
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { Header } from './Header';
import { getAllPrompts } from '../prompts';


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
  const agents = useMemo(() => getAllPrompts(), []);

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

          <Box marginTop={1} borderStyle="single" borderColor="gray" flexDirection="column" paddingX={1} flexGrow={1}>
             <Text bold>Available Agents & Instructions:</Text>
             {agents.map(agent => (
                <Box key={agent.id} flexDirection="column" marginTop={1}>
                    <Text color="yellow">➤ {agent.name} <Text color="dim">({agent.id})</Text></Text>
                    <Text color="white">   {agent.description}</Text>
                    {agent.arguments.length > 0 && (
                        <Text color="dim">   Args: {agent.arguments.map(a => a.name + (a.required ? '*' : '')).join(', ')}</Text>
                    )}
                    <Text color="cyan">   Instruction: "Use the {agent.name} to..."</Text>
                </Box>
             ))}
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
