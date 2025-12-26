import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Standard Config Locations
 */
const ANTIGRAVITY_CONFIG = path.join(os.homedir(), '.gemini/antigravity/mcp_config.json');
const CLAUDE_CONFIG = path.join(os.homedir(), '.config/claude/claude_desktop_config.json');

/**
 * Config Structure
 */
interface MCPServersConfig {
  mcpServers: Record<string, {
    command: string;
    args: string[];
    env?: Record<string, string>;
  }>;
}

export interface InstallStatus {
  antigravity: boolean;
  claude: boolean;
}

/**
 * Check if RRCE is installed in known locations
 */
export function checkInstallStatus(): InstallStatus {
  return {
    antigravity: checkConfigFile(ANTIGRAVITY_CONFIG),
    claude: checkConfigFile(CLAUDE_CONFIG),
  };
}

function checkConfigFile(configPath: string): boolean {
  if (!fs.existsSync(configPath)) return false;
  
  try {
    const content = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return !!content.mcpServers?.['rrce'];
  } catch {
    return false;
  }
}

/**
 * Install RRCE to a config file
 */
export function installToConfig(target: 'antigravity' | 'claude'): boolean {
  const configPath = target === 'antigravity' ? ANTIGRAVITY_CONFIG : CLAUDE_CONFIG;
  const dir = path.dirname(configPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let config: MCPServersConfig = { mcpServers: {} };
  
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Start fresh if invalid
    }
  }

  if (!config.mcpServers) config.mcpServers = {};

  config.mcpServers['rrce'] = {
    command: 'npx',
    args: ['-y', 'rrce-workflow', 'mcp', 'start'], // -y to avoid interactive prompts
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}
