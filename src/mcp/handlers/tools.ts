import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../logger';
import { getExposedProjects, getProjectContext, searchKnowledge, indexKnowledge, detectActiveProject } from '../resources';
import { getAllPrompts, getPromptDef, renderPrompt } from '../prompts';

/**
 * Register MCP tool handlers
 */
export function registerToolHandlers(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
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
        name: 'index_knowledge',
        description: 'Update the semantic search index for a specific project',
        inputSchema: {
            type: 'object',
            properties: { 
                project: { type: 'string', description: 'Name of the project to index' },
                force: { type: 'boolean', description: 'Force re-indexing of all files' }
            },
            required: ['project']
        }
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
    ];

    // Check if any projects are exposed. If not, add a help setup tool.
    const projects = getExposedProjects();
    if (projects.length === 0) {
        // @ts-ignore - Dynamic tool addition
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
      switch (name) {
        case 'search_knowledge': {
          const results = await searchKnowledge((args as { query: string }).query);
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        }

        case 'index_knowledge': {
            const params = args as { project: string; force?: boolean };
            const result = await indexKnowledge(params.project, params.force);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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

        case 'help_setup': {
            const msg = `
RRCE MCP Server is running, but no projects are configured/exposed.

To fix this:
1. Open a terminal.
2. Run: npx rrce-workflow mcp configure
3. Select the projects you want to expose to the AI.
4. Restart the MCP server (or it may pick up changes automatically).
`;
            return { content: [{ type: 'text', text: msg }] };
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
