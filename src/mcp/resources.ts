/**
 * MCP Resources - Project data access utilities
 * Shared between MCP server and other modules
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadMCPConfig, isProjectExposed, getProjectPermissions } from './config';
import { normalizeProjectPath } from './config-utils';
import { type DetectedProject, findClosestProject } from '../lib/detection';
import { projectService } from '../lib/detection-service';
import { RAGService } from './services/rag';

/**
 * Get list of projects exposed via MCP
 */
export function getExposedProjects(): DetectedProject[] {
  const config = loadMCPConfig();
  
  // Extract known paths from config to ensure we find workspace-mode projects
  const knownPaths = config.projects
    .map(p => p.path)
    .filter((p): p is string => !!p);

  const allProjects = projectService.scan({ knownPaths });
  
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
  return potentialProjects.filter(project => isProjectExposed(config, project.name, project.path));
}

/**
 * Get RAG index path for a project
 */
export function getRAGIndexPath(project: DetectedProject): string {
    const scanRoot = project.path || project.dataPath;
    return path.join(project.knowledgePath || path.join(scanRoot, '.rrce-workflow', 'knowledge'), 'embeddings.json');
}

/**
 * Detect the active project based on the current working directory (CWD)
 */
export function detectActiveProject(knownProjects?: DetectedProject[]): DetectedProject | undefined {
  // If no projects provided, scan mostly-global ones (avoid recursion loop by NOT calling getExposedProjects)
  let scanList = knownProjects;
  if (!scanList) {
     const config = loadMCPConfig();
     // Use known paths for detection to ensure we find the active project even if not in standard scan
     const knownPaths = config.projects
        .map(p => p.path)
        .filter((p): p is string => !!p);
        
     const all = projectService.scan({ knownPaths });
      // Only consider global ones for base detection to start with
      scanList = all.filter(project => isProjectExposed(config, project.name, project.path));
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
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.path));
  
  if (!project) {
    return null;
  }

  const permissions = getProjectPermissions(config, projectName, project.path);
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
  
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.path));
  
  if (!project) {
    return [];
  }

  const permissions = getProjectPermissions(config, projectName, project.path);
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
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return tasks;
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
}>> {
  const config = loadMCPConfig();
  const projects = getExposedProjects();
  const results: Array<{ project: string; file: string; matches: string[]; score?: number }> = [];
  
  const queryLower = query.toLowerCase();

  for (const project of projects) {
    // Skip if project filter specified and doesn't match
    if (projectFilter && project.name !== projectFilter) continue;
    
    const permissions = getProjectPermissions(config, project.name, project.path);
    
    if (!permissions.knowledge || !project.knowledgePath) continue;

    // Check for RAG configuration
    const projConfig = config.projects.find(p => 
        (p.path && normalizeProjectPath(p.path) === normalizeProjectPath(project.path)) || (!p.path && p.name === project.name)
    );
    const useRAG = projConfig?.semanticSearch?.enabled;

    if (useRAG) {
        try {
            const indexPath = path.join(project.knowledgePath, 'embeddings.json');
            const rag = new RAGService(indexPath, projConfig?.semanticSearch?.model);
            const ragResults = await rag.search(query, 5); // Limit 5 per project? or general?

            for (const r of ragResults) {
                results.push({
                    project: project.name,
                    file: path.relative(project.knowledgePath, r.filePath),
                    matches: [r.content], // The chunk content is the match
                    score: r.score
                });
            }
        } catch (e) {
            // Fallback or log?
        }
        continue; // Skip text search if RAG enabled (or maybe do both?)
        // Design choice: If RAG is enabled, we trust it? Or we combine?
        // Mini RAG implies strict semantic. Let's stick to RAG if enabled.
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
          });
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return results;
}

/**
 * Trigger knowledge indexing for a project (scans entire codebase)
 */
export async function indexKnowledge(projectName: string, force: boolean = false): Promise<{ success: boolean; message: string; filesIndexed: number; filesSkipped: number }> {
    const config = loadMCPConfig();
    const projects = getExposedProjects();
    const project = projects.find(p => p.name === projectName || (p.path && p.path === projectName));

    if (!project) {
        return { success: false, message: `Project '${projectName}' not found`, filesIndexed: 0, filesSkipped: 0 };
    }

    // Find config with fallback for global projects
    const projConfig = config.projects.find(p => 
        (p.path && normalizeProjectPath(p.path) === normalizeProjectPath(project.path)) || (!p.path && p.name === project.name)
    ) || (project.source === 'global' ? { semanticSearch: { enabled: true, model: 'Xenova/all-MiniLM-L6-v2' } } : undefined);
    
    // Check if RAG is actually enabled (either in config or detected)
    const isEnabled = projConfig?.semanticSearch?.enabled || (project as any).semanticSearchEnabled;

    if (!isEnabled) {
        return { success: false, message: 'Semantic Search is not enabled for this project', filesIndexed: 0, filesSkipped: 0 };
    }

    // Use project root for scanning
    // For global projects, project.path is the data path. We need to find the ACTUAL source path.
    // However, in the current architecture 'scanForProjects' sets project.path = dataPath for global projects.
    // This is a known limitation. We assumed global projects are wrapping the source?
    // Wait, global setup stores config in ~/.rrce/workspaces/proj/config.yaml
    // The ACTUAL source code is where 'npx rrce-workflow' was run.
    // BUT 'scanGlobalStorage' ONLY finds the ~/.rrce entry, it doesn't know where the request came from unless we store it.
    // CHECK: Does config.yaml in global storage contain the source path?
    
    // If not, we can only index what's inside the global storage (which is just metadata). 
    // This is a CRITICAL ISSUE for global mode RAG if we don't store source path.
    // Workaround: Check if project has a 'sourcePath' or similar in config.
    
    // Let's assume for now we scan 'project.path'. If it's global, that's ~/.rrce/... which is WRONG for code indexing.
    // We need to read the source path from somewhere.
    
    // Use project root for scanning
    // Prefer explicit sourcePath (Global mode) or detect from path (Workspace mode)
    const scanRoot = project.sourcePath || project.path || project.dataPath;

    if (!fs.existsSync(scanRoot)) {
        return { success: false, message: 'Project root not found', filesIndexed: 0, filesSkipped: 0 };
    }

    // Extensions to index (common source files)
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

    // Directories to skip
    const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target', 'vendor'];

    try {
        const indexPath = path.join(project.knowledgePath || path.join(scanRoot, '.rrce-workflow', 'knowledge'), 'embeddings.json');
        
        // Fix lint error: ensure model is defined or provide default
        const model = projConfig?.semanticSearch?.model || 'Xenova/all-MiniLM-L6-v2';
        const rag = new RAGService(indexPath, model);
        
        let indexed = 0;
        let skipped = 0;

        // Recursive file scanner
        const scanDir = async (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    // Skip excluded directories
                    if (SKIP_DIRS.includes(entry.name) || entry.name.startsWith('.')) {
                        continue;
                    }
                    await scanDir(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    if (!INDEXABLE_EXTENSIONS.includes(ext)) {
                        continue;
                    }
                    
                    try {
                        const stat = fs.statSync(fullPath);
                        const mtime = force ? undefined : stat.mtimeMs; // Force ignores mtime
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        
                        const wasIndexed = await rag.indexFile(fullPath, content, mtime);
                        if (wasIndexed) {
                            indexed++;
                        } else {
                            skipped++;
                        }
                    } catch (err) {
                        // Skip files that can't be read (binary, permissions, etc.)
                    }
                }
            }
        };

        await scanDir(scanRoot);
        rag.markFullIndex();
        
        const stats = rag.getStats();
        return { 
            success: true, 
            message: `Indexed ${indexed} files, skipped ${skipped} unchanged. Total: ${stats.totalChunks} chunks from ${stats.totalFiles} files.`, 
            filesIndexed: indexed,
            filesSkipped: skipped
        };

    } catch (error) {
        return { success: false, message: `Indexing failed: ${error}`, filesIndexed: 0, filesSkipped: 0 };
    }
}

/**
 * Generate standard context preamble for agents
 * Lists available projects, identifies active workspace, and pre-resolves path variables
 */
export function getContextPreamble(): string {
  const projects = getExposedProjects();
  const activeProject = detectActiveProject();
  
  let contextPreamble = '';
  
  // Pre-resolved paths section (helps agents avoid manual path resolution)
  if (activeProject) {
    const rrceHome = process.env.RRCE_HOME || path.join(require('os').homedir(), '.rrce-workflow');
    const workspaceRoot = activeProject.sourcePath || activeProject.path || activeProject.dataPath;
    const rrceData = activeProject.dataPath;
    
    contextPreamble += `
## System Resolved Paths
Use these values directly in your operations. Do NOT manually resolve paths.

| Variable | Value |
|----------|-------|
| \`WORKSPACE_ROOT\` | \`${workspaceRoot}\` |
| \`WORKSPACE_NAME\` | \`${activeProject.name}\` |
| \`RRCE_DATA\` | \`${rrceData}\` |
| \`RRCE_HOME\` | \`${rrceHome}\` |

`;
  }
  
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
WARNING: No projects are currently exposed to the MCP server.
Run 'npx rrce-workflow mcp configure' to select projects to expose.
`;
  }

  if (activeProject) {
    contextPreamble += `
Current Active Workspace: ${activeProject.name}
All file operations should be relative to WORKSPACE_ROOT shown above.
`;
  }

  contextPreamble += `
---
`;

  return contextPreamble;
}
