/**
 * MCP Server Implementation using @modelcontextprotocol/sdk
 * Provides stdio transport for VSCode Copilot integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import * as fs from 'fs';
import * as path from 'path';

import { logger } from './logger';
import { loadMCPConfig, getProjectPermissions } from './config';
import { getExposedProjects, getProjectContext, getProjectTasks, searchKnowledge, detectActiveProject } from './resources';
import { getAllPrompts, getPromptDef, renderPrompt } from './prompts';
import { getAgentCorePromptsDir } from '../lib/prompts';

interface ServerStatus {
  running: boolean;
  port?: number;
  pid?: number;
}

// In-memory server state
let serverState: ServerStatus = { running: false };
let mcpServer: Server | null = null;

/**
 * Start the MCP server with stdio transport
 */
export async function startMCPServer(): Promise<{ port: number; pid: number }> {
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

    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    serverState = { running: true, port: config.server.port, pid: process.pid };

    const exposed = getExposedProjects().map(p => p.name).join(', ');
    logger.info(`RRCE MCP Hub started (pid: ${process.pid})`, { exposedProjects: exposed });
    console.error(`RRCE MCP Hub started (pid: ${process.pid})`);
    console.error(`Exposed projects: ${exposed}`);

    return { port: config.server.port, pid: process.pid };
  } catch (error) {
    logger.error('Failed to start MCP server', error);
    throw error;
  }
}

/**
 * Register MCP resource handlers
 */
function registerResourceHandlers(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logger.debug('Listing resources');
    const projects = getExposedProjects();
    const resources: Array<{ uri: string; name: string; description: string; mimeType: string }> = [];

    resources.push({
      uri: 'rrce://projects',
      name: 'Project List',
      description: 'List of all RRCE projects exposed via MCP',
      mimeType: 'application/json',
    });

    for (const project of projects) {
      const config = loadMCPConfig();
      const permissions = getProjectPermissions(config, project.name);

      if (permissions.knowledge) {
        resources.push({
          uri: `rrce://projects/${project.name}/context`,
          name: `${project.name} - Project Context`,
          description: `Project context and architecture for ${project.name}`,
          mimeType: 'text/markdown',
        });
      }

      if (permissions.tasks) {
        resources.push({
          uri: `rrce://projects/${project.name}/tasks`,
          name: `${project.name} - Tasks`,
          description: `Task list and status for ${project.name}`,
          mimeType: 'application/json',
        });
      }
    }

    return { resources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    logger.info(`Reading resource: ${uri}`);

    try {
      if (uri === 'rrce://projects') {
        const projects = getExposedProjects();
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(projects.map(p => ({ name: p.name, source: p.source, path: p.path })), null, 2),
          }],
        };
      }

      const projectMatch = uri.match(/^rrce:\/\/projects\/([^/]+)\/(.+)$/);
      if (projectMatch && projectMatch[1] && projectMatch[2]) {
        const projectName = projectMatch[1];
        const resourceType = projectMatch[2];
        
        const content = resourceType === 'context' 
          ? getProjectContext(projectName)
          : JSON.stringify(getProjectTasks(projectName), null, 2);
        
        if (content === null) throw new Error(`Resource not found: ${uri}`);

        return {
          contents: [{
            uri,
            mimeType: resourceType === 'tasks' ? 'application/json' : 'text/markdown',
            text: content,
          }],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    } catch (error) {
      logger.error(`Failed to read resource: ${uri}`, error);
      throw error;
    }
  });
}

/**
 * Register MCP tool handlers
 */
function registerToolHandlers(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_knowledge',
        description: 'Search across all exposed project knowledge bases',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Search query to find in knowledge files' } },
          required: ['query'],
        },
      },
      {
        name: 'list_projects',
        description: 'List all projects exposed via MCP',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_project_context',
        description: 'Get the project context/architecture for a specific project',
        inputSchema: {
          type: 'object',
          properties: { project: { type: 'string', description: 'Name of the project to get context for' } },
          required: ['project'],
        },
      },
      {
        name: 'list_agents',
        description: 'List available RRCE agents/workflows',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_agent_prompt',
        description: 'Get the instructions/prompt for a specific agent',
        inputSchema: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Name of the agent (e.g. init, plan, execute)' },
            args: { type: 'object', description: 'Arguments for the agent prompt', additionalProperties: true },
          },
          required: ['agent'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Calling tool: ${name}`, args);

    try {
      switch (name) {
        case 'search_knowledge': {
          const results = searchKnowledge((args as { query: string }).query);
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        }

        case 'list_projects': {
          const projects = getExposedProjects();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(projects.map(p => ({ name: p.name, source: p.source, path: p.path })), null, 2),
            }],
          };
        }

        case 'get_project_context': {
          const context = getProjectContext((args as { project: string }).project);
          if (!context) {
            const msg = `No project context found for "${(args as { project: string }).project}"`;
            logger.warn(msg);
            return { content: [{ type: 'text', text: msg }], isError: true };
          }
          return { content: [{ type: 'text', text: context }] };
        }

        case 'list_agents': {
          const prompts = getAllPrompts();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(prompts.map(p => ({ 
                name: p.name, 
                description: p.description,
                arguments: p.arguments 
              })), null, 2),
            }],
          };
        }

        case 'get_agent_prompt': {
          const params = args as { agent: string; args?: Record<string, string> };
          const agentName = params.agent;
          const promptDef = getPromptDef(agentName);
          
          if (!promptDef) {
            throw new Error(`Agent not found: ${agentName}`);
          }

          // Generate Prompt with Context Injection (Reusing logic from GetPrompt handler would be ideal, but for now duplicate the injection to ensure consistency)
          // Actually, I should probably extract the "generatePromptWithContext" logic to a helper function to avoid duplication.
          // But for now, let's reuse the logic from prompts.ts (renderPrompt) and add strict context.
          
          // Render content
          const renderArgs = params.args || {};
          // Ensure strings
          const stringArgs: Record<string, string> = {};
          for (const [key, val] of Object.entries(renderArgs)) {
            stringArgs[key] = String(val);
          }
           
          const content = renderPrompt(promptDef.content, stringArgs);
          
          // Context Injection (Same as GetPromptRequest)
          const projects = getExposedProjects();
          const activeProject = detectActiveProject();
          
          const projectList = projects.map(p => {
            const isActive = activeProject && p.dataPath === activeProject.dataPath;
            return `- ${p.name} (${p.source}) ${isActive ? '**[ACTIVE]**' : ''}`;
          }).join('\n');
          
          let contextPreamble = `
Context - Available Projects (MCP Hub):
${projectList}
`;

          if (activeProject) {
            contextPreamble += `\nCurrent Active Workspace: ${activeProject.name} (${activeProject.path})\n`;
            contextPreamble += `IMPORTANT: Treat '${activeProject.path}' as the {{WORKSPACE_ROOT}}. All relative path operations (file reads/writes) MUST be performed relative to this directory.\n`;
          }

          contextPreamble += `
Note: If the user's request refers to a project not listed here, ask them to expose it via 'rrce-workflow mcp configure'.

---
`;
          return { content: [{ type: 'text', text: contextPreamble + content }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Tool execution failed: ${name}`, error);
      throw error;
    }
  });
}

/**
 * Register MCP prompt handlers
 */
function registerPromptHandlers(server: Server): void {
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    logger.debug('Listing prompts');
    const prompts = getAllPrompts();

    return {
      prompts: prompts.map(p => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments.map(a => ({
          name: a.name,
          description: a.description,
          required: a.required,
        })),
      })),
    };
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.info(`Getting prompt: ${name}`, args);

    const promptDef = getPromptDef(name);
    if (!promptDef) {
      logger.error(`Prompt not found: ${name}`);
      throw new Error(`Prompt not found: ${name}`);
    }

    try {
      // Validate required arguments
      const providedArgs = args || {};
      const missingArgs = promptDef.arguments
        .filter(a => a.required && !providedArgs[a.name])
        .map(a => a.name);

      if (missingArgs.length > 0) {
        throw new Error(`Missing required arguments: ${missingArgs.join(', ')}`);
      }

      // Render content
      // Ensure all args are strings
      const renderArgs: Record<string, string> = {};
      for (const [key, val] of Object.entries(providedArgs)) {
        renderArgs[key] = String(val);
      }

      const content = renderPrompt(promptDef.content, renderArgs);

      // Inject Available Projects Context
      const projects = getExposedProjects();
      const activeProject = detectActiveProject();
      
      const projectList = projects.map(p => {
        const isActive = activeProject && p.dataPath === activeProject.dataPath;
        return `- ${p.name} (${p.source}) ${isActive ? '**[ACTIVE]**' : ''}`;
      }).join('\n');
      
      let contextPreamble = `
Context - Available Projects (MCP Hub):
${projectList}
`;

      if (activeProject) {
        contextPreamble += `\nCurrent Active Workspace: ${activeProject.name} (${activeProject.path})\n`;
        contextPreamble += `IMPORTANT: Treat '${activeProject.path}' as the {{WORKSPACE_ROOT}}. All relative path operations (file reads/writes) MUST be performed relative to this directory.\n`;
      }

      contextPreamble += `
Note: If the user's request refers to a project not listed here, ask them to expose it via 'rrce-workflow mcp configure'.

---
`;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: contextPreamble + content,
            },
          },
        ],
      };
    } catch (error) {
      logger.error(`Failed to get prompt: ${name}`, error);
      throw error;
    }
  });
}

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
  console.error('RRCE MCP Hub stopped');
}

/**
 * Get current server status
 */
export function getMCPServerStatus(): ServerStatus {
  return { ...serverState };
}
