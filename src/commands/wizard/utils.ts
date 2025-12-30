import * as fs from 'fs';
import * as path from 'path';
import { stringify } from 'yaml';
import { ensureDir } from '../../lib/paths';
import type { ParsedPrompt } from '../../types/prompt';

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

/**
 * Convert a ParsedPrompt to OpenCode Markdown agent format
 */
export function convertToOpenCodeAgent(prompt: ParsedPrompt): string {
  const { frontmatter, content } = prompt;
  
  // Build tools map with rrce_ prefix
  const tools: Record<string, boolean> = {};
  if (frontmatter.tools) {
    for (const tool of frontmatter.tools) {
      tools[`rrce_${tool}`] = true;
    }
  }

  const opencodeFrontmatter = {
    description: frontmatter.description,
    mode: 'primary',
    tools: Object.keys(tools).length > 0 ? tools : undefined
  };

  return `---\n${stringify(opencodeFrontmatter)}---\n${content}`;
}

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
