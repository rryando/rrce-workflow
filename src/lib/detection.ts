import * as fs from 'fs';
import * as path from 'path';
import type { StorageMode } from '../types/prompt';
import { getDefaultRRCEHome, getEffectiveGlobalPath } from './paths';

/**
 * Detected rrce-workflow project information
 */
export interface DetectedProject {
  name: string;
  path: string;           // Absolute path to project root
  dataPath: string;       // Path to .rrce-workflow data directory
  source: 'global' | 'local';
  storageMode?: StorageMode;
  sourcePath?: string;
  knowledgePath?: string;
  refsPath?: string;
  tasksPath?: string;
  semanticSearchEnabled?: boolean;
}

export interface ScanOptions {
  excludeWorkspace?: string;  // Current workspace name to exclude
  workspacePath?: string;     // Current workspace path to exclude
  knownPaths?: string[];      // Explicit paths to scan (from MCP config)
  knownProjects?: { name: string; path: string }[]; // Explicit projects (Name + Path)
}

// Directories to skip during home scan (for performance)
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.npm',
  '.yarn',
  '.pnpm',
  '.local',
  '.config',
  '.vscode',
  '.vscode-server',
  'Library',
  'Applications',
  '.Trash',
  'snap',
  '.cargo',
  '.rustup',
  '.go',
  '.docker',
]);

/**
 * Scan for rrce-workflow projects in global storage, home directory, and known paths
 */
export function scanForProjects(options: ScanOptions = {}): DetectedProject[] {
  const { excludeWorkspace, workspacePath, knownPaths, knownProjects } = options;
  const projects: DetectedProject[] = [];
  const seenPaths = new Set<string>();

  // 1. Scan known projects (Preferred - Name + Path known)
  if (knownProjects && knownProjects.length > 0) {
    const explicitProjects = scanKnownProjects(knownProjects, excludeWorkspace);
    for (const project of explicitProjects) {
        if (!seenPaths.has(project.dataPath)) {
            seenPaths.add(project.dataPath);
            projects.push(project);
        }
    }
  }
  // 1b. Scan known paths (Legacy - Only Path known)
  else if (knownPaths && knownPaths.length > 0) {
    const explicitProjects = scanKnownPaths(knownPaths, excludeWorkspace);
    for (const project of explicitProjects) {
        if (!seenPaths.has(project.dataPath)) {
            seenPaths.add(project.dataPath);
            projects.push(project);
        }
    }
  }

  // 2. Scan global storage (~/.rrce-workflow/workspaces/)
  const globalProjects = scanGlobalStorage(excludeWorkspace);
  for (const project of globalProjects) {
    if (!seenPaths.has(project.dataPath)) {
      seenPaths.add(project.dataPath);
      projects.push(project);
    }
  }

  // 3. Scan home directory for .rrce-workflow folders
  // This is a fallback/discovery mechanism
  const homeProjects = scanHomeDirectory(workspacePath);
  for (const project of homeProjects) {
    if (!seenPaths.has(project.dataPath)) {
      seenPaths.add(project.dataPath);
      projects.push(project);
    }
  }

  return projects;
}

/**
 * Scan explicit known projects (Name + Path known)
 * Handles both Local and Global projects robustly
 */
function scanKnownProjects(projects: { name: string; path: string }[], excludeWorkspace?: string): DetectedProject[] {
    const results: DetectedProject[] = [];
    const rrceHome = getEffectiveGlobalPath();
    
    for (const p of projects) {
        try {
            if (!p.path || !fs.existsSync(p.path)) continue;
            if (p.name === excludeWorkspace) continue;
            
            // 1. Local Mode Check
            const localConfigPath = path.join(p.path, '.rrce-workflow', 'config.yaml');
            if (fs.existsSync(localConfigPath)) {
                migrateSemanticSearch(localConfigPath);
                const config = parseWorkspaceConfig(localConfigPath);
                
                const fullPath = path.join(p.path, '.rrce-workflow');
                const knowledgePath = path.join(fullPath, 'knowledge');
                const refsPath = path.join(fullPath, 'refs');
                const tasksPath = path.join(fullPath, 'tasks');
                
                results.push({
                    name: p.name, // Use MCP name
                    path: p.path,
                    dataPath: fullPath,
                    source: 'local',
                    storageMode: config?.storageMode || 'workspace',
                    knowledgePath: fs.existsSync(knowledgePath) ? knowledgePath : undefined,
                    refsPath: fs.existsSync(refsPath) ? refsPath : undefined,
                    tasksPath: fs.existsSync(tasksPath) ? tasksPath : undefined,
                    semanticSearchEnabled: config?.semanticSearchEnabled
                });
                continue;
            }

            // 2. Global Mode Check
            // We know the project name from MCP config, so we can find its data in global storage
            const globalDataPath = path.join(rrceHome, 'workspaces', p.name);
            if (fs.existsSync(globalDataPath)) {
                const knowledgePath = path.join(globalDataPath, 'knowledge');
                const refsPath = path.join(globalDataPath, 'refs');
                const tasksPath = path.join(globalDataPath, 'tasks');
                
                // Read config to check features (like semantic search)
                const configPath = path.join(globalDataPath, 'config.yaml');
                const config = parseWorkspaceConfig(configPath);

                results.push({
                    name: p.name,
                    path: p.path, // We know this is the source path
                    sourcePath: p.path,
                    dataPath: globalDataPath,
                    source: 'global',
                    storageMode: 'global',
                    knowledgePath: fs.existsSync(knowledgePath) ? knowledgePath : undefined,
                    refsPath: fs.existsSync(refsPath) ? refsPath : undefined,
                    tasksPath: fs.existsSync(tasksPath) ? tasksPath : undefined,
                    semanticSearchEnabled: config?.semanticSearchEnabled
                });
            }
        } catch {
            // Ignore errors
        }
    }
    return results;
}

/**
 * Scan explicit known paths for projects
 */
function scanKnownPaths(paths: string[], excludeWorkspace?: string): DetectedProject[] {
    const projects: DetectedProject[] = [];
    
    for (const p of paths) {
        try {
            if (!fs.existsSync(p)) continue;
            
            // Check for .rrce-workflow (Workspace Mode)
            const localConfigPath = path.join(p, '.rrce-workflow', 'config.yaml');
            if (fs.existsSync(localConfigPath)) {
                migrateSemanticSearch(localConfigPath);
                const config = parseWorkspaceConfig(localConfigPath);
                
                if (config?.name === excludeWorkspace) continue;
                
                const fullPath = path.join(p, '.rrce-workflow');
                const knowledgePath = path.join(fullPath, 'knowledge');
                const refsPath = path.join(fullPath, 'refs');
                const tasksPath = path.join(fullPath, 'tasks');
                
                projects.push({
                    name: config?.name || path.basename(p),
                    path: p,
                    dataPath: fullPath,
                    source: 'local',
                    storageMode: config?.storageMode,
                    knowledgePath: fs.existsSync(knowledgePath) ? knowledgePath : undefined,
                    refsPath: fs.existsSync(refsPath) ? refsPath : undefined,
                    tasksPath: fs.existsSync(tasksPath) ? tasksPath : undefined,
                    semanticSearchEnabled: config?.semanticSearchEnabled
                });
                continue;
            }
        } catch {
            // ignore
        }
    }
    
    return projects;
}

/**
 * Scan global storage for projects
 */
function scanGlobalStorage(excludeWorkspace?: string): DetectedProject[] {
  const rrceHome = getEffectiveGlobalPath();
  const workspacesDir = path.join(rrceHome, 'workspaces');
  const projects: DetectedProject[] = [];

  if (!fs.existsSync(workspacesDir)) {
    return projects;
  }

  try {
    const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === excludeWorkspace) continue;

      const projectDataPath = path.join(workspacesDir, entry.name);
      const knowledgePath = path.join(projectDataPath, 'knowledge');
      const refsPath = path.join(projectDataPath, 'refs');
      const tasksPath = path.join(projectDataPath, 'tasks');
      
      const configPath = path.join(projectDataPath, 'config.yaml');
      migrateSemanticSearch(configPath);
      const config = parseWorkspaceConfig(configPath);
      
      projects.push({
        name: config?.name || entry.name,
        path: projectDataPath,  // Default to dataPath if sourcePath unknown
        sourcePath: config?.sourcePath, // ...expose sourcePath if available
        dataPath: projectDataPath,
        source: 'global',
        knowledgePath: fs.existsSync(knowledgePath) ? knowledgePath : undefined,
        refsPath: fs.existsSync(refsPath) ? refsPath : undefined,
        tasksPath: fs.existsSync(tasksPath) ? tasksPath : undefined,
        semanticSearchEnabled: config?.semanticSearchEnabled
      });
    }
  } catch {
    // Ignore errors
  }

  return projects;
}

/**
 * Recursively scan home directory for .rrce-workflow folders
 * Efficiently skips heavy directories like node_modules, .git, etc.
 */
function scanHomeDirectory(excludePath?: string): DetectedProject[] {
  const home = process.env.HOME;
  if (!home) return [];

  const projects: DetectedProject[] = [];
  const maxDepth = 5; // Limit depth to avoid scanning too deep

  function scanDir(dirPath: string, depth: number) {
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        
        const fullPath = path.join(dirPath, entry.name);
        
        // Skip if this is the excluded workspace
        if (excludePath && fullPath === excludePath) continue;
        
        // Check if this is a .rrce-workflow folder with config
        if (entry.name === '.rrce-workflow') {
          const configPath = path.join(fullPath, 'config.yaml');
          if (fs.existsSync(configPath)) {
            const projectPath = dirPath; // Parent of .rrce-workflow
            const projectName = path.basename(projectPath);
            const config = parseWorkspaceConfig(configPath);
            
            const knowledgePath = path.join(fullPath, 'knowledge');
            const refsPath = path.join(fullPath, 'refs');
            const tasksPath = path.join(fullPath, 'tasks');

            projects.push({
              name: config?.name || projectName,
              path: projectPath,
              dataPath: fullPath,
              source: 'local',
              storageMode: config?.storageMode,
              knowledgePath: fs.existsSync(knowledgePath) ? knowledgePath : undefined,
              refsPath: fs.existsSync(refsPath) ? refsPath : undefined,
              tasksPath: fs.existsSync(tasksPath) ? tasksPath : undefined,
              semanticSearchEnabled: config?.semanticSearchEnabled,
            });
          }
          // Don't recurse into .rrce-workflow
          continue;
        }
        
        // Skip directories that shouldn't be scanned
        if (SKIP_DIRECTORIES.has(entry.name)) continue;
        if (entry.name.startsWith('.') && entry.name !== '.rrce-workflow') continue;
        
        // Recurse into subdirectories
        scanDir(fullPath, depth + 1);
      }
    } catch {
      // Ignore permission errors and other issues
    }
  }

  scanDir(home, 0);
  return projects;
}

/**
 * Parse a workspace config file
 */
export function parseWorkspaceConfig(configPath: string): {
  name: string;
  sourcePath?: string;
  storageMode: StorageMode;
  linkedProjects?: string[];
  semanticSearchEnabled?: boolean;
} | null {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    
    // Simple YAML parsing (we don't want to add a full YAML library)
    const nameMatch = content.match(/name:\s*["']?([^"'\n\r]+)["']?/);
    const sourcePathMatch = content.match(/sourcePath:\s*["']?([^"'\n\r]+)["']?/);
    const modeMatch = content.match(/mode:\s*(global|workspace)/);
    
    // Parse linked projects
    const linkedProjects: string[] = [];
    const linkedMatch = content.match(/linked_projects:\s*\n((?:\s+-\s+[^\n\r]+\n?)+)/);
    if (linkedMatch && linkedMatch[1]) {
      const lines = linkedMatch[1].split('\n');
      for (const line of lines) {
        const projectMatch = line.match(/^\s+-\s+(.+)$/);
        if (projectMatch && projectMatch[1]) {
          linkedProjects.push(projectMatch[1].trim());
        }
      }
    }

    // Parse semantic search setting (defaults to true)
    const semanticSearchMatch = content.match(/semantic_search:\s*\n\s*enabled:\s*(true|false)/);
    const semanticSearchEnabled = semanticSearchMatch ? semanticSearchMatch[1] === 'true' : true;

    return {
      name: nameMatch?.[1]?.trim() || path.basename(path.dirname(path.dirname(configPath))),
      sourcePath: sourcePathMatch?.[1]?.trim(),
      storageMode: (modeMatch?.[1] as StorageMode) || 'global',
      linkedProjects: linkedProjects.length > 0 ? linkedProjects : undefined,
      semanticSearchEnabled,
    };
  } catch {
    return null;
  }
}

/**
 * Migrate project config to enable semantic search by default
 * Updates config.yaml files that don't have semantic_search section
 */
export function migrateSemanticSearch(configPath: string): boolean {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    
    // Check if semantic_search already exists
    const semanticSearchMatch = content.match(/semantic_search:\s*\n\s*enabled:\s*(true|false)/);
    if (semanticSearchMatch) {
      // Already configured, skip migration
      return false;
    }
    
    // Add semantic_search section before the end of file
    const updatedContent = content.trimEnd() + '\n\nsemantic_search:\n  enabled: true\n';
    fs.writeFileSync(configPath, updatedContent, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get display label for a detected project
 */
export function getProjectDisplayLabel(project: DetectedProject): string {
  if (project.source === 'global') {
    return `~/.rrce-workflow/workspaces/${project.name}`;
  }
  return project.dataPath;
}

/**
 * Get all linkable folders from a detected project
 */
export function getProjectFolders(project: DetectedProject): Array<{
  path: string;
  type: 'knowledge' | 'refs' | 'tasks';
  displayName: string;
}> {
  const folders: Array<{ path: string; type: 'knowledge' | 'refs' | 'tasks'; displayName: string }> = [];

  if (project.knowledgePath) {
    folders.push({
      path: project.knowledgePath,
      type: 'knowledge',
      displayName: `📚 ${project.name} (knowledge)`,
    });
  }

  if (project.refsPath) {
    folders.push({
      path: project.refsPath,
      type: 'refs',
      displayName: `📎 ${project.name} (refs)`,
    });
  }

  if (project.tasksPath) {
    folders.push({
      path: project.tasksPath,
      type: 'tasks',
      displayName: `📋 ${project.name} (tasks)`,
    });
  }


  return folders;
}

/**
 * Find the project that best matches the current working directory
 * Returns the project with the longest matching path prefix (exact matches preferred)
 */
export function findClosestProject(projects: DetectedProject[], cwd: string = process.cwd()): DetectedProject | undefined {
  const matches = projects.map(p => {
    let matchPath = '';
    // Check both the primary path and sourcePath (for global projects)
    if (cwd === p.path) {
      matchPath = p.path;
    } else if (p.sourcePath && cwd === p.sourcePath) {
      matchPath = p.sourcePath;
    } else if (cwd.startsWith(p.path)) {
      matchPath = p.path;
    } else if (p.sourcePath && cwd.startsWith(p.sourcePath)) {
      matchPath = p.sourcePath;
    }
    return { project: p, matchPath };
  }).filter(m => m.matchPath !== '');

  // Sort by match path length descending (longest/most specific match first)
  matches.sort((a, b) => b.matchPath.length - a.matchPath.length);
  return matches[0]?.project;
}
