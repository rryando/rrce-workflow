import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import matter from 'gray-matter';
import { PromptFrontmatterSchema, type ParsedPrompt } from '../types/prompt';

// Get __dirname equivalent for ESM (works with both npm/tsx and Bun)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
 * Works with both npm/tsx and Bun
 */
export function getAgentCoreDir(): string {
  // Relative to this file: src/lib/prompts.ts -> ../../agent-core
  return path.join(__dirname, '..', '..', 'agent-core');
}

/**
 * Get the agent-core prompts directory
 */
export function getAgentCorePromptsDir(): string {
  return path.join(getAgentCoreDir(), 'prompts');
}

