
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, useInput, useApp } from 'ink';
import { Overview } from './Overview';
import { ProjectsView } from './ProjectsView';
import { TasksView } from './TasksView';
import { LogViewer } from './LogViewer';
import { StatusBoard } from './StatusBoard';
import { TabBar, type Tab } from './components/TabBar';
import { findProjectConfig } from '../config-utils';
import { getLogFilePath } from '../logger';
import { stopMCPServer, startMCPServer, getMCPServerStatus } from '../server';
import { detectWorkspaceRoot } from '../../lib/paths';
import { checkInstallStatus } from '../install';
import fs from 'fs';
import { useConfig } from './ConfigContext';

interface AppProps {
  onExit: () => void;
  initialPort: number;
}

export const App = ({ onExit, initialPort }: AppProps) => {
  const { exit } = useApp();
  const { config, projects, exposedProjects, driftReports, refresh: refreshData } = useConfig();
  const [activeTab, setActiveTab] = useState('overview');
  const [logs, setLogs] = useState<string[]>([]);
  const [serverInfo, setServerInfo] = useState({ 
    port: initialPort, 
    pid: process.pid,
    running: false 
  });
  
  // Check if any exposed project has RAG enabled
  const isRAGEnabled = useMemo(() => {
      return exposedProjects.some(p => {
          const cfg = findProjectConfig(config, { name: p.name, path: p.path });
          return cfg?.semanticSearch?.enabled || p.semanticSearchEnabled;
      });
  }, [exposedProjects, config]);

  const hasAnyDrift = useMemo(() => 
    Object.values(driftReports).some(r => r.hasDrift),
    [driftReports]
  );

  const tabs = useMemo<Tab[]>(() => {
      return [
        { id: 'overview', label: 'Overview' },
        { id: 'logs', label: 'Logs' },
        { id: 'tasks', label: 'Tasks' },
        { id: 'projects', label: 'Projects' },
      ];
  }, []);

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

  // Log Tailing Effect
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
                 logs={logs}
               />
           )}
           {activeTab === 'logs' && <LogViewer logs={logs} height={contentHeight} />}
           {activeTab === 'tasks' && <TasksView projects={projects} />}
           {activeTab === 'projects' && <ProjectsView config={config} projects={projects} onConfigChange={handleConfigChange} />}
       </Box>

        {/* Persistent Status Bar */}
        <Box marginTop={0}>
           <StatusBoard 
               exposedLabel={`${exposedProjects.length} / ${projects.length} projects`} 
               port={serverInfo.port} 
               pid={serverInfo.pid} 
               running={serverInfo.running} 
               hasDrift={hasAnyDrift}
           />
        </Box>

    </Box>
  );
};
