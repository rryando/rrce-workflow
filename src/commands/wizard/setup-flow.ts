import { group, text, select, multiselect, confirm, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import type { StorageMode } from '../../types/prompt';
import { 
  ensureDir, 
  getAgentPromptPath,
  syncMetadataToAll,
  copyDirToAllStoragePaths,
  checkWriteAccess,
  getDefaultRRCEHome
} from '../../lib/paths';
import { loadPromptsFromDir, getAgentCorePromptsDir, getAgentCoreDir } from '../../lib/prompts';
import { copyPromptsToDir } from './utils';
import { generateVSCodeWorkspace } from './vscode';
import { directoryAutocomplete, isCancel as isAutocompleteCancel } from '../../lib/autocomplete-prompt';
import { type DetectedProject, getProjectDisplayLabel } from '../../lib/detection';

interface SetupConfig {
  storageMode: StorageMode;
  globalPath?: string;
  tools: string[];
  linkedProjects: string[];
}

/**
 * Run the full setup flow for new workspaces
 */
export async function runSetupFlow(
  workspacePath: string,
  workspaceName: string,
  existingProjects: DetectedProject[]
): Promise<void> {
  const s = spinner();
  
  // Full setup flow
  const config = await group(
    {
      storageMode: () =>
        select({
          message: 'Where should workflow data be stored?',
          options: [
            { value: 'global', label: 'Global (~/.rrce-workflow/)' },
            { value: 'workspace', label: 'Workspace (.rrce-workflow/)' },
            { value: 'both', label: 'Both' },
          ],
          initialValue: 'global',
        }),
      tools: () =>
        multiselect({
          message: 'Which AI tools do you use?',
          options: [
            { value: 'copilot', label: 'GitHub Copilot', hint: 'VSCode' },
            { value: 'antigravity', label: 'Antigravity IDE' },
          ],
          required: false,
        }),
      linkedProjects: () => {
        // Only show if there are other projects to link
        if (existingProjects.length === 0) {
          return Promise.resolve([]);
        }
        return multiselect({
          message: 'Link knowledge from other projects?',
          options: existingProjects.map(project => ({
            value: `${project.name}:${project.source}`,  // Unique key
            label: `${project.name} ${pc.dim(`(${project.source})`)}`,
            hint: pc.dim(project.source === 'global' 
              ? `~/.rrce-workflow/workspaces/${project.name}`
              : project.dataPath
            ),
          })),
          required: false,
        });
      },
      confirm: () =>
        confirm({
          message: 'Create configuration?',
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        cancel('Setup process cancelled.');
        process.exit(0);
      },
    }
  );

  if (!config.confirm) {
    outro('Setup cancelled by user.');
    process.exit(0);
  }

  // Determine global path for 'global' or 'both' modes
  let customGlobalPath: string | undefined;
  
  if (config.storageMode === 'global' || config.storageMode === 'both') {
    customGlobalPath = await resolveGlobalPath();
    if (!customGlobalPath) {
      cancel('Setup cancelled - no writable global path available.');
      process.exit(1);
    }
  }

  s.start('Generating configuration');

  try {
    await generateConfiguration({
      storageMode: config.storageMode as StorageMode,
      globalPath: customGlobalPath,
      tools: config.tools as string[],
      linkedProjects: config.linkedProjects as string[],
    }, workspacePath, workspaceName, existingProjects);

    s.stop('Configuration generated');
    
    // Show summary
    const dataPaths = getDataPaths(
      config.storageMode as StorageMode, 
      workspaceName, 
      workspacePath,
      customGlobalPath
    );
    
    const summary = [
      `Storage: ${config.storageMode === 'both' ? 'global + workspace' : config.storageMode}`,
    ];
    
    if (customGlobalPath && customGlobalPath !== getDefaultRRCEHome()) {
      summary.push(`Global path: ${pc.cyan(customGlobalPath)}`);
    }
    
    if (dataPaths.length > 0) {
      summary.push(`Data paths:`);
      dataPaths.forEach(p => summary.push(`  - ${p}`));
    }
    
    const selectedTools = config.tools as string[];
    if (selectedTools.length > 0) {
      summary.push(`Tools: ${selectedTools.join(', ')}`);
    }

    const linkedProjects = config.linkedProjects as string[];
    if (linkedProjects.length > 0) {
      summary.push(`Linked projects: ${linkedProjects.join(', ')}`);
      summary.push(`Workspace file: ${pc.cyan(`${workspaceName}.code-workspace`)}`);
    }
    
    note(summary.join('\n'), 'Setup Summary');
    
    // Show appropriate outro message
    if (linkedProjects.length > 0) {
      outro(pc.green(`✓ Setup complete! Open ${pc.bold(`${workspaceName}.code-workspace`)} in VSCode to access linked knowledge.`));
    } else {
      outro(pc.green(`✓ Setup complete! Your agents are ready to use.`));
    }

  } catch (error) {
    s.stop('Error occurred');
    cancel(`Failed to setup: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Resolve global path - always prompt user to choose default or custom
 */
async function resolveGlobalPath(): Promise<string | undefined> {
  const defaultPath = getDefaultRRCEHome();
  const isDefaultWritable = checkWriteAccess(defaultPath);
  
  // Build options
  const options: { value: string; label: string; hint?: string }[] = [];
  
  // Default option
  options.push({
    value: 'default',
    label: `Default (${defaultPath})`,
    hint: isDefaultWritable ? pc.green('✓ writable') : pc.red('✗ not writable'),
  });
  
  // Custom option
  options.push({
    value: 'custom',
    label: 'Custom path',
    hint: 'Specify your own directory',
  });

  const choice = await select({
    message: 'Global storage location:',
    options,
    initialValue: isDefaultWritable ? 'default' : 'custom',
  });

  if (isCancel(choice)) {
    return undefined;
  }

  if (choice === 'default') {
    // Verify it's writable
    if (!isDefaultWritable) {
      note(
        `${pc.yellow('⚠')} Cannot write to default path:\n  ${pc.dim(defaultPath)}\n\nThis can happen when running via npx/bunx in restricted environments.\nPlease choose a custom path instead.`,
        'Write Access Issue'
      );
      // Recursively ask again
      return resolveGlobalPath();
    }
    return defaultPath;
  }

  // Custom path input with Tab autocomplete
  const suggestedPath = path.join(process.env.HOME || '~', '.local', 'share', 'rrce-workflow');
  const customPath = await directoryAutocomplete({
    message: 'Enter custom global path:',
    initialValue: suggestedPath,
    hint: 'Tab to autocomplete',
    validate: (value) => {
      if (!value.trim()) {
        return 'Path cannot be empty';
      }
      // Expand ~ to home directory
      const expandedPath = value.startsWith('~') 
        ? value.replace('~', process.env.HOME || '') 
        : value;
      
      if (!checkWriteAccess(expandedPath)) {
        return `Cannot write to ${expandedPath}. Please choose a writable path.`;
      }
      return undefined;
    },
  });

  if (isAutocompleteCancel(customPath)) {
    return undefined;
  }

  // Path is already expanded by directoryAutocomplete
  return customPath as string;
}

/**
 * Generate configuration files and directories
 */
async function generateConfiguration(
  config: SetupConfig,
  workspacePath: string,
  workspaceName: string,
  allProjects: DetectedProject[] = []
): Promise<void> {
  const dataPaths = getDataPaths(config.storageMode, workspaceName, workspacePath, config.globalPath);
  
  for (const dataPath of dataPaths) {
    ensureDir(dataPath);
    // Create agent metadata subdirectories (data only, no prompts)
    ensureDir(path.join(dataPath, 'knowledge'));
    ensureDir(path.join(dataPath, 'refs'));
    ensureDir(path.join(dataPath, 'tasks'));
    ensureDir(path.join(dataPath, 'templates'));
  }

  // Get the agent-core directory path
  const agentCoreDir = getAgentCoreDir();
  
  // Sync metadata (knowledge, refs, tasks) from agent-core to all storage locations
  syncMetadataToAll(agentCoreDir, dataPaths);
  
  // Also copy templates to all storage locations
  copyDirToAllStoragePaths(path.join(agentCoreDir, 'templates'), 'templates', dataPaths);

  // Load prompts for IDE-specific locations
  const prompts = loadPromptsFromDir(getAgentCorePromptsDir());

  // Copy prompts to tool-specific locations (for IDE integration)
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

  // Create workspace config (inside .rrce-workflow folder)
  const workspaceConfigPath = path.join(workspacePath, '.rrce-workflow', 'config.yaml');
  ensureDir(path.dirname(workspaceConfigPath));
  
  let configContent = `# RRCE-Workflow Configuration
version: 1

storage:
  mode: ${config.storageMode}`;

  // Add custom global path if different from default
  if (config.globalPath && config.globalPath !== getDefaultRRCEHome()) {
    configContent += `\n  globalPath: "${config.globalPath}"`;
  }

  configContent += `

project:
  name: "${workspaceName}"

tools:
  copilot: ${config.tools.includes('copilot')}
  antigravity: ${config.tools.includes('antigravity')}
`;

  // Add linked projects if any
  if (config.linkedProjects.length > 0) {
    configContent += `\nlinked_projects:\n`;
    config.linkedProjects.forEach(name => {
      configContent += `  - ${name}\n`;
    });
  }

  fs.writeFileSync(workspaceConfigPath, configContent);

  // Generate VSCode workspace file if using copilot or has linked projects
  if (config.tools.includes('copilot') || config.linkedProjects.length > 0) {
    // Look up the full DetectedProject objects for selected project keys (format: name:source)
    const selectedProjects = allProjects.filter(p => 
      config.linkedProjects.includes(`${p.name}:${p.source}`)
    );
    generateVSCodeWorkspace(workspacePath, workspaceName, selectedProjects, config.globalPath);
  }
}

/**
 * Get data paths based on storage mode and custom global path
 */
function getDataPaths(
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
    case 'both':
      return [workspacePath, globalPath];
    default:
      return [globalPath];
  }
}
