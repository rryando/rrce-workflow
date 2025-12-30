import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../logger';
import { getExposedProjects, getProjectContext, searchKnowledge, indexKnowledge, detectActiveProject, getContextPreamble } from '../resources';
import { getAllPrompts, getPromptDef, renderPrompt, renderPromptWithContext } from '../prompts';

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
          properties: { 
            query: { type: 'string', description: 'Search query to find in knowledge files' },
            project: { type: 'string', description: 'Optional: limit search to specific project name' }
          },
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
        description: 'List all projects exposed via MCP. Use these names for project-specific tools.',
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
        description: 'List available agents (e.g. init, plan) and their arguments. Use this to discover which agent to call.',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'get_agent_prompt',
        description: 'Get the system prompt for a specific agent. Accepts agent Name (e.g. "RRCE Init") or ID (e.g. "init").',
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
          const params = args as { query: string; project?: string };
          const results = await searchKnowledge(params.query, params.project);
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
        }

        case 'index_knowledge': {
            const params = args as { project: string; force?: boolean };
            const result = await indexKnowledge(params.project, params.force);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'list_projects': {
          const projects = getExposedProjects();
          const list = projects.map(p => ({ name: p.name, source: p.source, path: p.path }));
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(list, null, 2) + 
                "\n\nTip: Use these project names for tools like `get_project_context` or `index_knowledge`.",
            }],
          };
        }

        case 'get_project_context': {
          const context = getProjectContext((args as { project: string }).project);
          if (!context) {
            const projects = getExposedProjects().map(p => p.name).join(', ');
            const msg = `No project context found for "${(args as { project: string }).project}".\nAvailable projects: ${projects}`;
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
                id: p.id,
                description: p.description,
                arguments: p.arguments 
              })), null, 2) +
              "\n\nTip: Retrieve the prompt for an agent using `get_agent_prompt` with its name or ID.",
            }],
          };
        }

        case 'get_agent_prompt': {
          const params = args as { agent: string; args?: Record<string, string> };
          const agentName = params.agent;
          const promptDef = getPromptDef(agentName);
          
          if (!promptDef) {
            const available = getAllPrompts().map(p => `${p.name} (id: ${p.id})`).join(', ');
            throw new Error(`Agent not found: ${agentName}. Available agents: ${available}`);
          }
          
          // Render content
          const renderArgs = params.args || {};
          // Ensure strings
          const stringArgs: Record<string, string> = {};
          for (const [key, val] of Object.entries(renderArgs)) {
            stringArgs[key] = String(val);
          }
           
          const { rendered, context } = renderPromptWithContext(promptDef.content, stringArgs);
          
          // Context Injection (Same as GetPromptRequest)
          let contextPreamble = getContextPreamble();
          
          // Add Pre-Resolved Paths section to guide the agent
          contextPreamble += `
### System Resolved Paths (OVERRIDE)
The system has pre-resolved the configuration for this project. Use these values instead of manual resolution:
- **RRCE_DATA**: \`${context.RRCE_DATA}\` (Stores knowledge, tasks, refs)
- **WORKSPACE_ROOT**: \`${context.WORKSPACE_ROOT}\` (Source code location)
- **RRCE_HOME**: \`${context.RRCE_HOME}\`
- **Current Project**: ${context.WORKSPACE_NAME}
`;

          return { content: [{ type: 'text', text: contextPreamble + rendered }] };
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
