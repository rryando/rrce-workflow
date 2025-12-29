
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
         <Box justifyContent="space-between">
            <Box flexDirection="column">
                <Text bold underline>System Status</Text>
                <Box marginTop={1}>
                    <Text>Integrations Installed: </Text>
                    <Text color={stats.installedIntegrations > 0 ? 'green' : 'yellow'}>{stats.installedIntegrations}</Text>
                </Box>
                <Box>
                    <Text>Server Port: </Text>
                    <Text color="cyan">{serverStatus.port}</Text>
                </Box>
            </Box>
            
            <Box flexDirection="column" marginLeft={4}>
                <Text bold underline>Quick Start</Text>
                <Box marginTop={1} flexDirection="column">
                    <Text>1. Install "MCP" extension in VSCode / Antigravity</Text>
                    <Text>2. Configure Extension to use this server:</Text>
                    <Text color="dim">   (This is handled automatically by 'Install to IDE')</Text>
                    <Text>3. In your Agent IDE, ask:</Text>
                    <Text color="cyan">   "Use the rrce tools to analyze this project"</Text>
                </Box>
            </Box>
         </Box>

         <Box marginTop={1} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1}>
             <Text bold>Usage Tips:</Text>
             <Text>• <Text color="yellow">init</Text>: "Initialize project context"</Text>
             <Text>• <Text color="yellow">plan</Text>: "Create a plan for [task]"</Text>
             <Text>• <Text color="yellow">doctor</Text>: "Check project health"</Text>
         </Box>

         <Box marginTop={1} flexDirection="column">
             <Text color="dim">Controls:</Text>
             <Text color="dim">  • Press 'r' to restart server</Text>
             <Text color="dim">  • Use 1-4 or ◄/► to navigate tabs</Text>
             <Text color="dim">  • Press 'q' to stop server and exit</Text>
         </Box>
      </Box>
    </Box>
  );
};
