
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, useInput, useApp } from 'ink';
import { Overview } from './Overview';
import { ProjectsView } from './ProjectsView';
import { InstallView } from './InstallView';
import { LogViewer } from './LogViewer';
import { StatusBoard } from './StatusBoard';
import { IndexingStatus } from './IndexingStatus';
import { TabBar, type Tab } from './components/TabBar';
import { loadMCPConfig } from '../config';
import { findProjectConfig } from '../config-utils';
import { scanForProjects } from '../../lib/detection';
import { getLogFilePath } from '../logger';
import { stopMCPServer, startMCPServer, getMCPServerStatus } from '../server';
import { checkInstallStatus } from '../install';
import { detectWorkspaceRoot } from '../../lib/paths';
import fs from 'fs';

interface AppProps {
  onExit: () => void;
  initialPort: number;
}

export const App = ({ onExit, initialPort }: AppProps) => {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState('overview');
  const [logs, setLogs] = useState<string[]>([]);
  const [serverInfo, setServerInfo] = useState({ 
    port: initialPort, 
    pid: process.pid,
    running: false 
  });
  
  // Stats and Config - cached in state
  const [config, setConfig] = useState(() => loadMCPConfig());
  const [projects, setProjects] = useState(() => scanForProjects());
  
  // Refresh callback for manual updates
  const refreshData = useCallback(() => {
    setConfig(loadMCPConfig());
    setProjects(scanForProjects());
  }, []);
  
  // Memoize exposed projects calculation
  const exposedProjects = useMemo(() => 
    projects.filter(p => {
      // Find config: check path match first, then name match
      const cfg = config.projects.find(c => 
        (c.path && c.path === p.path) || 
        (p.source === 'global' && c.name === p.name) ||
        (!c.path && c.name === p.name)
      );
      
      // If found, use config.exposed. 
      // If not found, use default.
      return cfg?.expose ?? config.defaults.includeNew;
    }),
    [projects, config]
  );

  // Check if any exposed project has RAG enabled
  const isRAGEnabled = useMemo(() => {
      return exposedProjects.some(p => {
          const cfg = findProjectConfig(config, { name: p.name, path: p.path });
          return cfg?.semanticSearch?.enabled;
      });
  }, [exposedProjects, config]);

  const tabs = useMemo<Tab[]>(() => {
      const baseTabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'logs', label: 'Logs' },
        { id: 'projects', label: 'Projects' },
        { id: 'install', label: 'Install' }
      ];
      if (isRAGEnabled) {
          // Insert after projects
          baseTabs.splice(3, 0, { id: 'indexing', label: 'Indexing' });
      }
      return baseTabs;
  }, [isRAGEnabled]);

  const workspacePath = detectWorkspaceRoot();
  const installStatus = checkInstallStatus(workspacePath);
  const installedCount = [
      installStatus.antigravity, 
      installStatus.claude, 
      installStatus.vscodeGlobal, 
      installStatus.vscodeWorkspace
    ].filter(Boolean).length;


  // Start Server Effect
  useEffect(() => {
    const start = async () => {
      const status = getMCPServerStatus();
      if (!status.running) {
        try {
          const res = await startMCPServer({ interactive: true });
          setServerInfo(prev => ({ ...prev, running: true, port: res.port, pid: res.pid }));
        } catch (e) {
            setLogs(prev => [...prev, `[ERROR] Error starting server: ${e}`]);
        }
      } else {
         setServerInfo(prev => ({ ...prev, running: true, port: status.port || initialPort, pid: status.pid || process.pid }));
      }
    };
    start();
  }, []);

  // Log Tailing Effect (omitted for brevity, same as before)
  useEffect(() => {
    const logPath = getLogFilePath();
    let lastSize = 0;
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      lastSize = stats.size;
    }
    const interval = setInterval(() => {
      if (fs.existsSync(logPath)) {
        const stats = fs.statSync(logPath);
        if (stats.size > lastSize) {
          const buffer = Buffer.alloc(stats.size - lastSize);
          const fd = fs.openSync(logPath, 'r');
          fs.readSync(fd, buffer, 0, buffer.length, lastSize);
          fs.closeSync(fd);
          const newContent = buffer.toString('utf-8');
          const newLines = newContent.split('\n').filter(l => l.trim());
          setLogs(prev => {
            const next = [...prev, ...newLines];
            return next.slice(-100); 
          });
          lastSize = stats.size;
        }
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // Input Handling for Exit and Restart
  useInput(async (input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      stopMCPServer();
      onExit();
      exit();
    }
    
    if (input === 'r') {
      setLogs(prev => [...prev, '[INFO] Restarting server...']);
      stopMCPServer();
      setServerInfo(prev => ({ ...prev, running: false }));
      
      try {
        const res = await startMCPServer({ interactive: true });
        setServerInfo(prev => ({ ...prev, running: true, port: res.port, pid: res.pid }));
        setLogs(prev => [...prev, '[INFO] Server restarted successfully']);
      } catch (e) {
        setLogs(prev => [...prev, `[ERROR] Failed to restart: ${e}`]);
      }
    }
  }); 

  // Layout Calc
  const termHeight = process.stdout.rows || 24;
  // Reduce content height to account for TabBar (header) AND StatusBoard (footer)
  const contentHeight = termHeight - 8; 

  const handleConfigChange = useCallback(() => {
    refreshData();
  }, [refreshData]);

  return (
    <Box flexDirection="column" padding={0} height={termHeight}>
       <TabBar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
       
       <Box marginTop={1} flexGrow={1}>
           {activeTab === 'overview' && (
               <Overview 
                 serverStatus={serverInfo} 
                 stats={{ 
                     exposedProjects: exposedProjects.length, 
                     totalProjects: projects.length,
                     installedIntegrations: installedCount
                 }} 
               />
           )}
           {activeTab === 'projects' && <ProjectsView config={config} projects={projects} onConfigChange={handleConfigChange} />}
           {activeTab === 'indexing' && <IndexingStatus config={config} projects={exposedProjects} />}
           {activeTab === 'install' && <InstallView />}
           {activeTab === 'logs' && <LogViewer logs={logs} height={contentHeight} />}
       </Box>

       {/* Persistent Status Bar */}
       <Box marginTop={0}>
          <StatusBoard 
              exposedLabel={`${exposedProjects.length} / ${projects.length} projects`} 
              port={serverInfo.port} 
              pid={serverInfo.pid} 
              running={serverInfo.running} 
          />
       </Box>
    </Box>
  );
};
