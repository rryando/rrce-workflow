import { 
  getExposedProjects, 
  getProjectContext, 
  indexKnowledge, 
  resolveProjectPaths 
} from '../../resources';
import { logger } from '../../logger';
import type { DetectedProject } from '../../../lib/detection';

export const projectTools = [
  {
    name: 'resolve_path',
    description: 'Resolve configuration paths (RRCE_DATA, etc.) for a project. Helps determine if a project is using global or local storage.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        path: { type: 'string', description: 'Absolute path to the project root (WORKSPACE_ROOT)' },
      },
    },
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
    name: 'index_knowledge',
    description: 'Update the semantic search index for a specific project',
    inputSchema: {
      type: 'object',
      properties: { 
        project: { type: 'string', description: 'Name of the project to index' },
        force: { type: 'boolean', description: 'Force re-indexing of all files' },
        clean: { type: 'boolean', description: 'Wipe existing index and rebuild from scratch' }
      },
      required: ['project']
    },
  },
];

export async function handleProjectTool(name: string, args: Record<string, any> | undefined) {
  if (!args) {
    if (name === 'list_projects' || name === 'help_setup') {
      // These don't need args
    } else {
      return null;
    }
  }

  switch (name) {
    case 'resolve_path': {
      const params = args as { project?: string; path?: string };
      const result = resolveProjectPaths(params.project, params.path);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'list_projects': {
      const projects = getExposedProjects();
      const list = projects.map((p: DetectedProject) => ({ name: p.name, source: p.source, path: p.path }));
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
        const projects = getExposedProjects().map((p: DetectedProject) => p.name).join(', ');
        const msg = `No project context found for "${(args as { project: string }).project}".\nAvailable projects: ${projects}`;
        logger.warn(msg);
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
      return { content: [{ type: 'text', text: context }] };
    }

    case 'index_knowledge': {
      const params = args as { project: string; force?: boolean; clean?: boolean };
      const result = await indexKnowledge(params.project, params.force, params.clean);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
      return null;
  }
}
