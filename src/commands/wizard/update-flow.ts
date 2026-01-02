import { confirm, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { stringify, parse } from 'yaml';
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
import { copyPromptsToDir, convertToOpenCodeAgent, copyDirRecursive, updateOpenCodeConfig } from './utils';
import { OPENCODE_CONFIG } from '../../mcp/install';
import { DriftService } from '../../lib/drift-service';

/**
 * Backup a file by copying it with a timestamp
 */
function backupFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '-' + Date.now();
  const backupPath = `${filePath}.${timestamp}.bak`;
  try {
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch (e) {
    console.error(`Failed to backup ${filePath}:`, e);
    return null;
  }
}

/**
 * Get the current version from package.json
 */
function getPackageVersion(): string {
  try {
    const agentCoreDir = getAgentCoreDir();
    const packageJsonPath = path.join(path.dirname(agentCoreDir), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
    }
  } catch (e) {
    // Ignore
  }
  return '0.0.0';
}

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
    const runningVersion = getPackageVersion();

    // Determine storage paths based on current mode
    const mode = (currentStorageMode as StorageMode) || 'global';
    
    // Use effective RRCE_HOME from config for path resolution
    const customGlobalPath = getEffectiveRRCEHome(workspacePath);
    const dataPaths = resolveAllDataPathsWithCustomGlobal(mode, workspaceName, workspacePath, customGlobalPath);

    // Check for drift
    const configFilePath = getConfigPath(workspacePath);
    let currentSyncedVersion: string | undefined;
    if (fs.existsSync(configFilePath)) {
      try {
        const content = fs.readFileSync(configFilePath, 'utf-8');
        const config = parse(content) as any;
        currentSyncedVersion = config.last_synced_version;
      } catch (e) {}
    }

    const driftReport = DriftService.checkDrift(dataPaths[0]!, currentSyncedVersion, runningVersion);

    s.stop('Updates found');

    if (driftReport.type === 'version') {
      note(`New version available: ${pc.green(runningVersion)} (Current synced: ${pc.dim(currentSyncedVersion || 'None')})`, 'Update Available');
    }

    if (driftReport.modifiedFiles.length > 0) {
      note(
        pc.yellow(`The following files have been modified and will be backed up before updating:\n`) + 
        driftReport.modifiedFiles.map(f => `  • ${f}`).join('\n'),
        'Modifications Detected'
      );
    }

    // Show what will be updated
    const updateTargets = [
      `  • prompts/ (${prompts.length} agent prompts)`,
      `  • templates/ (output templates)`,
      `  • docs/ (documentation)`,
    ];

    // Check for IDE integrations to update
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

    // Update templates, prompts, and docs in all storage locations with drift protection
    for (const dataPath of dataPaths) {
      const dirs = ['templates', 'prompts', 'docs'];
      const updatedFiles: string[] = [];

      for (const dir of dirs) {
        const srcDir = path.join(agentCoreDir, dir);
        if (!fs.existsSync(srcDir)) continue;

        const syncFiles = (src: string, rel: string) => {
          const entries = fs.readdirSync(src, { withFileTypes: true });
          for (const entry of entries) {
            const entrySrc = path.join(src, entry.name);
            const entryRel = path.join(rel, entry.name);
            const entryDest = path.join(dataPath, entryRel);

            if (entry.isDirectory()) {
              ensureDir(entryDest);
              syncFiles(entrySrc, entryRel);
            } else {
              // Check for drift on this specific file
              if (driftReport.modifiedFiles.includes(entryRel)) {
                backupFile(entryDest);
              }
              fs.copyFileSync(entrySrc, entryDest);
              updatedFiles.push(entryRel);
            }
          }
        };

        syncFiles(srcDir, dir);
      }

      // Refresh checksums
      const manifest = DriftService.generateManifest(dataPath, updatedFiles);
      DriftService.saveManifest(dataPath, manifest);
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
        // Clear old prompts first to remove any renamed files
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
      
      // Update config.yaml with last_synced_version
      try {
        const yaml = parse(configContent) as any;
        yaml.last_synced_version = runningVersion;
        fs.writeFileSync(configFilePath, stringify(yaml));
      } catch (e) {
        console.error('Failed to update config.yaml version:', e);
      }
    }

    // Update mcp.yaml version if it exists
    const mcpPath = path.join(rrceHome, 'mcp.yaml');
    if (fs.existsSync(mcpPath)) {
      try {
        const content = fs.readFileSync(mcpPath, 'utf-8');
        const yaml = parse(content) as any;
        if (yaml.projects) {
          const project = yaml.projects.find((p: any) => p.name === workspaceName);
          if (project) {
            project.last_synced_version = runningVersion;
            fs.writeFileSync(mcpPath, stringify(yaml));
          }
        }
      } catch (e) {
        console.error('Failed to update mcp.yaml version:', e);
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

    if (driftReport.modifiedFiles.length > 0) {
      summary.push(`  ✓ ${driftReport.modifiedFiles.length} modified files backed up`);
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
    // Global mode: Use surgical update utility
    try {
      const promptsDir = path.join(path.dirname(OPENCODE_CONFIG), 'prompts');
      ensureDir(promptsDir);
      
      const newAgents: Record<string, any> = {};
      
      // Add/update current prompts - write files and use references
      for (const prompt of prompts) {
        const baseName = path.basename(prompt.filePath, '.md');
        const agentId = `rrce_${baseName}`;
        const promptFileName = `rrce-${baseName}.md`;
        const promptFilePath = path.join(promptsDir, promptFileName);

        // Write the prompt content to a separate file
        fs.writeFileSync(promptFilePath, prompt.content);

        // Create agent config with file reference
        const agentConfig = convertToOpenCodeAgent(prompt, true, `./prompts/${promptFileName}`);
        newAgents[agentId] = agentConfig;
      }

      // Use surgical update utility
      updateOpenCodeConfig(newAgents);
      
      // Hide OpenCode's native plan agent to avoid confusion with RRCE orchestrator
      if (fs.existsSync(OPENCODE_CONFIG)) {
          const config = JSON.parse(fs.readFileSync(OPENCODE_CONFIG, 'utf8'));
          if (!config.agents) config.agents = {};
          if (!config.agents.plan) config.agents.plan = {};
          config.agents.plan.disable = true;
          fs.writeFileSync(OPENCODE_CONFIG, JSON.stringify(config, null, 2));
      }

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
      const agentId = `rrce_${baseName}`;
      const agentConfig = convertToOpenCodeAgent(prompt);
      const content = `---\n${stringify({
        description: agentConfig.description,
        mode: agentConfig.mode,
        tools: agentConfig.tools
      })}---\n${agentConfig.prompt}`;
      fs.writeFileSync(path.join(opencodeBaseDir, `${agentId}.md`), content);
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
