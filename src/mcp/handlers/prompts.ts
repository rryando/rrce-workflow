import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../logger';
import { getExposedProjects, detectActiveProject, getContextPreamble } from '../resources';
import { getAllPrompts, getPromptDef, renderPrompt } from '../prompts';
import { getEffectiveGlobalPath } from '../../lib/paths';
import * as path from 'path';

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



      // Resolve Project Paths & Context
      // This is crucial for fixing the "Global Project" issue where agents default to local dir
      const activeProject = detectActiveProject();
      const DEFAULT_RRCE_HOME = getEffectiveGlobalPath();
      
      let resolvedRrceData = '.rrce-workflow/'; // Default to local if no project found
      let resolvedRrceHome = DEFAULT_RRCE_HOME;
      let resolvedWorkspaceRoot = process.cwd();
      let resolvedWorkspaceName = 'current-project';

      if (activeProject) {
        resolvedRrceData = activeProject.dataPath + '/'; // Ensure trailing slash
        resolvedWorkspaceRoot = activeProject.sourcePath || activeProject.path || activeProject.dataPath;
        resolvedWorkspaceName = activeProject.name;
        
        // If it's a global project, usually we want to know the global home too
        if (activeProject.source === 'global') {
           // We can infer RRCE_HOME as parent of workspaces dir
           // path = /home/user/.rrce-workflow/workspaces/proj
           const workspacesDir = path.dirname(activeProject.dataPath);
           resolvedRrceHome = path.dirname(workspacesDir);
        }
      }

      // Inject system variables if not provided by user
      if (!renderArgs['RRCE_DATA']) renderArgs['RRCE_DATA'] = resolvedRrceData;
      if (!renderArgs['RRCE_HOME']) renderArgs['RRCE_HOME'] = resolvedRrceHome;
      if (!renderArgs['WORKSPACE_ROOT']) renderArgs['WORKSPACE_ROOT'] = resolvedWorkspaceRoot;
      if (!renderArgs['WORKSPACE_NAME']) renderArgs['WORKSPACE_NAME'] = resolvedWorkspaceName;

      // Render content with these variables
      const content = renderPrompt(promptDef.content, renderArgs);

      // Inject Available Projects Context using shared utility
      let contextPreamble = getContextPreamble();
      
      // Add Pre-Resolved Paths section to guide the agent
      contextPreamble += `
### System Resolved Paths (OVERRIDE)
The system has pre-resolved the configuration for this project. Use these values instead of manual resolution:
- **RRCE_DATA**: \`${resolvedRrceData}\` (Stores knowledge, tasks, refs)
- **WORKSPACE_ROOT**: \`${resolvedWorkspaceRoot}\` (Source code location)
- **RRCE_HOME**: \`${resolvedRrceHome}\`
- **Current Project**: ${resolvedWorkspaceName}
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
