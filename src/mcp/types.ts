/**
 * MCP Hub Configuration Types
 */

export interface MCPPermissions {
  knowledge: boolean;
  tasks: boolean;
  refs: boolean;
}

export interface MCPProjectConfig {
  name: string;
  expose: boolean;
  permissions: MCPPermissions;
}

export interface MCPServerConfig {
  port: number;
  autoStart: boolean;
}

export interface MCPDefaultsConfig {
  includeNew: boolean;
  permissions: MCPPermissions;
}

export interface MCPConfig {
  server: MCPServerConfig;
  projects: MCPProjectConfig[];
  defaults: MCPDefaultsConfig;
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
    includeNew: true,
    permissions: {
      knowledge: true,
      tasks: true,
      refs: true,
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
