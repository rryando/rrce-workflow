import { confirm, isCancel, text } from '@clack/prompts';
import { configService, saveMCPConfig } from '../config';
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
  const { ConfigProvider } = await import('../ui/ConfigContext');

  // Check if projects are configured
  const config = configService.load();
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
  
  
  // Render Ink App
  // App handles its own views, we just wait for it to fully exit.
  
  process.stdin.resume(); // Ensure stdin is alive

  const app = render(
    React.createElement(ConfigProvider, null, 
      React.createElement(App, {
        initialPort,
        onExit: () => {
            // App requested exit
        }
      })
    ), { 
      exitOnCtrlC: false 
  });

  await app.waitUntilExit();
  
  // Cleanup if needed
  console.clear();
}
