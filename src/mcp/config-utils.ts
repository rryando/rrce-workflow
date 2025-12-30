/**
 * MCP Configuration Utilities
 * Helper functions for working with MCP configuration
 */

import type { MCPConfig, MCPProjectConfig } from './types';

/**
 * Find a project configuration in the MCP config
 * Handles both path-based and name-based lookups
 */
export function findProjectConfig(
  config: MCPConfig,
  identifier: { name: string; path?: string }
): MCPProjectConfig | undefined {
  return config.projects.find(p => {
    // If both have paths, match on path (most specific)
    if (identifier.path && p.path) {
      return p.path === identifier.path;
    }
    
    // If neither has path, match on name
    if (!identifier.path && !p.path) {
      return p.name === identifier.name;
    }
    
    // If identifier has path but config doesn't, allow name match (legacy upgrade)
    if (identifier.path && !p.path) {
      return p.name === identifier.name;
    }
    
    return false;
  });
}

/**
 * Check if a project is exposed via MCP
 */
export function isProjectExposedHelper(
  config: MCPConfig,
  name: string,
  path?: string
): boolean {
  const project = findProjectConfig(config, { name, path });
  
  if (project) {
    return project.expose;
  }
  
  // Use default if not explicitly configured
  return config.defaults.includeNew;
}
