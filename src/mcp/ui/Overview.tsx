
import React from 'react';
import { Box, Text } from 'ink';
import { Header } from './Header';


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
    <Box flexDirection="column" flexGrow={1}>
      <Header />
      
      <Box borderStyle="round" padding={1} borderColor="white" flexDirection="column" flexGrow={1}>
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
