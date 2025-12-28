/**
 * Shared TUI Utilities
 * Common prompts and helpers used across wizard and MCP
 */

import { select, note, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as path from 'path';
import { checkWriteAccess, getDefaultRRCEHome } from './paths';
import { directoryPrompt, isCancelled } from './autocomplete-prompt';
import { loadUserPreferences, saveUserPreferences } from './preferences';

/**
 * Prompt user to select or enter a global storage path
 * With bash-like Tab completion and write permission checking
 * 
 * Used by both the wizard setup and MCP configuration
 */
export async function resolveGlobalPath(): Promise<string | undefined> {
  const prefs = loadUserPreferences();
  const defaultPath = prefs.defaultGlobalPath || getDefaultRRCEHome();
  const isDefaultWritable = checkWriteAccess(defaultPath);
  
  const options: { value: string; label: string; hint?: string }[] = [
    {
      value: 'default',
      label: `Default (${defaultPath})`,
      hint: isDefaultWritable ? pc.green('✓ writable') : pc.red('✗ not writable'),
    },
    {
      value: 'custom',
      label: 'Custom path',
      hint: 'Specify your own directory',
    },
  ];

  const choice = await select({
    message: 'Global storage location:',
    options,
    initialValue: isDefaultWritable ? 'default' : 'custom',
  });

  if (isCancel(choice)) {
    return undefined;
  }

  if (choice === 'default') {
    if (!isDefaultWritable) {
      note(
        `${pc.yellow('⚠')} Cannot write to default path:\n  ${pc.dim(defaultPath)}\n\nThis can happen when running via npx/bunx in restricted environments.\nPlease choose a custom path instead.`,
        'Write Access Issue'
      );
      return resolveGlobalPath(); // Retry
    }
    return defaultPath;
  }

  // Custom path with bash-like Tab completion
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

  // Save as preference for next time
  saveUserPreferences({ defaultGlobalPath: expandedPath });
  
  return expandedPath;
}
