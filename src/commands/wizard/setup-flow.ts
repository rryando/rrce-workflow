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
import { type DetectedProject } from '../../lib/detection';
import { directoryPrompt, isCancelled } from '../../lib/autocomplete-prompt';

interface SetupConfig {
  storageMode: StorageMode;
  globalPath?: string;
  tools: string[];
  linkedProjects: string[];
  addToGitignore: boolean;
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
            { value: 'global', label: 'Global (~/.rrce-workflow/)', hint: 'Cross-project access, clean workspace' },
            { value: 'workspace', label: 'Workspace (.rrce-workflow/)', hint: 'Self-contained, version with repo' },
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
      addToGitignore: () =>
        confirm({
          message: 'Add generated folders to .gitignore?',
          initialValue: true,
        }),
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

  // Determine global path for 'global' mode
  let customGlobalPath: string | undefined;
  
  if (config.storageMode === 'global') {
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
      addToGitignore: config.addToGitignore as boolean,
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
      `Storage: ${config.storageMode}`,
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

  // Custom path input with bash-like Tab completion
  const suggestedPath = path.join(process.env.HOME || '~', '.local', 'share', 'rrce-workflow');
  const customPath = await directoryPrompt({
    message: 'Enter custom global path (Tab to autocomplete):',
    defaultValue: suggestedPath,
    validate: (value) => {
      if (!value.trim()) {
        return 'Path cannot be empty';
      }
      if (!checkWriteAccess(value)) {
        return `Cannot write to ${value}. Please choose a writable path.`;
      }
      return undefined;
    },
  });

  if (isCancelled(customPath)) {
    return undefined;
  }

  // Ensure path ends with .rrce-workflow so our tools can detect it
  let expandedPath = customPath as string;
  if (!expandedPath.endsWith('.rrce-workflow')) {
    expandedPath = path.join(expandedPath, '.rrce-workflow');
  }
  
  return expandedPath;
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

  // Add generated folders to .gitignore if user opted in
  if (config.addToGitignore) {
    updateGitignore(workspacePath, config.storageMode, config.tools);
  }

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
    default:
      return [globalPath];
  }
}

/**
 * Add generated folders to .gitignore based on storage mode and selected tools
 */
export function updateGitignore(workspacePath: string, storageMode: StorageMode, tools: string[]): boolean {
  const gitignorePath = path.join(workspacePath, '.gitignore');
  
  // Determine which entries to add based on config
  const entries: string[] = [];
  
  // Always add .rrce-workflow/ for workspace mode (data folder)
  if (storageMode === 'workspace') {
    entries.push('.rrce-workflow/');
  }
  
  // Add IDE-specific folders based on selected tools
  if (tools.includes('copilot')) {
    entries.push('.github/agents/');
  }
  if (tools.includes('antigravity')) {
    entries.push('.agent/');
  }
  
  if (entries.length === 0) {
    return false; // Nothing to add
  }
  
  try {
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8');
    }
    
    const lines = content.split('\n').map(line => line.trim());
    const newEntries: string[] = [];
    
    for (const entry of entries) {
      // Check if entry already exists (with or without trailing slash)
      const entryWithoutSlash = entry.replace(/\/$/, '');
      if (!lines.some(line => line === entry || line === entryWithoutSlash)) {
        newEntries.push(entry);
      }
    }
    
    if (newEntries.length === 0) {
      return false; // All entries already present
    }
    
    // Add entries to gitignore
    let newContent = content;
    if (!newContent.endsWith('\n') && newContent !== '') {
      newContent += '\n';
    }
    
    // Add a comment if adding new entries
    if (newContent === '' || !content.includes('# rrce-workflow')) {
      newContent += '\n# rrce-workflow generated folders\n';
    }
    
    newContent += newEntries.join('\n') + '\n';
    
    fs.writeFileSync(gitignorePath, newContent);
    return true;
  } catch {
    return false;
  }
}
