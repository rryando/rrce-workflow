import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Standard Config Locations
 */
const ANTIGRAVITY_CONFIG = path.join(os.homedir(), '.gemini/antigravity/mcp_config.json');
const CLAUDE_CONFIG = path.join(os.homedir(), '.config/claude/claude_desktop_config.json');
const VSCODE_GLOBAL_CONFIG = path.join(os.homedir(), '.config/Code/User/settings.json');

/**
 * Config Structures
 */
interface MCPServersConfig {
  mcpServers: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

// VSCode workspace format: .vscode/mcp.json
interface VSCodeMCPConfig {
  servers: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

// VSCode global settings.json format
interface VSCodeSettings {
  [key: string]: unknown;
  'mcp.servers'?: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

export type InstallTarget = 'antigravity' | 'claude' | 'vscode-global' | 'vscode-workspace';

export interface InstallStatus {
  antigravity: boolean;
  claude: boolean;
  vscodeGlobal: boolean;
  vscodeWorkspace: boolean;
}

/**
 * Check if RRCE is installed in known locations
 */
export function checkInstallStatus(workspacePath?: string): InstallStatus {
  return {
    antigravity: checkAntigravityConfig(),
    claude: checkClaudeConfig(),
    vscodeGlobal: checkVSCodeGlobalConfig(),
    vscodeWorkspace: workspacePath ? checkVSCodeWorkspaceConfig(workspacePath) : false,
  };
}

function checkAntigravityConfig(): boolean {
  if (!fs.existsSync(ANTIGRAVITY_CONFIG)) return false;
  try {
    const content = JSON.parse(fs.readFileSync(ANTIGRAVITY_CONFIG, 'utf-8'));
    return !!content.mcpServers?.['rrce'];
  } catch {
    return false;
  }
}

function checkClaudeConfig(): boolean {
  if (!fs.existsSync(CLAUDE_CONFIG)) return false;
  try {
    const content = JSON.parse(fs.readFileSync(CLAUDE_CONFIG, 'utf-8'));
    return !!content.mcpServers?.['rrce'];
  } catch {
    return false;
  }
}

function checkVSCodeGlobalConfig(): boolean {
  if (!fs.existsSync(VSCODE_GLOBAL_CONFIG)) return false;
  try {
    const content = JSON.parse(fs.readFileSync(VSCODE_GLOBAL_CONFIG, 'utf-8')) as VSCodeSettings;
    return !!content['mcp.servers']?.['rrce'];
  } catch {
    return false;
  }
}

function checkVSCodeWorkspaceConfig(workspacePath: string): boolean {
  const configPath = path.join(workspacePath, '.vscode', 'mcp.json');
  if (!fs.existsSync(configPath)) return false;
  try {
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as VSCodeMCPConfig;
    return !!content.servers?.['rrce'];
  } catch {
    return false;
  }
}

/**
 * Check if installed anywhere (for flow logic)
 */
export function isInstalledAnywhere(workspacePath?: string): boolean {
  const status = checkInstallStatus(workspacePath);
  return status.antigravity || status.claude || status.vscodeGlobal || status.vscodeWorkspace;
}

/**
 * Install RRCE to a config file
 */
export function installToConfig(target: InstallTarget, workspacePath?: string): boolean {
  switch (target) {
    case 'antigravity':
      return installToAntigravity();
    case 'claude':
      return installToClaude();
    case 'vscode-global':
      return installToVSCodeGlobal();
    case 'vscode-workspace':
      return workspacePath ? installToVSCodeWorkspace(workspacePath) : false;
    default:
      return false;
  }
}

function installToAntigravity(): boolean {
  const dir = path.dirname(ANTIGRAVITY_CONFIG);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let config: MCPServersConfig = { mcpServers: {} };
  if (fs.existsSync(ANTIGRAVITY_CONFIG)) {
    try {
      config = JSON.parse(fs.readFileSync(ANTIGRAVITY_CONFIG, 'utf-8'));
    } catch {
      // Start fresh if invalid
    }
  }

  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers['rrce'] = {
    command: 'npx',
    args: ['-y', 'rrce-workflow', 'mcp', 'start'],
  };

  try {
    fs.writeFileSync(ANTIGRAVITY_CONFIG, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

function installToClaude(): boolean {
  const dir = path.dirname(CLAUDE_CONFIG);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let config: MCPServersConfig = { mcpServers: {} };
  if (fs.existsSync(CLAUDE_CONFIG)) {
    try {
      config = JSON.parse(fs.readFileSync(CLAUDE_CONFIG, 'utf-8'));
    } catch {
      // Start fresh if invalid
    }
  }

  if (!config.mcpServers) config.mcpServers = {};
  config.mcpServers['rrce'] = {
    command: 'npx',
    args: ['-y', 'rrce-workflow', 'mcp', 'start'],
  };

  try {
    fs.writeFileSync(CLAUDE_CONFIG, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

function installToVSCodeGlobal(): boolean {
  const dir = path.dirname(VSCODE_GLOBAL_CONFIG);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let settings: VSCodeSettings = {};
  if (fs.existsSync(VSCODE_GLOBAL_CONFIG)) {
    try {
      settings = JSON.parse(fs.readFileSync(VSCODE_GLOBAL_CONFIG, 'utf-8'));
    } catch {
      // Start fresh if invalid
    }
  }

  if (!settings['mcp.servers']) settings['mcp.servers'] = {};
  settings['mcp.servers']['rrce'] = {
    command: 'npx',
    args: ['-y', 'rrce-workflow', 'mcp', 'start'],
  };

  try {
    fs.writeFileSync(VSCODE_GLOBAL_CONFIG, JSON.stringify(settings, null, 2));
    return true;
  } catch {
    return false;
  }
}

function installToVSCodeWorkspace(workspacePath: string): boolean {
  const vscodeDir = path.join(workspacePath, '.vscode');
  const configPath = path.join(vscodeDir, 'mcp.json');

  if (!fs.existsSync(vscodeDir)) {
    fs.mkdirSync(vscodeDir, { recursive: true });
  }

  let config: VSCodeMCPConfig = { servers: {} };
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Start fresh if invalid
    }
  }

  if (!config.servers) config.servers = {};
  config.servers['rrce'] = {
    command: 'npx',
    args: ['-y', 'rrce-workflow', 'mcp', 'start'],
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get human-readable label for install target
 */
export function getTargetLabel(target: InstallTarget): string {
  switch (target) {
    case 'antigravity':
      return 'Antigravity IDE';
    case 'claude':
      return 'Claude Desktop';
    case 'vscode-global':
      return 'VSCode (Global)';
    case 'vscode-workspace':
      return 'VSCode (Workspace)';
    default:
      return target;
  }
}
