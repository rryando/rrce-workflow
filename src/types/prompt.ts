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

export const PermissionSchema = z.object({
  read: z.union([z.literal('allow'), z.literal('ask'), z.literal('deny')]).optional(),
  write: z.union([z.literal('allow'), z.literal('ask'), z.literal('deny')]).optional(),
  edit: z.union([z.literal('allow'), z.literal('ask'), z.literal('deny')]).optional(),
  bash: z.union([z.literal('allow'), z.literal('ask'), z.literal('deny')]).optional(),
  webfetch: z.union([z.literal('allow'), z.literal('ask'), z.literal('deny')]).optional(),
}).passthrough();

export const PromptFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().optional(),
  'argument-hint': z.union([z.string(), z.array(z.string())]).optional(),
  tools: z.array(z.string()).optional(),
  mode: z.enum(['primary', 'subagent']).optional(),
  'required-args': z.array(PromptArgSchema).optional(),
  'optional-args': z.array(PromptArgSchema).optional(),
  'auto-identity': AutoIdentitySchema.optional(),
  permission: PermissionSchema.optional(),
});

export type PromptArg = z.infer<typeof PromptArgSchema>;
export type AutoIdentity = z.infer<typeof AutoIdentitySchema>;
export type Permission = z.infer<typeof PermissionSchema>;
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
