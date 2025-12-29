/**
 * MCP Resources - Project data access utilities
 * Shared between MCP server and other modules
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadMCPConfig, isProjectExposed, getProjectPermissions } from './config';
import { type DetectedProject, findClosestProject } from '../lib/detection';
import { projectService } from '../lib/detection-service';
import { RAGService } from './services/rag';

/**
 * Get list of projects exposed via MCP
 */
export function getExposedProjects(): DetectedProject[] {
  const config = loadMCPConfig();
  const allProjects = projectService.scan();
  
  // 1. Get globally exposed projects
  const globalProjects = allProjects.filter(project => isProjectExposed(config, project.name, project.dataPath));
  
  // 2. Get locally linked projects (smart resolution)
  const activeProject = detectActiveProject(globalProjects); // Pass preliminary list
  let linkedProjects: DetectedProject[] = [];

  if (activeProject) {
    const localConfigPath = path.join(activeProject.dataPath, 'config.yaml'); // New config location
    // Also check legacy .rrce-workflow.yaml? 'paths.ts' handles that, but here we need quick read.
    // Let's rely on standard paths.
    
    // We need to resolve the path properly. Let's use getConfigPath helper if we can, but 
    // we need to import it. Since we can't easily import circular deps or new deps without checking,
    // let's stick to reading the config file found in the active project path.
    
    // Check both locations just to be safe/compliant with paths.ts logic
    let cfgContent: string | null = null;
    if (fs.existsSync(path.join(activeProject.dataPath, '.rrce-workflow', 'config.yaml'))) {
       cfgContent = fs.readFileSync(path.join(activeProject.dataPath, '.rrce-workflow', 'config.yaml'), 'utf-8');
    } else if (fs.existsSync(path.join(activeProject.dataPath, '.rrce-workflow.yaml'))) {
       cfgContent = fs.readFileSync(path.join(activeProject.dataPath, '.rrce-workflow.yaml'), 'utf-8');
    }

    if (cfgContent) {
      if (cfgContent.includes('linked_projects:')) { // Simple check
         // Parse linked projects manually to avoid heavy yaml parser dep if not already present?
         // config.ts uses simple regex/line parsing. Let's do similar.
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
                    // exited section
                    inLinked = false;
                }
                
                if (inLinked && trimmed.startsWith('-')) {
                    // Extract name. format: "- name" or "- name:source"
                    const val = trimmed.replace(/^-\s*/, '').trim();
                    const [pName] = val.split(':'); // Take name part
                    
                    // Find this project in allProjects
                    // Avoid duplicates
                    if (!globalProjects.some(p => p.name === pName) && 
                        !linkedProjects.some(p => p.name === pName)) {
                        const found = allProjects.find(p => p.name === pName);
                        if (found) {
                            // Mark as linked for context clarity? DetectedProject doesn't have a 'linked' flag.
                            // We return it as is.
                            linkedProjects.push(found);
                        }
                    }
                }
            }
         }
      }
    }
  }

  return [...globalProjects, ...linkedProjects];
}

/**
 * Detect the active project based on the current working directory (CWD)
 */
export function detectActiveProject(knownProjects?: DetectedProject[]): DetectedProject | undefined {
  // If no projects provided, scan mostly-global ones (avoid recursion loop by NOT calling getExposedProjects)
  let scanList = knownProjects;
  if (!scanList) {
     const config = loadMCPConfig();
     const all = projectService.scan();
     // Only consider global ones for base detection to start with
     scanList = all.filter(project => isProjectExposed(config, project.name, project.dataPath));
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
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.dataPath));
  
  if (!project) {
    return null;
  }

  const permissions = getProjectPermissions(config, projectName, project.dataPath);
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
  
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.dataPath));
  
  if (!project) {
    return [];
  }

  const permissions = getProjectPermissions(config, projectName, project.dataPath);
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
 */
export async function searchKnowledge(query: string): Promise<Array<{
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
    const permissions = getProjectPermissions(config, project.name, project.dataPath);
    
    if (!permissions.knowledge || !project.knowledgePath) continue;

    // Check for RAG configuration
    const projConfig = config.projects.find(p => 
        (p.path && p.path === project.dataPath) || (!p.path && p.name === project.name)
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

    const projConfig = config.projects.find(p => 
        (p.path && p.path === project.dataPath) || (!p.path && p.name === project.name)
    );
    
    if (!projConfig?.semanticSearch?.enabled) {
        return { success: false, message: 'Semantic Search is not enabled for this project', filesIndexed: 0, filesSkipped: 0 };
    }

    // Use project root for scanning, not just knowledge path
    const scanRoot = project.path || project.dataPath;
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
        const rag = new RAGService(indexPath, projConfig.semanticSearch.model);
        
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
 * Lists available projects and identifies active workspace
 */
export function getContextPreamble(): string {
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

  return contextPreamble;
}
