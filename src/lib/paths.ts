import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { StorageMode } from '../types/prompt';

// Environment variables
const RRCE_HOME = process.env.RRCE_HOME || path.join(process.env.HOME || '~', '.rrce-workflow');
const RRCE_WORKSPACE = process.env.RRCE_WORKSPACE;

/**
 * Detect workspace root by walking up from CWD
 */
export function detectWorkspaceRoot(): string {
  if (RRCE_WORKSPACE) {
    return RRCE_WORKSPACE;
  }

  let current = process.cwd();
  
  while (current !== '/') {
    // Check for .git or .rrce-workflow/config.yaml (new location)
    // Also check legacy .rrce-workflow.yaml for backwards compatibility
    if (fs.existsSync(path.join(current, '.git')) || 
        fs.existsSync(path.join(current, '.rrce-workflow', 'config.yaml')) ||
        fs.existsSync(path.join(current, '.rrce-workflow.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  
  return process.cwd();
}

/**
 * Get the config file path for a workspace
 * New location: .rrce-workflow/config.yaml
 * Legacy location: .rrce-workflow.yaml (for backwards compatibility)
 */
export function getConfigPath(workspaceRoot: string): string {
  const newPath = path.join(workspaceRoot, '.rrce-workflow', 'config.yaml');
  const legacyPath = path.join(workspaceRoot, '.rrce-workflow.yaml');
  
  // Prefer new location, fall back to legacy
  if (fs.existsSync(newPath)) {
    return newPath;
  }
  if (fs.existsSync(legacyPath)) {
    return legacyPath;
  }
  
  // Default to new location for new configs
  return newPath;
}

/**
 * Get workspace name from directory or config
 */
export function getWorkspaceName(workspaceRoot: string): string {
  // TODO: Check .rrce-workflow.yaml for project.name
  return path.basename(workspaceRoot);
}

/**
 * Resolve primary data path based on storage mode
 */
export function resolveDataPath(mode: StorageMode, workspaceName: string, workspaceRoot: string): string {
  switch (mode) {
    case 'global':
      return path.join(RRCE_HOME, 'workspaces', workspaceName);
    case 'workspace':
      return path.join(workspaceRoot, '.rrce-workflow');
    default:
      return path.join(RRCE_HOME, 'workspaces', workspaceName);
  }
}

/**
 * Resolve ALL data paths based on storage mode
 * Returns array of paths where data should be stored:
 * - 'global': [~/.rrce-workflow/workspaces/<name>]
 * - 'workspace': [<workspace>/.rrce-workflow]
 */
export function resolveAllDataPaths(mode: StorageMode, workspaceName: string, workspaceRoot: string): string[] {
  const globalPath = path.join(RRCE_HOME, 'workspaces', workspaceName);
  const workspacePath = path.join(workspaceRoot, '.rrce-workflow');
  
  switch (mode) {
    case 'global':
      return [globalPath];
    case 'workspace':
      return [workspacePath];
    default:
      return [globalPath];
  }
}

/**
 * Get RRCE home directory
 */
export function getRRCEHome(): string {
  return RRCE_HOME;
}

/**
 * List all projects in global storage
 * @param excludeWorkspace - Workspace name to exclude from the list (typically current workspace)
 * @returns Array of project names found in ~/.rrce-workflow/workspaces/
 */
export function listGlobalProjects(excludeWorkspace?: string): string[] {
  const workspacesDir = path.join(RRCE_HOME, 'workspaces');
  
  if (!fs.existsSync(workspacesDir)) {
    return [];
  }
  
  try {
    const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && entry.name !== excludeWorkspace)
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Get the knowledge path for a global project
 */
export function getGlobalProjectKnowledgePath(projectName: string): string {
  return path.join(RRCE_HOME, 'workspaces', projectName, 'knowledge');
}

/**
 * Get the global workspace data path for a project
 */
export function getGlobalWorkspacePath(workspaceName: string): string {
  return path.join(RRCE_HOME, 'workspaces', workspaceName);
}

/**
 * Get the local workspace data path
 */
export function getLocalWorkspacePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.rrce-workflow');
}

/**
 * Ensure directory exists
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get path for agent prompts based on tool
 * IDE-specific locations so IDEs can auto-discover prompts
 */
export function getAgentPromptPath(workspaceRoot: string, tool: 'copilot' | 'antigravity'): string {
  if (tool === 'copilot') {
    return path.join(workspaceRoot, '.github', 'agents');
  } else {
    return path.join(workspaceRoot, '.agent', 'workflows');
  }
}

/**
 * Copy a file to all storage paths
 * @param sourceFile - Absolute path to source file
 * @param relativePath - Relative path within the data directory (e.g., 'knowledge/context.md')
 * @param dataPaths - Array of data paths from resolveAllDataPaths()
 */
export function copyToAllStoragePaths(sourceFile: string, relativePath: string, dataPaths: string[]): void {
  const content = fs.readFileSync(sourceFile);
  
  for (const dataPath of dataPaths) {
    const targetPath = path.join(dataPath, relativePath);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, content);
  }
}

/**
 * Write content to a file in all storage paths
 * @param content - Content to write
 * @param relativePath - Relative path within the data directory
 * @param dataPaths - Array of data paths from resolveAllDataPaths()
 */
export function writeToAllStoragePaths(content: string | Buffer, relativePath: string, dataPaths: string[]): void {
  for (const dataPath of dataPaths) {
    const targetPath = path.join(dataPath, relativePath);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, content);
  }
}

/**
 * Copy a directory recursively to all storage paths
 * @param sourceDir - Absolute path to source directory
 * @param relativeDir - Relative directory path within the data directory
 * @param dataPaths - Array of data paths from resolveAllDataPaths()
 */
export function copyDirToAllStoragePaths(sourceDir: string, relativeDir: string, dataPaths: string[]): void {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const relativePath = path.join(relativeDir, entry.name);
    
    if (entry.isDirectory()) {
      copyDirToAllStoragePaths(sourcePath, relativePath, dataPaths);
    } else {
      copyToAllStoragePaths(sourcePath, relativePath, dataPaths);
    }
  }
}

/**
 * Sync metadata subdirectories (knowledge, refs, tasks) to all storage paths
 * Copies from agent-core to all configured storage locations
 */
export function syncMetadataToAll(agentCorePath: string, dataPaths: string[]): void {
  const metadataDirs = ['knowledge', 'refs', 'tasks'];
  
  for (const dir of metadataDirs) {
    const sourceDir = path.join(agentCorePath, dir);
    copyDirToAllStoragePaths(sourceDir, dir, dataPaths);
  }
}

/**
 * Check if a directory path is writable
 * Creates a test file and removes it to verify write access
 */
export function checkWriteAccess(dirPath: string): boolean {
  const testFile = path.join(dirPath, '.rrce-write-test');
  
  try {
    // Ensure directory exists first
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Try to write and delete a test file
    fs.writeFileSync(testFile, 'write-test');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    // Clean up if test file was created but couldn't be deleted
    try {
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    } catch {
      // Ignore cleanup errors
    }
    return false;
  }
}

/**
 * Get the default RRCE_HOME path (from env or ~/.rrce-workflow)
 */
export function getDefaultRRCEHome(): string {
  return process.env.RRCE_HOME || path.join(process.env.HOME || '~', '.rrce-workflow');
}

/**
 * Get suggested global paths for user selection
 * Returns array of { path, label, isWritable } objects
 */
export function getSuggestedGlobalPaths(): Array<{ path: string; label: string; isWritable: boolean }> {
  const suggestions: Array<{ path: string; label: string; isWritable: boolean }> = [];
  
  // Option 1: RRCE_HOME environment variable (if explicitly set)
  if (process.env.RRCE_HOME) {
    suggestions.push({
      path: process.env.RRCE_HOME,
      label: 'RRCE_HOME (environment)',
      isWritable: checkWriteAccess(process.env.RRCE_HOME),
    });
  }
  
  // Option 2: Standard ~/.rrce-workflow
  const homeDefault = path.join(process.env.HOME || '~', '.rrce-workflow');
  if (!process.env.RRCE_HOME || process.env.RRCE_HOME !== homeDefault) {
    suggestions.push({
      path: homeDefault,
      label: '~/.rrce-workflow (default)',
      isWritable: checkWriteAccess(homeDefault),
    });
  }
  
  return suggestions;
}

/**
 * Get effective RRCE_HOME by reading from workspace config if available
 * Falls back to default RRCE_HOME if no custom path is configured
 */
export function getEffectiveRRCEHome(workspaceRoot?: string): string {
  // Check workspace config for custom globalPath
  if (workspaceRoot) {
    const configPath = getConfigPath(workspaceRoot);
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        const globalPathMatch = content.match(/globalPath:\s*["']?([^"'\n]+)["']?/);
        if (globalPathMatch?.[1]) {
          return globalPathMatch[1].trim();
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
  
  // Fall back to default
  return getDefaultRRCEHome();
}
