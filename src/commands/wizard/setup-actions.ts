/**
 * Setup Actions - Business logic for the wizard setup flow
 * Extracted from setup-flow.ts for better maintainability
 */

import * as fs from 'fs';
import * as path from 'path';
import pc from 'picocolors';
import { note } from '@clack/prompts';
import { stringify } from 'yaml';
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
import { copyPromptsToDir, convertToOpenCodeAgent, copyDirRecursive } from './utils';
import { generateVSCodeWorkspace } from './vscode';
import { installToConfig, getTargetLabel, type InstallTarget, OPENCODE_CONFIG_DIR, OPENCODE_CONFIG } from '../../mcp/install';

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
export async function installAgentPrompts(
  config: SetupConfig,
  workspacePath: string,
  dataPaths: string[]
): Promise<void> {
  const agentCoreDir = getAgentCoreDir();
  
  // Sync metadata to all storage locations
  syncMetadataToAll(agentCoreDir, dataPaths);
  copyDirToAllStoragePaths(path.join(agentCoreDir, 'templates'), 'templates', dataPaths);
  copyDirToAllStoragePaths(path.join(agentCoreDir, 'prompts'), 'prompts', dataPaths);
  copyDirToAllStoragePaths(path.join(agentCoreDir, 'docs'), 'docs', dataPaths);
  
  // Populate global RRCE_HOME with shared assets (templates and docs) as fallback
  const rrceHome = config.globalPath || getDefaultRRCEHome();
  ensureDir(path.join(rrceHome, 'templates'));
  ensureDir(path.join(rrceHome, 'docs'));
  copyDirRecursive(path.join(agentCoreDir, 'templates'), path.join(rrceHome, 'templates'));
  copyDirRecursive(path.join(agentCoreDir, 'docs'), path.join(rrceHome, 'docs'));
  
  // Load prompts for IDE-specific generation if needed
  const needsIDEPrompts = (config.storageMode === 'workspace' && (config.tools.includes('copilot') || config.tools.includes('antigravity'))) || 
                         config.tools.includes('opencode');
  
  if (needsIDEPrompts) {
    const prompts = loadPromptsFromDir(getAgentCorePromptsDir());

    // Workspace mode IDE prompts (Copilot/Antigravity)
    if (config.storageMode === 'workspace') {
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

    // OpenCode agents (respects storage mode)
    if (config.tools.includes('opencode')) {
      const primaryDataPath = dataPaths[0];
      if (primaryDataPath) {
        // Determine where to put OpenCode agents
        if (config.storageMode === 'global') {
          // Global mode: Write prompt files to ~/.config/opencode/prompts/ and reference them
          try {
            const promptsDir = path.join(path.dirname(OPENCODE_CONFIG), 'prompts');
            ensureDir(promptsDir);
            
            let opencodeConfig: any = { $schema: "https://opencode.ai/config.json" };
            if (fs.existsSync(OPENCODE_CONFIG)) {
              opencodeConfig = JSON.parse(fs.readFileSync(OPENCODE_CONFIG, 'utf-8'));
            }
            if (!opencodeConfig.agent) opencodeConfig.agent = {};
            
            for (const prompt of prompts) {
              const baseName = path.basename(prompt.filePath, '.md');
              const promptFileName = `rrce-${baseName}.md`;
              const promptFilePath = path.join(promptsDir, promptFileName);
              
              // Write the prompt content to a separate file
              fs.writeFileSync(promptFilePath, prompt.content);
              
              // Create agent config with file reference
              const agentConfig = convertToOpenCodeAgent(prompt, true, `./prompts/${promptFileName}`);
              opencodeConfig.agent[baseName] = agentConfig;
            }
            
            fs.writeFileSync(OPENCODE_CONFIG, JSON.stringify(opencodeConfig, null, 2) + '\n');
          } catch (e) {
            console.error('Failed to update global OpenCode config with agents:', e);
          }
        } else {
          // Workspace mode: put them in .rrce-workflow/.opencode/agent
          const opencodeBaseDir = path.join(primaryDataPath, '.opencode', 'agent');
          ensureDir(opencodeBaseDir);
          for (const prompt of prompts) {
            const baseName = path.basename(prompt.filePath, '.md');
            const agentConfig = convertToOpenCodeAgent(prompt);
            // In workspace mode, we keep individual markdown files with frontmatter
            const content = `---\n${stringify({
              description: agentConfig.description,
              mode: agentConfig.mode,
              tools: agentConfig.tools
            })}---\n${agentConfig.prompt}`;
            fs.writeFileSync(path.join(opencodeBaseDir, `${baseName}.md`), content);
          }
        }
      }
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
  // Determine target path based on storage mode
  let configPath: string;
  
  if (config.storageMode === 'global') {
    // Global mode: Store config in global workspace wrapper
    const rrceHome = config.globalPath || getDefaultRRCEHome();
    configPath = path.join(rrceHome, 'workspaces', workspaceName, 'config.yaml');
  } else {
    // Workspace mode: Store locally
    configPath = path.join(workspacePath, '.rrce-workflow', 'config.yaml');
  }
  
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
  sourcePath: "${workspacePath}"

tools:
  opencode: ${config.tools.includes('opencode')}
  copilot: ${config.tools.includes('copilot')}
  antigravity: ${config.tools.includes('antigravity')}
`;

  if (config.enableRAG) {
    content += `
semantic_search:
  enabled: true
`;
  }

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
    
      // Register with path for detection in both modes
      // This ensures the global MCP server can find the project without relying on deep filesystem scanning
      setProjectConfig(
        mcpConfig, 
        workspaceName, 
        true, 
        undefined,
        workspacePath,
        config.enableRAG ? { enabled: true } : undefined
      );
    
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

/**
 * Install RRCE MCP server to selected IDE configs
 * Non-fatal: catches errors and continues
 */
export function installToSelectedIDEs(tools: string[]): { 
  success: string[]; 
  failed: string[];
} {
  const success: string[] = [];
  const failed: string[] = [];
  
  // Map tool names to install targets
  const toolToTarget: Record<string, InstallTarget> = {
    'opencode': 'opencode',
    'antigravity': 'antigravity',
    'copilot': 'vscode-global',
  };
  
  for (const tool of tools) {
    const target = toolToTarget[tool];
    if (!target) continue;
    
    try {
      const result = installToConfig(target);
      const label = getTargetLabel(target);
      if (result) {
        success.push(label);
      } else {
        failed.push(label);
      }
    } catch (error) {
      const label = getTargetLabel(target);
      console.error(`Failed to install to ${label}:`, error);
      failed.push(label);
    }
  }
  
  return { success, failed };
}
