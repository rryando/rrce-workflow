/**
 * MCP Server Implementation using @modelcontextprotocol/sdk
 * Provides stdio transport for VSCode Copilot integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { logger } from './logger';
import { configService } from './config-service';
import { getExposedProjects } from './resources';
import { setDetectedClient, clearBaseProtocolCache } from './prompts';
import { projectService } from '../lib/detection-service';
import { RAGService } from './services/rag';
import { clearDependencyGraphCache } from './services/dependency-graph';
import { clearSymbolCache } from './resources/search';
import { clearProjectContextCache } from './resources/projects';
import { clearGitignoreCache } from './resources/utils';
import { indexingJobs } from './services/indexing-jobs';

// Import handlers from decomposed modules
import { registerResourceHandlers } from './handlers/resources';
import { registerToolHandlers } from './handlers/tools';
import { registerPromptHandlers } from './handlers/prompts';

/**
 * Read version from package.json at startup
 */
function getPackageVersion(): string {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

interface ServerStatus {
  running: boolean;
  port?: number;
  pid?: number;
}

// In-memory server state
let serverState: ServerStatus = { running: false };
let mcpServer: Server | null = null;
let configWatcher: fs.FSWatcher | null = null;
let configWatcherDebounce: ReturnType<typeof setTimeout> | null = null;
let handlersRegistered = false;

/**
 * Start the MCP server
 * @param options.interactive If true, does not attach stdio transport (avoids conflict with TUI)
 */
export async function startMCPServer(options: { interactive?: boolean } = {}): Promise<{ port: number; pid: number }> {
  try {
    logger.info('Starting MCP Server...');
    
    // Global error handlers to prevent silent crashes (register only once)
    if (!handlersRegistered) {
      process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception', error);
        console.error('Uncaught Exception:', error);
      });

      process.on('unhandledRejection', (reason) => {
        logger.error('Unhandled Rejection', reason);
      });
      handlersRegistered = true;
    }

    const config = configService.load();
    
    mcpServer = new Server(
      { name: 'rrce-mcp-hub', version: getPackageVersion() },
      { capabilities: { resources: {}, tools: {}, prompts: {} } }
    );

    // Set up error handling for the server instance
    mcpServer.onerror = (error) => {
      logger.error('MCP Server Error', error);
    };

    // Detect client after initialization handshake
    mcpServer.oninitialized = () => {
      try {
        const clientInfo = mcpServer?.getClientVersion();
        if (clientInfo?.name) {
          const clientName = clientInfo.name.toLowerCase();
          setDetectedClient(clientName);
          // Clear base protocol cache so it re-processes includes with client context
          clearBaseProtocolCache();
          logger.info(`MCP client detected: ${clientName}`);
        }
      } catch {
        // Client info not available, proceed without client-aware includes
      }
    };

    registerResourceHandlers(mcpServer);
    registerToolHandlers(mcpServer);
    registerPromptHandlers(mcpServer);

    // Watch config file for changes (for non-interactive mode / separate process)
    // This ensures the server picks up config changes made by the TUI
    const configPath = configService.getConfigPath();

    if (!options.interactive) {
      try {
        // Check if config file exists before watching
        if (fs.existsSync(configPath)) {
          configWatcher = fs.watch(configPath, () => {
            // Debounce rapid file changes (e.g., TUI toggling multiple projects)
            if (configWatcherDebounce) clearTimeout(configWatcherDebounce);
            configWatcherDebounce = setTimeout(() => {
              configService.invalidate();
              const exposed = getExposedProjects().map(p => p.name).join(', ');
              logger.info('Config file changed, refreshed exposed projects', { exposedProjects: exposed });
            }, 300);
          });
          logger.info('Watching config file for changes', { configPath });
        }
      } catch (err) {
        logger.warn('Failed to watch config file', { error: String(err) });
      }
    }

    // Only attach transport if NOT interactive (TUI mode)
    // In TUI mode, we run the logic but don't bind to stdio to avoid conflict with Ink
    if (!options.interactive) {
      const transport = new StdioServerTransport();
      await mcpServer.connect(transport);
    } else {
        logger.info('Running in interactive mode (Stdio transport detached)');
    }

    serverState = { running: !options.interactive, port: config.server.port, pid: process.pid };

    const exposed = getExposedProjects().map(p => p.name).join(', ');
    logger.info(`RRCE MCP Hub started (pid: ${process.pid})`, { exposedProjects: exposed });
    
    if (!options.interactive) {
        console.error(`RRCE MCP Hub started (pid: ${process.pid})`);
        console.error(`Exposed projects: ${exposed}`);
    }

    return { port: config.server.port, pid: process.pid };
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    throw error;
  }
}

// Resource, Tool, and Prompt handlers are now imported from ./handlers/

/**
 * Stop the MCP server and reset all module-level state
 */
export async function stopMCPServer(): Promise<void> {
  // Close config file watcher if active
  if (configWatcherDebounce) {
    clearTimeout(configWatcherDebounce);
    configWatcherDebounce = null;
  }
  if (configWatcher) {
    configWatcher.close();
    configWatcher = null;
  }

  if (mcpServer) {
    logger.info('Stopping MCP Server...');
    try {
      await mcpServer.close();
    } catch (err) {
      logger.error('Error closing MCP server', err);
    }
    mcpServer = null;
  }

  // Abort any running indexing jobs
  indexingJobs.abortAll();

  // Reset module-level caches to prevent stale state on restart
  clearBaseProtocolCache();
  configService.invalidate();
  projectService.invalidate();
  RAGService.clearCaches();
  clearDependencyGraphCache();
  clearSymbolCache();
  clearProjectContextCache();
  clearGitignoreCache();

  serverState = { running: false };
  logger.info('RRCE MCP Hub stopped');
}

/**
 * Get current server status
 */
export function getMCPServerStatus(): ServerStatus {
  return { ...serverState };
}
