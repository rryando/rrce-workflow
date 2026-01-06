/**
 * MCP Hub Configuration Types
 */

export interface MCPPermissions {
  knowledge: boolean;
  tasks: boolean;
  refs: boolean;
}

export interface MCPSemanticSearchConfig {
  enabled: boolean;
  model?: string;
}

export interface MCPProjectConfig {
  name: string;
  path?: string;
  expose: boolean;
  permissions: MCPPermissions;
  semanticSearch?: MCPSemanticSearchConfig;
  last_synced_version?: string;
}

export interface MCPServerConfig {
  port: number;
  autoStart: boolean;
}

export interface MCPDefaultsConfig {
  includeNew: boolean;
  permissions: MCPPermissions;
  semanticSearch: MCPSemanticSearchConfig;
}

export interface MCPConfig {
  server: MCPServerConfig;
  projects: MCPProjectConfig[];
  defaults: MCPDefaultsConfig;
  last_synced_version?: string;
}

/**
 * Default MCP configuration
 */
export const DEFAULT_MCP_CONFIG: MCPConfig = {
  server: {
    port: 3000,
    autoStart: false,
  },
  projects: [],
  defaults: {
    includeNew: false,
    permissions: {
      knowledge: true,
      tasks: true,
      refs: true,
    },
    semanticSearch: {
      enabled: true,
      model: 'Xenova/all-MiniLM-L6-v2',
    },
  },
};

/**
 * Default permissions for new projects
 */
export const DEFAULT_PERMISSIONS: MCPPermissions = {
  knowledge: true,
  tasks: true,
  refs: true,
};
