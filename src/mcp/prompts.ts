import { loadPromptsFromDir, getAgentCorePromptsDir } from '../lib/prompts';

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface AgentPromptDef {
  name: string;
  description: string;
  arguments: PromptArgument[];
  content: string; // The raw template
}

/**
 * Get all available agent prompts from the file system
 */
export function getAllPrompts(): AgentPromptDef[] {
  const prompts = loadPromptsFromDir(getAgentCorePromptsDir());
  
  return prompts.map(p => {
    const args: PromptArgument[] = [];
    
    // Process required args
    if (p.frontmatter['required-args']) {
      args.push(...p.frontmatter['required-args'].map(a => ({
        name: a.name,
        description: a.prompt || a.name,
        required: true
      })));
    }
    
    // Process optional args
    if (p.frontmatter['optional-args']) {
      args.push(...p.frontmatter['optional-args'].map(a => ({
        name: a.name,
        description: a.prompt || a.name,
        required: false
      })));
    }

    return {
      name: p.frontmatter.name,
      description: p.frontmatter.description,
      arguments: args,
      content: p.content
    };
  });
}

/**
 * Get prompt definition by name
 */
export function getPromptDef(name: string): AgentPromptDef | undefined {
  return getAllPrompts().find(p => p.name === name);
}

/**
 * Render a prompt template with arguments
 */
export function renderPrompt(content: string, args: Record<string, string>): string {
  let rendered = content;
  
  // Replace all provided arguments
  for (const [key, val] of Object.entries(args)) {
    // Replace {{KEY}} global case-insensitive? Convention is usually exact match or UPPERCASE.
    // The prompts usually use {{VAR_NAME}}.
    // We'll replace exact matches of {{key}}
    rendered = rendered.replace(new RegExp(`{{${key}}}`, 'g'), val);
  }

  // TODO: Handling missing required arguments? 
  // MCP server should validate requiredness before calling this if possible,
  // or we leave unreplaced tags.
  
  return rendered;
}
