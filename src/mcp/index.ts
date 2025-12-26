/**
 * MCP Hub TUI - Interactive menu for managing MCP
 */

import { intro, outro, select, multiselect, confirm, spinner, note, cancel, isCancel, text } from '@clack/prompts';
import pc from 'picocolors';
import { loadMCPConfig, saveMCPConfig, setProjectConfig, getMCPConfigPath, ensureMCPGlobalPath } from './config';
import type { MCPConfig, MCPProjectConfig } from './types';
import { scanForProjects, type DetectedProject } from '../lib/detection';
import { startMCPServer, stopMCPServer, getMCPServerStatus } from './server';
import { checkInstallStatus, installToConfig } from './install';

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

  // 1. Check Global Path (Required)
  const globalPathCheck = await ensureMCPGlobalPath();
  if (!globalPathCheck.configured) {
    const configured = await handleConfigureGlobalPath();
    if (!configured) {
      outro(pc.yellow('MCP requires a global storage path. Setup cancelled.'));
      return;
    }
  }

  // 2. Check Installation Status (Wizard)
  const status = checkInstallStatus();
  if (!status.antigravity && !status.claude) {
    const shouldInstall = await confirm({
      message: 'MCP server is not installed in your IDEs. Install now?',
      initialValue: true,
    });

    if (shouldInstall && !isCancel(shouldInstall)) {
      await handleInstallWizard();
    }
  }

  let running = true;
  while (running) {
    const serverStatus = getMCPServerStatus();
    const serverLabel = serverStatus.running ? pc.green('Running') : pc.dim('Stopped');

    const action = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'start', label: `▶️  Start MCP server`, hint: `Current status: ${serverLabel}` },
        { value: 'configure', label: '⚙️  Configure projects', hint: 'Choose which projects to expose' },
        { value: 'install', label: '📥 Install to IDE', hint: 'Add to Antigravity or Claude Desktop' },
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
        // After start returns (user stopped it), we loop back to menu
        break;
      case 'configure':
        await handleConfigure();
        break;
      case 'install':
        await handleInstallWizard();
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

async function handleInstallWizard(): Promise<void> {
  const status = checkInstallStatus();
  
  const options = [
    { value: 'antigravity', label: 'Antigravity IDE', hint: status.antigravity ? 'Installed' : 'Not installed' },
    { value: 'claude', label: 'Claude Desktop', hint: status.claude ? 'Installed' : 'Not installed' },
  ];

  const selected = await multiselect({
    message: 'Select where to install RRCE MCP Server:',
    options,
    initialValues: [
      ...(status.antigravity ? ['antigravity'] : []),
      ...(status.claude ? ['claude'] : []),
    ],
    required: false,
  });

  if (isCancel(selected)) return;

  const targets = selected as string[];
  const results = [];

  for (const target of targets) {
    const success = installToConfig(target as 'antigravity' | 'claude');
    results.push(`${target}: ${success ? pc.green('Success') : pc.red('Failed')}`);
  }

  if (results.length > 0) {
    note(results.join('\n'), 'Installation Results');
  }
}

/**
 * Start the MCP server - Interactive Mode
 * Starts the server and streams logs to the console
 */
async function handleStartServer(): Promise<void> {
  const fs = await import('fs');
  const { getLogFilePath } = await import('./logger');

  // Check if projects are configured
  const config = loadMCPConfig();
  const exposedCount = config.projects.filter(p => p.expose).length;
  // If no projects explicitly exposed, check default policy? 
  // Actually, we should warn if NO projects are exposed.
  if (exposedCount === 0 && !config.defaults.includeNew) {
    const shouldConfig = await confirm({
      message: 'No projects are currently exposed. Configure now?',
      initialValue: true,
    });
    if (shouldConfig && !isCancel(shouldConfig)) {
      await handleConfigure();
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

  // Save port to config (in memory for now, or persist?)
  // Let's persist it if changed
  const newPort = parseInt(portInput as string, 10);
  if (newPort !== config.server.port) {
    config.server.port = newPort;
    saveMCPConfig(config);
  }

  // Clear screen for server view
  console.clear();
  
  const logPath = getLogFilePath();
  
  // Render function for the TUI
  const renderHeader = () => {
    console.clear();
    console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
    console.log(pc.cyan('║           RRCE MCP Hub Running            ║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
    console.log(pc.dim('Server is running in Stdio mode (JSON-RPC).'));
    console.log(pc.dim(`Port: ${newPort} | PID: ${process.pid}`));
    console.log(pc.dim(`Logging to: ${logPath}`));
    console.log(pc.dim('---------------------------------------------'));
  };

  const renderFooter = () => {
    console.log(pc.dim('---------------------------------------------'));
    console.log(pc.bgBlue(pc.white(pc.bold(' COMMANDS '))));
    console.log(`${pc.bold('q')}: Stop & Quit   ${pc.bold('g')}: Configure Projects   ${pc.bold('p')}: Change Port`);
  };

  renderHeader();
  renderFooter(); // Initial render

  try {
    // Start server (hooks up Stdio transport)
    await startMCPServer();
    
    // Tail logs setup
    let lastSize = 0;
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      lastSize = stats.size;
    }

    let isRunning = true;

    // Loop for TUI
    // We need raw mode to capture keys without Enter
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
    }

    return new Promise<void>((resolve) => {
      // Key handler
      const onKey = async (key: string) => {
        // Ctrl+C or q
        if (key === '\u0003' || key.toLowerCase() === 'q') {
          cleanup();
          resolve(); 
        }
        
        // p - Change Port (Stop, loop back to menu implies resolve)
        // g - Configure (Stop, loop back)
        if (key.toLowerCase() === 'p' || key.toLowerCase() === 'g') {
          cleanup();
          // We need to signal what to do next?
          // Actually, handleStartServer just returns. The main loop will show menu.
          // User has to click 'configure' manually.
          // To auto-jump, I'd need to return an action.
          // But 'Return to menu' is good enough for now.
          resolve(); 
        }
      };

      process.stdin.on('data', onKey);

      // Log poller
      const interval = setInterval(() => {
        if (!isRunning) return;

        if (fs.existsSync(logPath)) {
          const stats = fs.statSync(logPath);
          if (stats.size > lastSize) {
            const stream = fs.createReadStream(logPath, {
              start: lastSize,
              end: stats.size,
              encoding: 'utf-8',
            });
            
            stream.on('data', (chunk) => {
              // Just write to stderr/stdout
              process.stderr.write(chunk);
            });
            
            lastSize = stats.size;
          }
        }
      }, 500);

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
  
  s.stop('Projects loaded');

  if (projects.length === 0) {
    note('No RRCE projects detected. Run "rrce-workflow" in a project to set it up.', 'No Projects');
    return;
  }

  const lines: string[] = [
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
  ${pc.cyan('View project status')}   See which projects are exposed
  ${pc.cyan('Configure projects')}    Choose which projects to expose
  ${pc.cyan('Start MCP server')}      Start the server for AI access
  ${pc.cyan('Stop MCP server')}       Stop the running server

${pc.bold('DIRECT COMMANDS')}
  ${pc.dim('rrce-workflow mcp start')}    Start server directly
  ${pc.dim('rrce-workflow mcp stop')}     Stop server directly
  ${pc.dim('rrce-workflow mcp status')}   Show status directly
  ${pc.dim('rrce-workflow mcp help')}     Show this help

${pc.bold('CLAUDE DESKTOP SETUP')}
Add to ${pc.cyan('~/.config/claude/claude_desktop_config.json')}:
${pc.dim(`{
  "mcpServers": {
    "rrce": {
      "command": "npx",
      "args": ["rrce-workflow", "mcp", "start"]
    }
  }
}`)}

${pc.bold('RESOURCES EXPOSED')}
  ${pc.cyan('rrce://projects')}              List all exposed projects
  ${pc.cyan('rrce://projects/{name}/context')}  Get project context
  ${pc.cyan('rrce://projects/{name}/tasks')}    Get project tasks

${pc.bold('PROMPTS (Agent Commands)')}
  ${pc.cyan('init')}      Initialize project context
  ${pc.cyan('research')}  Research requirements for a task
  ${pc.cyan('plan')}      Create execution plan
  ${pc.cyan('execute')}   Implement planned work
  ${pc.cyan('docs')}      Generate documentation
  ${pc.cyan('sync')}      Sync knowledge with codebase
`;

  note(help.trim(), 'Help');
}
