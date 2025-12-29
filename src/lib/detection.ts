import * as fs from 'fs';
import * as path from 'path';
import type { StorageMode } from '../types/prompt';
import { getDefaultRRCEHome } from './paths';

/**
 * Detected rrce-workflow project information
 */
export interface DetectedProject {
  name: string;
  path: string;           // Absolute path to project root
  dataPath: string;       // Path to .rrce-workflow data directory
  source: 'global' | 'local';
  storageMode?: StorageMode;
  knowledgePath?: string;
  refsPath?: string;
  tasksPath?: string;
  semanticSearchEnabled?: boolean;
}

export interface ScanOptions {
  excludeWorkspace?: string;  // Current workspace name to exclude
  workspacePath?: string;     // Current workspace path to exclude
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
 * Scan for rrce-workflow projects in global storage and home directory
 */
export function scanForProjects(options: ScanOptions = {}): DetectedProject[] {
  const { excludeWorkspace, workspacePath } = options;
  const projects: DetectedProject[] = [];
  const seenPaths = new Set<string>();

  // 1. Scan global storage (~/.rrce-workflow/workspaces/)
  const globalProjects = scanGlobalStorage(excludeWorkspace);
  for (const project of globalProjects) {
    if (!seenPaths.has(project.dataPath)) {
      seenPaths.add(project.dataPath);
      projects.push(project);
    }
  }

  // 2. Scan home directory for .rrce-workflow folders
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
 * Scan global storage for projects
 */
function scanGlobalStorage(excludeWorkspace?: string): DetectedProject[] {
  const rrceHome = getDefaultRRCEHome();
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

      projects.push({
        name: entry.name,
        path: projectDataPath,  // For global projects, path is the data path
        dataPath: projectDataPath,
        source: 'global',
        knowledgePath: fs.existsSync(knowledgePath) ? knowledgePath : undefined,
        refsPath: fs.existsSync(refsPath) ? refsPath : undefined,
        tasksPath: fs.existsSync(tasksPath) ? tasksPath : undefined,
        // Global projects store config at the root of their data path
        semanticSearchEnabled: parseWorkspaceConfig(path.join(projectDataPath, 'config.yaml'))?.semanticSearchEnabled
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
  storageMode: StorageMode;
  linkedProjects?: string[];
  semanticSearchEnabled?: boolean;
} | null {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    
    // Simple YAML parsing (we don't want to add a full YAML library)
    const nameMatch = content.match(/name:\s*["']?([^"'\n]+)["']?/);
    const modeMatch = content.match(/mode:\s*(global|workspace)/);
    
    // Parse linked projects
    const linkedProjects: string[] = [];
    const linkedMatch = content.match(/linked_projects:\s*\n((?:\s+-\s+[^\n]+\n?)+)/);
    if (linkedMatch && linkedMatch[1]) {
      const lines = linkedMatch[1].split('\n');
      for (const line of lines) {
        const projectMatch = line.match(/^\s+-\s+(.+)$/);
        if (projectMatch && projectMatch[1]) {
          linkedProjects.push(projectMatch[1].trim());
        }
      }
    }

    // Parse semantic search setting
    const semanticSearchMatch = content.match(/semantic_search:\s*\n\s*enabled:\s*(true|false)/);
    const semanticSearchEnabled = semanticSearchMatch ? semanticSearchMatch[1] === 'true' : false;

    return {
      name: nameMatch?.[1]?.trim() || path.basename(path.dirname(path.dirname(configPath))),
      storageMode: (modeMatch?.[1] as StorageMode) || 'global',
      linkedProjects: linkedProjects.length > 0 ? linkedProjects : undefined,
      semanticSearchEnabled,
    };
  } catch {
    return null;
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
 * Returns the project with the longest matching path prefix
 */
export function findClosestProject(projects: DetectedProject[], cwd: string = process.cwd()): DetectedProject | undefined {
  const matches = projects.filter(p => cwd.startsWith(p.path));
  // Sort by path length descending (most specific match first)
  matches.sort((a, b) => b.path.length - a.path.length);
  return matches[0];
}
