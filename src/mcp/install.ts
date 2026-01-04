import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Standard Config Locations
 */
export const ANTIGRAVITY_CONFIG = path.join(os.homedir(), '.gemini/antigravity/mcp_config.json');
export const CLAUDE_CONFIG = path.join(os.homedir(), '.config/claude/claude_desktop_config.json');
export const VSCODE_GLOBAL_CONFIG = path.join(os.homedir(), '.config/Code/User/settings.json');
export const OPENCODE_CONFIG_DIR = path.join(os.homedir(), '.config/opencode');
export const OPENCODE_CONFIG = path.join(OPENCODE_CONFIG_DIR, 'opencode.json');

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

// OpenCode config format
interface OpenCodeConfig {
  $schema?: string;
  plugin?: string[];
  provider?: Record<string, unknown>;
  mcp?: Record<string, {
    type: string;
    command: string[];
    enabled: boolean;
    environment?: Record<string, string>;
  }>;
  [key: string]: unknown; // Allow other fields
}

export type InstallTarget = 'antigravity' | 'claude' | 'vscode-global' | 'vscode-workspace' | 'opencode';

export interface InstallStatus {
  antigravity: boolean;
  claude: boolean;
  vscodeGlobal: boolean;
  vscodeWorkspace: boolean;
  opencode: boolean;
}

/**
 * Configuration for each install target
 * Centralizes config paths and RRCE server configuration
 */
interface TargetConfig {
  path: string;
  configKey: string;
  mcpKey: string;
  serverConfig: any;
  requiresWorkspacePath?: boolean;
}

const TARGET_CONFIGS: Record<InstallTarget, TargetConfig> = {
  antigravity: {
    path: ANTIGRAVITY_CONFIG,
    configKey: 'mcpServers',
    mcpKey: 'rrce',
    serverConfig: {
      command: 'npx',
      args: ['-y', 'rrce-workflow', 'mcp', 'start'],
    },
  },
  claude: {
    path: CLAUDE_CONFIG,
    configKey: 'mcpServers',
    mcpKey: 'rrce',
    serverConfig: {
      command: 'npx',
      args: ['-y', 'rrce-workflow', 'mcp', 'start'],
    },
  },
  'vscode-global': {
    path: VSCODE_GLOBAL_CONFIG,
    configKey: 'mcp.servers',
    mcpKey: 'rrce',
    serverConfig: {
      command: 'npx',
      args: ['-y', 'rrce-workflow', 'mcp', 'start'],
    },
  },
  'vscode-workspace': {
    path: '', // Resolved dynamically
    configKey: 'servers',
    mcpKey: 'rrce',
    serverConfig: {
      command: 'npx',
      args: ['-y', 'rrce-workflow', 'mcp', 'start'],
    },
    requiresWorkspacePath: true,
  },
  opencode: {
    path: OPENCODE_CONFIG,
    configKey: 'mcp',
    mcpKey: 'rrce',
    serverConfig: {
      type: 'local',
      command: ['npx', '-y', 'rrce-workflow', 'mcp', 'start'],
      enabled: true,
    },
  },
};

/**
 * Check if RRCE is installed in a specific config
 * Generic helper used by all check* functions
 */
function checkConfig(target: InstallTarget, workspacePath?: string): boolean {
  const config = TARGET_CONFIGS[target];
  const configPath = config.requiresWorkspacePath && workspacePath
    ? path.join(workspacePath, '.vscode', 'mcp.json')
    : config.path;

  if (!fs.existsSync(configPath)) return false;

  try {
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const targetContainer = config.configKey === 'mcp' && target === 'opencode'
      ? (content as OpenCodeConfig).mcp
      : config.configKey === 'mcp.servers'
        ? (content as MCPServersConfig).mcpServers
        : config.configKey === 'servers'
          ? (content as VSCodeMCPConfig).servers
          : config.configKey === 'mcp.servers'
            ? (content as VSCodeSettings)['mcp.servers']
            : content[config.configKey];

    return !!(targetContainer && targetContainer[config.mcpKey]);
  } catch {
    return false;
  }
}

/**
 * Check if RRCE is installed in known locations
 */
export function checkInstallStatus(workspacePath?: string): InstallStatus {
  return {
    antigravity: checkConfig('antigravity'),
    claude: checkConfig('claude'),
    vscodeGlobal: checkConfig('vscode-global'),
    vscodeWorkspace: workspacePath ? checkConfig('vscode-workspace', workspacePath) : false,
    opencode: checkConfig('opencode'),
  };
}

/**
 * Check if installed anywhere (for flow logic)
 */
export function isInstalledAnywhere(workspacePath?: string): boolean {
  const status = checkInstallStatus(workspacePath);
  return status.antigravity || status.claude || status.vscodeGlobal || 
         status.vscodeWorkspace || status.opencode;
}

/**
 * Generic helper to install RRCE to a config file
 * Handles all install targets through config-driven approach
 */
function installToTarget(target: InstallTarget, workspacePath?: string): boolean {
  const config = TARGET_CONFIGS[target];
  const configPath = config.requiresWorkspacePath && workspacePath
    ? path.join(workspacePath, '.vscode', 'mcp.json')
    : config.path;

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing config or start fresh
  let existingConfig: any = {};
  if (target === 'opencode') {
    existingConfig = { $schema: "https://opencode.ai/config.json" };
  } else if (config.configKey === 'servers') {
    existingConfig = { servers: {} };
  } else if (config.configKey === 'mcp.servers') {
    existingConfig = { mcpServers: {} };
  } else if (config.configKey === 'mcp') {
    existingConfig = {};
  }

  if (fs.existsSync(configPath)) {
    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (error) {
      if (target === 'opencode') {
        console.error('Warning: Could not parse existing OpenCode config, creating fresh config');
      }
      // For other targets, start fresh silently
    }
  }

  // Ensure config container exists
  const container = config.configKey === 'mcp' && target === 'opencode'
    ? existingConfig.mcp || (existingConfig.mcp = {})
    : config.configKey === 'mcp.servers'
      ? existingConfig.mcpServers || (existingConfig.mcpServers = {})
      : config.configKey === 'servers'
        ? existingConfig.servers || (existingConfig.servers = {})
        : config.configKey === 'mcp.servers'
          ? existingConfig['mcp.servers'] || (existingConfig['mcp.servers'] = {})
          : existingConfig[config.configKey] || (existingConfig[config.configKey] = {});

  // Add RRCE server config
  container[config.mcpKey] = config.serverConfig;

  try {
    const json = JSON.stringify(existingConfig, null, 2);
    fs.writeFileSync(configPath, json + (target === 'opencode' ? '\n' : ''));
    return true;
  } catch (error) {
    if (target === 'opencode') {
      console.error('Failed to write OpenCode config:', error instanceof Error ? error.message : String(error));
    }
    return false;
  }
}

/**
 * Install RRCE to a config file
 */
export function installToConfig(target: InstallTarget, workspacePath?: string): boolean {
  if (target === 'vscode-workspace' && !workspacePath) return false;
  return installToTarget(target, workspacePath);
}

/**
 * Generic helper to uninstall RRCE from a config file
 * Handles all uninstall targets through config-driven approach
 */
function uninstallFromTarget(target: InstallTarget, workspacePath?: string): boolean {
  const config = TARGET_CONFIGS[target];
  const configPath = config.requiresWorkspacePath && workspacePath
    ? path.join(workspacePath, '.vscode', 'mcp.json')
    : config.path;

  if (!fs.existsSync(configPath)) {
    console.error(`${getTargetLabel(target)} config not found`);
    return false;
  }

  try {
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const targetContainer = config.configKey === 'mcp' && target === 'opencode'
      ? (content as OpenCodeConfig).mcp
      : config.configKey === 'mcp.servers'
        ? (content as MCPServersConfig).mcpServers
        : config.configKey === 'servers'
          ? (content as VSCodeMCPConfig).servers
          : config.configKey === 'mcp.servers'
            ? (content as VSCodeSettings)['mcp.servers']
            : content[config.configKey];

    if (!targetContainer || !targetContainer[config.mcpKey]) {
      console.warn(`RRCE not found in ${getTargetLabel(target)} config`);
      return false;
    }

    delete targetContainer[config.mcpKey];
    
    fs.writeFileSync(configPath, JSON.stringify(content, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error(`Failed to uninstall from ${getTargetLabel(target)}:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Uninstall RRCE from a config file
 */
export function uninstallFromConfig(target: InstallTarget, workspacePath?: string): boolean {
  if (target === 'vscode-workspace' && !workspacePath) return false;
  return uninstallFromTarget(target, workspacePath);
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
    case 'opencode':
      return 'OpenCode';
    default:
      return target;
  }
}

/**
 * Check if OpenCode is installed on the system
 * (checks if config directory or config file exists)
 */
export function isOpenCodeInstalled(): boolean {
  const configDir = path.join(os.homedir(), '.config/opencode');
  const configFile = path.join(configDir, 'opencode.json');
  return fs.existsSync(configDir) || fs.existsSync(configFile);
}

/**
 * Check if Antigravity is installed on the system
 * (checks if config directory exists)
 */
export function isAntigravityInstalled(): boolean {
  const configDir = path.join(os.homedir(), '.gemini/antigravity');
  return fs.existsSync(configDir);
}

/**
 * Check if VSCode is installed on the system
 * (checks if global config directory exists)
 */
export function isVSCodeInstalled(): boolean {
  const configDir = path.join(os.homedir(), '.config/Code/User');
  return fs.existsSync(configDir);
}
