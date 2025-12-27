import React from 'react';
import { Box, Text } from 'ink';

interface StatusBoardProps {
  exposedLabel: string;
  port: number;
  pid: number;
  running: boolean;
}

export const StatusBoard = ({ exposedLabel, port, pid, running }: StatusBoardProps) => {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} flexGrow={1}>
      <Text>
        {running ? <Text color="green">● RUNNING</Text> : <Text color="red">● STOPPED</Text>} {'\u2502'} 📋 <Text color="yellow">{exposedLabel}</Text> {'\u2502'} Port: <Text color="green">{port}</Text> {'\u2502'} PID: <Text color="green">{pid}</Text>
      </Text>
    </Box>
  );
};
