import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../logger';
import { getExposedProjects } from '../resources';

// Domain-specific tool handlers
import { projectTools, handleProjectTool } from './tools/project';
import { searchTools, handleSearchTool } from './tools/search';
import { taskTools, handleTaskTool } from './tools/task';
import { sessionTools, handleSessionTool } from './tools/session';
import { agentTools, handleAgentTool } from './tools/agent';
import { cleanupTools, handleCleanupTool } from './tools/cleanup';

/**
 * Register MCP tool handlers
 */
export function registerToolHandlers(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      ...projectTools,
      ...searchTools,
      ...taskTools,
      ...sessionTools,
      ...agentTools,
      ...cleanupTools,
    ];

    // Check if any projects are exposed. If not, add a help setup tool.
    const projects = getExposedProjects();
    if (projects.length === 0) {
      tools.push({
        name: 'help_setup',
        description: 'Get help on how to configure projects for the RRCE MCP Server',
        inputSchema: { type: 'object', properties: {} },
      });
    }

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Calling tool: ${name}`, args);

    try {
      // Try project tools
      const projectResult = await handleProjectTool(name, args);
      if (projectResult) return projectResult;

      // Try search tools
      const searchResult = await handleSearchTool(name, args);
      if (searchResult) return searchResult;

      // Try task tools
      const taskResult = await handleTaskTool(name, args);
      if (taskResult) return taskResult;

      // Try session tools
      const sessionResult = await handleSessionTool(name, args);
      if (sessionResult) return sessionResult;

      // Try agent tools
      const agentResult = await handleAgentTool(name, args);
      if (agentResult) return agentResult;

      // Try cleanup tools
      const cleanupResult = await handleCleanupTool(name, args);
      if (cleanupResult) return cleanupResult;

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      logger.error(`Tool execution failed: ${name}`, error);
      throw error;
    }
  });
}
