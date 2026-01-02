/**
 * MCP Configuration Parser/Writer
 * Manages mcp.yaml in the effective RRCE home directory
 * Respects custom globalPath set by the wizard
 */

import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import { getEffectiveRRCEHome, detectWorkspaceRoot, getEffectiveGlobalPath } from '../lib/paths';
import type { MCPConfig, MCPProjectConfig, MCPPermissions, MCPSemanticSearchConfig } from './types';
import { DEFAULT_MCP_CONFIG, DEFAULT_PERMISSIONS } from './types';
import { findProjectConfig, normalizeProjectPath } from './config-utils';

/**
 * Migrate configuration to latest format
 * - Converts data paths (.rrce-workflow) to project root paths
 */
function migrateConfig(config: MCPConfig): MCPConfig {
  let changed = false;
  
  config.projects = config.projects.map(p => {
    if (p.path) {
      const normalized = normalizeProjectPath(p.path);
      if (normalized !== p.path) {
        changed = true;
        return { ...p, path: normalized };
      }
    }
    return p;
  });

  return config;
}

/**
 * Get path to MCP config file
 */
export function getMCPConfigPath(): string {
  const workspaceRoot = detectWorkspaceRoot();
  const rrceHome = getEffectiveRRCEHome(workspaceRoot);
  return path.join(rrceHome, 'mcp.yaml');
}

/**
 * Load MCP configuration from disk
 * Returns default config if file doesn't exist
 */
export function loadMCPConfig(): MCPConfig {
  const configPath = getMCPConfigPath();
  
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_MCP_CONFIG };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    let config = parseMCPConfig(content);
    
    // Apply migration
    config = migrateConfig(config);
    
    return config;
  } catch {
    return { ...DEFAULT_MCP_CONFIG };
  }
}

/**
 * Extended result type for global path check
 */
export interface GlobalPathCheckResult {
  configured: boolean;
  path: string;
  reason?: string;
}

/**
 * Check if a valid global path is configured for MCP
 * MCP needs a global location to store its config and coordinate across projects
 * 
 * Returns:
 * - configured: true if a valid global path exists
 * - path: the resolved path
 * - reason: why it's not configured (if applicable)
 */
export function ensureMCPGlobalPath(): GlobalPathCheckResult {
  const workspaceRoot = detectWorkspaceRoot();
  const rrceHome = getEffectiveRRCEHome(workspaceRoot);
  
  // Check if the path is valid (not just workspace-local)
  // Workspace-local paths like ".rrce-workflow" don't work for cross-project MCP
  if (rrceHome.startsWith('.') || rrceHome.includes('.rrce-workflow/')) {
    // Check if this is a relative/workspace path
    const configPath = path.join(workspaceRoot, '.rrce-workflow', 'config.yaml');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const modeMatch = content.match(/mode:\s*(global|workspace)/);
      if (modeMatch?.[1] === 'workspace') {
        // Workspace mode - no global path configured
        return {
          configured: false,
          path: rrceHome,
          reason: 'Workspace mode configured. MCP requires a global storage path.',
        };
      }
    }
  }
  
  // Global path exists
  return {
    configured: true,
    path: rrceHome,
  };
}

/**
 * Save MCP configuration to disk
 */
export function saveMCPConfig(config: MCPConfig): void {
  const configPath = getMCPConfigPath();
  const dir = path.dirname(configPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = serializeMCPConfig(config);
  fs.writeFileSync(configPath, content);
}

/**
 * Parse MCP config from YAML string
 * Uses yaml library for reliable parsing
 */
function parseMCPConfig(content: string): MCPConfig {
  try {
    const parsed = YAML.parse(content);
    
    // Ensure all required fields have defaults
    const config: MCPConfig = {
      server: {
        port: parsed?.server?.port ?? DEFAULT_MCP_CONFIG.server.port,
        autoStart: parsed?.server?.autoStart ?? DEFAULT_MCP_CONFIG.server.autoStart,
      },
      defaults: {
        includeNew: parsed?.defaults?.includeNew ?? DEFAULT_MCP_CONFIG.defaults.includeNew,
        permissions: {
          knowledge: parsed?.defaults?.permissions?.knowledge ?? DEFAULT_PERMISSIONS.knowledge,
          tasks: parsed?.defaults?.permissions?.tasks ?? DEFAULT_PERMISSIONS.tasks,
          refs: parsed?.defaults?.permissions?.refs ?? DEFAULT_PERMISSIONS.refs,
        },
      },
      projects: Array.isArray(parsed?.projects) ? parsed.projects.map((p: any) => ({
        name: p.name || '',
        path: p.path,
        expose: p.expose ?? true,
        permissions: {
          knowledge: p.permissions?.knowledge ?? DEFAULT_PERMISSIONS.knowledge,
          tasks: p.permissions?.tasks ?? DEFAULT_PERMISSIONS.tasks,
          refs: p.permissions?.refs ?? DEFAULT_PERMISSIONS.refs,
        },
        semanticSearch: p.semanticSearch,
        last_synced_version: p.last_synced_version,
      })) : [],
      last_synced_version: parsed?.last_synced_version,
    };
    
    return config;
  } catch (err) {
    // On parse error, return default config
    return { ...DEFAULT_MCP_CONFIG };
  }
}

/**
 * Serialize MCP config to YAML string
 * Uses yaml library for clean, standard-compliant output
 */
function serializeMCPConfig(config: MCPConfig): string {
  // Add header comment manually
  const header = `# RRCE MCP Hub Configuration
# Manages which projects are exposed via MCP

`;
  
  return header + YAML.stringify(config, {
    indent: 2,
    lineWidth: 0, // No line wrapping
  });
}

/**
 * Add or update a project in the config
 */
export function setProjectConfig(
  config: MCPConfig, 
  name: string, 
  expose: boolean,
  permissions?: Partial<MCPPermissions>,
  projectPath?: string,
  semanticSearch?: MCPSemanticSearchConfig
): MCPConfig {
  const existing = findProjectConfig(config, { name, path: projectPath });
  
  if (existing) {
    existing.expose = expose;
    // Upgrade path if missing
    if (projectPath && !existing.path) {
        existing.path = projectPath;
    }
    if (permissions) {
      existing.permissions = { ...existing.permissions, ...permissions };
    }
    if (semanticSearch) {
        existing.semanticSearch = semanticSearch;
    }
  } else {
    // If we didn't find it by path, try checking if there's a loose name match to avoid duplicates?
    // No, if the user explicitly provided a path, we treat it as a distinct entry unless matched above.
    config.projects.push({
      name,
      path: projectPath,
      expose,
      permissions: permissions ? { ...DEFAULT_PERMISSIONS, ...permissions } : { ...DEFAULT_PERMISSIONS },
      semanticSearch,
    });
  }

  return config;
}

/**
 * Remove a project from the config
 */
export function removeProjectConfig(config: MCPConfig, name: string): MCPConfig {
  config.projects = config.projects.filter(p => p.name !== name);
  return config;
}

/**
 * Check if a project is exposed via MCP
 */
export function isProjectExposed(config: MCPConfig, name: string, projectPath?: string): boolean {
  const project = findProjectConfig(config, { name, path: projectPath });
  
  if (project) {
    return project.expose;
  }
  
  return config.defaults.includeNew;
}

/**
 * Get permissions for a project
 */
export function getProjectPermissions(config: MCPConfig, name: string, projectPath?: string): MCPPermissions {
  const project = findProjectConfig(config, { name, path: projectPath });
  return project?.permissions ?? config.defaults.permissions;
}

/**
 * Clean up stale project entries from configuration
 * - Removes projects with explicit paths that no longer exist
 * - Removes global projects whose workspace directory no longer exists
 */
export function cleanStaleProjects(config: MCPConfig): { config: MCPConfig, removed: string[] } {
    const rrceHome = getEffectiveGlobalPath();
    const globalWorkspacesDir = path.join(rrceHome, 'workspaces');
    
    const validProjects: MCPProjectConfig[] = [];
    const removed: string[] = [];
    
    for (const project of config.projects) {
        let exists = false;
        
        if (project.path) {
            // Explicit path
            exists = fs.existsSync(project.path);
        } else {
            // Global project - check workspaces dir
            const globalPath = path.join(globalWorkspacesDir, project.name);
            exists = fs.existsSync(globalPath);
        }
        
        if (exists) {
            validProjects.push(project);
        } else {
            removed.push(project.name);
        }
    }
    
    if (removed.length > 0) {
        config.projects = validProjects;
    }
    
    return { config, removed };
}
