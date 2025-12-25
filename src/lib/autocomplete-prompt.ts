import { TextPrompt, isCancel, type Prompt } from '@clack/core';
import * as fs from 'fs';
import * as path from 'path';
import pc from 'picocolors';

interface DirectoryAutocompleteOptions {
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (value: string) => string | undefined;
  hint?: string;
}

/**
 * Custom text input with Tab-completion for directory paths
 * Uses @clack/core TextPrompt with custom key handling
 */
export async function directoryAutocomplete(opts: DirectoryAutocompleteOptions): Promise<string | symbol> {
  let completions: string[] = [];
  let completionIndex = 0;
  let lastTabValue = '';

  const prompt = new TextPrompt({
    initialValue: opts.initialValue,
    validate: opts.validate,
    render() {
      const title = `${pc.cyan('◆')}  ${opts.message}`;
      const hintText = opts.hint ? pc.dim(` (${opts.hint})`) : '';
      
      let inputLine: string;
      if (this.state === 'error') {
        inputLine = `${pc.yellow('▲')}  ${this.valueWithCursor}`;
      } else if (this.state === 'submit') {
        inputLine = `${pc.green('✓')}  ${pc.dim(String(this.value || ''))}`;
      } else {
        inputLine = `${pc.cyan('│')}  ${this.valueWithCursor || pc.dim(opts.placeholder || '')}`;
      }
      
      let result = `${title}${hintText}\n${inputLine}`;
      
      if (this.state === 'error' && this.error) {
        result += `\n${pc.yellow('│')}  ${pc.yellow(this.error)}`;
      }
      
      // Show completion hint if multiple options
      if (completions.length > 1 && this.state === 'active') {
        const remaining = completions.length - 1;
        result += `\n${pc.dim('│')}  ${pc.dim(`+${remaining} more, press Tab again to cycle`)}`;
      }
      
      return result;
    },
  });

  // Listen for key events - Tab key handling
  prompt.on('key', (key) => {
    if (key === '\t' || key === 'tab') {
      handleTabCompletion(prompt);
    } else {
      // Reset completion state on any other key
      completions = [];
      completionIndex = 0;
      lastTabValue = '';
    }
  });

  function handleTabCompletion(p: TextPrompt) {
    const input = String(p.value || '');
    
    // Expand ~ to home directory
    const expanded = input.startsWith('~')
      ? input.replace(/^~/, process.env.HOME || '')
      : input;

    // If user hasn't changed input since last tab, cycle through completions
    if (lastTabValue === input && completions.length > 1) {
      completionIndex = (completionIndex + 1) % completions.length;
      const completion = completions[completionIndex] || '';
      setPromptValue(p, completion);
      return;
    }

    // Get new completions
    completions = getDirectoryCompletions(expanded);
    completionIndex = 0;
    lastTabValue = input;

    if (completions.length === 1) {
      // Single match - auto-complete with trailing slash if directory
      const completion = completions[0] || '';
      setPromptValue(p, completion.endsWith('/') ? completion : completion + '/');
      completions = []; // Clear so next Tab gets fresh completions
      lastTabValue = '';
    } else if (completions.length > 1) {
      // Multiple matches - complete common prefix and show first
      const commonPrefix = getCommonPrefix(completions);
      if (commonPrefix.length > expanded.length) {
        setPromptValue(p, commonPrefix);
        lastTabValue = formatForDisplay(commonPrefix);
      } else {
        // Show first completion
        setPromptValue(p, completions[0] || '');
      }
    }
  }

  function setPromptValue(p: TextPrompt, value: string) {
    // Convert back to ~ format if in home directory for display
    const displayValue = formatForDisplay(value);
    
    // Update the prompt's value by emitting a value event
    // This is a workaround since TextPrompt doesn't expose a direct setValue method
    (p as any).value = displayValue;
  }

  function formatForDisplay(value: string): string {
    const home = process.env.HOME || '';
    return value.startsWith(home)
      ? value.replace(home, '~')
      : value;
  }

  function getDirectoryCompletions(inputPath: string): string[] {
    try {
      let dirToScan: string;
      let prefix: string;

      if (inputPath === '' || inputPath === '/') {
        dirToScan = inputPath || '/';
        prefix = '';
      } else if (inputPath.endsWith('/')) {
        // User typed a complete directory path
        dirToScan = inputPath;
        prefix = '';
      } else {
        // User is typing a partial name
        dirToScan = path.dirname(inputPath);
        prefix = path.basename(inputPath).toLowerCase();
      }

      if (!fs.existsSync(dirToScan)) {
        return [];
      }

      const entries = fs.readdirSync(dirToScan, { withFileTypes: true })
        .filter(entry => {
          // Only directories
          if (!entry.isDirectory()) return false;
          // Skip hidden directories unless explicitly typing them
          if (entry.name.startsWith('.') && !prefix.startsWith('.')) return false;
          // Match prefix
          return prefix === '' || entry.name.toLowerCase().startsWith(prefix);
        })
        .map(entry => path.join(dirToScan, entry.name))
        .sort();

      return entries;
    } catch {
      return [];
    }
  }

  function getCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return '';
    if (strings.length === 1) return strings[0] || '';

    let prefix = strings[0] || '';
    for (let i = 1; i < strings.length; i++) {
      const str = strings[i] || '';
      while (prefix.length > 0 && !str.startsWith(prefix)) {
        prefix = prefix.slice(0, -1);
      }
    }
    return prefix;
  }

  const result = await prompt.prompt();
  
  if (isCancel(result)) {
    return result;
  }
  
  // Expand ~ in final result
  const value = String(result || '');
  return value.startsWith('~')
    ? value.replace(/^~/, process.env.HOME || '')
    : value;
}

export { isCancel };
