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
 * Check if RRCE is installed in known locations
 */
export function checkInstallStatus(workspacePath?: string): InstallStatus {
  return {
    antigravity: checkAntigravityConfig(),
    claude: checkClaudeConfig(),
    vscodeGlobal: checkVSCodeGlobalConfig(),
    vscodeWorkspace: workspacePath ? checkVSCodeWorkspaceConfig(workspacePath) : false,
    opencode: checkOpenCodeConfig(),
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
  // Check for common OS paths if default doesn't exist? 
  // For now stick to Linux path as we know user is on Linux
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

function checkOpenCodeConfig(): boolean {
  if (!fs.existsSync(OPENCODE_CONFIG)) return false;
  try {
    const content = JSON.parse(fs.readFileSync(OPENCODE_CONFIG, 'utf-8')) as OpenCodeConfig;
    return !!content.mcp?.['rrce'];
  } catch {
    return false;
  }
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
    case 'opencode':
      return installToOpenCode();
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

function installToOpenCode(): boolean {
  const dir = path.dirname(OPENCODE_CONFIG);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let config: OpenCodeConfig = {
    $schema: "https://opencode.ai/config.json"
  };
  
  if (fs.existsSync(OPENCODE_CONFIG)) {
    try {
      config = JSON.parse(fs.readFileSync(OPENCODE_CONFIG, 'utf-8'));
    } catch (error) {
      console.error('Warning: Could not parse existing OpenCode config, creating fresh config');
    }
  }

  if (!config.mcp) config.mcp = {};
  config.mcp['rrce'] = {
    type: 'local',
    command: ['npx', '-y', 'rrce-workflow', 'mcp', 'start'],
    enabled: true,
  };

  try {
    fs.writeFileSync(OPENCODE_CONFIG, JSON.stringify(config, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error('Failed to write OpenCode config:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Uninstall RRCE from OpenCode
 */
function uninstallFromOpenCode(): boolean {
  if (!fs.existsSync(OPENCODE_CONFIG)) {
    console.error('OpenCode config not found');
    return false;
  }

  try {
    const config: OpenCodeConfig = JSON.parse(fs.readFileSync(OPENCODE_CONFIG, 'utf-8'));
    
    if (!config.mcp?.['rrce']) {
      console.warn('RRCE not found in OpenCode config');
      return false;
    }

    delete config.mcp['rrce'];
    // Keep empty mcp object for future use
    
    fs.writeFileSync(OPENCODE_CONFIG, JSON.stringify(config, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error('Failed to uninstall from OpenCode:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Uninstall RRCE from Antigravity
 */
function uninstallFromAntigravity(): boolean {
  if (!fs.existsSync(ANTIGRAVITY_CONFIG)) {
    console.error('Antigravity config not found');
    return false;
  }

  try {
    const config: MCPServersConfig = JSON.parse(fs.readFileSync(ANTIGRAVITY_CONFIG, 'utf-8'));
    
    if (!config.mcpServers?.['rrce']) {
      console.warn('RRCE not found in Antigravity config');
      return false;
    }

    delete config.mcpServers['rrce'];
    
    fs.writeFileSync(ANTIGRAVITY_CONFIG, JSON.stringify(config, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error('Failed to uninstall from Antigravity:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Uninstall RRCE from Claude Desktop
 */
function uninstallFromClaude(): boolean {
  if (!fs.existsSync(CLAUDE_CONFIG)) {
    console.error('Claude Desktop config not found');
    return false;
  }

  try {
    const config: MCPServersConfig = JSON.parse(fs.readFileSync(CLAUDE_CONFIG, 'utf-8'));
    
    if (!config.mcpServers?.['rrce']) {
      console.warn('RRCE not found in Claude Desktop config');
      return false;
    }

    delete config.mcpServers['rrce'];
    
    fs.writeFileSync(CLAUDE_CONFIG, JSON.stringify(config, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error('Failed to uninstall from Claude Desktop:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Uninstall RRCE from VSCode Global Settings
 */
function uninstallFromVSCodeGlobal(): boolean {
  if (!fs.existsSync(VSCODE_GLOBAL_CONFIG)) {
    console.error('VSCode global config not found');
    return false;
  }

  try {
    const settings: VSCodeSettings = JSON.parse(fs.readFileSync(VSCODE_GLOBAL_CONFIG, 'utf-8'));
    
    if (!settings['mcp.servers']?.['rrce']) {
      console.warn('RRCE not found in VSCode global settings');
      return false;
    }

    delete settings['mcp.servers']['rrce'];
    
    fs.writeFileSync(VSCODE_GLOBAL_CONFIG, JSON.stringify(settings, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error('Failed to uninstall from VSCode (Global):', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Uninstall RRCE from VSCode Workspace
 */
function uninstallFromVSCodeWorkspace(workspacePath: string): boolean {
  const configPath = path.join(workspacePath, '.vscode', 'mcp.json');
  
  if (!fs.existsSync(configPath)) {
    console.error('VSCode workspace config not found');
    return false;
  }

  try {
    const config: VSCodeMCPConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    if (!config.servers?.['rrce']) {
      console.warn('RRCE not found in VSCode workspace config');
      return false;
    }

    delete config.servers['rrce'];
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error('Failed to uninstall from VSCode (Workspace):', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Uninstall RRCE from a config file
 */
export function uninstallFromConfig(target: InstallTarget, workspacePath?: string): boolean {
  switch (target) {
    case 'antigravity':
      return uninstallFromAntigravity();
    case 'claude':
      return uninstallFromClaude();
    case 'vscode-global':
      return uninstallFromVSCodeGlobal();
    case 'vscode-workspace':
      return workspacePath ? uninstallFromVSCodeWorkspace(workspacePath) : false;
    case 'opencode':
      return uninstallFromOpenCode();
    default:
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
