import React, { useState, useEffect } from 'react';
import { Box, useInput, useApp } from 'ink';
import { Dashboard } from './Dashboard';
import { loadMCPConfig } from '../config';
import { scanForProjects } from '../../lib/detection';
import { getLogFilePath } from '../logger';
import { stopMCPServer, startMCPServer, getMCPServerStatus } from '../server';
import fs from 'fs';

interface AppProps {
  onExit: () => void;
  initialPort: number;
}

import { ConfigModal } from './ConfigModal';
import { InstallModal } from './InstallModal';

export const App = ({ onExit, initialPort }: AppProps) => {
  const { exit } = useApp();
  const [view, setView] = useState<'dashboard' | 'config' | 'install'>('dashboard');
  const [logs, setLogs] = useState<string[]>([]);
  const [serverInfo, setServerInfo] = useState({ 
    port: initialPort, 
    pid: process.pid,
    running: false 
  });
  const [showHelp, setShowHelp] = useState(false);
  
  // Load config for display
  const config = loadMCPConfig();
  const projects = scanForProjects();
  const exposedProjects = projects.filter(p => {
    const cfg = config.projects.find(c => 
      (c.path && c.path === p.dataPath) || (!c.path && c.name === p.name)
    );
    return cfg?.expose ?? config.defaults.includeNew;
  });
  
  const exposedNames = exposedProjects.map(p => p.name).slice(0, 5);
  const exposedLabel = exposedNames.length > 0 
    ? exposedNames.join(', ') + (exposedProjects.length > 5 ? ` (+${exposedProjects.length - 5} more)` : '')
    : '(none)';

  // Start Server Effect
  useEffect(() => {
    const start = async () => {
      const status = getMCPServerStatus();
      if (!status.running) {
        try {
          // Check if server fails on start
          const res = await startMCPServer({ interactive: true });
          setServerInfo(prev => ({ ...prev, running: true, port: res.port, pid: res.pid }));
        } catch (e) {
            setLogs(prev => [...prev, `Error starting server: ${e}`]);
        }
      } else {
         setServerInfo(prev => ({ ...prev, running: true, port: status.port || initialPort, pid: status.pid || process.pid }));
      }
    };
    start();

    return () => {
      // Cleanup handled by onExit logic mostly, but good practice
    };
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
            return next.slice(-50); // Keep last 50 logs
          });
          
          lastSize = stats.size;
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // Input Handling
  useInput((input, key) => {
    // Debug logging
    // fs.appendFileSync('input_debug.log', `Input: ${input}, Key: ${JSON.stringify(key)}\n`);

    if (input === 'q' || (key.ctrl && input === 'c')) {
      stopMCPServer();
      onExit(); // This triggers unmount/cleanup in index.ts
      exit();
    }
    
    if (input === 'p') {
      setView('config');
    }
    
    if (input === 'i') {
      setView('install');
    }

    if (input === 'c') {
      setLogs([]);
    }
    
    if (input === 'r') {
       setLogs(prev => [...prev, '[INFO] Config reload requested...']);
    }

    if (input === '?') {
       setShowHelp(prev => !prev);
    }
  }, { isActive: true }); // Ensure we only capture when active

  // Calculate layout
  const termHeight = process.stdout.rows || 24;
  const logHeight = Math.max(5, termHeight - 12);

  if (view === 'config') {
      return <ConfigModal onBack={() => setView('dashboard')} />;
  }
  
  if (view === 'install') {
      return <InstallModal onBack={() => setView('dashboard')} />;
  }

  return (
    <Dashboard 
      logs={logs}
      exposedLabel={exposedLabel}
      port={serverInfo.port}
      pid={serverInfo.pid}
      running={serverInfo.running}
      logHeight={logHeight}
      showHelp={showHelp}
    />
  );
};
