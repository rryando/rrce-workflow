
/**
 * MCP Hub TUI - Interactive menu for managing MCP
 */

import { intro, outro, confirm, note, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { ensureMCPGlobalPath } from './config';
import { startMCPServer, stopMCPServer } from './server';
import { isInstalledAnywhere } from './install';
import { detectWorkspaceRoot } from '../lib/paths';

// Import commands
import { handleStartServer } from './commands/start';
import { handleConfigureGlobalPath } from './commands/configure';
import { runInstallWizard } from './commands/install-wizard';

/**
 * Run the MCP TUI
 * Launches the TUI dashboard directly
 */
export async function runMCP(subcommand?: string): Promise<void> {
  // Handle 'start' subcommand for non-TTY mode (used by IDE integrations)
  if (subcommand === 'start' && !process.stdout.isTTY) {
    const shutdown = () => { stopMCPServer().finally(() => process.exit(0)); };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    await startMCPServer();
    await new Promise(() => {}); // Never resolves - keep server running
    return;
  }

  // Detect workspace for installation check
  const workspacePath = detectWorkspaceRoot();

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

export { handleStartServer, handleConfigureGlobalPath };
