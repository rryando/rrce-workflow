import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../logger';
import { 
  getExposedProjects, 
  getProjectContext, 
  searchKnowledge,
  searchCode,
  searchSymbols,
  getFileSummary,
  getContextBundle,
  prefetchTaskContext,
  searchTasks,
  validatePhase,
  findRelatedFiles,
  indexKnowledge, 
  detectActiveProject, 
  getContextPreamble,
  getProjectTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  resolveProjectPaths,
  startSession,
  endSession,
  updateAgentTodos,
  getAgentTodos,
  getSession
} from '../resources';
import { getAllPrompts, getPromptDef, renderPrompt, renderPromptWithContext } from '../prompts';

/**
 * Register MCP tool handlers
 */
export function registerToolHandlers(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
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
        name: 'search_knowledge',
        description: 'Search across all exposed project knowledge bases. Returns results with token count and optional truncation.',
        inputSchema: {
          type: 'object',
          properties: { 
            query: { type: 'string', description: 'Search query to find in knowledge files' },
            project: { type: 'string', description: 'Optional: limit search to specific project name' },
            max_tokens: { type: 'number', description: 'Optional: maximum tokens for response (truncates by relevance)' },
            min_score: { type: 'number', description: 'Optional: minimum relevance score threshold (0-1)' }
          },
          required: ['query'],
        },
      },
      {
        name: 'search_code',
        description: 'Semantic search across code files. Returns code snippets with line numbers, function/class context, and token budget support.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (e.g., "error handling", "authentication logic", "database connection")' },
            project: { type: 'string', description: 'Optional: limit search to specific project name' },
            limit: { type: 'number', description: 'Maximum number of results (default 10)' },
            max_tokens: { type: 'number', description: 'Optional: maximum tokens for response (truncates by relevance)' },
            min_score: { type: 'number', description: 'Optional: minimum relevance score threshold (0-1)' }
          },
          required: ['query'],
        },
      },
      {
        name: 'find_related_files',
        description: 'Find files related to a given file through import/dependency relationships. Use for understanding code structure, finding consumers of a module, or tracing data flow.',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'Path to the file (absolute or project-relative)' },
            project: { type: 'string', description: 'Name of the project' },
            include_imports: { type: 'boolean', description: 'Include files this file imports (default true)' },
            include_imported_by: { type: 'boolean', description: 'Include files that import this file (default true)' },
            depth: { type: 'number', description: 'How many levels of relationships to traverse (default 1)' }
          },
          required: ['file', 'project'],
        },
      },
      {
        name: 'search_symbols',
        description: 'Search for code symbols (functions, classes, types, variables) by name. Uses fuzzy matching. Faster than search_code for finding definitions.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Symbol name to search for' },
            project: { type: 'string', description: 'Name of the project' },
            type: { type: 'string', enum: ['function', 'class', 'type', 'interface', 'variable', 'const', 'enum', 'any'], description: 'Filter by symbol type (default: any)' },
            fuzzy: { type: 'boolean', description: 'Use fuzzy matching (default: true)' },
            limit: { type: 'number', description: 'Maximum results (default: 10)' }
          },
          required: ['name', 'project'],
        },
      },
      {
        name: 'get_file_summary',
        description: 'Get a quick summary of a file without reading full content. Returns: language, LOC, exports, imports, key symbols.',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'Path to the file (absolute or project-relative)' },
            project: { type: 'string', description: 'Name of the project' }
          },
          required: ['file', 'project'],
        },
      },
      {
        name: 'get_context_bundle',
        description: 'Get bundled context for a query: project context + knowledge + code in one call. Reduces multi-tool chaining. Respects token budget.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language query or task description' },
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'Optional: task slug to include task-specific context' },
            max_tokens: { type: 'number', description: 'Max tokens for response (default: 4000)' },
            include: {
              type: 'object',
              description: 'What to include in the bundle',
              properties: {
                project_context: { type: 'boolean', description: 'Include project context (default: true)' },
                knowledge: { type: 'boolean', description: 'Include knowledge search results (default: true)' },
                code: { type: 'boolean', description: 'Include code search results (default: true)' },
                related_files: { type: 'boolean', description: 'Include related files (default: false)' }
              }
            }
          },
          required: ['query', 'project'],
        },
      },
      {
        name: 'prefetch_task_context',
        description: 'Pre-gather all context for a task: task meta, referenced files, knowledge matches, code matches. Single call for task-aware context.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'The task slug' },
            max_tokens: { type: 'number', description: 'Max tokens for response (default: 6000)' }
          },
          required: ['project', 'task_slug'],
        },
      },
      {
        name: 'search_tasks',
        description: 'Search across all tasks by keyword, status, agent phase, or date. Returns matching tasks sorted by relevance.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            keyword: { type: 'string', description: 'Search in title/summary' },
            status: { type: 'string', description: 'Filter by status (draft, in_progress, complete, etc.)' },
            agent: { type: 'string', description: 'Filter by agent phase (research, planning, executor, documentation)' },
            since: { type: 'string', description: 'ISO date - tasks updated after this date' },
            limit: { type: 'number', description: 'Max results (default: 20)' }
          },
          required: ['project'],
        },
      },
      {
        name: 'validate_phase',
        description: 'Check if a task phase has all prerequisites complete. Returns validation result with missing items and suggestions.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'The task slug' },
            phase: { type: 'string', enum: ['research', 'planning', 'execution', 'documentation'], description: 'Phase to validate' }
          },
          required: ['project', 'task_slug', 'phase'],
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
      {
        name: 'list_tasks',
        description: 'List all tasks for a project',
        inputSchema: {
          type: 'object',
          properties: { project: { type: 'string', description: 'Name of the project' } },
          required: ['project'],
        },
      },
      {
        name: 'get_task',
        description: 'Get details of a specific task',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'The slug of the task' },
          },
          required: ['project', 'task_slug'],
        },
      },
      {
        name: 'create_task',
        description: 'Create a new task in the project',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'The slug for the new task (kebab-case)' },
            title: { type: 'string', description: 'The title of the task' },
            summary: { type: 'string', description: 'Brief summary of the task' },
          },
          required: ['project', 'task_slug'],
        },
      },
      {
        name: 'update_task',
        description: 'Update an existing task',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'The slug of the task' },
            updates: { type: 'object', description: 'The fields to update in meta.json', additionalProperties: true },
          },
          required: ['project', 'task_slug', 'updates'],
        },
      },
      {
        name: 'delete_task',
        description: 'Delete a task from the project',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'The slug of the task to delete' },
          },
          required: ['project', 'task_slug'],
        },
      },
      {
        name: 'start_session',
        description: 'Start an agent session for active task tracking. Call this when beginning work on a task phase.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'The slug of the task' },
            agent: { type: 'string', description: 'Agent type: research, planning, executor, or documentation' },
            phase: { type: 'string', description: 'Current phase description (e.g., "clarification", "task breakdown")' },
          },
          required: ['project', 'task_slug', 'agent', 'phase'],
        },
      },
      {
        name: 'end_session',
        description: 'End an agent session. Call this before emitting completion signal.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'The slug of the task' },
          },
          required: ['project', 'task_slug'],
        },
      },
      {
        name: 'update_agent_todos',
        description: 'Update the agent todo list for a task. Use this to track granular work items during a phase.',
        inputSchema: {
          type: 'object',
          properties: {
            project: { type: 'string', description: 'Name of the project' },
            task_slug: { type: 'string', description: 'The slug of the task' },
            phase: { type: 'string', description: 'Current phase' },
            agent: { type: 'string', description: 'Agent type' },
            items: { 
              type: 'array', 
              description: 'Todo items array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  content: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
                  priority: { type: 'string', enum: ['high', 'medium', 'low'] }
                },
                required: ['id', 'content', 'status', 'priority']
              }
            },
          },
          required: ['project', 'task_slug', 'phase', 'agent', 'items'],
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
        case 'resolve_path': {
            const params = args as { project?: string; path?: string };
            const result = resolveProjectPaths(params.project, params.path);
            return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'search_knowledge': {
          const params = args as { query: string; project?: string; max_tokens?: number; min_score?: number };
          const result = await searchKnowledge(params.query, params.project, {
            max_tokens: params.max_tokens,
            min_score: params.min_score
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'search_code': {
          const params = args as { query: string; project?: string; limit?: number; max_tokens?: number; min_score?: number };
          const result = await searchCode(params.query, params.project, params.limit, {
            max_tokens: params.max_tokens,
            min_score: params.min_score
          });
          if (result.results.length === 0) {
            return {
              content: [{
                type: 'text',
                text: 'No code matches found. The code index may be empty or semantic search is not enabled.\nRun `index_knowledge` first to build the code index.'
              }]
            };
          }
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'find_related_files': {
          const params = args as {
            file: string;
            project: string;
            include_imports?: boolean;
            include_imported_by?: boolean;
            depth?: number;
          };
          const result = await findRelatedFiles(params.file, params.project, {
            includeImports: params.include_imports,
            includeImportedBy: params.include_imported_by,
            depth: params.depth
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'search_symbols': {
          const params = args as {
            name: string;
            project: string;
            type?: string;
            fuzzy?: boolean;
            limit?: number;
          };
          const result = await searchSymbols(params.name, params.project, {
            type: params.type as any,
            fuzzy: params.fuzzy,
            limit: params.limit
          });
          if (!result.success) {
            return { content: [{ type: 'text', text: result.message || 'Search failed' }], isError: true };
          }
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'get_file_summary': {
          const params = args as { file: string; project: string };
          const result = await getFileSummary(params.file, params.project);
          if (!result.success) {
            return { content: [{ type: 'text', text: result.message || 'Failed to get file summary' }], isError: true };
          }
          return { content: [{ type: 'text', text: JSON.stringify(result.summary, null, 2) }] };
        }

        case 'get_context_bundle': {
          const params = args as {
            query: string;
            project: string;
            task_slug?: string;
            max_tokens?: number;
            include?: {
              project_context?: boolean;
              knowledge?: boolean;
              code?: boolean;
              related_files?: boolean;
            };
          };
          const result = await getContextBundle(params.query, params.project, {
            task_slug: params.task_slug,
            max_tokens: params.max_tokens,
            include: params.include
          });
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
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
           
          const { rendered } = renderPromptWithContext(promptDef.content, stringArgs);
          
          // Single source of truth for context - no duplicate path sections
          // getContextPreamble() provides minimal System Context table
          // Base protocol (injected by renderPromptWithContext) explains how to use it
          const contextPreamble = getContextPreamble();

          return { content: [{ type: 'text', text: contextPreamble + rendered }] };
        }

        case 'list_tasks': {
          const params = args as { project: string };
          const tasks = getProjectTasks(params.project);
          return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
        }

        case 'get_task': {
          const params = args as { project: string; task_slug: string };
          const task = getTask(params.project, params.task_slug);
          if (!task) {
            return { content: [{ type: 'text', text: `Task '${params.task_slug}' not found in project '${params.project}'.` }], isError: true };
          }
          return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
        }

        case 'create_task': {
          const params = args as { project: string; task_slug: string; title?: string; summary?: string };
          const taskData = {
              title: params.title || params.task_slug,
              summary: params.summary || ""
          };
          const task = await createTask(params.project, params.task_slug, taskData);
          return { content: [{ type: 'text', text: `✓ Task '${params.task_slug}' created. meta.json saved.\n${JSON.stringify(task, null, 2)}` }] };
        }

        case 'update_task': {
          const params = args as { project: string; task_slug: string; updates: any };
          const task = await updateTask(params.project, params.task_slug, params.updates);
          return { content: [{ type: 'text', text: `✓ Task '${params.task_slug}' updated. meta.json saved.\n${JSON.stringify(task, null, 2)}` }] };
        }

        case 'delete_task': {
          const params = args as { project: string; task_slug: string };
          const success = deleteTask(params.project, params.task_slug);
          return { content: [{ type: 'text', text: success ? `✓ Task '${params.task_slug}' deleted.` : `✗ Failed to delete '${params.task_slug}'.` }] };
        }

        case 'start_session': {
          const params = args as { project: string; task_slug: string; agent: string; phase: string };
          const result = startSession(params.project, params.task_slug, params.agent as any, params.phase);
          return { content: [{ type: 'text', text: result.message }], isError: !result.success };
        }

        case 'end_session': {
          const params = args as { project: string; task_slug: string };
          const result = endSession(params.project, params.task_slug);
          return { content: [{ type: 'text', text: result.message }], isError: !result.success };
        }

        case 'update_agent_todos': {
          const params = args as { project: string; task_slug: string; phase: string; agent: string; items: any[] };
          const result = updateAgentTodos(params.project, params.task_slug, params.phase, params.agent, params.items);
          return { content: [{ type: 'text', text: result.message }], isError: !result.success };
        }

        case 'prefetch_task_context': {
          const params = args as { project: string; task_slug: string; max_tokens?: number };
          const result = await prefetchTaskContext(params.project, params.task_slug, {
            max_tokens: params.max_tokens
          });
          if (!result.success) {
            return { content: [{ type: 'text', text: result.message || 'Failed to prefetch task context' }], isError: true };
          }
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }

        case 'search_tasks': {
          const params = args as { 
            project: string; 
            keyword?: string; 
            status?: string; 
            agent?: string; 
            since?: string; 
            limit?: number 
          };
          const results = searchTasks(params.project, {
            keyword: params.keyword,
            status: params.status,
            agent: params.agent,
            since: params.since,
            limit: params.limit
          });
          return { content: [{ type: 'text', text: JSON.stringify({ count: results.length, tasks: results }, null, 2) }] };
        }

        case 'validate_phase': {
          const params = args as { 
            project: string; 
            task_slug: string; 
            phase: 'research' | 'planning' | 'execution' | 'documentation' 
          };
          const result = validatePhase(params.project, params.task_slug, params.phase);
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
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      logger.error(`Tool execution failed: ${name}`, error);
      throw error;
    }
  });
}
