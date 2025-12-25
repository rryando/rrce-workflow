import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import pc from 'picocolors';

interface DirectoryPromptOptions {
  message: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined;
}

/**
 * Directory input prompt with bash-like Tab completion
 * Uses Node.js readline with custom completer for real Tab autocompletion
 */
export function directoryPrompt(opts: DirectoryPromptOptions): Promise<string | symbol> {
  return new Promise((resolve) => {
    // Display the prompt message
    process.stdout.write(`${pc.cyan('◆')}  ${opts.message}\n`);
    process.stdout.write(`${pc.cyan('│')}  `);
    
    // Create readline interface with custom completer
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: completeDirectory,
      terminal: true,
    });

    // Set default value if provided
    if (opts.defaultValue) {
      rl.write(opts.defaultValue);
    }

    // Handle line input
    rl.on('line', (input) => {
      const value = input.trim();
      
      // Expand ~ to home directory
      const expandedPath = value.startsWith('~')
        ? value.replace(/^~/, process.env.HOME || '')
        : value;
      
      // Validate if validator provided
      if (opts.validate) {
        const error = opts.validate(expandedPath);
        if (error) {
          process.stdout.write(`${pc.yellow('│')}  ${pc.yellow(error)}\n`);
          process.stdout.write(`${pc.cyan('│')}  `);
          rl.write(value); // Restore the input
          return;
        }
      }
      
      rl.close();
      process.stdout.write(`${pc.green('✓')}  ${pc.dim(expandedPath)}\n`);
      resolve(expandedPath);
    });

    // Handle Ctrl+C
    rl.on('close', () => {
      // If resolved already, don't do anything
    });

    rl.on('SIGINT', () => {
      rl.close();
      process.stdout.write('\n');
      resolve(Symbol('cancel'));
    });
  });
}

/**
 * Directory completer function for readline
 * Returns [completions, originalInput]
 */
function completeDirectory(line: string): [string[], string] {
  // Expand ~ to home directory for completion
  const expanded = line.startsWith('~')
    ? line.replace(/^~/, process.env.HOME || '')
    : line;

  try {
    let dirToScan: string;
    let prefix: string;
    let basePath: string;

    if (expanded === '' || expanded === '/') {
      dirToScan = expanded || '/';
      prefix = '';
      basePath = expanded;
    } else if (expanded.endsWith('/')) {
      // User typed a complete directory path, show contents
      dirToScan = expanded;
      prefix = '';
      basePath = expanded;
    } else {
      // User is typing a partial name
      dirToScan = path.dirname(expanded);
      prefix = path.basename(expanded).toLowerCase();
      basePath = dirToScan === '/' ? '/' : dirToScan + '/';
    }

    if (!fs.existsSync(dirToScan)) {
      return [[], line];
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
      .map(entry => {
        const fullPath = path.join(dirToScan, entry.name);
        // Convert back to ~ format if in home directory
        const displayPath = fullPath.startsWith(process.env.HOME || '')
          ? fullPath.replace(process.env.HOME || '', '~')
          : fullPath;
        return displayPath + '/';
      })
      .sort();

    // If single match, return it directly
    if (entries.length === 1) {
      return [entries, line];
    }

    // If multiple matches, find common prefix
    if (entries.length > 1) {
      const commonPrefix = getCommonPrefix(entries);
      if (commonPrefix.length > line.length) {
        return [[commonPrefix], line];
      }
    }

    return [entries, line];
  } catch {
    return [[], line];
  }
}

/**
 * Get common prefix of an array of strings
 */
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

/**
 * Check if a value is a cancel symbol
 */
export function isCancelled(value: unknown): value is symbol {
  return typeof value === 'symbol';
}
