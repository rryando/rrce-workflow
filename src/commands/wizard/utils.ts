import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { stringify } from 'yaml';
import { ensureDir } from '../../lib/paths';
import type { ParsedPrompt, StorageMode } from '../../types/prompt';

/**
 * Get the path to OpenCode config (lazy evaluated to support testing)
 */
function getOpenCodeConfigPath(): string {
  return path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
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
 * Surgically update OpenCode agents using proper cleanup logic
 * Removes old rrce_* agents, adds new ones, preserves user agents
 * 
 * @param prompts - The parsed prompts to install as agents
 * @param mode - Storage mode ('global' or 'workspace')
 * @param dataPath - The primary data path for the project
 */
export function surgicalUpdateOpenCodeAgents(
  prompts: ParsedPrompt[], 
  mode: StorageMode, 
  dataPath: string
): void {
  if (mode === 'global') {
    // Global mode: Update ~/.config/opencode/opencode.json surgically
    try {
      const openCodeConfig = getOpenCodeConfigPath();
      const promptsDir = path.join(path.dirname(openCodeConfig), 'prompts');
      ensureDir(promptsDir);
      
      const newAgents: Record<string, any> = {};
      
      // Write prompt files and build agent configs
      for (const prompt of prompts) {
        const baseName = path.basename(prompt.filePath, '.md');
        const agentId = `rrce_${baseName}`;
        const promptFileName = `rrce-${baseName}.md`;
        const promptFilePath = path.join(promptsDir, promptFileName);

        // Write the prompt content to a separate file
        fs.writeFileSync(promptFilePath, prompt.content);

        // Create agent config with file reference
        const agentConfig = convertToOpenCodeAgent(prompt, true, `./prompts/${promptFileName}`);
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

    // IMPORTANT: Clear old agents first (this is the fix!)
    clearDirectory(opencodeBaseDir);

    // Write new agents
    for (const prompt of prompts) {
      const baseName = path.basename(prompt.filePath, '.md');
      const agentId = `rrce_${baseName}`;
      const agentConfig = convertToOpenCodeAgent(prompt);
      const content = `---\n${stringify({
        description: agentConfig.description,
        mode: agentConfig.mode,
        tools: agentConfig.tools
      })}---\n${agentConfig.prompt}`;
      fs.writeFileSync(path.join(opencodeBaseDir, `${agentId}.md`), content);
    }
  }
}
