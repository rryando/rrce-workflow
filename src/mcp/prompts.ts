import { loadPromptsFromDir, getAgentCorePromptsDir } from '../lib/prompts';
import { detectActiveProject } from './resources';
import { getEffectiveGlobalPath, detectWorkspaceRoot } from '../lib/paths';
import { projectService } from '../lib/detection-service';
import * as path from 'path';
import * as fs from 'fs';

// Cache for base protocol to avoid repeated file reads
let baseProtocolCache: string | null = null;

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface AgentPromptDef {
  id: string; // The filename without extension (e.g. "init")
  name: string;
  description: string;
  arguments: PromptArgument[];
  content: string; // The raw template
}

/**
 * Load the base protocol file (_base.md) that's injected into all agent prompts
 * This contains shared behaviors like path resolution, tool preferences, completion signals
 */
function loadBaseProtocol(): string {
  if (baseProtocolCache !== null) {
    return baseProtocolCache;
  }
  
  const basePath = path.join(getAgentCorePromptsDir(), '_base.md');
  if (fs.existsSync(basePath)) {
    const content = fs.readFileSync(basePath, 'utf-8');
    // Strip any frontmatter (if accidentally added)
    baseProtocolCache = content.replace(/^---[\s\S]*?---\n*/, '');
    return baseProtocolCache;
  }
  
  baseProtocolCache = '';
  return '';
}

/**
 * Clear the base protocol cache (useful for testing or hot-reload)
 */
export function clearBaseProtocolCache(): void {
  baseProtocolCache = null;
}

/**
 * Get all available agent prompts from the file system
 * Note: _base.md and other underscore-prefixed files are excluded by loadPromptsFromDir
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
    
    // Extract ID from filename
    // filePath is absolute, get basename without extension
    const filename = p.filePath.split('/').pop() || '';
    const id = filename.replace(/\.md$/, '');

    return {
      id,
      name: p.frontmatter.name,
      description: p.frontmatter.description,
      arguments: args,
      content: p.content
    };
  });
}

/**
 * Get prompt definition by name (or ID/filename)
 */
export function getPromptDef(name: string): AgentPromptDef | undefined {
  const all = getAllPrompts();
  const search = name.toLowerCase();
  
  return all.find(p => 
      p.name === name || 
      p.id === name || 
      p.name.toLowerCase() === search || 
      p.id.toLowerCase() === search
  );
}

/**
 * Render a prompt template with arguments, including automatic system context injection
 */
export function renderPromptWithContext(content: string, args: Record<string, string>): { rendered: string, context: Record<string, string> } {
  const renderArgs = { ...args };
  
  // Resolve Project Paths & Context
  let activeProject = detectActiveProject();
  
  // If not found, force refresh the cache and try again
  if (!activeProject) {
      projectService.refresh();
      activeProject = detectActiveProject();
  }

  const DEFAULT_RRCE_HOME = getEffectiveGlobalPath();
  
  let resolvedRrceData = '.rrce-workflow/'; // Default to local if no project found
  let resolvedRrceHome = DEFAULT_RRCE_HOME;
  let resolvedWorkspaceRoot = process.cwd();
  let resolvedWorkspaceName = 'current-project';

  if (activeProject) {
    resolvedRrceData = activeProject.dataPath;
    // Ensure trailing slash for data path consistency in prompts
    if (!resolvedRrceData.endsWith('/') && !resolvedRrceData.endsWith('\\')) {
        resolvedRrceData += '/';
    }
    
    resolvedWorkspaceRoot = activeProject.sourcePath || activeProject.path || activeProject.dataPath;
    resolvedWorkspaceName = activeProject.name;
    
    // If it's a global project, infer RRCE_HOME from its data path
    if (activeProject.source === 'global') {
       const workspacesDir = path.dirname(activeProject.dataPath);
       resolvedRrceHome = path.dirname(workspacesDir);
    }
  } else {
    // Fallback: Try to identify if we are in a likely global project that wasn't detected
    // This happens if detection fails (e.g. path mismatch) but the user selected global storage
    try {
        const workspaceRoot = detectWorkspaceRoot();
        const workspaceName = path.basename(workspaceRoot);
        const globalWorkspacePath = path.join(DEFAULT_RRCE_HOME, 'workspaces', workspaceName);
        
        // If a global workspace directory exists for this folder name, use it
        if (fs.existsSync(globalWorkspacePath)) {
            resolvedRrceData = globalWorkspacePath;
            resolvedWorkspaceRoot = workspaceRoot;
            resolvedWorkspaceName = workspaceName;
            
            if (!resolvedRrceData.endsWith('/') && !resolvedRrceData.endsWith('\\')) {
                resolvedRrceData += '/';
            }
        }
    } catch (e) {
        // Ignore errors in fallback logic
    }
  }

  // Inject system variables if not provided by user
  if (!renderArgs['RRCE_DATA']) renderArgs['RRCE_DATA'] = resolvedRrceData;
  if (!renderArgs['RRCE_HOME']) renderArgs['RRCE_HOME'] = resolvedRrceHome;
  if (!renderArgs['WORKSPACE_ROOT']) renderArgs['WORKSPACE_ROOT'] = resolvedWorkspaceRoot;
  if (!renderArgs['WORKSPACE_NAME']) renderArgs['WORKSPACE_NAME'] = resolvedWorkspaceName;

  // Render agent-specific content
  const agentContent = renderPrompt(content, renderArgs);
  
  // Inject base protocol before agent-specific content
  // This provides shared behaviors (path resolution, tool preferences, completion signals)
  const baseProtocol = loadBaseProtocol();
  const rendered = baseProtocol ? `${baseProtocol}\n${agentContent}` : agentContent;

  return {
    rendered,
    context: {
        RRCE_DATA: resolvedRrceData,
        RRCE_HOME: resolvedRrceHome,
        WORKSPACE_ROOT: resolvedWorkspaceRoot,
        WORKSPACE_NAME: resolvedWorkspaceName
    }
  };
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
