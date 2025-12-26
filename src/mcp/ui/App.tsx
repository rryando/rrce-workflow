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
  onConfigure: () => void;
  onInstall: () => void;
  initialPort: number;
}

export const App = ({ onExit, onConfigure, onInstall, initialPort }: AppProps) => {
  const { exit } = useApp();
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
      setLogs(prev => [...prev, 'Switching to configuration wizard...']);
      // Small delay to let user see message? No, just go.
      onConfigure();
      exit();
    }
    
    if (input === 'i') {
      setLogs(prev => [...prev, 'Switching to install wizard...']);
      onInstall();
      exit();
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
  // Header (~5 lines) + Status (~3 lines) + Command (~3 lines) = ~11 lines overhead
  // We use process.stdout.rows to get terminal height
  const termHeight = process.stdout.rows || 24;
  const logHeight = Math.max(5, termHeight - 12);

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
