/**
 * MCP Server Implementation using @modelcontextprotocol/sdk
 * Provides stdio transport for VSCode Copilot integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { logger } from './logger';
import { loadMCPConfig } from './config';
import { getExposedProjects } from './resources';

// Import handlers from decomposed modules
import { registerResourceHandlers } from './handlers/resources';
import { registerToolHandlers } from './handlers/tools';
import { registerPromptHandlers } from './handlers/prompts';

interface ServerStatus {
  running: boolean;
  port?: number;
  pid?: number;
}

// In-memory server state
let serverState: ServerStatus = { running: false };
let mcpServer: Server | null = null;

/**
 * Start the MCP server
 * @param options.interactive If true, does not attach stdio transport (avoids conflict with TUI)
 */
export async function startMCPServer(options: { interactive?: boolean } = {}): Promise<{ port: number; pid: number }> {
  try {
    logger.info('Starting MCP Server...');
    
    // Global error handlers to prevent silent crashes
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      // Don't exit immediately, try to keep going if possible, or at least log it
      console.error('Uncaught Exception:', error);
    });
    
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Rejection', reason);
      console.error('Unhandled Rejection:', reason);
    });

    const config = loadMCPConfig();
    
    mcpServer = new Server(
      { name: 'rrce-mcp-hub', version: '1.0.0' },
      { capabilities: { resources: {}, tools: {}, prompts: {} } }
    );

    // Set up error handling for the server instance
    mcpServer.onerror = (error) => {
      logger.error('MCP Server Error', error);
    };

    registerResourceHandlers(mcpServer);
    registerToolHandlers(mcpServer);
    registerPromptHandlers(mcpServer);

    // Only attach transport if NOT interactive (TUI mode)
    // In TUI mode, we run the logic but don't bind to stdio to avoid conflict with Ink
    if (!options.interactive) {
      const transport = new StdioServerTransport();
      await mcpServer.connect(transport);
    } else {
        logger.info('Running in interactive mode (Stdio transport detached)');
    }

    serverState = { running: true, port: config.server.port, pid: process.pid };

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
 * Stop the MCP server
 */
export function stopMCPServer(): void {
  if (mcpServer) {
    logger.info('Stopping MCP Server...');
    mcpServer.close();
    mcpServer = null;
  }
  serverState = { running: false };
  logger.info('RRCE MCP Hub stopped');
  // console.error('RRCE MCP Hub stopped'); // Suppress for TUI cleanliness
}

/**
 * Get current server status
 */
export function getMCPServerStatus(): ServerStatus {
  return { ...serverState };
}
