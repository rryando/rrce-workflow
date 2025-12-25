/**
 * MCP Hub TUI - Interactive menu for managing MCP
 */

import { intro, outro, select, multiselect, confirm, spinner, note, cancel, isCancel, text } from '@clack/prompts';
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
 * Uses the same bash-like Tab completion and permission checking as the wizard
 */
async function handleConfigureGlobalPath(): Promise<boolean> {
  const { checkWriteAccess, getDefaultRRCEHome } = await import('../lib/paths');
  const { directoryPrompt, isCancelled } = await import('../lib/autocomplete-prompt');
  const path = await import('path');

  const defaultPath = getDefaultRRCEHome();
  const isDefaultWritable = checkWriteAccess(defaultPath);

  note(
    `MCP Hub requires a ${pc.bold('global storage path')} to store its configuration
and coordinate across projects.

Your current setup uses ${pc.cyan('workspace')} mode, which stores data
locally in each project. MCP needs a central location.`,
    'Global Path Required'
  );

  // Build options like the wizard
  const options: { value: string; label: string; hint?: string }[] = [
    {
      value: 'default',
      label: `Default (${defaultPath})`,
      hint: isDefaultWritable ? pc.green('✓ writable') : pc.red('✗ not writable'),
    },
    {
      value: 'custom',
      label: 'Custom path',
      hint: 'Specify your own directory',
    },
  ];

  const choice = await select({
    message: 'Global storage location:',
    options,
    initialValue: isDefaultWritable ? 'default' : 'custom',
  });

  if (isCancel(choice)) {
    return false;
  }

  let resolvedPath: string;

  if (choice === 'default') {
    if (!isDefaultWritable) {
      note(
        `${pc.yellow('⚠')} Cannot write to default path:\n  ${pc.dim(defaultPath)}\n\nThis can happen when running via npx/bunx in restricted environments.\nPlease choose a custom path instead.`,
        'Write Access Issue'
      );
      // Try again with custom path
      return handleConfigureGlobalPath();
    }
    resolvedPath = defaultPath;
  } else {
    // Custom path with bash-like Tab completion
    const suggestedPath = path.join(process.env.HOME || '~', '.local', 'share', 'rrce-workflow');
    const customPath = await directoryPrompt({
      message: 'Enter custom global path (Tab to autocomplete):',
      defaultValue: suggestedPath,
      validate: (value) => {
        if (!value.trim()) {
          return 'Path cannot be empty';
        }
        if (!checkWriteAccess(value)) {
          return `Cannot write to ${value}. Please choose a writable path.`;
        }
        return undefined;
      },
    });

    if (isCancelled(customPath)) {
      return false;
    }

    // Ensure path ends with .rrce-workflow so our tools can detect it
    let expandedPath = customPath as string;
    if (!expandedPath.endsWith('.rrce-workflow')) {
      expandedPath = path.join(expandedPath, '.rrce-workflow');
    }
    resolvedPath = expandedPath;
  }

  // Create the directory if it doesn't exist
  const fs = await import('fs');
  
  try {
    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    
    // Save the MCP config to the resolved path
    const configPath = path.join(resolvedPath, 'mcp.yaml');
    const config = loadMCPConfig();
    saveMCPConfig(config);
    
    note(
      `${pc.green('✓')} Global path configured: ${pc.cyan(resolvedPath)}\n\n` +
      `MCP config will be stored at:\n${configPath}`,
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
  const s = spinner();
  s.start('Scanning for projects...');

  const config = loadMCPConfig();
  const projects = scanForProjects();

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
  
  for (const project of projects) {
    const shouldExpose = selectedNames.includes(project.name);
    setProjectConfig(config, project.name, shouldExpose);
  }

  saveMCPConfig(config);

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
async function handleStartServer(): Promise<void> {
  const s = spinner();
  s.start('Starting MCP server...');

  try {
    const result = await startMCPServer();
    s.stop(pc.green(`MCP server started on port ${result.port}`));
    
    note(
      `The MCP server is now running.\n\n` +
      `To connect from Claude Desktop, add to your config:\n` +
      pc.cyan(`~/.config/claude/claude_desktop_config.json`),
      'Server Started'
    );
  } catch (error) {
    s.stop(pc.red('Failed to start server'));
    note(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
      'Server Error'
    );
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
