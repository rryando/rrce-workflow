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
 * Skips files starting with '_' (used for includes/partials like _base.md)
 */
export function loadPromptsFromDir(dirPath: string): ParsedPrompt[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  
  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md') && !f.startsWith('_'));
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
 * 
 * Searches multiple candidate paths to handle:
 * - Dev mode (npm run dev): cwd/agent-core
 * - Bundled mode (dist/index.js): ../agent-core relative to dist
 * - npm global install: ../../agent-core (package root)
 * 
 * Validates by checking for _base.md existence to ensure correct directory.
 */
export function getAgentCoreDir(): string {
  // Build candidate paths in order of preference
  const candidates = [
    // Dev mode: agent-core at cwd (common when running from project root)
    path.join(process.cwd(), 'agent-core'),
    // Bundled: dist/index.js -> ../agent-core
    path.resolve(__dirname, '..', 'agent-core'),
    // npm global: dist/index.js -> ../../agent-core (package root)
    path.resolve(__dirname, '..', '..', 'agent-core'),
    // Source mode: src/lib/prompts.ts -> ../../agent-core
    path.resolve(__dirname, '..', '..', 'agent-core'),
  ];
  
  // Find first candidate that contains _base.md (validates correct directory)
  for (const candidate of candidates) {
    const baseMdPath = path.join(candidate, 'prompts', '_base.md');
    if (fs.existsSync(baseMdPath)) {
      return candidate;
    }
  }
  
  // Fallback with warning - prompts may be incomplete
  console.warn('[RRCE] Could not find agent-core directory with _base.md. Prompts may be incomplete.');
  console.warn('[RRCE] Searched paths:', candidates.join(', '));
  
  // Return first candidate as fallback (maintains backward compatibility)
  // Non-null assertion safe: candidates array is never empty
  return candidates[0] as string;
}

/**
 * Get the agent-core prompts directory
 */
export function getAgentCorePromptsDir(): string {
  return path.join(getAgentCoreDir(), 'prompts');
}

