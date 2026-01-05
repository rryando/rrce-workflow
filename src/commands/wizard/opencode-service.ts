import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { stringify } from 'yaml';
import { ensureDir } from '../../lib/paths';
import { getAgentCorePromptsDir } from '../../lib/prompts';
import type { ParsedPrompt, StorageMode } from '../../types/prompt';
import { clearDirectory } from './fs-utils';

/**
 * Get the path to OpenCode config (lazy evaluated to support testing)
 */
export function getOpenCodeConfigPath(): string {
  return path.join(os.homedir(), '.config', 'opencode', 'opencode.json');
}

/**
 * Get the path to OpenCode command directory
 */
export function getOpenCodeCommandDir(mode: StorageMode, dataPath: string): string {
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
    'design': 'design',
    'develop': 'develop',
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

  // For develop, reference the subagent but run in-context by default
  // Users can use @rrce_develop for isolated execution
  if (baseName === 'develop') {
    fm.agent = 'rrce_develop';
    fm.subtask = false;  // Run in-context by default
  }

  return fm;
}

/**
 * Generate OpenCode slash command files for RRCE prompts
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

    if (baseName === 'orchestrator') continue;
    if (baseName.startsWith('_')) continue;

    const commandName = mapPromptToCommandName(baseName);
    const commandFile = `rrce_${commandName}.md`;

    const frontmatter = buildCommandFrontmatter(prompt, baseName);
    const fullContent = baseProtocol ? `${baseProtocol}\n${prompt.content}` : prompt.content;

    const content = `---\n${stringify(frontmatter)}---\n${fullContent}`;
    fs.writeFileSync(path.join(commandDir, commandFile), content);
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

    const existingAgentKeys = Object.keys(agentConfig);
    const rrceKeys = existingAgentKeys.filter(key => key.startsWith('rrce_'));

    for (const key of rrceKeys) {
      if (!newAgents[key]) {
        delete agentConfig[key];
      }
    }

    for (const [key, value] of Object.entries(newAgents)) {
      if (key.startsWith('rrce_')) {
        agentConfig[key] = value;
      }
    }

    config.agent = agentConfig;
    if (config.agents) delete config.agents;

    fs.writeFileSync(opencodePath, JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('Failed to update OpenCode config:', e);
  }
}

/**
 * Convert a ParsedPrompt to OpenCode agent config
 */
export function convertToOpenCodeAgent(
  prompt: ParsedPrompt,
  useFileReference: boolean = false,
  promptFilePath?: string
): any {
  const { frontmatter, content } = prompt;
  const tools: Record<string, boolean> = {};

  if (frontmatter.tools) {
    for (const tool of frontmatter.tools) {
      tools[tool] = true;
    }
  }

  tools['webfetch'] = true;

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
 * Surgically update OpenCode agents and commands
 */
export function surgicalUpdateOpenCodeAgents(
  prompts: ParsedPrompt[],
  mode: StorageMode,
  dataPath: string
): void {
  const agentPrompts = prompts.filter(p => {
    const baseName = path.basename(p.filePath, '.md');
    return baseName === 'orchestrator' || baseName === 'develop';
  });

  if (mode === 'global') {
    try {
      const openCodeConfigPath = getOpenCodeConfigPath();
      const promptsDir = path.join(path.dirname(openCodeConfigPath), 'prompts');
      ensureDir(promptsDir);

      const baseProtocol = loadBaseProtocol();
      const newAgents: Record<string, any> = {};

      for (const prompt of agentPrompts) {
        const baseName = path.basename(prompt.filePath, '.md');
        const agentId = `rrce_${baseName}`;
        const promptFileName = `rrce-${baseName}.md`;
        const promptFilePath = path.join(promptsDir, promptFileName);

        const fullContent = baseProtocol ? `${baseProtocol}\n${prompt.content}` : prompt.content;
        fs.writeFileSync(promptFilePath, fullContent);

        const agentConfig = convertToOpenCodeAgent(prompt, true, `./prompts/${promptFileName}`);
        if (baseName === 'develop') {
          agentConfig.description = 'Develop planned tasks - use /rrce_develop (in-context) or @rrce_develop (isolated)';
        }
        newAgents[agentId] = agentConfig;
      }

      updateOpenCodeConfig(newAgents);

      if (fs.existsSync(openCodeConfigPath)) {
        const config = JSON.parse(fs.readFileSync(openCodeConfigPath, 'utf8'));
        if (!config.agent) config.agent = {};
        fs.writeFileSync(openCodeConfigPath, JSON.stringify(config, null, 2));
      }
    } catch (e) {
      console.error('Failed to update global OpenCode config with agents:', e);
      throw e;
    }
  } else {
    const opencodeBaseDir = path.join(dataPath, '.opencode', 'agent');
    ensureDir(opencodeBaseDir);
    clearDirectory(opencodeBaseDir);

    const baseProtocol = loadBaseProtocol();

    for (const prompt of agentPrompts) {
      const baseName = path.basename(prompt.filePath, '.md');
      const agentId = `rrce_${baseName}`;
      const agentConfig = convertToOpenCodeAgent(prompt);

      if (baseName === 'develop') {
        agentConfig.description = 'Develop planned tasks - use /rrce_develop (in-context) or @rrce_develop (isolated)';
      }

      const fullContent = baseProtocol ? `${baseProtocol}\n${agentConfig.prompt}` : agentConfig.prompt;

      const content = `---\n${stringify({
        description: agentConfig.description,
        mode: agentConfig.mode,
        tools: agentConfig.tools
      })}---\n${fullContent}`;
      fs.writeFileSync(path.join(opencodeBaseDir, `${agentId}.md`), content);
    }
  }

  generateOpenCodeCommands(prompts, mode, dataPath);
}

/**
 * Enable provider caching for all supported providers in OpenCode config.
 */
export function enableProviderCaching(): void {
  const opencodePath = getOpenCodeConfigPath();
  let config: Record<string, any> = {};

  if (fs.existsSync(opencodePath)) {
    try {
      config = JSON.parse(fs.readFileSync(opencodePath, 'utf8'));
    } catch (e) {
      console.error('Warning: Could not parse existing OpenCode config, creating new provider section');
    }
  } else {
    ensureDir(path.dirname(opencodePath));
  }

  if (!config.provider) {
    config.provider = {};
  }

  const providers = ['anthropic', 'openai', 'openrouter', 'google'];
  for (const provider of providers) {
    if (!config.provider[provider]) {
      config.provider[provider] = {};
    }
    if (!config.provider[provider].options) {
      config.provider[provider].options = {};
    }
    config.provider[provider].options.setCacheKey = true;
  }

  fs.writeFileSync(opencodePath, JSON.stringify(config, null, 2));
}
