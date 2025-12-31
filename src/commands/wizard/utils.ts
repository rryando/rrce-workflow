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
export function convertToOpenCodeAgent(prompt: ParsedPrompt): any {
  const { frontmatter, content } = prompt;
  
  // Build tools map
  const tools: Record<string, boolean> = {
    // Enable standard host tools by default
    'read': true,
    'write': true,
    'edit': true,
    'bash': true,
    'grep': true,
    'glob': true,
    'webfetch': true
  };

  // Add MCP tools with rrce_ prefix
  if (frontmatter.tools) {
    for (const tool of frontmatter.tools) {
      tools[`rrce_${tool}`] = true;
    }
  }

  return {
    description: frontmatter.description,
    mode: 'primary',
    prompt: content,
    tools
  };
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
