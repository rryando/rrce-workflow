/**
 * Config Context for MCP TUI
 * Provides global state for config and projects across all TUI components
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { MCPConfig } from '../types';
import type { DetectedProject } from '../../lib/detection';
import { loadMCPConfig } from '../config';
import { projectService } from '../../lib/detection-service';
import { findProjectConfig } from '../config-utils';
import { DriftService, type DriftReport } from '../../lib/drift-service';
import { getAgentCoreDir } from '../../lib/prompts';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Get the current version from package.json
 */
function getPackageVersion(): string {
  try {
    const agentCoreDir = getAgentCoreDir();
    const packageJsonPath = path.join(path.dirname(agentCoreDir), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
    }
  } catch (e) {
    // Ignore
  }
  return '0.0.0';
}

interface ConfigContextType {
  config: MCPConfig;
  projects: DetectedProject[];
  exposedProjects: DetectedProject[];
  driftReports: Record<string, DriftReport>;
  refresh: () => void;
  checkAllDrift: () => void;
}

const ConfigContext = createContext<ConfigContextType | null>(null);

interface ConfigProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that manages config and project state
 */
export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children }) => {
  const [config, setConfig] = useState<MCPConfig>(() => loadMCPConfig());
  const [projects, setProjects] = useState<DetectedProject[]>(() => projectService.scan());
  const [driftReports, setDriftReports] = useState<Record<string, DriftReport>>({});
  
  // Refresh function to reload config and projects
  const refresh = useCallback(() => {
    const newConfig = loadMCPConfig();
    const newProjects = projectService.refresh();
    setConfig(newConfig);
    setProjects(newProjects);
  }, []);

  const checkAllDrift = useCallback(() => {
    const runningVersion = getPackageVersion();
    const reports: Record<string, DriftReport> = {};

    for (const project of projects) {
        const projectConfig = findProjectConfig(config, { name: project.name, path: project.path });
        const currentVersion = projectConfig?.last_synced_version;
        
        reports[project.path] = DriftService.checkDrift(project.dataPath, currentVersion, runningVersion);
    }
    setDriftReports(reports);
  }, [projects, config]);

  // Deferred drift check — let the TUI render first
  useEffect(() => {
    const timer = setTimeout(checkAllDrift, 500);
    return () => clearTimeout(timer);
  }, [checkAllDrift]);
  
  // Memoize exposed projects calculation
  const exposedProjects = useMemo(() => 
    projects.filter(p => {
      const cfg = findProjectConfig(config, { name: p.name, path: p.path });
      return cfg?.expose ?? config.defaults.includeNew;
    }),
    [projects, config]
  );
  
  const value = useMemo(() => ({
    config,
    projects,
    exposedProjects,
    driftReports,
    refresh,
    checkAllDrift,
  }), [config, projects, exposedProjects, driftReports, refresh, checkAllDrift]);
  
  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};

/**
 * Hook to access config context
 * Must be used within a ConfigProvider
 */
export function useConfig(): ConfigContextType {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}

export { ConfigContext };
