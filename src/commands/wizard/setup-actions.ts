/**
 * Setup Actions - Business logic for the wizard setup flow
 * Extracted from setup-flow.ts for better maintainability
 */

import * as fs from 'fs';
import * as path from 'path';
import pc from 'picocolors';
import { note } from '@clack/prompts';
import type { StorageMode } from '../../types/prompt';
import type { DetectedProject } from '../../lib/detection';
import { 
  ensureDir, 
  getAgentPromptPath,
  syncMetadataToAll,
  copyDirToAllStoragePaths,
  getDefaultRRCEHome
} from '../../lib/paths';
import { loadPromptsFromDir, getAgentCorePromptsDir, getAgentCoreDir } from '../../lib/prompts';
import { copyPromptsToDir } from './utils';
import { generateVSCodeWorkspace } from './vscode';

export interface SetupConfig {
  storageMode: StorageMode;
  globalPath?: string;
  tools: string[];
  linkedProjects: string[];
  addToGitignore: boolean;
  exposeToMCP: boolean;
  enableRAG: boolean;
}

/**
 * Create directory structure for workflow data
 */
export function createDirectoryStructure(dataPaths: string[]): void {
  for (const dataPath of dataPaths) {
    ensureDir(dataPath);
    ensureDir(path.join(dataPath, 'knowledge'));
    ensureDir(path.join(dataPath, 'refs'));
    ensureDir(path.join(dataPath, 'tasks'));
    ensureDir(path.join(dataPath, 'templates'));
  }
}

/**
 * Install agent prompts and metadata
 */
export function installAgentPrompts(
  config: SetupConfig,
  workspacePath: string,
  dataPaths: string[]
): void {
  const agentCoreDir = getAgentCoreDir();
  
  // Sync metadata to all storage locations
  syncMetadataToAll(agentCoreDir, dataPaths);
  copyDirToAllStoragePaths(path.join(agentCoreDir, 'templates'), 'templates', dataPaths);
  
  // Load and copy prompts to IDE-specific locations
  if (config.storageMode === 'workspace') {
    const prompts = loadPromptsFromDir(getAgentCorePromptsDir());
    
    if (config.tools.includes('copilot')) {
      const copilotPath = getAgentPromptPath(workspacePath, 'copilot');
      ensureDir(copilotPath);
      copyPromptsToDir(prompts, copilotPath, '.agent.md');
    }
    
    if (config.tools.includes('antigravity')) {
      const antigravityPath = getAgentPromptPath(workspacePath, 'antigravity');
      ensureDir(antigravityPath);
      copyPromptsToDir(prompts, antigravityPath, '.md');
    }
  }
}

/**
 * Create workspace config file (only for workspace mode)
 */
export function createWorkspaceConfig(
  config: SetupConfig,
  workspacePath: string,
  workspaceName: string
): void {
  if (config.storageMode !== 'workspace') return;
  
  const configPath = path.join(workspacePath, '.rrce-workflow', 'config.yaml');
  ensureDir(path.dirname(configPath));
  
  let content = `# RRCE-Workflow Configuration
version: 1

storage:
  mode: ${config.storageMode}`;

  if (config.globalPath && config.globalPath !== getDefaultRRCEHome()) {
    content += `\n  globalPath: "${config.globalPath}"`;
  }

  content += `

project:
  name: "${workspaceName}"

tools:
  copilot: ${config.tools.includes('copilot')}
  antigravity: ${config.tools.includes('antigravity')}
`;

  if (config.linkedProjects.length > 0) {
    content += `\nlinked_projects:\n`;
    config.linkedProjects.forEach(name => {
      content += `  - ${name}\n`;
    });
  }

  fs.writeFileSync(configPath, content);
}

/**
 * Register project with MCP server
 * Non-fatal: catches errors and shows warning
 */
export async function registerWithMCP(
  config: SetupConfig,
  workspacePath: string,
  workspaceName: string
): Promise<void> {
  if (!config.exposeToMCP) return;
  
  try {
    const { loadMCPConfig, saveMCPConfig, setProjectConfig } = await import('../../mcp/config');
    
    const mcpConfig = loadMCPConfig();
    
    if (config.storageMode === 'workspace') {
      setProjectConfig(
        mcpConfig, 
        workspaceName, 
        true, 
        undefined,
        undefined,
        config.enableRAG ? { enabled: true } : undefined
      );
    } else {
      // Global mode - register with path for detection
      setProjectConfig(
        mcpConfig, 
        workspaceName, 
        true, 
        undefined,
        workspacePath,
        config.enableRAG ? { enabled: true } : undefined
      );
    }
    
    saveMCPConfig(mcpConfig);
  } catch (e) {
    note(
      `${pc.yellow('\u26a0')} Could not register project with MCP\n` +
      `Error: ${e instanceof Error ? e.message : String(e)}\n\n` +
      `You can configure MCP later: ${pc.cyan('npx rrce-workflow mcp')}`,
      'MCP Registration Warning'
    );
  }
}

/**
 * Get data paths based on storage mode
 */
export function getDataPaths(
  mode: StorageMode, 
  workspaceName: string, 
  workspaceRoot: string,
  customGlobalPath?: string
): string[] {
  const globalPath = path.join(customGlobalPath || getDefaultRRCEHome(), 'workspaces', workspaceName);
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
