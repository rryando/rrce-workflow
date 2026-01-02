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
 * Convert a ParsedPrompt to OpenCode agent config
 * 
 * IMPORTANT: This respects the tool restrictions defined in each prompt's frontmatter.
 * Different agents have different tool access based on their role in the pipeline:
 * - orchestrator: primary agent, full tool access for coordination
 * - research/planning: read-only for workspace, can write to RRCE_DATA (subagents)
 * - executor: full access including edit/bash for code changes (subagent)
 * - doctor/init: read-only, no code modifications (subagents)
 * 
 * @param prompt - The parsed prompt
 * @param useFileReference - If true, returns a file reference instead of inline content
 * @param promptFilePath - The path to reference (used when useFileReference is true)
 */
export function convertToOpenCodeAgent(
  prompt: ParsedPrompt, 
  useFileReference: boolean = false,
  promptFilePath?: string
): any {
  const { frontmatter, content } = prompt;
  
  // Build tools map based on frontmatter.tools
  // DO NOT enable all tools by default - respect the prompt's tool restrictions
  const tools: Record<string, boolean> = {};

  // Map frontmatter tools to OpenCode tool names
  // Some tools are host tools (read, write, edit, bash, grep, glob)
  // Some are MCP tools (search_knowledge, get_project_context, etc.)
  const hostTools = ['read', 'write', 'edit', 'bash', 'grep', 'glob', 'webfetch', 'terminalLastCommand', 'task'];
  
  if (frontmatter.tools) {
    for (const tool of frontmatter.tools) {
      if (hostTools.includes(tool)) {
        // Host tool - use as-is
        tools[tool] = true;
      } else {
        // MCP tool - add rrce_ prefix
        tools[`rrce_${tool}`] = true;
      }
    }
  }

  // Always enable webfetch for documentation lookup (safe, read-only)
  tools['webfetch'] = true;

  // Determine mode from frontmatter or default to subagent
  const mode = frontmatter.mode || 'subagent';
  const invocationHint = mode === 'primary' ? '' : ' (Invoke via @rrce_*)';

  return {
    description: `${frontmatter.description}${invocationHint}`,
    mode,
    prompt: useFileReference && promptFilePath ? `{file:${promptFilePath}}` : content,
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
