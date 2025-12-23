import { intro, group, text, select, multiselect, confirm, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { getGitUser } from '../lib/git';
import { detectWorkspaceRoot, getWorkspaceName, resolveDataPath, ensureDir, getAgentPromptPath } from '../lib/paths';
import type { StorageMode } from '../types/prompt';
import { loadPromptsFromDir, getAgentCorePromptsDir } from '../lib/prompts';

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
     // Create config file
    const dataPath = resolveDataPath(config.storageMode as StorageMode, workspaceName, workspacePath);
    ensureDir(dataPath);

    // Load prompts
    const prompts = loadPromptsFromDir(getAgentCorePromptsDir());

    // Copy prompts
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
    const workspaceConfigPath = path.join(workspacePath, '.rrce-workflow.yaml');
    const configContent = `# RRCE-Workflow Configuration
version: 1

storage:
  mode: ${config.storageMode}

project:
  name: "${workspaceName}"
`;
    fs.writeFileSync(workspaceConfigPath, configContent);

    s.stop('Configuration generated');
    
    outro(pc.green(`✓ Setup complete! You can now run "rrce-workflow select" to start using agents.`));

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
