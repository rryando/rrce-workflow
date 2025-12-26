/**
 * MCP Hub TUI - Interactive menu for managing MCP
 */

import { intro, outro, select, confirm, note, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { loadMCPConfig, ensureMCPGlobalPath } from './config';
import { startMCPServer, getMCPServerStatus } from './server';
import { checkInstallStatus, isInstalledAnywhere } from './install';
import { detectWorkspaceRoot } from '../lib/paths';

// Import extracted commands
import { handleStartServer } from './commands/start';
import { handleConfigure, handleConfigureGlobalPath } from './commands/configure';
import { handleShowStatus } from './commands/status';
import { runInstallWizard } from './commands/install-wizard';
import { showHelp } from './commands/help';

/**
 * Run the MCP TUI
 * Can be invoked directly or with a subcommand
 */
export async function runMCP(subcommand?: string): Promise<void> {
  // Handle direct subcommands
  if (subcommand) {
    switch (subcommand) {
      case 'start':
        // Check if running interactively (TTY)
        if (process.stdout.isTTY) {
            // User manually running "mcp start" -> Show TUI
            await handleStartServer();
        } else {
            // IDE spawning process (non-interactive) -> Headless StdIO
            await startMCPServer();
            await new Promise(() => {}); // Never resolves
        }
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
      case 'configure':
        await handleConfigure();
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

  // 2. Check Installation Status - Enforce Flow
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
      // Step 1: Install
      await runInstallWizard(workspacePath);
      
      // Step 2: Configure Projects
      const config = loadMCPConfig();
      const exposedCount = config.projects.filter(p => p.expose).length;
      if (exposedCount === 0) {
        await handleConfigure();
      }
      
      // Step 3: Start Server
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
        await runInstallWizard(workspacePath);
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
 * Stop the MCP server
 */
async function handleStopServer(): Promise<void> {
  const { stopMCPServer } = await import('./server');
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

// Re-export specific handlers if needed by other modules
export { handleStartServer, handleConfigure, handleConfigureGlobalPath };
