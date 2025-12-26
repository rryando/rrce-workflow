import { confirm, isCancel, text } from '@clack/prompts';
import { loadMCPConfig, saveMCPConfig } from '../config';
import { scanForProjects } from '../../lib/detection';
import { getMCPServerStatus } from '../server';
import { detectWorkspaceRoot } from '../../lib/paths';
import { handleConfigure } from './configure';
import { runInstallWizard } from './install-wizard';

/**
 * Start the MCP server - Interactive Mode with Ink
 */
export async function handleStartServer(): Promise<void> {
  const React = await import('react');
  const { render } = await import('ink');
  const { App } = await import('../ui/App');

  // Check if projects are configured
  const config = loadMCPConfig();
  const projects = scanForProjects();
  const exposedProjects = projects.filter(p => {
    const cfg = config.projects.find(c => 
        (c.path && c.path === p.dataPath) || (!c.path && c.name === p.name)
    );
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

  // Allow port selection if not running
  const status = getMCPServerStatus();
  let initialPort = config.server.port;

  if (!status.running) {
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
      initialPort = newPort;
    }
  }
  
  console.clear();
  
  // We need a loop to handle reconfigurations that return to the server view
  let keepRunning = true;
  
  while (keepRunning) {
    // Determine what to do next based on exit reason
    let nextAction: 'exit' | 'configure' | 'install' | 'restart' = 'exit';
    
    // Force stdin to resume
    process.stdin.resume();
    
    // Render Ink App
    const app = render(React.createElement(App, {
      initialPort,
      onExit: () => {
        nextAction = 'exit';
      },
      onConfigure: () => {
        nextAction = 'configure';
      },
      onInstall: () => {
        nextAction = 'install';
      }
    }), { 
        exitOnCtrlC: false // We handle this in App
    });

    await app.waitUntilExit();
    
    // Handle next action
    if (nextAction === 'exit') {
      keepRunning = false;
    } else if (nextAction === 'configure') {
      console.clear();
      await handleConfigure();
      // Loop continues, restarting server view
    } else if (nextAction === 'install') {
       console.clear();
       const workspacePath = detectWorkspaceRoot();
       await runInstallWizard(workspacePath);
       // Loop continues
    }
  }
}
