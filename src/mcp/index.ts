
/**
 * MCP Hub TUI - Interactive menu for managing MCP
 */

import { intro, outro, confirm, note, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { loadMCPConfig, ensureMCPGlobalPath } from './config';
import { startMCPServer, getMCPServerStatus } from './server';
import { checkInstallStatus, isInstalledAnywhere } from './install';
import { detectWorkspaceRoot } from '../lib/paths';

// Import commands
import { handleStartServer } from './commands/start';
import { handleConfigure, handleConfigureGlobalPath } from './commands/configure';
import { handleShowStatus } from './commands/status';
import { runInstallWizard } from './commands/install-wizard';
import { runUninstallWizard } from './commands/uninstall-wizard';
import { showHelp } from './commands/help';

/**
 * Run the MCP TUI
 * Can be invoked directly or with a subcommand
 */
export async function runMCP(subcommand?: string): Promise<void> {
  // Detect workspace (needed for some commands)
  const workspacePath = detectWorkspaceRoot();

  // Handle direct subcommands (likely from CLI args)
  if (subcommand) {
    switch (subcommand) {
      case 'start':
        if (process.stdout.isTTY) {
            await handleStartServer();
        } else {
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
      case 'uninstall':
        await runUninstallWizard(workspacePath);
        return;
      case 'help':
        showHelp();
        return;
      case 'configure':
        await handleConfigure();
        return;
      case 'menu':
        // Force show the old menu if needed (hidden option)
        break;
    }
  }

  // 1. Check Global Path (Required)
  const globalPathCheck = await ensureMCPGlobalPath();
  if (!globalPathCheck.configured) {
    intro(pc.bgCyan(pc.black(' MCP Setup ')));
    const configured = await handleConfigureGlobalPath();
    if (!configured) {
      outro(pc.yellow('MCP requires a global storage path. Setup cancelled.'));
      return;
    }
  }

  // 2. Check Installation Status
  const installed = isInstalledAnywhere(workspacePath);
  
  if (!installed) {
     // First time setup - Use Clack Wizard
    intro(pc.bgCyan(pc.black(' Welcome to MCP Hub ')));
    note(
      `${pc.bold('Set up Model Context Protocol')}\nAllow AI assistants to access your project context.`,
      'Getting Started'
    );

    const shouldInstall = await confirm({
      message: 'Install MCP server integrations now?',
      initialValue: true,
    });

    if (shouldInstall && !isCancel(shouldInstall)) {
      await runInstallWizard(workspacePath);
      
      const shouldStart = await confirm({
        message: 'Start the MCP Dashboard?',
        initialValue: true,
      });
      
      if (shouldStart && !isCancel(shouldStart)) {
        await handleStartServer();
      }
    } else {
        outro(pc.dim('Setup skipped. Run "npx rrce-workflow mcp" later to restart.'));
    }
    return;
  }

  // 3. Normal Flow - Launch TUI Dashboard directly
  // This dashboard now encompasses Configure, Install, and Logs.
  try {
      await handleStartServer();
  } catch (err) {
      console.error(err);
      outro(pc.red('Failed to launch MCP Dashboard'));
  }
}

/**
 * Stop the MCP server
 */
async function handleStopServer(): Promise<void> {
  const { stopMCPServer } = await import('./server');
  const status = getMCPServerStatus();
  
  if (!status.running) {
    console.log(pc.dim('MCP server is already stopped.'));
    return;
  }
  
  stopMCPServer();
  console.log(pc.green('MCP server stopped.'));
}

export { handleStartServer, handleConfigure, handleConfigureGlobalPath };
