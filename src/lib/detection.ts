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
  source: 'global' | 'sibling' | 'parent';
  storageMode?: StorageMode;
  knowledgePath?: string;
  refsPath?: string;
  tasksPath?: string;
}

interface ScanOptions {
  excludeWorkspace?: string;  // Current workspace name to exclude
  workspacePath?: string;     // Current workspace path for sibling detection
  scanSiblings?: boolean;     // Whether to scan sibling directories (default: true)
}

/**
 * Scan for rrce-workflow projects in various locations
 */
export function scanForProjects(options: ScanOptions = {}): DetectedProject[] {
  const { excludeWorkspace, workspacePath, scanSiblings = true } = options;
  const projects: DetectedProject[] = [];
  const seenPaths = new Set<string>();

  // 1. Scan global storage (~/.rrce-workflow/workspaces/)
  const globalProjects = scanGlobalStorage(excludeWorkspace);
  for (const project of globalProjects) {
    if (!seenPaths.has(project.path)) {
      seenPaths.add(project.path);
      projects.push(project);
    }
  }

  // 2. Scan sibling directories (same parent as current workspace)
  if (scanSiblings && workspacePath) {
    const siblingProjects = scanSiblingDirectories(workspacePath, excludeWorkspace);
    for (const project of siblingProjects) {
      if (!seenPaths.has(project.path)) {
        seenPaths.add(project.path);
        projects.push(project);
      }
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
      });
    }
  } catch {
    // Ignore errors
  }

  return projects;
}

/**
 * Scan sibling directories for workspace-scoped projects
 */
function scanSiblingDirectories(workspacePath: string, excludeWorkspace?: string): DetectedProject[] {
  const parentDir = path.dirname(workspacePath);
  const projects: DetectedProject[] = [];

  try {
    const entries = fs.readdirSync(parentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      
      const projectPath = path.join(parentDir, entry.name);
      
      // Skip current workspace
      if (projectPath === workspacePath) continue;
      if (entry.name === excludeWorkspace) continue;

      // Check for .rrce-workflow/config.yaml
      const configPath = path.join(projectPath, '.rrce-workflow', 'config.yaml');
      if (!fs.existsSync(configPath)) continue;

      // Parse config to get project details
      const config = parseWorkspaceConfig(configPath);
      if (!config) continue;

      const dataPath = path.join(projectPath, '.rrce-workflow');
      const knowledgePath = path.join(dataPath, 'knowledge');
      const refsPath = path.join(dataPath, 'refs');
      const tasksPath = path.join(dataPath, 'tasks');

      projects.push({
        name: config.name || entry.name,
        path: projectPath,
        dataPath,
        source: 'sibling',
        storageMode: config.storageMode,
        knowledgePath: fs.existsSync(knowledgePath) ? knowledgePath : undefined,
        refsPath: fs.existsSync(refsPath) ? refsPath : undefined,
        tasksPath: fs.existsSync(tasksPath) ? tasksPath : undefined,
      });
    }
  } catch {
    // Ignore errors
  }

  return projects;
}

/**
 * Parse a workspace config file
 */
export function parseWorkspaceConfig(configPath: string): {
  name: string;
  storageMode: StorageMode;
  linkedProjects?: string[];
} | null {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    
    // Simple YAML parsing (we don't want to add a full YAML library)
    const nameMatch = content.match(/name:\s*["']?([^"'\n]+)["']?/);
    const modeMatch = content.match(/mode:\s*(global|workspace|both)/);
    
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

    return {
      name: nameMatch?.[1]?.trim() || path.basename(path.dirname(path.dirname(configPath))),
      storageMode: (modeMatch?.[1] as StorageMode) || 'global',
      linkedProjects: linkedProjects.length > 0 ? linkedProjects : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Get display label for a detected project
 */
export function getProjectDisplayLabel(project: DetectedProject): string {
  switch (project.source) {
    case 'global':
      return `global: ~/.rrce-workflow/workspaces/${project.name}`;
    case 'sibling':
      return `sibling: ${project.path}/.rrce-workflow`;
    default:
      return project.dataPath;
  }
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
