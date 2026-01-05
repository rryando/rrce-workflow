import { 
  searchKnowledge,
  searchCode,
  findRelatedFiles,
  searchSymbols,
  getFileSummary,
  getContextBundle,
  prefetchTaskContext
} from '../../resources';
import { logger } from '../../logger';

export const searchTools = [
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
];

export async function handleSearchTool(name: string, args: Record<string, any> | undefined) {
  if (!args) return null;

  switch (name) {
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

    default:
      return null;
  }
}
