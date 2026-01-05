/**
 * Path resolution utilities for RRCE projects
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadMCPConfig } from '../config';
import { findProjectConfig } from '../config-utils';
import { 
  getConfigPath, 
  resolveDataPath, 
  getRRCEHome, 
  getEffectiveGlobalPath,
  getWorkspaceName as getWorkspaceNameFromPath 
} from '../../lib/paths';

/**
 * Resolve configuration paths for a project
 * Returns RRCE_HOME, RRCE_DATA, WORKSPACE_ROOT, WORKSPACE_NAME, storage_mode, and config_path
 */
export function resolveProjectPaths(project?: string, pathInput?: string): object {
  const config = loadMCPConfig();
  let workspaceRoot = pathInput;
  let workspaceName = project;

  // 1. Resolve workspaceRoot if only project name is given
  if (!workspaceRoot && project) {
    const projConfig = findProjectConfig(config, { name: project });
    if (projConfig?.path) {
      workspaceRoot = projConfig.path;
    }
  }

  // 1.5. Resolve actual workspace root if we have a data path
  if (workspaceRoot && workspaceRoot.includes('/workspaces/')) {
    try {
      const workspaceConfigPath = path.join(workspaceRoot, 'config.yaml');
      if (fs.existsSync(workspaceConfigPath)) {
        const content = fs.readFileSync(workspaceConfigPath, 'utf-8');
        const sourcePathMatch = content.match(/sourcePath:\s*["']?([^"'\n\r]+)/);
        if (sourcePathMatch?.[1]) {
          workspaceRoot = sourcePathMatch[1].trim();
        }
      }
    } catch (err) {
      // Fallback to the path we have
    }
  }

  // 2. Resolve project name if only path is given
  if (!workspaceName && workspaceRoot) {
    const projConfig = findProjectConfig(config, { path: workspaceRoot });
    workspaceName = projConfig?.name || getWorkspaceNameFromPath(workspaceRoot);
  }

  if (!workspaceName) {
    workspaceName = 'unknown';
  }

  let rrceData = '';
  let mode = 'global'; // Default
  let configFilePath = '';

  if (workspaceRoot) {
    configFilePath = getConfigPath(workspaceRoot);
    const rrceHome = getEffectiveGlobalPath();
    
    // Determine mode based on where config file is found
    if (configFilePath.startsWith(rrceHome)) {
      mode = 'global';
    } else {
      // It's local
      mode = 'workspace';
      // Check content for override
      if (fs.existsSync(configFilePath)) {
        const content = fs.readFileSync(configFilePath, 'utf-8');
        if (content.includes('mode: global')) mode = 'global';
        if (content.includes('mode: workspace')) mode = 'workspace';
      }
    }
    
    rrceData = resolveDataPath(mode as any, workspaceName, workspaceRoot);
  } else {
    // Pure global project reference (no local source?)
    rrceData = resolveDataPath('global', workspaceName, '');
  }

  return {
    RRCE_HOME: getRRCEHome(),
    RRCE_DATA: rrceData,
    WORKSPACE_ROOT: workspaceRoot || null,
    WORKSPACE_NAME: workspaceName,
    storage_mode: mode,
    config_path: configFilePath || null
  };
}
