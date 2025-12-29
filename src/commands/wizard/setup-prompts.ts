/**
 * Setup Prompts - All prompt definitions for the wizard setup flow
 * Extracted from setup-flow.ts for better maintainability
 */

import { select, multiselect, confirm, isCancel, cancel } from '@clack/prompts';
import pc from 'picocolors';
import type { StorageMode } from '../../types/prompt';
import type { DetectedProject } from '../../lib/detection';

/**
 * Prompt for setup mode selection (Express vs Custom)
 */
export async function promptSetupMode(): Promise<'express' | 'custom'> {
  const result = await select({
    message: 'Setup mode:',
    options: [
      { value: 'express', label: 'Express Setup', hint: 'Quick start with recommended defaults (3 steps)' },
      { value: 'custom', label: 'Custom Setup', hint: 'Full configuration options' },
    ],
    initialValue: 'express',
  });
  
  if (isCancel(result)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  return result as 'express' | 'custom';
}

/**
 * Prompt for storage mode selection
 */
export async function promptStorageMode(): Promise<StorageMode> {
  const result = await select({
    message: 'Where should workflow data be stored?',
    options: [
      { value: 'global', label: 'Global (~/.rrce-workflow/)', hint: 'Cross-project access, clean workspace' },
      { value: 'workspace', label: 'Workspace (.rrce-workflow/)', hint: 'Self-contained, version with repo' },
    ],
    initialValue: 'global',
  });
  
  if (isCancel(result)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  return result as StorageMode;
}

/**
 * Prompt for AI tools selection
 */
export async function promptTools(): Promise<string[]> {
  const result = await multiselect({
    message: 'Which AI tools do you use?',
    options: [
      { value: 'copilot', label: 'GitHub Copilot', hint: 'VSCode' },
      { value: 'antigravity', label: 'Antigravity IDE' },
    ],
    required: false,
  });
  
  if (isCancel(result)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  return result as string[];
}

/**
 * Prompt for MCP exposure
 */
export async function promptMCPExposure(): Promise<boolean> {
  const result = await confirm({
    message: 'Expose this project to MCP (AI Agent) server?',
    initialValue: true,
  });
  
  if (isCancel(result)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  return result;
}

/**
 * Prompt for linked projects selection
 */
export async function promptLinkedProjects(existingProjects: DetectedProject[]): Promise<string[]> {
  if (existingProjects.length === 0) {
    return [];
  }
  
  const result = await multiselect({
    message: 'Link knowledge from other projects?',
    options: existingProjects.map(project => ({
      value: `${project.name}:${project.source}`,
      label: `${project.name} ${pc.dim(`(${project.source})`)}`,
      hint: pc.dim(project.source === 'global' 
        ? `~/.rrce-workflow/workspaces/${project.name}`
        : project.dataPath
      ),
    })),
    required: false,
  });
  
  if (isCancel(result)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  return result as string[];
}

/**
 * Prompt for gitignore addition
 */
export async function promptGitignore(): Promise<boolean> {
  const result = await confirm({
    message: 'Add generated folders to .gitignore? (as comments - uncomment if needed)',
    initialValue: false,
  });
  
  if (isCancel(result)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  return result;
}

/**
 * Prompt for RAG enablement with warning
 */
export async function promptRAG(): Promise<boolean> {
  const result = await confirm({
    message: `Enable Semantic Search (Local Mini RAG)?\n${pc.yellow('\u26a0 First use will download a ~100MB model')}`,
    initialValue: true,
  });
  
  if (isCancel(result)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  return result;
}

/**
 * Prompt for final confirmation
 */
export async function promptConfirmation(): Promise<boolean> {
  const result = await confirm({
    message: 'Create configuration?',
    initialValue: true,
  });
  
  if (isCancel(result)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  return result;
}
