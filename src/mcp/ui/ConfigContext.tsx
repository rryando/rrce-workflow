/**
 * Config Context for MCP TUI
 * Provides global state for config and projects across all TUI components
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { MCPConfig } from '../types';
import type { DetectedProject } from '../../lib/detection';
import { loadMCPConfig } from '../config';
import { scanForProjects } from '../../lib/detection';
import { findProjectConfig } from '../config-utils';

interface ConfigContextType {
  config: MCPConfig;
  projects: DetectedProject[];
  exposedProjects: DetectedProject[];
  refresh: () => void;
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
  const [projects, setProjects] = useState<DetectedProject[]>(() => scanForProjects());
  
  // Refresh function to reload config and projects
  const refresh = useCallback(() => {
    setConfig(loadMCPConfig());
    setProjects(scanForProjects());
  }, []);
  
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
    refresh,
  }), [config, projects, exposedProjects, refresh]);
  
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
