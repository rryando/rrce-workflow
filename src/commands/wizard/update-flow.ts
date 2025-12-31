import { confirm, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { stringify } from 'yaml';
import type { StorageMode } from '../../types/prompt';
import { 
  ensureDir, 
  resolveAllDataPaths, 
  getAgentPromptPath,
  copyDirToAllStoragePaths,
  getEffectiveRRCEHome,
  getConfigPath,
  getDefaultRRCEHome
} from '../../lib/paths';
import { loadPromptsFromDir, getAgentCorePromptsDir, getAgentCoreDir } from '../../lib/prompts';
import { copyPromptsToDir, convertToOpenCodeAgent, copyDirRecursive } from './utils';
import { OPENCODE_CONFIG } from '../../mcp/install';

/**
 * Update prompts and templates from the package without resetting config
 * This ensures all IDE integrations and data paths receive the latest prompts
 */
export async function runUpdateFlow(
  workspacePath: string, 
  workspaceName: string, 
  currentStorageMode: string | null
) {
  const s = spinner();
  s.start('Checking for updates');

  try {
    const agentCoreDir = getAgentCoreDir();
    const prompts = loadPromptsFromDir(getAgentCorePromptsDir());

    // Determine storage paths based on current mode
    const mode = (currentStorageMode as StorageMode) || 'global';
    
    // Use effective RRCE_HOME from config for path resolution
    const customGlobalPath = getEffectiveRRCEHome(workspacePath);
    const dataPaths = resolveAllDataPathsWithCustomGlobal(mode, workspaceName, workspacePath, customGlobalPath);

    s.stop('Updates found');

    // Show what will be updated
    const updateTargets = [
      `  • prompts/ (${prompts.length} agent prompts)`,
      `  • templates/ (output templates)`,
      `  • docs/ (documentation)`,
    ];

    // Check for IDE integrations to update
    const configFilePath = getConfigPath(workspacePath);
    const ideTargets: string[] = [];
    
    if (fs.existsSync(configFilePath)) {
      const configContent = fs.readFileSync(configFilePath, 'utf-8');
      if (configContent.includes('opencode: true')) ideTargets.push('OpenCode agents');
      if (configContent.includes('copilot: true')) ideTargets.push('GitHub Copilot');
      if (configContent.includes('antigravity: true')) ideTargets.push('Antigravity');
    }

    if (ideTargets.length > 0) {
      updateTargets.push(`  • IDE integrations: ${ideTargets.join(', ')}`);
    }

    note(
      `The following will be updated from the package:\n${updateTargets.join('\n')}\n\nTarget locations:\n${dataPaths.map(p => `  • ${p}`).join('\n')}`,
      'Update Preview'
    );

    const shouldUpdate = await confirm({
      message: 'Proceed with update?',
      initialValue: true,
    });

    if (isCancel(shouldUpdate) || !shouldUpdate) {
      outro('Update cancelled.');
      return;
    }

    s.start('Updating from package');

    // Update templates, prompts, and docs in all storage locations
    for (const dataPath of dataPaths) {
      copyDirToAllStoragePaths(path.join(agentCoreDir, 'templates'), 'templates', [dataPath]);
      copyDirToAllStoragePaths(path.join(agentCoreDir, 'prompts'), 'prompts', [dataPath]);
      copyDirToAllStoragePaths(path.join(agentCoreDir, 'docs'), 'docs', [dataPath]);
    }

    // Also update global RRCE_HOME with shared assets as fallback
    const rrceHome = customGlobalPath || getDefaultRRCEHome();
    ensureDir(path.join(rrceHome, 'templates'));
    ensureDir(path.join(rrceHome, 'docs'));
    copyDirRecursive(path.join(agentCoreDir, 'templates'), path.join(rrceHome, 'templates'));
    copyDirRecursive(path.join(agentCoreDir, 'docs'), path.join(rrceHome, 'docs'));

    // Update IDE-specific locations if configured
    if (fs.existsSync(configFilePath)) {
      const configContent = fs.readFileSync(configFilePath, 'utf-8');

      // Update Copilot prompts (workspace-local)
      if (configContent.includes('copilot: true')) {
        const copilotPath = getAgentPromptPath(workspacePath, 'copilot');
        ensureDir(copilotPath);
        // Clear old prompts first to remove any renamed files (like planning_orchestrator -> planning_discussion)
        clearDirectory(copilotPath);
        copyPromptsToDir(prompts, copilotPath, '.agent.md');
      }

      // Update Antigravity prompts (workspace-local)
      if (configContent.includes('antigravity: true')) {
        const antigravityPath = getAgentPromptPath(workspacePath, 'antigravity');
        ensureDir(antigravityPath);
        // Clear old prompts first
        clearDirectory(antigravityPath);
        copyPromptsToDir(prompts, antigravityPath, '.md');
      }

      // Update OpenCode agents
      if (configContent.includes('opencode: true')) {
        const primaryDataPath = dataPaths[0];
        if (primaryDataPath) {
          updateOpenCodeAgents(prompts, mode, primaryDataPath);
        }
      }
    }

    s.stop('Update complete');

    const summary = [
      `Updated:`,
      `  ✓ ${prompts.length} agent prompts`,
      `  ✓ Output templates`,
      `  ✓ Documentation`,
    ];

    if (ideTargets.length > 0) {
      summary.push(`  ✓ IDE integrations: ${ideTargets.join(', ')}`);
    }

    summary.push(
      ``,
      `Your configuration and knowledge files were preserved.`,
      ``,
      pc.dim(`💡 If using OpenCode, you may need to reload for changes to take effect.`)
    );

    note(summary.join('\n'), 'Update Summary');

    outro(pc.green('✓ Successfully updated from package!'));

  } catch (error) {
    s.stop('Error occurred');
    cancel(`Failed to update: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Update OpenCode agents based on storage mode
 */
function updateOpenCodeAgents(
  prompts: ReturnType<typeof loadPromptsFromDir>,
  mode: StorageMode,
  primaryDataPath: string
): void {
  if (mode === 'global') {
    // Global mode: Write prompt files to ~/.config/opencode/prompts/ and reference them
    try {
      const promptsDir = path.join(path.dirname(OPENCODE_CONFIG), 'prompts');
      ensureDir(promptsDir);
      
      let opencodeConfig: any = { $schema: "https://opencode.ai/config.json" };
      if (fs.existsSync(OPENCODE_CONFIG)) {
        opencodeConfig = JSON.parse(fs.readFileSync(OPENCODE_CONFIG, 'utf-8'));
      }
      if (!opencodeConfig.agent) opencodeConfig.agent = {};
      
      // Remove old agents that might have been renamed
      // (e.g., planning_orchestrator -> planning_discussion)
      const currentAgentNames = prompts.map(p => path.basename(p.filePath, '.md'));
      const existingAgentNames = Object.keys(opencodeConfig.agent);
      
      // Find agents to remove (exist in config but not in current prompts)
      // Only remove RRCE agents, not user-defined ones
      const rrceAgentPrefixes = ['init', 'research', 'planning', 'executor', 'doctor', 'documentation', 'sync'];
      for (const existingName of existingAgentNames) {
        const isRrceAgent = rrceAgentPrefixes.some(prefix => existingName.startsWith(prefix));
        const stillExists = currentAgentNames.includes(existingName);
        if (isRrceAgent && !stillExists) {
          delete opencodeConfig.agent[existingName];
          // Also remove the old prompt file
          const oldPromptFile = path.join(promptsDir, `rrce-${existingName}.md`);
          if (fs.existsSync(oldPromptFile)) {
            fs.unlinkSync(oldPromptFile);
          }
        }
      }
      
      // Add/update current prompts - write files and use references
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
    // Workspace mode: Update .rrce-workflow/.opencode/agent
    const opencodeBaseDir = path.join(primaryDataPath, '.opencode', 'agent');
    ensureDir(opencodeBaseDir);
    
    // Clear old agents first
    clearDirectory(opencodeBaseDir);
    
    for (const prompt of prompts) {
      const baseName = path.basename(prompt.filePath, '.md');
      const agentConfig = convertToOpenCodeAgent(prompt);
      const content = `---\n${stringify({
        description: agentConfig.description,
        mode: agentConfig.mode,
        tools: agentConfig.tools
      })}---\n${agentConfig.prompt}`;
      fs.writeFileSync(path.join(opencodeBaseDir, `${baseName}.md`), content);
    }
  }
}

/**
 * Clear all files in a directory (but not subdirectories)
 */
function clearDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      fs.unlinkSync(path.join(dirPath, entry.name));
    }
  }
}

/**
 * Resolve all data paths with custom global path support
 */
function resolveAllDataPathsWithCustomGlobal(
  mode: StorageMode, 
  workspaceName: string, 
  workspaceRoot: string,
  customGlobalPath: string
): string[] {
  const globalPath = path.join(customGlobalPath, 'workspaces', workspaceName);
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
