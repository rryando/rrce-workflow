
import React from 'react';
import { Box, Text } from 'ink';
import { Header } from './Header';
import { StatusBoard } from './StatusBoard';

interface OverviewProps {
  serverStatus: {
    running: boolean;
    port: number;
    pid: number;
  };
  stats: {
    exposedProjects: number;
    totalProjects: number;
    installedIntegrations: number;
  };
}

export const Overview = ({ serverStatus, stats }: OverviewProps) => {
  return (
    <Box flexDirection="column">
      <Header />
      <Box marginTop={1} marginBottom={1}>
        <StatusBoard 
            exposedLabel={`${stats.exposedProjects} / ${stats.totalProjects} projects`} 
            port={serverStatus.port} 
            pid={serverStatus.pid} 
            running={serverStatus.running} 
        />
      </Box>
      
      <Box borderStyle="round" padding={1} borderColor="white" flexDirection="column">
         <Text bold underline>System Status</Text>
         <Box marginTop={1}>
            <Text>Integrations Installed: </Text>
            <Text color={stats.installedIntegrations > 0 ? 'green' : 'yellow'}>{stats.installedIntegrations}</Text>
         </Box>
          <Box>
            <Text>Server Port: </Text>
            <Text color="cyan">{serverStatus.port}</Text>
         </Box>
         <Box marginTop={1}>
             <Text color="dim">Press 'q' to stop server and exit.</Text>
         </Box>
      </Box>
    </Box>
  );
};
