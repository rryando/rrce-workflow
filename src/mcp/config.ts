/**
 * MCP Configuration Parser/Writer
 * Manages mcp.yaml in the effective RRCE home directory
 * Respects custom globalPath set by the wizard
 */

import * as fs from 'fs';
import * as path from 'path';
import { getEffectiveRRCEHome, detectWorkspaceRoot } from '../lib/paths';
import type { MCPConfig, MCPProjectConfig, MCPPermissions, MCPSemanticSearchConfig } from './types';
import { DEFAULT_MCP_CONFIG, DEFAULT_PERMISSIONS } from './types';

/**
 * Get path to MCP config file
 * Uses effective RRCE home (respects custom globalPath from workspace config)
 */
export function getMCPConfigPath(): string {
  const workspaceRoot = detectWorkspaceRoot();
  const rrceHome = getEffectiveRRCEHome(workspaceRoot);
  return path.join(rrceHome, 'mcp.yaml');
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
    return parseMCPConfig(content);
  } catch {
    return { ...DEFAULT_MCP_CONFIG };
  }
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
 * Line-by-line parser to properly handle YAML structure
 */
function parseMCPConfig(content: string): MCPConfig {
  const config: MCPConfig = { ...DEFAULT_MCP_CONFIG, projects: [] };
  const lines = content.split('\n');
  
  let currentSection: 'server' | 'defaults' | 'projects' | null = null;
  let currentProject: MCPProjectConfig | null = null;
  let inPermissions = false;
  let inSemanticSearch = false;

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') continue;
    
    // Detect top-level sections
    if (line.match(/^server:/)) {
      currentSection = 'server';
      currentProject = null;
      inPermissions = false;
      inSemanticSearch = false;
      continue;
    }
    if (line.match(/^defaults:/)) {
      currentSection = 'defaults';
      currentProject = null;
      inPermissions = false;
      inSemanticSearch = false;
      continue;
    }
    if (line.match(/^projects:/)) {
      currentSection = 'projects';
      currentProject = null;
      inPermissions = false;
      inSemanticSearch = false;
      continue;
    }
    
    // Parse based on current section
    if (currentSection === 'server') {
      const portMatch = trimmed.match(/^port:\s*(\d+)/);
      if (portMatch?.[1]) config.server.port = parseInt(portMatch[1], 10);
      
      const autoStartMatch = trimmed.match(/^autoStart:\s*(true|false)/);
      if (autoStartMatch) config.server.autoStart = autoStartMatch[1] === 'true';
    }
    
    if (currentSection === 'defaults') {
      const includeNewMatch = trimmed.match(/^includeNew:\s*(true|false)/);
      if (includeNewMatch) config.defaults.includeNew = includeNewMatch[1] === 'true';
      
      // Handle defaults.permissions
      if (trimmed === 'permissions:') {
        inPermissions = true;
        continue;
      }
      if (inPermissions) {
        const knowledgeMatch = trimmed.match(/^knowledge:\s*(true|false)/);
        if (knowledgeMatch) config.defaults.permissions.knowledge = knowledgeMatch[1] === 'true';
        
        const tasksMatch = trimmed.match(/^tasks:\s*(true|false)/);
        if (tasksMatch) config.defaults.permissions.tasks = tasksMatch[1] === 'true';
        
        const refsMatch = trimmed.match(/^refs:\s*(true|false)/);
        if (refsMatch) config.defaults.permissions.refs = refsMatch[1] === 'true';
      }
    }
    
    if (currentSection === 'projects') {
      // New project entry starts with "- name:"
      const projectNameMatch = line.match(/^\s+-\s+name:\s*["']?([^"'\n]+)["']?/);
      if (projectNameMatch) {
        // Save previous project if exists
        if (currentProject && currentProject.name) {
          config.projects.push(currentProject);
        }
        currentProject = {
          name: projectNameMatch[1]!.trim(),
          expose: true,
          permissions: { ...DEFAULT_PERMISSIONS },
        };
        inPermissions = false;
        continue;
      }
      
      // Parse project properties
      if (currentProject) {
        const pathMatch = trimmed.match(/^path:\s*["']?([^"'\n]+)["']?/);
        if (pathMatch) {
            currentProject.path = pathMatch[1].trim();
        }

        const exposeMatch = trimmed.match(/^expose:\s*(true|false)/);
        if (exposeMatch) {
          currentProject.expose = exposeMatch[1] === 'true';
        }
        
        if (trimmed === 'permissions:') {
          inPermissions = true;
          continue;
        }
        
        if (inPermissions) {
          const knowledgeMatch = trimmed.match(/^knowledge:\s*(true|false)/);
          if (knowledgeMatch) currentProject.permissions.knowledge = knowledgeMatch[1] === 'true';
          
          const tasksMatch = trimmed.match(/^tasks:\s*(true|false)/);
          if (tasksMatch) currentProject.permissions.tasks = tasksMatch[1] === 'true';
          
          const refsMatch = trimmed.match(/^refs:\s*(true|false)/);
          if (refsMatch) currentProject.permissions.refs = refsMatch[1] === 'true';
        }

        if (trimmed === 'semanticSearch:') {
          inSemanticSearch = true;
          inPermissions = false;
          if (!currentProject.semanticSearch) {
              currentProject.semanticSearch = { enabled: false };
          }
          continue;
        }

        if (inSemanticSearch && currentProject.semanticSearch) {
            const enabledMatch = trimmed.match(/^enabled:\s*(true|false)/);
            if (enabledMatch) currentProject.semanticSearch.enabled = enabledMatch[1] === 'true';

            const modelMatch = trimmed.match(/^model:\s*["']?([^"'\n]+)["']?/);
            if (modelMatch) currentProject.semanticSearch.model = modelMatch[1].trim();
        }
      }
    }
  }
  
  // Don't forget the last project
  if (currentProject && currentProject.name) {
    config.projects.push(currentProject);
  }

  return config;
}

/**
 * Serialize MCP config to YAML string
 */
function serializeMCPConfig(config: MCPConfig): string {
  let content = `# RRCE MCP Hub Configuration
# Manages which projects are exposed via MCP

server:
  port: ${config.server.port}
  autoStart: ${config.server.autoStart}

defaults:
  includeNew: ${config.defaults.includeNew}
  permissions:
    knowledge: ${config.defaults.permissions.knowledge}
    tasks: ${config.defaults.permissions.tasks}
    refs: ${config.defaults.permissions.refs}

projects:
`;

  if (config.projects.length === 0) {
    content += '  # No projects configured yet. Run "rrce-workflow mcp" to add projects.\n';
  } else {
    for (const project of config.projects) {
      content += `  - name: "${project.name}"
`;
      if (project.path) {
        content += `    path: "${project.path}"\n`;
      }
      content += `    expose: ${project.expose}\n`;
      if (project.semanticSearch) {
        content += `    semanticSearch:
      enabled: ${project.semanticSearch.enabled}
`;
        if (project.semanticSearch.model) {
            content += `      model: "${project.semanticSearch.model}"
`;
        }
      }
      content += `    permissions:
      knowledge: ${project.permissions.knowledge}
      tasks: ${project.permissions.tasks}
      refs: ${project.permissions.refs}
`;
    }
  }

  return content;
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
  let existing = config.projects.find(p => {
    // Exact match on path if both have it
    if (projectPath && p.path) {
        return p.path === projectPath;
    }
    // Fallback to name match if paths are missing
    if (!projectPath && !p.path) {
        return p.name === name;
    }
    // If one has path and other doesn't, but names match?
    // Assume legacy config upgrade if name matches and config has no path
    if (projectPath && !p.path && p.name === name) {
        return true;
    }
    return false;
  });
  
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
  const project = config.projects.find(p => {
    if (projectPath && p.path) return p.path === projectPath;
    if (!projectPath && !p.path) return p.name === name;
    // Fallback: if we have a path but config doesn't, allow name match
    if (projectPath && !p.path) return p.name === name;
    return false;
  });
  
  // If explicitly configured, use that
  if (project) {
    return project.expose;
  }
  
  // Otherwise use default
  return config.defaults.includeNew;
}

/**
 * Get permissions for a project
 */
export function getProjectPermissions(config: MCPConfig, name: string, projectPath?: string): MCPPermissions {
  const project = config.projects.find(p => {
    if (projectPath && p.path) return p.path === projectPath;
    if (!projectPath && !p.path) return p.name === name;
    if (projectPath && !p.path) return p.name === name;
    return false;
  });
  return project?.permissions ?? config.defaults.permissions;
}
