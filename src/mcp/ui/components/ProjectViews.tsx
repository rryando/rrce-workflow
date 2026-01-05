import React from 'react';
import { Box, Text } from 'ink';

export const ProjectsHeader = ({ autoExpose }: { autoExpose: boolean }) => (
  <Box paddingX={1} justifyContent="space-between" borderBottom>
    <Box>
      <Text bold color="cyan">Projects</Text>
      <Text color="dim"> │ </Text>
      <Text color={autoExpose ? 'green' : 'red'}>
        Auto-expose: {autoExpose ? 'ON' : 'OFF'}
      </Text>
    </Box>
    <Text color="dim">v0.3.14</Text>
  </Box>
);

export const ProjectsFooter = () => (
  <Box paddingX={1} justifyContent="space-between" borderTop>
    <Text color="dim">Space:Select  Enter:Save  a:Toggle Auto  u:Refresh Drift</Text>
    <Text color="dim">Use 'rrce-workflow wizard' for advanced config</Text>
  </Box>
);
