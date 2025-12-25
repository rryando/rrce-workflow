import { confirm, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import type { StorageMode } from '../../types/prompt';
import { 
  ensureDir, 
  resolveAllDataPaths, 
  getAgentPromptPath,
  copyDirToAllStoragePaths,
  getEffectiveRRCEHome 
} from '../../lib/paths';
import { loadPromptsFromDir, getAgentCorePromptsDir, getAgentCoreDir } from '../../lib/prompts';
import { copyPromptsToDir } from './utils';

/**
 * Update prompts and templates from the package without resetting config
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
    note(
      `The following will be updated from the package:\n  • prompts/ (${prompts.length} agent prompts)\n  • templates/ (output templates)\n\nTarget locations:\n${dataPaths.map(p => `  • ${p}`).join('\n')}`,
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

    // Update prompts and templates in all storage locations
    for (const dataPath of dataPaths) {
      // Update prompts
      const promptsDir = path.join(dataPath, 'prompts');
      ensureDir(promptsDir);
      copyPromptsToDir(prompts, promptsDir, '.md');

      // Update templates
      copyDirToAllStoragePaths(path.join(agentCoreDir, 'templates'), 'templates', [dataPath]);
    }

    // Also update tool-specific locations if configured
    const configFilePath = path.join(workspacePath, '.rrce-workflow.yaml');
    const configContent = fs.readFileSync(configFilePath, 'utf-8');

    if (configContent.includes('copilot: true')) {
      const copilotPath = getAgentPromptPath(workspacePath, 'copilot');
      ensureDir(copilotPath);
      copyPromptsToDir(prompts, copilotPath, '.agent.md');
    }

    if (configContent.includes('antigravity: true')) {
      const antigravityPath = getAgentPromptPath(workspacePath, 'antigravity');
      ensureDir(antigravityPath);
      copyPromptsToDir(prompts, antigravityPath, '.md');
    }

    s.stop('Update complete');

    const summary = [
      `Updated:`,
      `  ✓ ${prompts.length} agent prompts`,
      `  ✓ Output templates`,
      ``,
      `Your configuration and knowledge files were preserved.`,
    ];

    note(summary.join('\n'), 'Update Summary');

    outro(pc.green('✓ Successfully updated from package!'));

  } catch (error) {
    s.stop('Error occurred');
    cancel(`Failed to update: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
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
    case 'both':
      return [workspacePath, globalPath];
    default:
      return [globalPath];
  }
}
