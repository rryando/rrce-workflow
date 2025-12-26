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
  running: boolean;
  logHeight: number;
  showHelp: boolean;
}

import { HelpModal } from './HelpModal';

export const Dashboard = ({ logs, exposedLabel, port, pid, running, logHeight, showHelp }: DashboardProps) => {
  return (
    <Box flexDirection="column" padding={0}>
      <Header />
      {showHelp ? (
          <HelpModal onClose={() => {}} />
      ) : (
          <LogViewer logs={logs} height={logHeight} />
      )}
      <StatusBoard exposedLabel={exposedLabel} port={port} pid={pid} running={running} />
      <CommandBar />
    </Box>
  );
};
