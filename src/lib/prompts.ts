import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { PromptFrontmatterSchema, type ParsedPrompt } from '../types/prompt';

/**
 * Parse a prompt file and extract frontmatter + content
 */
export function parsePromptFile(filePath: string): ParsedPrompt | null {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);
    
    const parsed = PromptFrontmatterSchema.safeParse(data);
    
    if (!parsed.success) {
      console.error(`Failed to parse frontmatter in ${filePath}:`, parsed.error);
      return null;
    }
    
    return {
      frontmatter: parsed.data,
      content: content.trim(),
      filePath,
    };
  } catch (error) {
    console.error(`Error reading prompt file ${filePath}:`, error);
    return null;
  }
}

/**
 * Load all prompts from a directory
 */
export function loadPromptsFromDir(dirPath: string): ParsedPrompt[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  const prompts: ParsedPrompt[] = [];
  
  for (const file of files) {
    const prompt = parsePromptFile(path.join(dirPath, file));
    if (prompt) {
      prompts.push(prompt);
    }
  }
  
  return prompts;
}

/**
 * Get the agent-core root directory
 */
export function getAgentCoreDir(): string {
  // Relative to the package root
  return path.join(import.meta.dir, '..', '..', 'agent-core');
}

/**
 * Get the agent-core prompts directory
 */
export function getAgentCorePromptsDir(): string {
  return path.join(getAgentCoreDir(), 'prompts');
}
