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
    // Check for .git or .rrce-workflow.yaml
    if (fs.existsSync(path.join(current, '.git')) || 
        fs.existsSync(path.join(current, '.rrce-workflow.yaml'))) {
      return current;
    }
    current = path.dirname(current);
  }
  
  return process.cwd();
}

/**
 * Get workspace name from directory or config
 */
export function getWorkspaceName(workspaceRoot: string): string {
  // TODO: Check .rrce-workflow.yaml for project.name
  return path.basename(workspaceRoot);
}

/**
 * Resolve data path based on storage mode
 */
export function resolveDataPath(mode: StorageMode, workspaceName: string, workspaceRoot: string): string {
  switch (mode) {
    case 'global':
      return path.join(RRCE_HOME, 'workspaces', workspaceName);
    case 'workspace':
      return path.join(workspaceRoot, '.rrce-workflow');
    case 'both':
      // Primary is workspace for 'both' mode
      return path.join(workspaceRoot, '.rrce-workflow');
    default:
      return path.join(RRCE_HOME, 'workspaces', workspaceName);
  }
}

/**
 * Get RRCE home directory
 */
export function getRRCEHome(): string {
  return RRCE_HOME;
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
 */
export function getAgentPromptPath(workspaceRoot: string, tool: 'copilot' | 'antigravity'): string {
  if (tool === 'copilot') {
    return path.join(workspaceRoot, '.github', 'agents');
  } else {
    return path.join(workspaceRoot, '.agent', 'workflows');
  }
}
