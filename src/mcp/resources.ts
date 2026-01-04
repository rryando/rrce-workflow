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
 * Search code files using semantic search on the code-specific index
 * Returns code snippets with line numbers and context
 * @param query Search query string
 * @param projectFilter Optional: limit search to specific project name
 * @param limit Maximum number of results (default 10)
 */
export async function searchCode(query: string, projectFilter?: string, limit: number = 10): Promise<Array<{
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
}>> {
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

  // Sort by score descending and limit results
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Search across all exposed project knowledge bases
 * @param query Search query string
 * @param projectFilter Optional: limit search to specific project name
 */
export async function searchKnowledge(query: string, projectFilter?: string): Promise<Array<{
  project: string;
  file: string;
  matches: string[];
  score?: number;
  indexingInProgress?: boolean;
  advisoryMessage?: string;
}>> {
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

  return results;
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
