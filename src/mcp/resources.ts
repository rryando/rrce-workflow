/**
 * MCP Resources - Project data access utilities
 * Shared between MCP server and other modules
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import ignore from 'ignore';
import { logger } from './logger';
import type { IndexJobState } from './services/indexing-jobs';
import { loadMCPConfig, isProjectExposed, getProjectPermissions } from './config';
import { normalizeProjectPath, findProjectConfig } from './config-utils';
import { type DetectedProject, findClosestProject } from '../lib/detection';
import { projectService } from '../lib/detection-service';
import { RAGService } from './services/rag';
import type { CodeChunk, ChunkWithLines } from './services/rag';
import { indexingJobs } from './services/indexing-jobs';
import { extractContext, getLanguageFromExtension } from './services/context-extractor';
import { scanProjectDependencies, findRelatedFiles as findRelatedInGraph, type FileRelationship } from './services/dependency-graph';
import { extractSymbols, searchSymbols as searchSymbolsInResults, type SymbolType, type ExtractedSymbol, type SymbolExtractionResult } from './services/symbol-extractor';
import { 
  getConfigPath, 
  resolveDataPath, 
  getRRCEHome, 
  getEffectiveGlobalPath,
  getWorkspaceName as getWorkspaceNameFromPath 
} from '../lib/paths';
import type { TaskMeta } from './ui/lib/tasks-fs';

/**
 * Constants for Indexing
 */
const INDEXABLE_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.pyw',
    '.go',
    '.rs',
    '.java', '.kt', '.kts',
    '.c', '.cpp', '.h', '.hpp',
    '.cs',
    '.rb',
    '.php',
    '.swift',
    '.md', '.mdx',
    '.json', '.yaml', '.yml', '.toml',
    '.sh', '.bash', '.zsh',
    '.sql',
    '.html', '.css', '.scss', '.sass', '.less'
];

const CODE_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.py', '.pyw',
    '.go',
    '.rs',
    '.java', '.kt', '.kts',
    '.c', '.cpp', '.h', '.hpp',
    '.cs',
    '.rb',
    '.php',
    '.swift',
    '.sh', '.bash', '.zsh',
    '.sql'
];

const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target', 'vendor'];

/**
 * Resolve configuration paths for a project
 */
export function resolveProjectPaths(project?: string, pathInput?: string): object {
    const config = loadMCPConfig();
    let workspaceRoot = pathInput;
    let workspaceName = project;

    // 1. Resolve workspaceRoot if only project name is given
    if (!workspaceRoot && project) {
        const projConfig = findProjectConfig(config, { name: project });
        if (projConfig?.path) {
            workspaceRoot = projConfig.path;
        }
    }

    // 2. Resolve project name if only path is given
    if (!workspaceName && workspaceRoot) {
        const projConfig = findProjectConfig(config, { path: workspaceRoot });
        workspaceName = projConfig?.name || getWorkspaceNameFromPath(workspaceRoot);
    }

    if (!workspaceName) {
         workspaceName = 'unknown';
    }

    let rrceData = '';
    let mode = 'global'; // Default
    let configFilePath = '';

    if (workspaceRoot) {
        configFilePath = getConfigPath(workspaceRoot);
        const rrceHome = getEffectiveGlobalPath();
        
        // Determine mode based on where config file is found
        if (configFilePath.startsWith(rrceHome)) {
            mode = 'global';
        } else {
            // It's local
            mode = 'workspace';
            // Check content for override
            if (fs.existsSync(configFilePath)) {
                 const content = fs.readFileSync(configFilePath, 'utf-8');
                 if (content.includes('mode: global')) mode = 'global';
                 if (content.includes('mode: workspace')) mode = 'workspace';
            }
        }
        
        rrceData = resolveDataPath(mode as any, workspaceName, workspaceRoot);
    } else {
        // Pure global project reference (no local source?)
        rrceData = resolveDataPath('global', workspaceName, '');
    }

    return {
        RRCE_HOME: getRRCEHome(),
        RRCE_DATA: rrceData,
        WORKSPACE_ROOT: workspaceRoot || null,
        WORKSPACE_NAME: workspaceName,
        storage_mode: mode,
        config_path: configFilePath || null
    };
}

/**
 * Get list of projects exposed via MCP
 */
export function getExposedProjects(): DetectedProject[] {
  const config = loadMCPConfig();
  
  // Extract known projects from config to ensure we find workspace-mode and global projects
  const knownProjects = config.projects
    .filter(p => !!p.path)
    .map(p => ({ name: p.name, path: p.path! }));

  const allProjects = projectService.scan({ knownProjects });
  
  // 1. Resolve linked projects first to get the full pool of potential projects
  const activeProject = detectActiveProject(allProjects); 
  const potentialProjects = [...allProjects];

  if (activeProject) {
    let cfgContent: string | null = null;
    if (fs.existsSync(path.join(activeProject.dataPath, '.rrce-workflow', 'config.yaml'))) {
       cfgContent = fs.readFileSync(path.join(activeProject.dataPath, '.rrce-workflow', 'config.yaml'), 'utf-8');
    } else if (fs.existsSync(path.join(activeProject.dataPath, '.rrce-workflow.yaml'))) {
       cfgContent = fs.readFileSync(path.join(activeProject.dataPath, '.rrce-workflow.yaml'), 'utf-8');
    }

    if (cfgContent) {
      if (cfgContent.includes('linked_projects:')) {
         const lines = cfgContent.split('\n');
         let inLinked = false;
         for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('linked_projects:')) {
                inLinked = true;
                continue;
            }
            if (inLinked) {
                if (trimmed.startsWith('-') || trimmed.startsWith('linked_projects')) { 
                    // continue parsing 
                } else if (trimmed !== '' && !trimmed.startsWith('#')) {
                    inLinked = false;
                }
                
                if (inLinked && trimmed.startsWith('-')) {
                    const val = trimmed.replace(/^-\s*/, '').trim();
                    const [pName] = val.split(':');
                    
                    if (!potentialProjects.some(p => p.name === pName)) {
                        const found = allProjects.find(p => p.name === pName);
                        if (found) {
                            potentialProjects.push(found);
                        }
                    }
                }
            }
         }
      }
    }
  }

  // 2. Filter ALL potential projects through the SSOT configuration
  // Use project.path (the root) for standardized lookup
  return potentialProjects.filter(project => isProjectExposed(config, project.name, project.sourcePath || project.path));
}

/**
 * Get RAG index path for a project
 */
export function getRAGIndexPath(project: DetectedProject): string {
    const scanRoot = project.path || project.dataPath;
    return path.join(project.knowledgePath || path.join(scanRoot, '.rrce-workflow', 'knowledge'), 'embeddings.json');
}

/**
 * Get Code-specific RAG index path for a project
 */
export function getCodeIndexPath(project: DetectedProject): string {
    const scanRoot = project.path || project.dataPath;
    return path.join(project.knowledgePath || path.join(scanRoot, '.rrce-workflow', 'knowledge'), 'code-embeddings.json');
}

/**
 * Detect the active project based on the current working directory (CWD)
 */
export function detectActiveProject(knownProjects?: DetectedProject[]): DetectedProject | undefined {
  // If no projects provided, scan mostly-global ones (avoid recursion loop by NOT calling getExposedProjects)
  let scanList = knownProjects;
  if (!scanList) {
     const config = loadMCPConfig();
     // Use known projects for detection to ensure we find the active project even if not in standard scan
     const knownProjectsMap = config.projects
        .filter(p => !!p.path)
        .map(p => ({ name: p.name, path: p.path! }));
        
     const all = projectService.scan({ knownProjects: knownProjectsMap });
      // Only consider global ones for base detection to start with
      scanList = all.filter(project => isProjectExposed(config, project.name, project.sourcePath || project.path));
  }
  
  return findClosestProject(scanList);
}

/**
 * Get project context (project-context.md)
 */
export function getProjectContext(projectName: string): string | null {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  
  // Find the SPECIFIC project that is exposed (disambiguate by path if need be)
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project) {
    return null;
  }

  const permissions = getProjectPermissions(config, projectName, project.sourcePath || project.path);
  if (!permissions.knowledge) {
    return null;
  }
  
  if (!project.knowledgePath) {
    return null;
  }

  const contextPath = path.join(project.knowledgePath, 'project-context.md');
  
  if (!fs.existsSync(contextPath)) {
    return null;
  }

  return fs.readFileSync(contextPath, 'utf-8');
}

/**
 * Get project tasks from meta.json files
 */
export function getProjectTasks(projectName: string): object[] {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project) {
    return [];
  }

  const permissions = getProjectPermissions(config, projectName, project.sourcePath || project.path);
  if (!permissions.tasks) {
    return [];
  }
  
  if (!project.tasksPath || !fs.existsSync(project.tasksPath)) {
    return [];
  }

  const tasks: object[] = [];
  
  try {
    const taskDirs = fs.readdirSync(project.tasksPath, { withFileTypes: true });
    
    for (const dir of taskDirs) {
      if (!dir.isDirectory()) continue;
      
      const metaPath = path.join(project.tasksPath, dir.name, 'meta.json');
      
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          tasks.push(meta);
        } catch (err) {
          logger.error(`[getProjectTasks] Failed to parse meta.json in ${dir.name}`, err);
        }
      }
    }
  } catch (err) {
    logger.error(`[getProjectTasks] Failed to read tasks directory ${project.tasksPath}`, err);
  }

  return tasks;
}

/**
 * Estimate token count from text (conservative: chars / 4)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Search code files using semantic search on the code-specific index
 * Returns code snippets with line numbers and context
 * @param query Search query string
 * @param projectFilter Optional: limit search to specific project name
 * @param limit Maximum number of results (default 10)
 * @param options Additional options: max_tokens, min_score
 */
export async function searchCode(query: string, projectFilter?: string, limit: number = 10, options?: {
  max_tokens?: number;
  min_score?: number;
}): Promise<{
  results: Array<{
    project: string;
    file: string;
    snippet: string;
    lineStart: number;
    lineEnd: number;
    context?: string;
    language?: string;
    score: number;
  }>;
  token_count: number;
  truncated: boolean;
  index_age_seconds?: number;
  last_indexed_at?: string;
  indexingInProgress?: boolean;
  advisoryMessage?: string;
}> {
  const config = loadMCPConfig();
  const projects = getExposedProjects();
  const results: Array<{
    project: string;
    file: string;
    snippet: string;
    lineStart: number;
    lineEnd: number;
    context?: string;
    language?: string;
    score: number;
    indexingInProgress?: boolean;
    advisoryMessage?: string;
  }> = [];

  for (const project of projects) {
    // Skip if project filter specified and doesn't match
    if (projectFilter && project.name !== projectFilter) continue;

    const permissions = getProjectPermissions(config, project.name, project.sourcePath || project.path);
    if (!permissions.knowledge || !project.knowledgePath) continue;

    const indexingInProgress = indexingJobs.isRunning(project.name);
    const advisoryMessage = indexingInProgress
      ? 'Indexing in progress; results may be stale/incomplete.'
      : undefined;

    // Check for RAG configuration
    const projConfig = findProjectConfig(config, { name: project.name, path: project.sourcePath || project.path });
    const useRAG = projConfig?.semanticSearch?.enabled;

    if (!useRAG) {
      logger.debug(`[searchCode] Semantic search not enabled for project '${project.name}'`);
      continue;
    }

    try {
      const codeIndexPath = getCodeIndexPath(project);
      
      if (!fs.existsSync(codeIndexPath)) {
        logger.debug(`[searchCode] Code index not found for project '${project.name}'`);
        continue;
      }

      const rag = new RAGService(codeIndexPath, projConfig?.semanticSearch?.model);
      const ragResults = await rag.search(query, limit);

      for (const r of ragResults) {
        // CodeChunk fields are preserved even when cast to RAGChunk
        const codeChunk = r as CodeChunk & { score: number };
        
        results.push({
          project: project.name,
          file: path.relative(project.sourcePath || project.path || '', codeChunk.filePath),
          snippet: codeChunk.content,
          lineStart: codeChunk.lineStart ?? 1,
          lineEnd: codeChunk.lineEnd ?? 1,
          context: codeChunk.context,
          language: codeChunk.language,
          score: codeChunk.score,
          indexingInProgress: indexingInProgress || undefined,
          advisoryMessage
        });
      }
    } catch (e) {
      logger.error(`[searchCode] Search failed for project '${project.name}'`, e);
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  // Apply min_score filter if specified
  let filteredResults = results;
  if (options?.min_score !== undefined && options.min_score > 0) {
    filteredResults = results.filter(r => r.score >= options.min_score!);
  }
  
  // Apply limit
  let limitedResults = filteredResults.slice(0, limit);
  
  // Apply max_tokens budget if specified
  let truncated = false;
  let tokenCount = 0;
  
  if (options?.max_tokens !== undefined && options.max_tokens > 0) {
    const budgetedResults: typeof limitedResults = [];
    for (const result of limitedResults) {
      const resultTokens = estimateTokens(result.snippet + (result.context || ''));
      if (tokenCount + resultTokens > options.max_tokens) {
        truncated = true;
        break;
      }
      budgetedResults.push(result);
      tokenCount += resultTokens;
    }
    limitedResults = budgetedResults;
  } else {
    // Calculate total tokens without budget
    tokenCount = limitedResults.reduce((sum, r) => sum + estimateTokens(r.snippet + (r.context || '')), 0);
  }

  // Get index freshness info
  let indexAgeSeconds: number | undefined;
  let lastIndexedAt: string | undefined;
  let indexingInProgress: boolean | undefined;
  let advisoryMessage: string | undefined;

  if (projectFilter) {
    const project = projects.find(p => p.name === projectFilter);
    if (project) {
      indexingInProgress = indexingJobs.isRunning(project.name);
      advisoryMessage = indexingInProgress ? 'Indexing in progress; results may be stale/incomplete.' : undefined;
      
      const progress = indexingJobs.getProgress(project.name);
      if (progress.completedAt) {
        lastIndexedAt = new Date(progress.completedAt).toISOString();
        indexAgeSeconds = Math.floor((Date.now() - progress.completedAt) / 1000);
      }
    }
  }

  // Strip internal fields from results
  const cleanResults = limitedResults.map(({ indexingInProgress: _, advisoryMessage: __, ...rest }) => rest);

  return {
    results: cleanResults,
    token_count: tokenCount,
    truncated,
    index_age_seconds: indexAgeSeconds,
    last_indexed_at: lastIndexedAt,
    indexingInProgress,
    advisoryMessage
  };
}

/**
 * Search across all exposed project knowledge bases
 * @param query Search query string
 * @param projectFilter Optional: limit search to specific project name
 * @param options Additional options: max_tokens, min_score
 */
export async function searchKnowledge(query: string, projectFilter?: string, options?: {
  max_tokens?: number;
  min_score?: number;
}): Promise<{
  results: Array<{
    project: string;
    file: string;
    matches: string[];
    score?: number;
  }>;
  token_count: number;
  truncated: boolean;
  index_age_seconds?: number;
  last_indexed_at?: string;
  indexingInProgress?: boolean;
  advisoryMessage?: string;
}> {
  const config = loadMCPConfig();
  const projects = getExposedProjects();
  const results: Array<{ project: string; file: string; matches: string[]; score?: number; indexingInProgress?: boolean; advisoryMessage?: string }> = [];
  
  const queryLower = query.toLowerCase();

  for (const project of projects) {
    // Skip if project filter specified and doesn't match
    if (projectFilter && project.name !== projectFilter) continue;
    
    const permissions = getProjectPermissions(config, project.name, project.sourcePath || project.path);
    
    if (!permissions.knowledge || !project.knowledgePath) continue;

    const indexingInProgress = indexingJobs.isRunning(project.name);
    const advisoryMessage = indexingInProgress
      ? 'Indexing in progress; results may be stale/incomplete.'
      : undefined;

    // Check for RAG configuration
    const projConfig = findProjectConfig(config, { name: project.name, path: project.sourcePath || project.path });
    const useRAG = projConfig?.semanticSearch?.enabled;

    if (useRAG) {
        logger.info(`[RAG] Using semantic search for project '${project.name}'`);
        try {
            const indexPath = path.join(project.knowledgePath, 'embeddings.json');
            const rag = new RAGService(indexPath, projConfig?.semanticSearch?.model);
            const ragResults = await rag.search(query, 5); // Limit 5 per project? or general?

            for (const r of ragResults) {
                results.push({
                    project: project.name,
                    file: path.relative(project.knowledgePath, r.filePath),
                    matches: [r.content], // The chunk content is the match
                    score: r.score,
                    indexingInProgress: indexingInProgress || undefined,
                    advisoryMessage
                });
            }
            continue; // Skip text search since RAG succeeded
        } catch (e) {
            logger.error(`[RAG] Semantic search failed for project '${project.name}', falling back to text search`, e);
            // Fall through to text search
        }
    }
    
    try {
      const files = fs.readdirSync(project.knowledgePath);
      
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        
        const filePath = path.join(project.knowledgePath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Simple line-by-line search
        const lines = content.split('\n');
        const matches: string[] = [];
        
        for (const line of lines) {
          if (line.toLowerCase().includes(queryLower)) {
            matches.push(line.trim());
          }
        }
        
        if (matches.length > 0) {
          results.push({
            project: project.name,
            file,
            matches: matches.slice(0, 5), // Limit to 5 matches per file
            indexingInProgress: indexingInProgress || undefined,
            advisoryMessage,
          });
        }
      }
    } catch (err) {
      logger.error(`[searchKnowledge] Failed to read knowledge directory ${project.knowledgePath}`, err);
    }
  }

  // Apply min_score filter if specified
  let filteredResults = results;
  if (options?.min_score !== undefined && options.min_score > 0) {
    filteredResults = results.filter(r => (r.score ?? 1) >= options.min_score!);
  }

  // Sort by score descending (text matches default to score of 1)
  filteredResults.sort((a, b) => (b.score ?? 1) - (a.score ?? 1));

  // Apply max_tokens budget if specified
  let truncated = false;
  let tokenCount = 0;
  let budgetedResults = filteredResults;

  if (options?.max_tokens !== undefined && options.max_tokens > 0) {
    budgetedResults = [];
    for (const result of filteredResults) {
      const resultTokens = estimateTokens(result.matches.join('\n'));
      if (tokenCount + resultTokens > options.max_tokens) {
        truncated = true;
        break;
      }
      budgetedResults.push(result);
      tokenCount += resultTokens;
    }
  } else {
    tokenCount = filteredResults.reduce((sum, r) => sum + estimateTokens(r.matches.join('\n')), 0);
  }

  // Get index freshness info
  let indexAgeSeconds: number | undefined;
  let lastIndexedAt: string | undefined;
  let indexingInProgress: boolean | undefined;
  let advisoryMessage: string | undefined;

  if (projectFilter) {
    const project = projects.find(p => p.name === projectFilter);
    if (project) {
      indexingInProgress = indexingJobs.isRunning(project.name);
      advisoryMessage = indexingInProgress ? 'Indexing in progress; results may be stale/incomplete.' : undefined;
      
      const progress = indexingJobs.getProgress(project.name);
      if (progress.completedAt) {
        lastIndexedAt = new Date(progress.completedAt).toISOString();
        indexAgeSeconds = Math.floor((Date.now() - progress.completedAt) / 1000);
      }
    }
  }

  // Strip internal fields from results
  const cleanResults = budgetedResults.map(({ indexingInProgress: _, advisoryMessage: __, ...rest }) => rest);

  return {
    results: cleanResults,
    token_count: tokenCount,
    truncated,
    index_age_seconds: indexAgeSeconds,
    last_indexed_at: lastIndexedAt,
    indexingInProgress,
    advisoryMessage
  };
}

/**
 * Helper to get project scan root and gitignore configuration
 */
function getScanContext(project: DetectedProject, scanRoot: string) {
    const gitignorePath = path.join(scanRoot, '.gitignore');
    const ig = fs.existsSync(gitignorePath)
      ? ignore().add(fs.readFileSync(gitignorePath, 'utf-8'))
      : null;

    const toPosixRelativePath = (absolutePath: string): string => {
      const rel = path.relative(scanRoot, absolutePath);
      return rel.split(path.sep).join('/');
    };

    const isUnderGitDir = (absolutePath: string): boolean => {
      const rel = toPosixRelativePath(absolutePath);
      return rel === '.git' || rel.startsWith('.git/');
    };

    const isIgnoredByGitignore = (absolutePath: string, isDir: boolean): boolean => {
      if (!ig) return false;
      const rel = toPosixRelativePath(absolutePath);
      return ig.ignores(isDir ? `${rel}/` : rel);
    };

    const shouldSkipEntryDir = (absolutePath: string): boolean => {
      const dirName = path.basename(absolutePath);
      if (dirName === '.git') return true;
      if (SKIP_DIRS.includes(dirName)) return true;
      if (isIgnoredByGitignore(absolutePath, true)) return true;
      return false;
    };

    const shouldSkipEntryFile = (absolutePath: string): boolean => {
      if (isUnderGitDir(absolutePath)) return true;
      if (isIgnoredByGitignore(absolutePath, false)) return true;
      return false;
    };

    return { shouldSkipEntryDir, shouldSkipEntryFile };
}

/**
 * Trigger knowledge indexing for a project (scans entire codebase)
 */
export async function indexKnowledge(projectName: string, force: boolean = false): Promise<{
  state: IndexJobState;
  status: 'started' | 'already_running' | 'failed';
  success: boolean;
  message: string;
  filesIndexed: number;
  filesSkipped: number;
  progress: {
    itemsDone: number;
    itemsTotal?: number;
    currentItem?: string;
    startedAt?: number;
    completedAt?: number;
    lastError?: string;
  };
}> {
    const config = loadMCPConfig();
    const projects = getExposedProjects();
    const project = projects.find(p => p.name === projectName || (p.path && p.path === projectName));

     if (!project) {
         return {
           state: 'failed',
           status: 'failed',
           success: false,
           message: `Project '${projectName}' not found`,
           filesIndexed: 0,
           filesSkipped: 0,
           progress: { itemsDone: 0 }
         };
     }

    // Find config with fallback for global projects
    const projConfig = findProjectConfig(config, { name: project.name, path: project.sourcePath || project.path }) 
        || (project.source === 'global' ? { semanticSearch: { enabled: true, model: 'Xenova/all-MiniLM-L6-v2' } } : undefined);
    
    // Check if RAG is actually enabled (either in config or detected)
    const isEnabled = projConfig?.semanticSearch?.enabled || (project as any).semanticSearchEnabled;

     if (!isEnabled) {
         return {
           state: 'failed',
           status: 'failed',
           success: false,
           message: 'Semantic Search is not enabled for this project',
           filesIndexed: 0,
           filesSkipped: 0,
           progress: { itemsDone: 0 }
         };
     }

    // Use project root for scanning
    const scanRoot = project.sourcePath || project.path || project.dataPath;

     if (!fs.existsSync(scanRoot)) {
         return {
           state: 'failed',
           status: 'failed',
           success: false,
           message: 'Project root not found',
           filesIndexed: 0,
           filesSkipped: 0,
           progress: { itemsDone: 0 }
         };
     }

      const runIndexing = async (): Promise<void> => {
         const { shouldSkipEntryDir, shouldSkipEntryFile } = getScanContext(project, scanRoot);
         
         const indexPath = path.join(project.knowledgePath || path.join(scanRoot, '.rrce-workflow', 'knowledge'), 'embeddings.json');
         const codeIndexPath = path.join(project.knowledgePath || path.join(scanRoot, '.rrce-workflow', 'knowledge'), 'code-embeddings.json');
         
         const model = projConfig?.semanticSearch?.model || 'Xenova/all-MiniLM-L6-v2';
         const rag = new RAGService(indexPath, model);
         const codeRag = new RAGService(codeIndexPath, model);
         
         let indexed = 0;
         let codeIndexed = 0;
         let skipped = 0;
         let itemsTotal = 0;
         let itemsDone = 0;

          const preCount = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                if (shouldSkipEntryDir(fullPath)) continue;
                preCount(fullPath);
              } else if (entry.isFile()) {
                const ext = path.extname(entry.name).toLowerCase();
                if (!INDEXABLE_EXTENSIONS.includes(ext)) continue;
                if (shouldSkipEntryFile(fullPath)) continue;
                itemsTotal++;
              }
            }
          };

          preCount(scanRoot);
          indexingJobs.update(project.name, { itemsTotal });

          const cleanupIgnoredFiles = async (): Promise<void> => {
            const indexedFiles = [...rag.getIndexedFiles(), ...codeRag.getIndexedFiles()];
            const unique = Array.from(new Set(indexedFiles));
            for (const filePath of unique) {
              if (!path.isAbsolute(filePath)) continue;

              const relFilePath = filePath.split(path.sep).join('/');
              const relScanRoot = scanRoot.split(path.sep).join('/');
              const isInScanRoot = relFilePath === relScanRoot || relFilePath.startsWith(`${relScanRoot}/`);
              if (!isInScanRoot) continue;

              if (shouldSkipEntryFile(filePath)) {
                await rag.removeFile(filePath);
                await codeRag.removeFile(filePath);
              }
            }
          };

          await cleanupIgnoredFiles();

          // Recursive file scanner
         const scanDir = async (dir: string) => {
             const entries = fs.readdirSync(dir, { withFileTypes: true });
             
             for (const entry of entries) {
                 const fullPath = path.join(dir, entry.name);
                 
                  if (entry.isDirectory()) {
                      if (shouldSkipEntryDir(fullPath)) continue;
                      await scanDir(fullPath);
                  } else if (entry.isFile()) {
                      const ext = path.extname(entry.name).toLowerCase();
                      if (!INDEXABLE_EXTENSIONS.includes(ext)) continue;
                      if (shouldSkipEntryFile(fullPath)) continue;
                      
                      try {
                          indexingJobs.update(project.name, { currentItem: fullPath, itemsDone });
                          const stat = fs.statSync(fullPath);
                          const mtime = force ? undefined : stat.mtimeMs; 
                          const content = fs.readFileSync(fullPath, 'utf-8');
                          
                          // Index in knowledge index (all files)
                          const wasIndexed = await rag.indexFile(fullPath, content, mtime);
                          if (wasIndexed) {
                              indexed++;
                          } else {
                              skipped++;
                          }
                          
                          // For code files, also index with line numbers + context in code index
                          if (CODE_EXTENSIONS.includes(ext)) {
                              if (!mtime || codeRag.needsReindex(fullPath, mtime)) {
                                  const language = getLanguageFromExtension(ext);
                                  const chunks = codeRag.chunkContentWithLines(content);
                                  codeRag.clearFileChunks(fullPath);
                                  
                                  for (const chunk of chunks) {
                                      const context = extractContext(content, chunk.lineStart, language);
                                      await codeRag.indexCodeChunk(fullPath, chunk, context, language, mtime);
                                  }
                                  
                                  codeRag.updateFileMetadata(fullPath, chunks.length, mtime ?? Date.now(), language);
                                  codeIndexed++;
                              }
                          }
                      } catch (err) {
                          logger.error(`[indexKnowledge] Failed to index ${fullPath}`, err);
                     } finally {
                         itemsDone++;
                         indexingJobs.update(project.name, { itemsDone });
                         if (itemsDone % 10 === 0) {
                           await new Promise<void>(resolve => setImmediate(resolve));
                         }
                     }
                  }
             }
         };

         await scanDir(scanRoot);
          rag.markFullIndex();
          codeRag.markFullIndex();

          const stats = rag.getStats();
          const codeStats = codeRag.getStats();
          const message = `Indexed ${indexed} files (${codeIndexed} code files), skipped ${skipped} unchanged. Knowledge: ${stats.totalChunks} chunks. Code: ${codeStats.totalChunks} chunks.`;
          logger.info(`[RAG] ${project.name}: ${message}`);
         indexingJobs.update(project.name, { currentItem: undefined });
      };

     const startResult = indexingJobs.startOrStatus(project.name, runIndexing);
     const p = startResult.progress;

     return {
       state: startResult.state,
       status: startResult.status,
       success: startResult.status === 'started' || startResult.status === 'already_running',
       message:
         startResult.status === 'started'
           ? `Indexing started in background for '${project.name}'.`
           : `Indexing already running for '${project.name}'.`,
       filesIndexed: 0,
       filesSkipped: 0,
       progress: {
         itemsDone: p.itemsDone,
         itemsTotal: p.itemsTotal,
         currentItem: p.currentItem,
         startedAt: p.startedAt,
         completedAt: p.completedAt,
         lastError: p.lastError,
       },
     };
}

/**
 * Generate minimal context preamble for agents (token-optimized)
 * Single source of truth for path resolution - no duplication in handlers or prompts
 */
export function getContextPreamble(): string {
  const activeProject = detectActiveProject();
  
  if (!activeProject) {
    return `## System Context
No active project detected. Run \`rrce-workflow mcp configure\` to expose projects.
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
 * Get a specific task by slug
 */
export function getTask(projectName: string, taskSlug: string): TaskMeta | null {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) return null;

  const metaPath = path.join(project.tasksPath, taskSlug, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as TaskMeta;
  } catch (err) {
    logger.error(`[getTask] Failed to parse meta.json for task ${taskSlug}`, err);
    return null;
  }
}

/**
 * Create a new task
 */
export async function createTask(projectName: string, taskSlug: string, taskData: Partial<TaskMeta>): Promise<TaskMeta | null> {
    const config = loadMCPConfig();
    const projects = projectService.scan();
    const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
    
    if (!project || !project.tasksPath) {
        throw new Error(`Project '${projectName}' not found or not configured with a tasks path.`);
    }

    const taskDir = path.join(project.tasksPath, taskSlug);
    if (fs.existsSync(taskDir)) {
        throw new Error(`Task with slug '${taskSlug}' already exists.`);
    }

    fs.mkdirSync(taskDir, { recursive: true });
    fs.mkdirSync(path.join(taskDir, 'research'), { recursive: true });
    fs.mkdirSync(path.join(taskDir, 'planning'), { recursive: true });
    fs.mkdirSync(path.join(taskDir, 'execution'), { recursive: true });
    fs.mkdirSync(path.join(taskDir, 'docs'), { recursive: true });

    // Load template from global storage
    const rrceHome = process.env.RRCE_HOME || path.join(os.homedir(), '.rrce-workflow');
    const templatePath = path.join(rrceHome, 'templates', 'meta.template.json');
    
    let meta: any = {
        task_id: crypto.randomUUID(),
        task_slug: taskSlug,
        status: "draft",
        agents: {}
    };

    if (fs.existsSync(templatePath)) {
        try {
            const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
            meta = { ...template, ...meta };
        } catch (e) {
            logger.error('Failed to load meta template', e);
        }
    }

    // Populate initial fields
    meta.created_at = new Date().toISOString();
    meta.updated_at = meta.created_at;
    meta.workspace = {
        name: project.name,
        path: project.path || project.dataPath,
        hash: project.name
    };

    // Merge taskData
    Object.assign(meta, taskData);

    const metaPath = path.join(taskDir, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    return meta as TaskMeta;
}

/**
 * Update an existing task
 */
export async function updateTask(projectName: string, taskSlug: string, taskData: Partial<TaskMeta>): Promise<TaskMeta | null> {
    const meta = getTask(projectName, taskSlug);
    if (!meta) throw new Error(`Task '${taskSlug}' not found.`);

    // Smart merge
    const updatedMeta = {
        ...meta,
        ...taskData,
        updated_at: new Date().toISOString(),
        // Ensure nested objects are merged if they exist in taskData
        agents: taskData.agents ? { ...meta.agents, ...taskData.agents } : meta.agents,
        workspace: (meta as any).workspace // Protect workspace metadata
    };

    const config = loadMCPConfig();
    const projects = projectService.scan();
    const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
    
    if (!project || !project.tasksPath) return null;

    const metaPath = path.join(project.tasksPath, taskSlug, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));

    return updatedMeta as TaskMeta;
}

/**
 * Delete a task
 */
export function deleteTask(projectName: string, taskSlug: string): boolean {
    const config = loadMCPConfig();
    const projects = projectService.scan();
    const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
    
    if (!project || !project.tasksPath) return false;

    const taskDir = path.join(project.tasksPath, taskSlug);
    if (!fs.existsSync(taskDir)) return false;

    if (fs.rmSync) {
        fs.rmSync(taskDir, { recursive: true, force: true });
    } else {
        // @ts-ignore - Fallback for older Node
        fs.rmdirSync(taskDir, { recursive: true });
    }
    
    return true;
}

/**
 * Find files related to a given file through import relationships
 * Uses static analysis of imports/dependencies to find connected files
 * @param filePath Absolute or project-relative path to the file
 * @param projectName Name of the project to search in
 * @param options Options for relationship traversal
 */
export async function findRelatedFiles(
  filePath: string,
  projectName: string,
  options: {
    includeImports?: boolean;
    includeImportedBy?: boolean;
    depth?: number;
  } = {}
): Promise<{
  success: boolean;
  file: string;
  project: string;
  relationships: Array<{
    file: string;
    relationship: 'imports' | 'imported-by' | 'exports-to';
    importPath: string;
  }>;
  message?: string;
}> {
  const config = loadMCPConfig();
  const projects = getExposedProjects();
  const project = projects.find(p => p.name === projectName);

  if (!project) {
    return {
      success: false,
      file: filePath,
      project: projectName,
      relationships: [],
      message: `Project '${projectName}' not found`
    };
  }

  const projectRoot = project.sourcePath || project.path || '';
  
  // Resolve file path - if relative, make it absolute
  let absoluteFilePath = filePath;
  if (!path.isAbsolute(filePath)) {
    absoluteFilePath = path.resolve(projectRoot, filePath);
  }

  if (!fs.existsSync(absoluteFilePath)) {
    return {
      success: false,
      file: filePath,
      project: projectName,
      relationships: [],
      message: `File '${filePath}' not found`
    };
  }

  try {
    // Build dependency graph for the project
    const graph = await scanProjectDependencies(projectRoot);
    
    // Find related files
    const related = findRelatedInGraph(absoluteFilePath, graph, {
      includeImports: options.includeImports ?? true,
      includeImportedBy: options.includeImportedBy ?? true,
      depth: options.depth ?? 1
    });

    // Convert absolute paths to project-relative paths
    const relationships = related.map(r => ({
      file: path.relative(projectRoot, r.file),
      relationship: r.relationship,
      importPath: r.importPath
    }));

    return {
      success: true,
      file: path.relative(projectRoot, absoluteFilePath),
      project: projectName,
      relationships
    };
  } catch (e) {
    logger.error(`[findRelatedFiles] Error analyzing ${filePath}`, e);
    return {
      success: false,
      file: filePath,
      project: projectName,
      relationships: [],
      message: `Error analyzing file relationships: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

// ============================================================================
// Symbol Search & File Summary Tools
// ============================================================================

/**
 * Search for symbols (functions, classes, types, variables) by name
 * Uses fuzzy matching to find symbols across project files
 */
export async function searchSymbols(
  name: string,
  projectName: string,
  options: {
    type?: SymbolType | 'any';
    fuzzy?: boolean;
    limit?: number;
  } = {}
): Promise<{
  success: boolean;
  project: string;
  results: Array<{
    name: string;
    type: string;
    file: string;
    line: number;
    signature: string;
    exported: boolean;
    score: number;
  }>;
  message?: string;
}> {
  const config = loadMCPConfig();
  const projects = getExposedProjects();
  const project = projects.find(p => p.name === projectName);

  if (!project) {
    return {
      success: false,
      project: projectName,
      results: [],
      message: `Project '${projectName}' not found`
    };
  }

  const projectRoot = project.sourcePath || project.path || '';
  
  if (!fs.existsSync(projectRoot)) {
    return {
      success: false,
      project: projectName,
      results: [],
      message: `Project root not found: ${projectRoot}`
    };
  }

  try {
    // Collect all code files
    const codeFiles: string[] = [];
    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.includes(entry.name)) continue;
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (CODE_EXTENSIONS.includes(ext)) {
            codeFiles.push(fullPath);
          }
        }
      }
    };
    scanDir(projectRoot);

    // Extract symbols from each file
    const symbolResults: SymbolExtractionResult[] = [];
    for (const file of codeFiles.slice(0, 500)) { // Limit to 500 files for performance
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const result = extractSymbols(content, file);
        symbolResults.push(result);
      } catch (e) {
        // Skip files that can't be read
      }
    }

    // Search across all extracted symbols
    const matches = searchSymbolsInResults(symbolResults, name, {
      type: options.type,
      fuzzy: options.fuzzy ?? true,
      limit: options.limit ?? 10,
      minScore: 0.3
    });

    // Convert to relative paths
    const results = matches.map(m => ({
      name: m.name,
      type: m.type,
      file: path.relative(projectRoot, m.file),
      line: m.line,
      signature: m.signature,
      exported: m.exported,
      score: m.score
    }));

    return {
      success: true,
      project: projectName,
      results
    };
  } catch (e) {
    logger.error(`[searchSymbols] Error searching symbols in ${projectName}`, e);
    return {
      success: false,
      project: projectName,
      results: [],
      message: `Error searching symbols: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

/**
 * Get a summary of a file without reading its full content
 * Returns: path, language, LOC, size, exports, imports, key symbols
 */
export async function getFileSummary(
  filePath: string,
  projectName: string
): Promise<{
  success: boolean;
  summary?: {
    path: string;
    language: string;
    lines: number;
    size_bytes: number;
    last_modified: string;
    exports: string[];
    imports: string[];
    symbols: Array<{ name: string; type: string; line: number }>;
  };
  message?: string;
}> {
  const config = loadMCPConfig();
  const projects = getExposedProjects();
  const project = projects.find(p => p.name === projectName);

  if (!project) {
    return {
      success: false,
      message: `Project '${projectName}' not found`
    };
  }

  const projectRoot = project.sourcePath || project.path || '';
  
  // Resolve file path
  let absolutePath = filePath;
  if (!path.isAbsolute(filePath)) {
    absolutePath = path.resolve(projectRoot, filePath);
  }

  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      message: `File not found: ${filePath}`
    };
  }

  try {
    const stat = fs.statSync(absolutePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n');
    
    // Extract symbols
    const symbolResult = extractSymbols(content, absolutePath);
    
    return {
      success: true,
      summary: {
        path: path.relative(projectRoot, absolutePath),
        language: symbolResult.language,
        lines: lines.length,
        size_bytes: stat.size,
        last_modified: stat.mtime.toISOString(),
        exports: symbolResult.exports,
        imports: symbolResult.imports,
        symbols: symbolResult.symbols.map(s => ({
          name: s.name,
          type: s.type,
          line: s.line
        }))
      }
    };
  } catch (e) {
    logger.error(`[getFileSummary] Error reading ${filePath}`, e);
    return {
      success: false,
      message: `Error reading file: ${e instanceof Error ? e.message : String(e)}`
    };
  }
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

/**
 * Search across all tasks by keyword, status, agent phase, or date
 */
export function searchTasks(
  projectName: string,
  options: {
    keyword?: string;
    status?: string;
    agent?: string;
    since?: string;
    limit?: number;
  } = {}
): Array<TaskMeta & { relevance?: number }> {
  const allTasks = getProjectTasks(projectName) as TaskMeta[];
  const limit = options.limit ?? 20;
  
  let filtered = allTasks;
  
  // Filter by status
  if (options.status) {
    filtered = filtered.filter(t => t.status === options.status);
  }
  
  // Filter by agent phase status
  if (options.agent) {
    filtered = filtered.filter(t => {
      const agents = (t as any).agents as Record<string, any> | undefined;
      if (!agents) return false;
      return agents[options.agent!]?.status !== undefined;
    });
  }
  
  // Filter by date (updated since)
  if (options.since) {
    const sinceDate = new Date(options.since).getTime();
    filtered = filtered.filter(t => {
      const updatedAt = (t as any).updated_at as string | undefined;
      if (!updatedAt) return false;
      return new Date(updatedAt).getTime() >= sinceDate;
    });
  }
  
  // Filter and score by keyword
  if (options.keyword) {
    const kw = options.keyword.toLowerCase();
    filtered = filtered.map(t => {
      const title = (t.title || '').toLowerCase();
      const summary = (t.summary || '').toLowerCase();
      
      let relevance = 0;
      if (title.includes(kw)) relevance += 2;
      if (summary.includes(kw)) relevance += 1;
      if (t.task_slug.toLowerCase().includes(kw)) relevance += 1;
      
      return { ...t, relevance };
    }).filter(t => t.relevance > 0) as Array<TaskMeta & { relevance: number }>;
    
    // Sort by relevance
    (filtered as Array<TaskMeta & { relevance: number }>).sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
  } else {
    // Sort by updated_at descending
    filtered.sort((a, b) => {
      const aDate = new Date((a as any).updated_at || 0).getTime();
      const bDate = new Date((b as any).updated_at || 0).getTime();
      return bDate - aDate;
    });
  }
  
  return filtered.slice(0, limit);
}

/**
 * Validate if a task phase has all required prerequisites
 */
export function validatePhase(
  projectName: string,
  taskSlug: string,
  phase: 'research' | 'planning' | 'execution' | 'documentation'
): {
  valid: boolean;
  phase: string;
  status: string;
  missing_items: string[];
  suggestions: string[];
} {
  const task = getTask(projectName, taskSlug);
  
  if (!task) {
    return {
      valid: false,
      phase,
      status: 'not_found',
      missing_items: ['Task does not exist'],
      suggestions: [`Create task with: create_task(project: "${projectName}", task_slug: "${taskSlug}")`]
    };
  }

  const agents = (task as any).agents as Record<string, any> | undefined;
  const phaseData = agents?.[phase === 'execution' ? 'executor' : phase];
  const status = phaseData?.status || 'pending';
  const missing: string[] = [];
  const suggestions: string[] = [];

  // Phase-specific validation rules
  switch (phase) {
    case 'research':
      if (status !== 'complete') {
        missing.push('Research phase not complete');
        suggestions.push(`Run research phase: /rrce_research ${taskSlug}`);
      }
      if (!phaseData?.artifact) {
        missing.push('Research artifact not saved');
        suggestions.push('Save research brief to complete the phase');
      }
      break;
      
    case 'planning':
      // Check research prerequisite
      const researchStatus = agents?.research?.status;
      if (researchStatus !== 'complete') {
        missing.push('Research phase not complete');
        suggestions.push(`Complete research first: /rrce_research ${taskSlug}`);
      }
      if (status !== 'complete') {
        missing.push('Planning phase not complete');
        suggestions.push(`Run planning phase: /rrce_plan ${taskSlug}`);
      }
      if (!phaseData?.artifact) {
        missing.push('Planning artifact not saved');
      }
      if (!phaseData?.task_count) {
        missing.push('Task breakdown not defined');
      }
      break;
      
    case 'execution':
      // Check planning prerequisite
      const planningStatus = agents?.planning?.status;
      if (planningStatus !== 'complete') {
        missing.push('Planning phase not complete');
        suggestions.push(`Complete planning first: /rrce_plan ${taskSlug}`);
      }
      if (status !== 'complete') {
        missing.push('Execution phase not complete');
        suggestions.push(`Run execution phase: /rrce_execute ${taskSlug}`);
      }
      break;
      
    case 'documentation':
      // Check execution prerequisite
      const executorStatus = agents?.executor?.status;
      if (executorStatus !== 'complete') {
        missing.push('Execution phase not complete');
        suggestions.push(`Complete execution first: /rrce_execute ${taskSlug}`);
      }
      if (status !== 'complete') {
        missing.push('Documentation phase not complete');
        suggestions.push(`Run documentation phase: /rrce_docs ${taskSlug}`);
      }
      break;
  }

  return {
    valid: missing.length === 0,
    phase,
    status,
    missing_items: missing,
    suggestions
  };
}

// ============================================================================
// Session & Agent Todos Management
// ============================================================================

export type AgentType = 'research' | 'planning' | 'executor' | 'documentation';

export interface AgentSession {
  agent: AgentType;
  phase: string;
  task_slug: string;
  started_at: string;
  heartbeat: string;
}

export interface AgentTodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

export interface AgentTodos {
  phase: string;
  agent: string;
  items: AgentTodoItem[];
  updated_at: string;
}

/**
 * Start or update an agent session for a task
 */
export function startSession(
  projectName: string, 
  taskSlug: string, 
  agent: AgentType, 
  phase: string
): { success: boolean; message: string } {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) {
    return { success: false, message: `Project '${projectName}' not found or not exposed.` };
  }

  const taskDir = path.join(project.tasksPath, taskSlug);
  if (!fs.existsSync(taskDir)) {
    return { success: false, message: `Task '${taskSlug}' not found.` };
  }

  const session: AgentSession = {
    agent,
    phase,
    task_slug: taskSlug,
    started_at: new Date().toISOString(),
    heartbeat: new Date().toISOString()
  };

  const sessionPath = path.join(taskDir, 'session.json');
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

  return { success: true, message: `Session started for ${agent} agent on task '${taskSlug}' (phase: ${phase})` };
}

/**
 * End an agent session for a task
 */
export function endSession(projectName: string, taskSlug: string): { success: boolean; message: string } {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) {
    return { success: false, message: `Project '${projectName}' not found or not exposed.` };
  }

  const sessionPath = path.join(project.tasksPath, taskSlug, 'session.json');
  if (!fs.existsSync(sessionPath)) {
    return { success: true, message: `No active session for task '${taskSlug}'.` };
  }

  fs.unlinkSync(sessionPath);
  return { success: true, message: `Session ended for task '${taskSlug}'.` };
}

/**
 * Update agent todos for a task
 */
export function updateAgentTodos(
  projectName: string,
  taskSlug: string,
  phase: string,
  agent: string,
  items: AgentTodoItem[]
): { success: boolean; message: string; count?: number } {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) {
    return { success: false, message: `Project '${projectName}' not found or not exposed.` };
  }

  const taskDir = path.join(project.tasksPath, taskSlug);
  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }

  const todos: AgentTodos = {
    phase,
    agent,
    items,
    updated_at: new Date().toISOString()
  };

  const todosPath = path.join(taskDir, 'agent-todos.json');
  fs.writeFileSync(todosPath, JSON.stringify(todos, null, 2));

  return { success: true, message: `Updated ${items.length} todo items for task '${taskSlug}'.`, count: items.length };
}

/**
 * Get agent todos for a task
 */
export function getAgentTodos(projectName: string, taskSlug: string): AgentTodos | null {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) return null;

  const todosPath = path.join(project.tasksPath, taskSlug, 'agent-todos.json');
  if (!fs.existsSync(todosPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(todosPath, 'utf-8')) as AgentTodos;
  } catch {
    return null;
  }
}

/**
 * Get active session for a task
 */
export function getSession(projectName: string, taskSlug: string): AgentSession | null {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) return null;

  const sessionPath = path.join(project.tasksPath, taskSlug, 'session.json');
  if (!fs.existsSync(sessionPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as AgentSession;
  } catch {
    return null;
  }
}
