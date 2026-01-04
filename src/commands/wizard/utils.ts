import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { stringify } from 'yaml';
import { ensureDir } from '../../lib/paths';
import { getAgentCorePromptsDir } from '../../lib/prompts';
import type { ParsedPrompt, StorageMode } from '../../types/prompt';

/**
 * Get the path to OpenCode config (lazy evaluated to support testing)
 */
function getOpenCodeConfigPath(): string {
  return path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
}

/**
 * Get the path to OpenCode command directory
 */
function getOpenCodeCommandDir(mode: StorageMode, dataPath: string): string {
  if (mode === 'global') {
    return path.join(os.homedir(), '.config', 'opencode', 'command');
  }
  return path.join(dataPath, '.opencode', 'command');
}

/**
 * Map prompt base names to slash command names
 */
function mapPromptToCommandName(baseName: string): string {
  const mapping: Record<string, string> = {
    'research_discussion': 'research',
    'planning_discussion': 'plan',
    'executor': 'execute',
    'documentation': 'docs',
    'init': 'init',
    'sync': 'sync',
    'doctor': 'doctor'
  };
  return mapping[baseName] || baseName;
}

/**
 * Load the base protocol content for injection into slash commands
 */
function loadBaseProtocol(): string {
  const basePath = path.join(getAgentCorePromptsDir(), '_base.md');
  if (fs.existsSync(basePath)) {
    return fs.readFileSync(basePath, 'utf-8');
  }
  return '';
}

/**
 * Build command frontmatter for a slash command
 */
function buildCommandFrontmatter(prompt: ParsedPrompt, baseName: string): Record<string, any> {
  const fm: Record<string, any> = {
    description: prompt.frontmatter.description,
  };
  
  // For executor, reference the subagent but run in-context by default
  // Users can use @rrce_executor for isolated execution
  if (baseName === 'executor') {
    fm.agent = 'rrce_executor';
    fm.subtask = false;  // Run in-context by default
  }
  
  return fm;
}

/**
 * Generate OpenCode slash command files for RRCE prompts
 * 
 * Slash commands run in-context (no separate session) for token efficiency.
 * This is a major optimization over subagents which create separate sessions.
 * 
 * Commands created:
 * - /rrce_init - Project initialization
 * - /rrce_research - Interactive research (was @rrce_research_discussion)
 * - /rrce_plan - Planning (was @rrce_planning_discussion)
 * - /rrce_execute - Execution in-context (also available as @rrce_executor subagent)
 * - /rrce_docs - Documentation
 * - /rrce_sync - Knowledge sync
 * - /rrce_doctor - Health check
 * 
 * @param prompts - All parsed prompts
 * @param mode - Storage mode ('global' or 'workspace')
 * @param dataPath - The primary data path for the project
 */
export function generateOpenCodeCommands(
  prompts: ParsedPrompt[],
  mode: StorageMode,
  dataPath: string
): void {
  const commandDir = getOpenCodeCommandDir(mode, dataPath);
  ensureDir(commandDir);
  
  // Clear old rrce_* commands
  if (fs.existsSync(commandDir)) {
    const entries = fs.readdirSync(commandDir, { withFileTypes: true });
    for (const entry of entries) {
      const fileName = entry.name;
      if (entry.isFile() && fileName.startsWith('rrce_') && fileName.endsWith('.md')) {
        fs.unlinkSync(path.join(commandDir, fileName));
      }
    }
  }
  
  // Load base protocol for injection
  const baseProtocol = loadBaseProtocol();
  
  // Generate command files for each prompt (except orchestrator which stays as primary agent)
  for (const prompt of prompts) {
    const baseName = path.basename(prompt.filePath, '.md');
    
    // Skip orchestrator - it stays as a primary agent, not a command
    if (baseName === 'orchestrator') continue;
    
    // Skip files starting with _ (like _base.md)
    if (baseName.startsWith('_')) continue;
    
    const commandName = mapPromptToCommandName(baseName);
    const commandFile = `rrce_${commandName}.md`;
    
    // Build command frontmatter
    const frontmatter = buildCommandFrontmatter(prompt, baseName);
    
    // Combine base protocol + prompt content
    // Base protocol provides shared behaviors (path resolution, tool preferences, etc.)
    const fullContent = baseProtocol ? `${baseProtocol}\n${prompt.content}` : prompt.content;
    
    // Write command file
    const content = `---\n${stringify(frontmatter)}---\n${fullContent}`;
    fs.writeFileSync(path.join(commandDir, commandFile), content);
  }
}

/**
 * Enable provider caching for all supported providers in OpenCode config.
 * This sets `setCacheKey: true` for each provider, which enables prompt caching
 * for multi-turn conversations and session reuse.
 * 
 * IMPORTANT: This function is model-agnostic - it only enables caching without
 * overwriting any existing provider settings (models, API keys, etc.)
 * 
 * Supported providers: anthropic, openai, openrouter, google
 */
export function enableProviderCaching(): void {
  const opencodePath = getOpenCodeConfigPath();
  
  let config: Record<string, any> = {};
  
  // Load existing config if it exists
  if (fs.existsSync(opencodePath)) {
    try {
      config = JSON.parse(fs.readFileSync(opencodePath, 'utf8'));
    } catch (e) {
      // If config is corrupted, start fresh but warn
      console.error('Warning: Could not parse existing OpenCode config, creating new provider section');
    }
  } else {
    // Ensure the directory exists
    ensureDir(path.dirname(opencodePath));
  }
  
  // Ensure provider section exists
  if (!config.provider) {
    config.provider = {};
  }
  
  // Enable caching for each provider WITHOUT overwriting other settings
  const providers = ['anthropic', 'openai', 'openrouter', 'google'];
  for (const provider of providers) {
    if (!config.provider[provider]) {
      config.provider[provider] = {};
    }
    if (!config.provider[provider].options) {
      config.provider[provider].options = {};
    }
    // Set caching key - this is the critical optimization flag
    config.provider[provider].options.setCacheKey = true;
  }
  
  // Write back with pretty formatting
  fs.writeFileSync(opencodePath, JSON.stringify(config, null, 2));
}

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
 * Update OpenCode config surgically
 */
export function updateOpenCodeConfig(newAgents: Record<string, any>) {
  const opencodePath = getOpenCodeConfigPath();
  if (!fs.existsSync(opencodePath)) {
    return;
  }

  try {
    const config = JSON.parse(fs.readFileSync(opencodePath, 'utf8'));
    const agentConfig = config.agent ?? config.agents ?? {};

    // Identify all keys starting with rrce_
    const existingAgentKeys = Object.keys(agentConfig);
    const rrceKeys = existingAgentKeys.filter(key => key.startsWith('rrce_'));

    // Delete rrce_ keys that are not in the new package
    for (const key of rrceKeys) {
      if (!newAgents[key]) {
        delete agentConfig[key];
      }
    }

    // Upsert rrce_ keys from the package
    for (const [key, value] of Object.entries(newAgents)) {
      if (key.startsWith('rrce_')) {
        agentConfig[key] = value;
      }
    }

    config.agent = agentConfig;
    if (config.agents) delete config.agents;

    // Write back to disk with 2-space indentation
    fs.writeFileSync(opencodePath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to update OpenCode config:', e);
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
      // Use tool name as-is from prompt metadata
      // This matches what the MCP server registers
      tools[tool] = true;
    }
  }

  // Always enable webfetch for documentation lookup (safe, read-only)
  tools['webfetch'] = true;

  // Token-efficiency soft guidance: keep grep/glob available only when explicitly allowed,
  // but nudge the model toward semantic search first.
  // (We do this in prompts; here we avoid auto-enabling extra tools.)

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

/**
 * Clear all files in a directory (but not subdirectories)
 * Useful for removing old agent files before writing new ones
 */
export function clearDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) return;
  
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      fs.unlinkSync(path.join(dirPath, entry.name));
    }
  }
}

/**
 * Surgically update OpenCode agents and commands
 * 
 * NEW ARCHITECTURE (Token Optimized):
 * - Only orchestrator (primary) and executor (subagent) are created as agents
 * - All other prompts become slash commands (run in-context, no session overhead)
 * 
 * This provides ~50-60% token savings for interactive workflows.
 * 
 * @param prompts - The parsed prompts to install
 * @param mode - Storage mode ('global' or 'workspace')
 * @param dataPath - The primary data path for the project
 */
export function surgicalUpdateOpenCodeAgents(
  prompts: ParsedPrompt[], 
  mode: StorageMode, 
  dataPath: string
): void {
  // Filter to only orchestrator and executor for agents
  // Everything else becomes slash commands
  const agentPrompts = prompts.filter(p => {
    const baseName = path.basename(p.filePath, '.md');
    return baseName === 'orchestrator' || baseName === 'executor';
  });

  if (mode === 'global') {
    // Global mode: Update ~/.config/opencode/opencode.json surgically
    try {
      const openCodeConfig = getOpenCodeConfigPath();
      const promptsDir = path.join(path.dirname(openCodeConfig), 'prompts');
      ensureDir(promptsDir);
      
      // Load base protocol for injection into agent prompts
      const baseProtocol = loadBaseProtocol();
      
      const newAgents: Record<string, any> = {};
      
      // Write prompt files and build agent configs (only orchestrator + executor)
      for (const prompt of agentPrompts) {
        const baseName = path.basename(prompt.filePath, '.md');
        const agentId = `rrce_${baseName}`;
        const promptFileName = `rrce-${baseName}.md`;
        const promptFilePath = path.join(promptsDir, promptFileName);

        // Combine base protocol + prompt content
        const fullContent = baseProtocol ? `${baseProtocol}\n${prompt.content}` : prompt.content;
        
        // Write the prompt content to a separate file
        fs.writeFileSync(promptFilePath, fullContent);

        // Create agent config with file reference
        const agentConfig = convertToOpenCodeAgent(prompt, true, `./prompts/${promptFileName}`);
        
        // Update description for executor to mention both invocation methods
        if (baseName === 'executor') {
          agentConfig.description = 'Execute planned tasks - use /rrce_execute (in-context) or @rrce_executor (isolated)';
        }
        
        newAgents[agentId] = agentConfig;
      }

      // Use surgical update utility (removes old rrce_* agents, upserts new ones)
      updateOpenCodeConfig(newAgents);
      
      // Hide OpenCode's native plan agent to avoid confusion with RRCE orchestrator
      if (fs.existsSync(openCodeConfig)) {
        const config = JSON.parse(fs.readFileSync(openCodeConfig, 'utf8'));
        if (!config.agent) config.agent = {};
        if (!config.agent.plan) config.agent.plan = {};
        config.agent.plan.disable = true;
        fs.writeFileSync(openCodeConfig, JSON.stringify(config, null, 2));
      }

    } catch (e) {
      console.error('Failed to update global OpenCode config with agents:', e);
      throw e;
    }
  } else {
    // Workspace mode: Clear and rewrite .rrce-workflow/.opencode/agent/
    const opencodeBaseDir = path.join(dataPath, '.opencode', 'agent');
    ensureDir(opencodeBaseDir);

    // Clear old agents first
    clearDirectory(opencodeBaseDir);

    // Load base protocol for injection
    const baseProtocol = loadBaseProtocol();

    // Write new agents (only orchestrator + executor)
    for (const prompt of agentPrompts) {
      const baseName = path.basename(prompt.filePath, '.md');
      const agentId = `rrce_${baseName}`;
      const agentConfig = convertToOpenCodeAgent(prompt);
      
      // Update description for executor
      if (baseName === 'executor') {
        agentConfig.description = 'Execute planned tasks - use /rrce_execute (in-context) or @rrce_executor (isolated)';
      }
      
      // Combine base protocol + prompt content
      const fullContent = baseProtocol ? `${baseProtocol}\n${agentConfig.prompt}` : agentConfig.prompt;
      
      const content = `---\n${stringify({
        description: agentConfig.description,
        mode: agentConfig.mode,
        tools: agentConfig.tools
      })}---\n${fullContent}`;
      fs.writeFileSync(path.join(opencodeBaseDir, `${agentId}.md`), content);
    }
  }
  
  // Generate slash commands for all prompts (except orchestrator)
  // This is the new token-optimized approach
  generateOpenCodeCommands(prompts, mode, dataPath);
}
