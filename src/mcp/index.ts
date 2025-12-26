/**
 * MCP Hub TUI - Interactive menu for managing MCP
 */

import { intro, outro, select, multiselect, confirm, spinner, note, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { loadMCPConfig, saveMCPConfig, setProjectConfig, getMCPConfigPath, ensureMCPGlobalPath } from './config';
import type { MCPConfig, MCPProjectConfig } from './types';
import { scanForProjects, type DetectedProject } from '../lib/detection';
import { startMCPServer, stopMCPServer, getMCPServerStatus } from './server';

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

  // Check if global path is configured (MCP needs global storage)
  const globalPathCheck = await ensureMCPGlobalPath();
  if (!globalPathCheck.configured) {
    // Prompt user to configure global path
    const configured = await handleConfigureGlobalPath();
    if (!configured) {
      outro(pc.yellow('MCP requires a global storage path. Setup cancelled.'));
      return;
    }
  }

  let running = true;
  while (running) {
    const action = await select({
      message: 'What would you like to do?',
      options: [
        { value: 'status', label: '📋 View project status', hint: 'See which projects are exposed' },
        { value: 'configure', label: '⚙️  Configure projects', hint: 'Choose which projects to expose' },
        { value: 'start', label: '▶️  Start MCP server', hint: 'Start the MCP server' },
        { value: 'stop', label: '⏹️  Stop MCP server', hint: 'Stop the running server' },
        { value: 'help', label: '❓ Help', hint: 'Learn about MCP Hub' },
        { value: 'exit', label: '↩  Exit', hint: 'Return to shell' },
      ],
    });

    if (isCancel(action)) {
      cancel('MCP Hub closed.');
      return;
    }

    switch (action) {
      case 'status':
        await handleShowStatus();
        break;
      case 'configure':
        await handleConfigure();
        break;
      case 'start':
        await handleStartServer();
        running = false; // Exit after starting server
        break;
      case 'stop':
        await handleStopServer();
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
 * Start the MCP server
 */
/**
 * Start the MCP server - Interactive Mode
 * Starts the server and streams logs to the console
 */
async function handleStartServer(): Promise<void> {
  const fs = await import('fs');
  const { getLogFilePath } = await import('./logger');

  // Clear screen for server view
  console.clear();
  
  const logPath = getLogFilePath();
  
  console.log(pc.cyan('╔═══════════════════════════════════════════╗'));
  console.log(pc.cyan('║           RRCE MCP Hub Running            ║'));
  console.log(pc.cyan('╚═══════════════════════════════════════════╝'));
  console.log('');
  console.log(pc.dim('Server is running in Stdio mode (JSON-RPC).'));
  console.log(pc.dim('Do not type in this console as it may interfere with the protocol.'));
  console.log(pc.dim(`Logging to: ${logPath}`));
  console.log(pc.yellow('Press Ctrl+C to stop the server'));
  console.log('');
  console.log(pc.bold('Server Logs:'));
  console.log(pc.dim('---------------------------------------------'));

  try {
    // Start server (hooks up Stdio transport)
    await startMCPServer();
    
    // Tail the log file and print to stderr to avoid polluting stdout (which is used for JSON-RPC)
    // We use a simple polling approach for tailing
    let lastSize = 0;
    
    // Check if file exists first
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      lastSize = stats.size;
    }

    // Keep process alive and poll for logs
    setInterval(() => {
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        if (stats.size > lastSize) {
          const stream = fs.createReadStream(logPath, {
            start: lastSize,
            end: stats.size,
            encoding: 'utf-8',
          });
          
          stream.on('data', (chunk) => {
            process.stderr.write(chunk); // Write to stderr!
          });
          
          lastSize = stats.size;
        }
      }
    }, 500);

    // Handle shutdown
    const cleanup = () => {
      stopMCPServer();
      console.log(pc.yellow('\nMCP Server caught signal, stopping...'));
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep promise from resolving to hold the TUI loop (though we effectively exit the loop visually)
    await new Promise(() => {});

  } catch (error) {
    console.error(pc.red('\nFailed to start server:'));
    console.error(error);
    process.exit(1);
  }
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
