import React from 'react';
import { Box } from 'ink';
import { Header } from './Header';
import { StatusBoard } from './StatusBoard';
import { LogViewer } from './LogViewer';
import { CommandBar } from './CommandBar';

interface DashboardProps {
  logs: string[];
  exposedLabel: string;
  port: number;
  pid: number;
  logHeight: number;
}

export const Dashboard = ({ logs, exposedLabel, port, pid, logHeight }: DashboardProps) => {
  return (
    <Box flexDirection="column" padding={0}>
      <Header />
      <LogViewer logs={logs} height={logHeight} />
      <StatusBoard exposedLabel={exposedLabel} port={port} pid={pid} />
      <CommandBar />
    </Box>
  );
};
