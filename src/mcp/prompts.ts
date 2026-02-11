import { loadPromptsFromDir, getAgentCorePromptsDir } from '../lib/prompts';
import { detectActiveProject } from './resources';
import { getEffectiveGlobalPath, detectWorkspaceRoot } from '../lib/paths';
import { projectService } from '../lib/detection-service';
import matter from 'gray-matter';
import * as path from 'path';
import * as fs from 'fs';

// Cache for base protocol to avoid repeated file reads
let baseProtocolCache: string | null = null;

// Cache for all prompts to avoid repeated directory scans + file reads
let allPromptsCache: AgentPromptDef[] | null = null;

// Client detection for conditional includes
let detectedClientName: string | null = null;

/**
 * Set the detected MCP client name (e.g., "opencode", "vscode", "claude")
 * Called during server initialization when client info is available.
 */
export function setDetectedClient(clientName: string): void {
  detectedClientName = clientName.toLowerCase();
}

/**
 * Get the currently detected client name
 */
export function getDetectedClient(): string | null {
  return detectedClientName;
}

/**
 * Process include directives in prompt/partial content.
 * Supports:
 *   <!-- include: _filename.md -->          (unconditional)
 *   <!-- include-if: clientname _filename.md --> (conditional on client)
 *
 * Includes are resolved recursively up to MAX_INCLUDE_DEPTH levels.
 * Security: only allows underscore-prefixed filenames to prevent arbitrary file reads.
 */
const MAX_INCLUDE_DEPTH = 3;

export function processIncludes(content: string, promptsDir: string, _depth: number = 0): string {
  if (_depth >= MAX_INCLUDE_DEPTH) {
    console.warn(`[rrce] Include depth limit reached (${MAX_INCLUDE_DEPTH}), skipping further includes`);
    return content;
  }

  // Process conditional includes: <!-- include-if: clientname _filename.md -->
  content = content.replace(
    /<!--\s*include-if:\s*(\S+)\s+(_[a-zA-Z0-9_-]+\.md)\s*-->/g,
    (_match, clientName: string, filename: string) => {
      if (detectedClientName && detectedClientName === clientName.toLowerCase()) {
        const partial = loadPartial(filename, promptsDir);
        return processIncludes(partial, promptsDir, _depth + 1);
      }
      return ''; // Client doesn't match, skip include
    }
  );

  // Process unconditional includes: <!-- include: _filename.md -->
  content = content.replace(
    /<!--\s*include:\s*(_[a-zA-Z0-9_-]+\.md)\s*-->/g,
    (_match, filename: string) => {
      const partial = loadPartial(filename, promptsDir);
      return processIncludes(partial, promptsDir, _depth + 1);
    }
  );

  return content;
}

/**
 * Load a partial file, strip frontmatter, and return content
 */
function loadPartial(filename: string, promptsDir: string): string {
  const filePath = path.join(promptsDir, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`[rrce] Include not found: ${filename}`);
    return '';
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { content } = matter(raw);
  return content.trim();
}

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

  const promptsDir = getAgentCorePromptsDir();
  const basePath = path.join(promptsDir, '_base.md');
  if (fs.existsSync(basePath)) {
    let raw = fs.readFileSync(basePath, 'utf-8');
    let content = matter(raw).content.trim();
    // Process include directives
    content = processIncludes(content, promptsDir);
    baseProtocolCache = content;
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
  allPromptsCache = null;
}

/**
 * Get all available agent prompts from the file system
 * Note: _base.md and other underscore-prefixed files are excluded by loadPromptsFromDir
 * Results are cached; call clearBaseProtocolCache() to invalidate.
 */
export function getAllPrompts(): AgentPromptDef[] {
  if (allPromptsCache !== null) {
    return allPromptsCache;
  }

  const prompts = loadPromptsFromDir(getAgentCorePromptsDir());

  allPromptsCache = prompts.map(p => {
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

  return allPromptsCache;
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
 * Resolved project paths and context for prompt rendering
 */
export interface ProjectContext {
  rrceData: string;
  rrceHome: string;
  workspaceRoot: string;
  workspaceName: string;
}

/**
 * Detect the active project and resolve all system paths.
 * Handles: active project detection, cache refresh fallback,
 * global project path inference, and workspace root fallback.
 */
export function resolveProjectContext(): ProjectContext {
  let activeProject = detectActiveProject();

  // If not found, force refresh the cache and try again
  if (!activeProject) {
    projectService.refresh();
    activeProject = detectActiveProject();
  }

  const DEFAULT_RRCE_HOME = getEffectiveGlobalPath();

  let rrceData = '.rrce-workflow/';
  let rrceHome = DEFAULT_RRCE_HOME;
  let workspaceRoot = process.cwd();
  let workspaceName = 'current-project';

  if (activeProject) {
    rrceData = activeProject.dataPath;
    if (!rrceData.endsWith('/') && !rrceData.endsWith('\\')) {
      rrceData += '/';
    }

    workspaceRoot = activeProject.sourcePath || activeProject.path || activeProject.dataPath;
    workspaceName = activeProject.name;

    if (activeProject.source === 'global') {
      const workspacesDir = path.dirname(activeProject.dataPath);
      rrceHome = path.dirname(workspacesDir);
    }
  } else {
    // Fallback: check for global workspace directory matching current folder name
    try {
      const detectedRoot = detectWorkspaceRoot();
      const detectedName = path.basename(detectedRoot);
      const globalWorkspacePath = path.join(DEFAULT_RRCE_HOME, 'workspaces', detectedName);

      if (fs.existsSync(globalWorkspacePath)) {
        rrceData = globalWorkspacePath;
        workspaceRoot = detectedRoot;
        workspaceName = detectedName;

        if (!rrceData.endsWith('/') && !rrceData.endsWith('\\')) {
          rrceData += '/';
        }
      }
    } catch (_e) {
      // Ignore errors in fallback logic
    }
  }

  return { rrceData, rrceHome, workspaceRoot, workspaceName };
}

/**
 * Render a prompt template with arguments, including automatic system context injection
 */
export function renderPromptWithContext(content: string, args: Record<string, string>): { rendered: string, context: Record<string, string> } {
  const renderArgs = { ...args };

  // 1. Resolve project paths
  const ctx = resolveProjectContext();

  // 2. Inject system variables (user-provided values take precedence)
  if (!renderArgs['RRCE_DATA']) renderArgs['RRCE_DATA'] = ctx.rrceData;
  if (!renderArgs['RRCE_HOME']) renderArgs['RRCE_HOME'] = ctx.rrceHome;
  if (!renderArgs['WORKSPACE_ROOT']) renderArgs['WORKSPACE_ROOT'] = ctx.workspaceRoot;
  if (!renderArgs['WORKSPACE_NAME']) renderArgs['WORKSPACE_NAME'] = ctx.workspaceName;

  // 3. Process include directives
  const promptsDir = getAgentCorePromptsDir();
  const processedContent = processIncludes(content, promptsDir);

  // 4. Replace {{VAR}} template variables
  const agentContent = renderPrompt(processedContent, renderArgs);

  // 5. Prepend base protocol
  const baseProtocol = loadBaseProtocol();
  const rendered = baseProtocol ? `${baseProtocol}\n${agentContent}` : agentContent;

  return {
    rendered,
    context: {
      RRCE_DATA: ctx.rrceData,
      RRCE_HOME: ctx.rrceHome,
      WORKSPACE_ROOT: ctx.workspaceRoot,
      WORKSPACE_NAME: ctx.workspaceName,
    },
  };
}

/**
 * Render a prompt template by replacing {{KEY}} placeholders with provided values.
 * Warns on unreplaced UPPER_CASE vars (likely missing system vars).
 *
 * Note: Some prompts (e.g., develop.md) use ${VAR} syntax for instructional path
 * templates meant for agents to interpret at runtime. These are intentionally NOT
 * replaced by this function — this keeps token usage low when the same path variable
 * appears many times.
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

  // Warn about unreplaced UPPER_CASE variables (likely system vars that should have been replaced)
  // Lowercase/mixed-case vars like {{task_slug}} are agent-filled and expected to remain
  const unreplaced = rendered.match(/\{\{[A-Z][A-Z0-9_]+\}\}/g);
  if (unreplaced) {
    const unique = [...new Set(unreplaced)];
    console.warn(`[rrce] Unreplaced template variables: ${unique.join(', ')}`);
  }

  return rendered;
}
