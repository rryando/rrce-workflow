import React from 'react';
import { Box, Text } from 'ink';

export const TasksHeader = ({ projectCount, taskCount }: { projectCount: number; taskCount: number }) => (
  <Box paddingX={1} justifyContent="space-between" borderBottom>
    <Box>
      <Text bold color="cyan">⚙ Tasks</Text>
      <Text color="dim"> │ </Text>
      <Text>{projectCount} projects</Text>
      <Text color="dim"> • </Text>
      <Text>{taskCount} tasks</Text>
    </Box>
    <Text color="dim">v0.3.14</Text>
  </Box>
);

export const TasksFooter = () => (
  <Box paddingX={1} justifyContent="space-between" borderTop>
    <Text color="dim">↑↓:Nav  Enter:Expand  s:Cycle Status  R:Refresh</Text>
    <Text color="dim">Press 'q' to exit</Text>
  </Box>
);
