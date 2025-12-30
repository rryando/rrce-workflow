/**
 * MCP Configuration Utilities
 * Helper functions for working with MCP configuration
 */

import * as path from 'path';
import type { MCPConfig, MCPProjectConfig } from './types';

/**
 * Normalize a project path for comparison
 * Converts data paths (.rrce-workflow) to project root paths
 */
export function normalizeProjectPath(projectPath: string): string {
  if (projectPath.endsWith('.rrce-workflow')) {
    return path.dirname(projectPath);
  }
  if (projectPath.endsWith('.rrce-workflow/')) {
    return path.dirname(projectPath.slice(0, -1));
  }
  return projectPath;
}

/**
 * Find a project configuration in the MCP config
 * Handles both path-based and name-based lookups
 */
export function findProjectConfig(
  config: MCPConfig,
  identifier: { name: string; path?: string }
): MCPProjectConfig | undefined {
  const targetPath = identifier.path ? normalizeProjectPath(identifier.path) : undefined;

  return config.projects.find(p => {
    const configPath = p.path ? normalizeProjectPath(p.path) : undefined;

    // If both have paths, match on path (most specific)
    if (targetPath && configPath) {
      return configPath === targetPath;
    }
    
    // If neither has path, match on name
    if (!targetPath && !configPath) {
      return p.name === identifier.name;
    }
    
    // If identifier has path but config doesn't, allow name match (legacy upgrade)
    if (targetPath && !configPath) {
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
