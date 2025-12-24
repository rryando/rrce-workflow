import { intro, group, text, select, multiselect, confirm, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { getGitUser } from '../lib/git';
import { detectWorkspaceRoot, getWorkspaceName, resolveAllDataPaths, ensureDir, getAgentPromptPath, syncMetadataToAll, copyDirToAllStoragePaths, listGlobalProjects, getGlobalProjectKnowledgePath, getRRCEHome, getGlobalWorkspacePath, getLocalWorkspacePath } from '../lib/paths';
import type { StorageMode } from '../types/prompt';
import { loadPromptsFromDir, getAgentCorePromptsDir, getAgentCoreDir } from '../lib/prompts';

import type { ParsedPrompt } from '../types/prompt';

export async function runWizard() {
  intro(pc.cyan(pc.inverse(' RRCE-Workflow Setup ')));

  const s = spinner();
  s.start('Detecting environment');

  const workspacePath = detectWorkspaceRoot();
  const workspaceName = getWorkspaceName(workspacePath);
  const gitUser = getGitUser();

  await new Promise(r => setTimeout(r, 800)); // Dramatic pause
  s.stop('Environment detected');

  note(
    `Git User:  ${pc.bold(gitUser || '(not found)')}
Workspace: ${pc.bold(workspaceName)}`,
    'Context'
  );

  // Check for existing projects in global storage
  const existingProjects = listGlobalProjects(workspaceName);
  
  // Check if already configured
  const configFilePath = path.join(workspacePath, '.rrce-workflow.yaml');
  const isAlreadyConfigured = fs.existsSync(configFilePath);
  
  // Check current storage mode from config
  let currentStorageMode: string | null = null;
  if (isAlreadyConfigured) {
    try {
      const configContent = fs.readFileSync(configFilePath, 'utf-8');
      const modeMatch = configContent.match(/mode:\s*(global|workspace|both)/);
      currentStorageMode = modeMatch?.[1] ?? null;
    } catch {
      // Ignore parse errors
    }
  }

  // Check if workspace has local data that could be synced
  const localDataPath = path.join(workspacePath, '.rrce-workflow');
  const hasLocalData = fs.existsSync(localDataPath);

  // If already configured, show menu
  if (isAlreadyConfigured) {
    const menuOptions: { value: string; label: string; hint?: string }[] = [];
    
    // Add link option if other projects exist
    if (existingProjects.length > 0) {
      menuOptions.push({ 
        value: 'link', 
        label: 'Link other project knowledge', 
        hint: `${existingProjects.length} projects available` 
      });
    }
    
    // Add sync to global option if using workspace-only mode
    if (currentStorageMode === 'workspace' && hasLocalData) {
      menuOptions.push({ 
        value: 'sync-global', 
        label: 'Sync to global storage', 
        hint: 'Share knowledge with other projects' 
      });
    }
    
    menuOptions.push({ value: 'reconfigure', label: 'Reconfigure from scratch' });
    menuOptions.push({ value: 'exit', label: 'Exit' });

    const action = await select({
      message: 'This workspace is already configured. What would you like to do?',
      options: menuOptions,
    });

    if (isCancel(action) || action === 'exit') {
      outro('Exited.');
      process.exit(0);
    }

    if (action === 'link') {
      await runLinkProjectsFlow(workspacePath, workspaceName, existingProjects);
      return;
    }

    if (action === 'sync-global') {
      await runSyncToGlobalFlow(workspacePath, workspaceName);
      return;
    }
    // Otherwise continue to full reconfigure flow
  }

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
          options: existingProjects.map(name => ({
            value: name,
            label: name,
            hint: `~/.rrce-workflow/workspaces/${name}/knowledge`
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

  s.start('Generating configuration');

  try {
    // Create data directories in all storage locations
    const dataPaths = resolveAllDataPaths(config.storageMode as StorageMode, workspaceName, workspacePath);
    
    for (const dataPath of dataPaths) {
      ensureDir(dataPath);
      // Create agent metadata subdirectories
      ensureDir(path.join(dataPath, 'knowledge'));
      ensureDir(path.join(dataPath, 'refs'));
      ensureDir(path.join(dataPath, 'tasks'));
      ensureDir(path.join(dataPath, 'templates'));
      ensureDir(path.join(dataPath, 'prompts'));
    }

    // Get the agent-core directory path
    const agentCoreDir = getAgentCoreDir();
    
    // Sync metadata (knowledge, refs, tasks) from agent-core to all storage locations
    syncMetadataToAll(agentCoreDir, dataPaths);
    
    // Also copy templates to all storage locations
    copyDirToAllStoragePaths(path.join(agentCoreDir, 'templates'), 'templates', dataPaths);

    // Load prompts
    const prompts = loadPromptsFromDir(getAgentCorePromptsDir());

    // Copy prompts to all storage locations (for cross-project access)
    for (const dataPath of dataPaths) {
      const promptsDir = path.join(dataPath, 'prompts');
      ensureDir(promptsDir);
      copyPromptsToDir(prompts, promptsDir, '.md');
    }

    // Copy prompts to tool-specific locations (for IDE integration)
    const selectedTools = config.tools as string[];
    
    if (selectedTools.includes('copilot')) {
      const copilotPath = getAgentPromptPath(workspacePath, 'copilot');
      ensureDir(copilotPath);
      copyPromptsToDir(prompts, copilotPath, '.agent.md');
    }

    if (selectedTools.includes('antigravity')) {
      const antigravityPath = getAgentPromptPath(workspacePath, 'antigravity');
      ensureDir(antigravityPath);
      copyPromptsToDir(prompts, antigravityPath, '.md');
    }

    // Create workspace config
    const linkedProjects = config.linkedProjects as string[];
    const workspaceConfigPath = path.join(workspacePath, '.rrce-workflow.yaml');
    let configContent = `# RRCE-Workflow Configuration
version: 1

storage:
  mode: ${config.storageMode}

project:
  name: "${workspaceName}"

tools:
  copilot: ${selectedTools.includes('copilot')}
  antigravity: ${selectedTools.includes('antigravity')}
`;

    // Add linked projects if any
    if (linkedProjects.length > 0) {
      configContent += `\nlinked_projects:\n`;
      linkedProjects.forEach(name => {
        configContent += `  - ${name}\n`;
      });
    }

    fs.writeFileSync(workspaceConfigPath, configContent);

    // Generate VSCode workspace file if using copilot or has linked projects
    if (selectedTools.includes('copilot') || linkedProjects.length > 0) {
      generateVSCodeWorkspace(workspacePath, workspaceName, linkedProjects);
    }

    s.stop('Configuration generated');
    
    // Show summary
    const summary = [
      `Storage: ${config.storageMode === 'both' ? 'global + workspace' : config.storageMode}`,
    ];
    
    if (dataPaths.length > 0) {
      summary.push(`Data paths:`);
      dataPaths.forEach(p => summary.push(`  - ${p}`));
    }
    
    if (selectedTools.length > 0) {
      summary.push(`Tools: ${selectedTools.join(', ')}`);
    }

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

function copyPromptsToDir(prompts: ParsedPrompt[], targetDir: string, extension: string) {
  for (const prompt of prompts) {
    const baseName = path.basename(prompt.filePath, '.md');
    const targetName = baseName + extension;
    const targetPath = path.join(targetDir, targetName);
    
    // Read the full content including frontmatter
    const content = fs.readFileSync(prompt.filePath, 'utf-8');
    fs.writeFileSync(targetPath, content);
  }
}

interface VSCodeWorkspaceFolder {
  path: string;
  name?: string;
}

interface VSCodeWorkspace {
  folders: VSCodeWorkspaceFolder[];
  settings?: Record<string, unknown>;
}

/**
 * Generate or update VSCode workspace file with linked project knowledge folders
 */
function generateVSCodeWorkspace(workspacePath: string, workspaceName: string, linkedProjects: string[]) {
  const workspaceFilePath = path.join(workspacePath, `${workspaceName}.code-workspace`);
  
  let workspace: VSCodeWorkspace;
  
  // Check if workspace file already exists
  if (fs.existsSync(workspaceFilePath)) {
    try {
      const content = fs.readFileSync(workspaceFilePath, 'utf-8');
      workspace = JSON.parse(content);
    } catch {
      // If parse fails, create new
      workspace = { folders: [] };
    }
  } else {
    workspace = { folders: [] };
  }

  // Ensure main workspace folder is first
  const mainFolder: VSCodeWorkspaceFolder = { path: '.' };
  const existingMainIndex = workspace.folders.findIndex(f => f.path === '.');
  if (existingMainIndex === -1) {
    workspace.folders.unshift(mainFolder);
  }

  // Add linked project knowledge folders
  const rrceHome = getRRCEHome();
  for (const projectName of linkedProjects) {
    const knowledgePath = path.join(rrceHome, 'workspaces', projectName, 'knowledge');
    const folderEntry: VSCodeWorkspaceFolder = {
      path: knowledgePath,
      name: `📚 ${projectName} (knowledge)`
    };

    // Check if already exists
    const existingIndex = workspace.folders.findIndex(f => f.path === knowledgePath);
    if (existingIndex === -1) {
      workspace.folders.push(folderEntry);
    }
  }

  // Write workspace file
  fs.writeFileSync(workspaceFilePath, JSON.stringify(workspace, null, 2));
}

/**
 * Run the link-only flow for adding other project knowledge to an existing workspace
 */
async function runLinkProjectsFlow(workspacePath: string, workspaceName: string, existingProjects: string[]) {
  const linkedProjects = await multiselect({
    message: 'Select projects to link:',
    options: existingProjects.map(name => ({
      value: name,
      label: name,
      hint: `~/.rrce-workflow/workspaces/${name}/knowledge`
    })),
    required: true,
  });

  if (isCancel(linkedProjects)) {
    cancel('Cancelled.');
    process.exit(0);
  }

  const selectedProjects = linkedProjects as string[];

  if (selectedProjects.length === 0) {
    outro('No projects selected.');
    return;
  }

  const s = spinner();
  s.start('Linking projects');

  // Update .rrce-workflow.yaml with linked projects
  const configFilePath = path.join(workspacePath, '.rrce-workflow.yaml');
  let configContent = fs.readFileSync(configFilePath, 'utf-8');

  // Check if linked_projects section exists
  if (configContent.includes('linked_projects:')) {
    // Append to existing section - find and update
    const lines = configContent.split('\n');
    const linkedIndex = lines.findIndex(l => l.trim() === 'linked_projects:');
    if (linkedIndex !== -1) {
      // Find where to insert new projects (after existing ones)
      let insertIndex = linkedIndex + 1;
      while (insertIndex < lines.length && lines[insertIndex]?.startsWith('  - ')) {
        insertIndex++;
      }
      // Add new projects that aren't already there
      for (const name of selectedProjects) {
        if (!configContent.includes(`  - ${name}`)) {
          lines.splice(insertIndex, 0, `  - ${name}`);
          insertIndex++;
        }
      }
      configContent = lines.join('\n');
    }
  } else {
    // Add new linked_projects section
    configContent += `\nlinked_projects:\n`;
    selectedProjects.forEach(name => {
      configContent += `  - ${name}\n`;
    });
  }

  fs.writeFileSync(configFilePath, configContent);

  // Update VSCode workspace file
  generateVSCodeWorkspace(workspacePath, workspaceName, selectedProjects);

  s.stop('Projects linked');

  // Show summary
  const workspaceFile = `${workspaceName}.code-workspace`;
  const summary = [
    `Linked projects:`,
    ...selectedProjects.map(p => `  ✓ ${p}`),
    ``,
    `Workspace file: ${pc.cyan(workspaceFile)}`,
  ];

  note(summary.join('\n'), 'Link Summary');

  outro(pc.green(`✓ Projects linked! Open ${pc.bold(workspaceFile)} in VSCode to access linked knowledge.`));
}

/**
 * Sync workspace knowledge to global storage so other projects can reference it
 */
async function runSyncToGlobalFlow(workspacePath: string, workspaceName: string) {
  const localPath = getLocalWorkspacePath(workspacePath);
  const globalPath = getGlobalWorkspacePath(workspaceName);

  // Check what exists locally
  const subdirs = ['knowledge', 'prompts', 'templates', 'tasks', 'refs'];
  const existingDirs = subdirs.filter(dir => 
    fs.existsSync(path.join(localPath, dir))
  );

  if (existingDirs.length === 0) {
    outro(pc.yellow('No data found in workspace storage to sync.'));
    return;
  }

  // Show what will be synced
  note(
    `The following will be copied to global storage:\n${existingDirs.map(d => `  • ${d}/`).join('\n')}\n\nDestination: ${pc.cyan(globalPath)}`,
    'Sync Preview'
  );

  const shouldSync = await confirm({
    message: 'Proceed with sync to global storage?',
    initialValue: true,
  });

  if (isCancel(shouldSync) || !shouldSync) {
    outro('Sync cancelled.');
    return;
  }

  const s = spinner();
  s.start('Syncing to global storage');

  try {
    // Ensure global directory exists
    ensureDir(globalPath);

    // Copy each directory
    for (const dir of existingDirs) {
      const srcDir = path.join(localPath, dir);
      const destDir = path.join(globalPath, dir);
      ensureDir(destDir);
      
      // Copy files recursively
      copyDirRecursive(srcDir, destDir);
    }

    // Update the config to reflect 'both' mode
    const configFilePath = path.join(workspacePath, '.rrce-workflow.yaml');
    let configContent = fs.readFileSync(configFilePath, 'utf-8');
    configContent = configContent.replace(/mode:\s*workspace/, 'mode: both');
    fs.writeFileSync(configFilePath, configContent);

    s.stop('Sync complete');

    const summary = [
      `Synced directories:`,
      ...existingDirs.map(d => `  ✓ ${d}/`),
      ``,
      `Global path: ${pc.cyan(globalPath)}`,
      `Storage mode updated to: ${pc.bold('both')}`,
      ``,
      `Other projects can now link this knowledge!`,
    ];

    note(summary.join('\n'), 'Sync Summary');

    outro(pc.green('✓ Workspace knowledge synced to global storage!'));

  } catch (error) {
    s.stop('Error occurred');
    cancel(`Failed to sync: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Recursively copy a directory
 */
function copyDirRecursive(src: string, dest: string) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      ensureDir(destPath);
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
