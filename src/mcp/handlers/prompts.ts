import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../logger';
import { getExposedProjects, detectActiveProject } from '../resources';
import { getAllPrompts, getPromptDef, renderPrompt } from '../prompts';

/**
 * Register MCP prompt handlers
 */
export function registerPromptHandlers(server: Server): void {
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
      if (projects.length === 0) {
        contextPreamble += `
WARNING: No projects are currently exposed to the MCP server.
The user needs to run 'npx rrce-workflow mcp configure' in their terminal to select projects to expose.
Please advise the user to do this if they expect to see project context.
`;
      }

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
