import * as fs from 'fs';
import * as path from 'path';
import { ensureDir } from '../../lib/paths';
import type { ParsedPrompt } from '../../types/prompt';

/**
 * Recursively copy a directory
 */
export function copyDirRecursive(src: string, dest: string) {
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

/**
 * Clear all files in a directory (but not subdirectories)
 * Useful for removing old agent files before writing new ones
 */
export function clearDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      try {
        fs.unlinkSync(path.join(dirPath, entry.name));
      } catch (err) {
        console.error(`[clearDirectory] Failed to delete ${path.join(dirPath, entry.name)}:`, err);
      }
    }
  }
}

/**
 * Copy parsed prompts to a target directory with specified extension
 */
export function copyPromptsToDir(prompts: ParsedPrompt[], targetDir: string, extension: string) {
  for (const prompt of prompts) {
    const baseName = path.basename(prompt.filePath, '.md');
    const targetName = baseName + extension;
    const targetPath = path.join(targetDir, targetName);

    // Read the full content including frontmatter
    const content = fs.readFileSync(prompt.filePath, 'utf-8');
    fs.writeFileSync(targetPath, content);
  }
}
