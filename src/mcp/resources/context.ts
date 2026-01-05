/**
 * Context bundling and preamble generation
 */

import * as path from 'path';
import * as os from 'os';
import { normalizeProjectPath } from '../config-utils';
import { getExposedProjects, detectActiveProject, getProjectContext } from './projects';
import { searchKnowledge, searchCode, findRelatedFiles, getFileSummary } from './search';
import { getTask } from './tasks';
import { estimateTokens } from './utils';
import type { TaskMeta } from './types';

/**
 * Generate minimal context preamble for agents (token-optimized)
 * Single source of truth for path resolution - no duplication in handlers or prompts
 */
export function getContextPreamble(): string {
  const activeProject = detectActiveProject();
  
  if (!activeProject) {
    return `## System Context
No active project detected.

**To resolve paths manually:** 
- Call \`rrce_resolve_path(project: "your-project-name")\`
- Or call \`rrce_list_projects()\` to see available projects

If the above tools fail, ask the user for clarification.
---
`;
  }
  
  const rrceHome = process.env.RRCE_HOME || path.join(os.homedir(), '.rrce-workflow');
  const workspaceRoot = activeProject.sourcePath || activeProject.path || activeProject.dataPath;
  const rrceData = activeProject.dataPath;
  
  // Minimal format - single table, no redundant explanations
  // Agents inherit base protocol which explains how to use these
  return `## System Context
| Key | Value |
|-----|-------|
| WORKSPACE_ROOT | \`${workspaceRoot}\` |
| WORKSPACE_NAME | \`${activeProject.name}\` |
| RRCE_DATA | \`${rrceData}\` |
| RRCE_HOME | \`${rrceHome}\` |

---
`;
}

/**
 * Generate verbose context preamble (for debugging or explicit requests)
 * Includes project list and additional guidance
 */
export function getVerboseContextPreamble(): string {
  const projects = getExposedProjects();
  const activeProject = detectActiveProject();
  
  let contextPreamble = getContextPreamble();
  
  // Add project list only in verbose mode
  const projectList = projects.map(p => {
    const isActive = activeProject && normalizeProjectPath(p.path) === normalizeProjectPath(activeProject.path);
    return `- ${p.name} (${p.source}) ${isActive ? '**[ACTIVE]**' : ''}`;
  }).join('\n');
  
  contextPreamble += `
## Available Projects
${projectList}
`;

  if (projects.length === 0) {
    contextPreamble += `
WARNING: No projects exposed. Run 'npx rrce-workflow mcp configure'.
`;
  }

  return contextPreamble;
}

/**
 * Get a bundled context for a query - combines project context, knowledge, and code search
 * Single-call context gathering to reduce multi-tool chaining
 */
export async function getContextBundle(
  query: string,
  projectName: string,
  options: {
    task_slug?: string;
    max_tokens?: number;
    include?: {
      project_context?: boolean;
      knowledge?: boolean;
      code?: boolean;
      related_files?: boolean;
    };
  } = {}
): Promise<{
  success: boolean;
  project_context: string | null;
  knowledge_results: Array<{ file: string; matches: string[]; score?: number }>;
  code_results: Array<{ file: string; snippet: string; lineStart: number; lineEnd: number; context?: string; score: number }>;
  related_files: string[];
  token_count: number;
  truncated: boolean;
  index_age_seconds?: number;
  message?: string;
}> {
  const maxTokens = options.max_tokens ?? 4000;
  const include = {
    project_context: options.include?.project_context ?? true,
    knowledge: options.include?.knowledge ?? true,
    code: options.include?.code ?? true,
    related_files: options.include?.related_files ?? false
  };

  // Token budget allocation: 40% context, 30% knowledge, 30% code
  const contextBudget = Math.floor(maxTokens * 0.4);
  const knowledgeBudget = Math.floor(maxTokens * 0.3);
  const codeBudget = Math.floor(maxTokens * 0.3);

  let totalTokens = 0;
  let truncated = false;
  let indexAgeSeconds: number | undefined;

  // 1. Get project context
  let projectContext: string | null = null;
  if (include.project_context) {
    const rawContext = getProjectContext(projectName);
    if (rawContext) {
      const contextTokens = estimateTokens(rawContext);
      if (contextTokens <= contextBudget) {
        projectContext = rawContext;
        totalTokens += contextTokens;
      } else {
        // Truncate to budget
        const maxChars = contextBudget * 4;
        projectContext = rawContext.slice(0, maxChars) + '\n\n[truncated]';
        totalTokens += contextBudget;
        truncated = true;
      }
    }
  }

  // 2. Search knowledge
  const knowledgeResults: Array<{ file: string; matches: string[]; score?: number }> = [];
  if (include.knowledge) {
    const knowledgeSearch = await searchKnowledge(query, projectName, { max_tokens: knowledgeBudget });
    for (const r of knowledgeSearch.results) {
      knowledgeResults.push({
        file: r.file,
        matches: r.matches,
        score: r.score
      });
    }
    totalTokens += knowledgeSearch.token_count;
    if (knowledgeSearch.truncated) truncated = true;
    if (knowledgeSearch.index_age_seconds !== undefined) {
      indexAgeSeconds = knowledgeSearch.index_age_seconds;
    }
  }

  // 3. Search code
  const codeResults: Array<{ file: string; snippet: string; lineStart: number; lineEnd: number; context?: string; score: number }> = [];
  if (include.code) {
    const codeSearch = await searchCode(query, projectName, 10, { max_tokens: codeBudget });
    for (const r of codeSearch.results) {
      codeResults.push({
        file: r.file,
        snippet: r.snippet,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        context: r.context,
        score: r.score
      });
    }
    totalTokens += codeSearch.token_count;
    if (codeSearch.truncated) truncated = true;
    if (codeSearch.index_age_seconds !== undefined && indexAgeSeconds === undefined) {
      indexAgeSeconds = codeSearch.index_age_seconds;
    }
  }

  // 4. Find related files (if requested and we have code results)
  const relatedFiles: string[] = [];
  if (include.related_files && codeResults.length > 0) {
    const topFile = codeResults[0]?.file;
    if (topFile) {
      const related = await findRelatedFiles(topFile, projectName, { depth: 1 });
      if (related.success) {
        for (const r of related.relationships.slice(0, 5)) {
          relatedFiles.push(r.file);
        }
      }
    }
  }

  return {
    success: true,
    project_context: projectContext,
    knowledge_results: knowledgeResults,
    code_results: codeResults,
    related_files: relatedFiles,
    token_count: totalTokens,
    truncated,
    index_age_seconds: indexAgeSeconds
  };
}

/**
 * Prefetch all context relevant to a specific task
 * Reads task meta, gathers referenced files, runs knowledge/code search on task summary
 */
export async function prefetchTaskContext(
  projectName: string,
  taskSlug: string,
  options: {
    max_tokens?: number;
  } = {}
): Promise<{
  success: boolean;
  task: TaskMeta | null;
  project_context: string | null;
  referenced_files: Array<{ path: string; language: string; lines: number; exports: string[] }>;
  knowledge_matches: Array<{ file: string; matches: string[]; score?: number }>;
  code_matches: Array<{ file: string; snippet: string; lineStart: number; lineEnd: number; score: number }>;
  token_count: number;
  truncated: boolean;
  message?: string;
}> {
  const maxTokens = options.max_tokens ?? 6000;
  
  // Get the task
  const task = getTask(projectName, taskSlug);
  if (!task) {
    return {
      success: false,
      task: null,
      project_context: null,
      referenced_files: [],
      knowledge_matches: [],
      code_matches: [],
      token_count: 0,
      truncated: false,
      message: `Task '${taskSlug}' not found in project '${projectName}'`
    };
  }

  // Build search query from task
  const searchQuery = `${task.title || ''} ${task.summary || ''}`.trim();
  
  // Get context bundle using the task summary as query
  const bundle = await getContextBundle(searchQuery, projectName, {
    max_tokens: Math.floor(maxTokens * 0.7), // Reserve 30% for referenced files
    include: {
      project_context: true,
      knowledge: true,
      code: true,
      related_files: false
    }
  });

  // Get summaries of referenced files
  const referencedFiles: Array<{ path: string; language: string; lines: number; exports: string[] }> = [];
  const references = (task as any).references as string[] | undefined;
  if (references && Array.isArray(references)) {
    for (const ref of references.slice(0, 5)) {
      const summary = await getFileSummary(ref, projectName);
      if (summary.success && summary.summary) {
        referencedFiles.push({
          path: summary.summary.path,
          language: summary.summary.language,
          lines: summary.summary.lines,
          exports: summary.summary.exports
        });
      }
    }
  }

  const taskTokens = estimateTokens(JSON.stringify(task));
  const refTokens = estimateTokens(JSON.stringify(referencedFiles));
  
  return {
    success: true,
    task,
    project_context: bundle.project_context,
    referenced_files: referencedFiles,
    knowledge_matches: bundle.knowledge_results,
    code_matches: bundle.code_results,
    token_count: bundle.token_count + taskTokens + refTokens,
    truncated: bundle.truncated
  };
}
