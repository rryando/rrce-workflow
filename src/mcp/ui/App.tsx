
import React, { useState, useEffect } from 'react';
import { Box, useInput, useApp } from 'ink';
import { Overview } from './Overview';
import { ProjectsView } from './ProjectsView';
import { InstallView } from './InstallView';
import { LogViewer } from './LogViewer';
import { StatusBoard } from './StatusBoard';
import { TabBar, type Tab } from './components/TabBar';
import { loadMCPConfig } from '../config';
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

const TABS: Tab[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Logs' },
    { id: 'projects', label: 'Projects' },
    { id: 'install', label: 'Install' }
];

export const App = ({ onExit, initialPort }: AppProps) => {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState<string[]>([]);
  const [serverInfo, setServerInfo] = useState({ 
    port: initialPort, 
    pid: process.pid,
    running: false 
  });
  
  // Stats and Config
  const [configVersion, setConfigVersion] = useState(0); // Used to trigger re-renders
  const config = loadMCPConfig(); // Config re-reads on render, or we force update
  const projects = scanForProjects();
  const exposedProjects = projects.filter(p => {
    const cfg = config.projects.find(c => 
      (c.path && c.path === p.dataPath) || (!c.path && c.name === p.name)
    );
    return cfg?.expose ?? config.defaults.includeNew;
  });

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

  // Input Handling for Exit
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      stopMCPServer();
      onExit();
      exit();
    }
  }); 

  // Layout Calc
  const termHeight = process.stdout.rows || 24;
  // Reduce content height to account for TabBar (header) AND StatusBoard (footer)
  const contentHeight = termHeight - 8; 

  const handleConfigChange = () => {
      // Force re-render to update stats
      setConfigVersion(prev => prev + 1);
  };

  return (
    <Box flexDirection="column" padding={0} height={termHeight}>
       <TabBar tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
       
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
           {activeTab === 'projects' && <ProjectsView onConfigChange={handleConfigChange} />}
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
