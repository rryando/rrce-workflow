import { z } from 'zod';

// Prompt frontmatter schema
export const PromptArgSchema = z.object({
  name: z.string(),
  default: z.string().optional(),
  prompt: z.string().optional(),
});

export const AutoIdentitySchema = z.object({
  user: z.string(),
  model: z.string(),
});

export const PromptFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  'argument-hint': z.union([z.string(), z.array(z.string())]).optional(),
  tools: z.array(z.string()).optional(),
  mode: z.enum(['primary', 'subagent']).optional(),
  'required-args': z.array(PromptArgSchema).optional(),
  'optional-args': z.array(PromptArgSchema).optional(),
  'auto-identity': AutoIdentitySchema.optional(),
});

export type PromptArg = z.infer<typeof PromptArgSchema>;
export type AutoIdentity = z.infer<typeof AutoIdentitySchema>;
export type PromptFrontmatter = z.infer<typeof PromptFrontmatterSchema>;

// Parsed prompt with content
export interface ParsedPrompt {
  frontmatter: PromptFrontmatter;
  content: string;
  filePath: string;
}

// Storage mode options
export type StorageMode = 'global' | 'workspace';

// Config schema
export interface RRCEConfig {
  version: number;
  last_synced_version?: string;
  storage: {
    mode: StorageMode;
    globalPath?: string;  // Custom global storage path (when not using default ~/.rrce-workflow)
  };
  project: {
    name: string;
  };
  tools: {
    copilot: boolean;
    antigravity: boolean;
  };
  linked_projects?: string[];
}
