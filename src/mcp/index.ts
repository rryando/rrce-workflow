/**
 * MCP Hub TUI - Interactive menu for managing MCP
 */

import { intro, outro, select, multiselect, confirm, spinner, note, cancel, isCancel, text } from '@clack/prompts';
import pc from 'picocolors';
import { loadMCPConfig, saveMCPConfig, setProjectConfig, getMCPConfigPath, ensureMCPGlobalPath } from './config';
import type { MCPConfig, MCPProjectConfig } from './types';
import { scanForProjects, type DetectedProject } from '../lib/detection';
import { startMCPServer, stopMCPServer, getMCPServerStatus } from './server';
import { checkInstallStatus, installToConfig, isInstalledAnywhere, getTargetLabel, type InstallTarget, type InstallStatus } from './install';
import { detectWorkspaceRoot } from '../lib/paths';

/**
 * Run the MCP TUI
 * Can be invoked directly or with a subcommand
 */
export async function runMCP(subcommand?: string): Promise<void> {
  // Handle direct subcommands
  if (subcommand) {
    switch (subcommand) {
      case 'start':
        // When called directly (e.g., from VSCode), run in stdio mode
        // This keeps the process alive for MCP communication
        await startMCPServer();
        // Keep process alive - the MCP server runs until killed
        await new Promise(() => {}); // Never resolves
        return;
      case 'stop':
        await handleStopServer();
        return;
      case 'status':
        await handleShowStatus();
        return;
      case 'help':
        showHelp();
        return;
    }
  }

  // Show interactive menu
  intro(pc.bgCyan(pc.black(' RRCE MCP Hub ')));

  // Get workspace path for workspace-specific checks
  const workspacePath = detectWorkspaceRoot();

  // 1. Check Global Path (Required)
  const globalPathCheck = await ensureMCPGlobalPath();
  if (!globalPathCheck.configured) {
    const configured = await handleConfigureGlobalPath();
    if (!configured) {
      outro(pc.yellow('MCP requires a global storage path. Setup cancelled.'));
      return;
    }
  }

  // 2. Check Installation Status - Improved Flow
  const status = checkInstallStatus(workspacePath);
  const installed = isInstalledAnywhere(workspacePath);
  
  if (!installed) {
    // Not installed anywhere → Install → Configure → Start Server
    note(
      `${pc.bold('Welcome to RRCE MCP Hub!')}

MCP (Model Context Protocol) allows AI assistants to access your 
project knowledge in real-time. Let's get you set up.`,
      'Getting Started'
    );

    const shouldInstall = await confirm({
      message: 'Install MCP server to your IDE(s)?',
      initialValue: true,
    });

    if (shouldInstall && !isCancel(shouldInstall)) {
      await handleInstallWizard(workspacePath);
      
      // After install, configure projects
      await handleConfigure();
      
      // Then start server
      const shouldStart = await confirm({
        message: 'Start the MCP server now?',
        initialValue: true,
      });
      
      if (shouldStart && !isCancel(shouldStart)) {
        await handleStartServer();
      }
    }
    
    outro(pc.green('MCP Hub setup complete!'));
    return;
  }

  // 3. Check if projects are configured
  const config = loadMCPConfig();
  const exposedCount = config.projects.filter(p => p.expose).length;
  
  if (exposedCount === 0 && !config.defaults.includeNew) {
    // Installed but no projects configured
    note('MCP is installed but no projects are exposed. Let\'s configure that.', 'Configuration Needed');
    await handleConfigure();
  }

  // Main Menu Loop
  let running = true;
  while (running) {
    const serverStatus = getMCPServerStatus();
    const serverLabel = serverStatus.running ? pc.green('● Running') : pc.dim('○ Stopped');
    const currentStatus = checkInstallStatus(workspacePath);
    const installedCount = [currentStatus.antigravity, currentStatus.claude, currentStatus.vscodeGlobal, currentStatus.vscodeWorkspace].filter(Boolean).length;

    const action = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'start', label: `▶️  Start MCP server`, hint: serverLabel },
        { value: 'configure', label: '⚙️  Configure projects', hint: 'Choose which projects to expose' },
        { value: 'install', label: '📥 Install to IDE', hint: `${installedCount} IDE(s) configured` },
        { value: 'status', label: '📋 View status', hint: 'See details' },
        { value: 'help', label: '❓ Help', hint: 'Learn about MCP Hub' },
        { value: 'exit', label: '↩  Exit', hint: 'Return to shell' },
      ],
    });

    if (isCancel(action)) {
      cancel('MCP Hub closed.');
      return;
    }

    switch (action) {
      case 'start':
        await handleStartServer();
        break;
      case 'configure':
        await handleConfigure();
        break;
      case 'install':
        await handleInstallWizard(workspacePath);
        break;
      case 'status':
        await handleShowStatus();
        break;
      case 'help':
        showHelp();
        break;
      case 'exit':
        running = false;
        break;
    }
  }

  outro(pc.green('MCP Hub closed.'));
}

/**
 * Install Wizard with VSCode support
 */
async function handleInstallWizard(workspacePath?: string): Promise<void> {
  const status = checkInstallStatus(workspacePath);
  
  const options: { value: string; label: string; hint: string }[] = [
    { 
      value: 'antigravity', 
      label: 'Antigravity IDE', 
      hint: status.antigravity ? pc.green('✓ Installed') : pc.dim('Not installed'),
    },
    { 
      value: 'vscode-global', 
      label: 'VSCode (Global)', 
      hint: status.vscodeGlobal ? pc.green('✓ Installed') : pc.dim('Not installed'),
    },
    { 
      value: 'vscode-workspace', 
      label: 'VSCode (This Workspace)', 
      hint: status.vscodeWorkspace ? pc.green('✓ Installed') : pc.dim('Not installed'),
    },
    { 
      value: 'claude', 
      label: 'Claude Desktop', 
      hint: status.claude ? pc.green('✓ Installed') : pc.dim('Not installed'),
    },
  ];

  const selected = await multiselect({
    message: 'Select where to install RRCE MCP Server:',
    options,
    initialValues: [
      ...(status.antigravity ? ['antigravity'] : []),
      ...(status.vscodeGlobal ? ['vscode-global'] : []),
      ...(status.vscodeWorkspace ? ['vscode-workspace'] : []),
      ...(status.claude ? ['claude'] : []),
    ],
    required: false,
  });

  if (isCancel(selected)) return;

  const targets = selected as InstallTarget[];
  const results: string[] = [];

  for (const target of targets) {
    const success = installToConfig(target, workspacePath);
    const label = getTargetLabel(target);
    results.push(`${label}: ${success ? pc.green('✓ Success') : pc.red('✗ Failed')}`);
  }

  if (results.length > 0) {
    note(results.join('\n'), 'Installation Results');
  }
}

/**
 * Start the MCP server - Interactive Mode with enhanced TUI
 */
async function handleStartServer(): Promise<void> {
  const fs = await import('fs');
  const { getLogFilePath } = await import('./logger');

  // Check if projects are configured
  const config = loadMCPConfig();
  const projects = scanForProjects();
  const exposedProjects = projects.filter(p => {
    const cfg = config.projects.find(c => c.name === p.name);
    return cfg?.expose ?? config.defaults.includeNew;
  });
  
  if (exposedProjects.length === 0) {
    const shouldConfig = await confirm({
      message: 'No projects are currently exposed. Configure now?',
      initialValue: true,
    });
    if (shouldConfig && !isCancel(shouldConfig)) {
      await handleConfigure();
      // Reload after config
      return handleStartServer();
    }
  }

  // Allow port selection
  const portInput = await text({
    message: 'Select port for MCP Server',
    initialValue: config.server.port.toString(),
    placeholder: '3200',
    validate(value) {
      if (isNaN(Number(value))) return 'Port must be a number';
    },
  });

  if (isCancel(portInput)) return;

  const newPort = parseInt(portInput as string, 10);
  if (newPort !== config.server.port) {
    config.server.port = newPort;
    saveMCPConfig(config);
  }

  console.clear();
  
  const logPath = getLogFilePath();
  const workspacePath = detectWorkspaceRoot();
  
  // Build exposed project names for sticky display
  const exposedNames = exposedProjects.map(p => p.name).slice(0, 5);
  const exposedLabel = exposedNames.length > 0 
    ? exposedNames.join(', ') + (exposedProjects.length > 5 ? ` (+${exposedProjects.length - 5} more)` : '')
    : pc.dim('(none)');

  // Render function for the enhanced TUI
  const render = (logs: string[] = []) => {
    console.clear();
    
    // Header
    console.log(pc.cyan('╔═══════════════════════════════════════════════════════════════╗'));
    console.log(pc.cyan('║') + pc.bold(pc.white('                    RRCE MCP Hub Running                      ')) + pc.cyan('║'));
    console.log(pc.cyan('╠═══════════════════════════════════════════════════════════════╣'));
    
    // Log area (show last 10 lines)
    const logLines = logs.slice(-10);
    const emptyLines = 10 - logLines.length;
    
    for (let i = 0; i < emptyLines; i++) {
      console.log(pc.cyan('║') + ' '.repeat(63) + pc.cyan('║'));
    }
    for (const line of logLines) {
      const truncated = line.substring(0, 61).padEnd(61);
      console.log(pc.cyan('║') + ' ' + pc.dim(truncated) + ' ' + pc.cyan('║'));
    }
    
    // Sticky info bar (2nd from bottom)
    console.log(pc.cyan('╠═══════════════════════════════════════════════════════════════╣'));
    const infoLine = ` 📋 ${exposedLabel} │ Port: ${newPort} │ PID: ${process.pid}`.substring(0, 61).padEnd(61);
    console.log(pc.cyan('║') + pc.yellow(infoLine) + ' ' + pc.cyan('║'));
    
    // Command bar (bottom)
    console.log(pc.cyan('╠═══════════════════════════════════════════════════════════════╣'));
    const cmdLine = ` q:Quit  p:Projects  i:Install  r:Reload  c:Clear  ?:Help`;
    console.log(pc.cyan('║') + pc.dim(cmdLine.padEnd(63)) + pc.cyan('║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════════════════════════╝'));
  };

  let logBuffer: string[] = [];
  render(logBuffer);

  try {
    await startMCPServer();
    
    // Tail logs setup
    let lastSize = 0;
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      lastSize = stats.size;
    }

    let isRunning = true;

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
    }

    return new Promise<void>((resolve) => {
      const cleanup = () => {
        isRunning = false;
        clearInterval(interval);
        if (process.stdin.setRawMode) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener('data', onKey);
        process.stdin.pause();
        stopMCPServer();
        console.log('');
      };

      const onKey = async (key: string) => {
        // Ctrl+C or q - Quit
        if (key === '\u0003' || key.toLowerCase() === 'q') {
          cleanup();
          resolve();
          return;
        }
        
        // p - Reconfigure projects
        if (key.toLowerCase() === 'p') {
          cleanup();
          console.clear();
          await handleConfigure();
          resolve();
          return;
        }
        
        // i - Install to additional IDEs
        if (key.toLowerCase() === 'i') {
          cleanup();
          console.clear();
          await handleInstallWizard(workspacePath);
          resolve();
          return;
        }
        
        // r - Reload config
        if (key.toLowerCase() === 'r') {
          logBuffer.push('[INFO] Reloading configuration...');
          render(logBuffer);
          return;
        }
        
        // c - Clear logs
        if (key.toLowerCase() === 'c') {
          logBuffer = [];
          render(logBuffer);
          return;
        }
        
        // ? - Show help
        if (key === '?') {
          logBuffer.push('─'.repeat(40));
          logBuffer.push('Commands:');
          logBuffer.push('  q - Stop server and return to menu');
          logBuffer.push('  p - Reconfigure exposed projects');
          logBuffer.push('  i - Install to additional IDEs');
          logBuffer.push('  r - Reload configuration');
          logBuffer.push('  c - Clear log display');
          logBuffer.push('  ? - Show this help');
          logBuffer.push('─'.repeat(40));
          render(logBuffer);
          return;
        }
      };

      process.stdin.on('data', onKey);

      // Log poller
      const interval = setInterval(() => {
        if (!isRunning) return;

        if (fs.existsSync(logPath)) {
          const stats = fs.statSync(logPath);
          if (stats.size > lastSize) {
            const buffer = Buffer.alloc(stats.size - lastSize);
            const fd = fs.openSync(logPath, 'r');
            fs.readSync(fd, buffer, 0, buffer.length, lastSize);
            fs.closeSync(fd);
            
            const newContent = buffer.toString('utf-8');
            const newLines = newContent.split('\n').filter(l => l.trim());
            logBuffer.push(...newLines);
            
            // Keep only last 100 lines in buffer
            if (logBuffer.length > 100) {
              logBuffer = logBuffer.slice(-100);
            }
            
            lastSize = stats.size;
            render(logBuffer);
          }
        }
      }, 500);
    });

  } catch (error) {
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    console.error(pc.red('\nFailed to start server:'));
    console.error(error);
  }
}

/**
 * Prompt user to configure a global path for MCP
 * Returns true if configured successfully
 */
async function handleConfigureGlobalPath(): Promise<boolean> {
  const { resolveGlobalPath } = await import('../lib/tui-utils');
  const fs = await import('fs');
  const path = await import('path');

  note(
    `MCP Hub requires a ${pc.bold('global storage path')} to store its configuration
and coordinate across projects.

Your current setup uses ${pc.cyan('workspace')} mode, which stores data
locally in each project. MCP needs a central location.`,
    'Global Path Required'
  );

  const resolvedPath = await resolveGlobalPath();
  
  if (!resolvedPath) {
    return false;
  }

  try {
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    
    const config = loadMCPConfig();
    saveMCPConfig(config);
    
    note(
      `${pc.green('✓')} Global path configured: ${pc.cyan(resolvedPath)}\n\n` +
      `MCP config will be stored at:\n${path.join(resolvedPath, 'mcp.yaml')}`,
      'Configuration Saved'
    );
    
    return true;
  } catch (error) {
    note(
      `${pc.red('✗')} Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
      'Error'
    );
    return false;
  }
}

/**
 * Show current project status
 */
async function handleShowStatus(): Promise<void> {
  const s = spinner();
  s.start('Loading projects...');

  const config = loadMCPConfig();
  const projects = scanForProjects();
  const workspacePath = detectWorkspaceRoot();
  const installStatus = checkInstallStatus(workspacePath);
  
  s.stop('Projects loaded');

  if (projects.length === 0) {
    note('No RRCE projects detected. Run "rrce-workflow" in a project to set it up.', 'No Projects');
    return;
  }

  const lines: string[] = [
    `${pc.bold('Installation Status')}`,
    '',
    `  Antigravity:      ${installStatus.antigravity ? pc.green('✓ Installed') : pc.dim('Not installed')}`,
    `  VSCode (Global):  ${installStatus.vscodeGlobal ? pc.green('✓ Installed') : pc.dim('Not installed')}`,
    `  VSCode (Workspace): ${installStatus.vscodeWorkspace ? pc.green('✓ Installed') : pc.dim('Not installed')}`,
    `  Claude Desktop:   ${installStatus.claude ? pc.green('✓ Installed') : pc.dim('Not installed')}`,
    '',
    `${pc.bold('Project Status')}`,
    '',
  ];

  for (const project of projects) {
    const projectConfig = config.projects.find(p => p.name === project.name);
    const isExposed = projectConfig?.expose ?? config.defaults.includeNew;
    const status = isExposed ? pc.green('✓ exposed') : pc.dim('○ hidden');
    const source = pc.dim(`(${project.source})`);
    
    lines.push(`  ${status}  ${project.name} ${source}`);
  }

  lines.push('');
  lines.push(pc.dim(`Config: ${getMCPConfigPath()}`));

  const serverStatus = getMCPServerStatus();
  if (serverStatus.running) {
    lines.push(pc.green(`Server: running on port ${serverStatus.port}`));
  } else {
    lines.push(pc.dim('Server: not running'));
  }

  note(lines.join('\n'), 'MCP Hub Status');
}

/**
 * Configure which projects to expose
 */
async function handleConfigure(): Promise<void> {
  const { logger } = await import('./logger');
  const s = spinner();
  s.start('Scanning for projects...');

  const config = loadMCPConfig();
  const projects = scanForProjects();
  logger.info('Configure: Loaded config', { projects: config.projects, defaultMode: config.defaults.includeNew });

  s.stop('Projects found');

  if (projects.length === 0) {
    note('No RRCE projects detected. Run "rrce-workflow" in a project to set it up.', 'No Projects');
    return;
  }

  // Build options with current state
  const options = projects.map(project => {
    const projectConfig = config.projects.find(p => p.name === project.name);
    const isExposed = projectConfig?.expose ?? config.defaults.includeNew;
    
    return {
      value: project.name,
      label: `${project.name} ${pc.dim(`(${project.source})`)}`,
      hint: project.dataPath,
    };
  });

  // Get currently exposed projects for initial values
  const currentlyExposed = projects
    .filter(p => {
      const cfg = config.projects.find(c => c.name === p.name);
      return cfg?.expose ?? config.defaults.includeNew;
    })
    .map(p => p.name);

  const selected = await multiselect({
    message: 'Select projects to expose via MCP:',
    options,
    initialValues: currentlyExposed,
    required: false,
  });

  if (isCancel(selected)) {
    return;
  }

  // Update config
  const selectedNames = selected as string[];
  logger.info('Configure: User selected projects', selectedNames);

  for (const project of projects) {
    const shouldExpose = selectedNames.includes(project.name);
    setProjectConfig(config, project.name, shouldExpose);
  }

  saveMCPConfig(config);
  logger.info('Configure: Config saved', config);

  const exposedCount = selectedNames.length;
  note(
    `${pc.green('✓')} Configuration saved!\n\n` +
    `Exposed projects: ${exposedCount}\n` +
    `Hidden projects: ${projects.length - exposedCount}`,
    'Configuration Updated'
  );
}

/**
 * Stop the MCP server
 */
async function handleStopServer(): Promise<void> {
  const status = getMCPServerStatus();
  
  if (!status.running) {
    note('MCP server is not running.', 'Status');
    return;
  }

  const confirmed = await confirm({
    message: 'Stop the MCP server?',
    initialValue: true,
  });

  if (isCancel(confirmed) || !confirmed) {
    return;
  }

  stopMCPServer();
  note(pc.green('MCP server stopped.'), 'Server Stopped');
}

/**
 * Show help information
 */
function showHelp(): void {
  const help = `
${pc.bold('RRCE MCP Hub')} - Cross-project AI assistant server

${pc.bold('ABOUT')}
MCP (Model Context Protocol) allows AI assistants like Claude to 
access your project knowledge in real-time. The RRCE MCP Hub 
provides a central server that exposes selected projects.

${pc.bold('MENU OPTIONS')}
  ${pc.cyan('Start MCP server')}      Start the server for AI access
  ${pc.cyan('Configure projects')}    Choose which projects to expose
  ${pc.cyan('Install to IDE')}        Add to Antigravity, VSCode, or Claude
  ${pc.cyan('View status')}           See which projects are exposed

${pc.bold('DIRECT COMMANDS')}
  ${pc.dim('rrce-workflow mcp start')}    Start server directly
  ${pc.dim('rrce-workflow mcp stop')}     Stop server directly
  ${pc.dim('rrce-workflow mcp status')}   Show status directly
  ${pc.dim('rrce-workflow mcp help')}     Show this help

${pc.bold('IDE INSTALLATION')}
  ${pc.cyan('Antigravity')}    ~/.gemini/antigravity/mcp_config.json
  ${pc.cyan('VSCode Global')} ~/.config/Code/User/settings.json
  ${pc.cyan('VSCode Workspace')} .vscode/mcp.json
  ${pc.cyan('Claude Desktop')} ~/.config/claude/claude_desktop_config.json

${pc.bold('SERVER COMMANDS')} (while running)
  ${pc.cyan('q')} Stop and quit       ${pc.cyan('p')} Reconfigure projects
  ${pc.cyan('i')} Install to IDE      ${pc.cyan('r')} Reload config
  ${pc.cyan('c')} Clear logs          ${pc.cyan('?')} Show help

${pc.bold('RESOURCES EXPOSED')}
  ${pc.cyan('rrce://projects')}              List all exposed projects
  ${pc.cyan('rrce://projects/{name}/context')}  Get project context
  ${pc.cyan('rrce://projects/{name}/tasks')}    Get project tasks
`;

  note(help.trim(), 'Help');
}
