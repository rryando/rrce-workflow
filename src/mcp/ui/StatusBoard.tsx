import React from 'react';
import { Box, Text } from 'ink';

interface StatusBoardProps {
  exposedLabel: string;
  port: number;
  pid: number;
  running: boolean;
  hasDrift?: boolean;
}

export const StatusBoard = ({ exposedLabel, port, pid, running, hasDrift }: StatusBoardProps) => {
  return (
    <Box borderStyle="single" borderColor="white" paddingX={1} flexGrow={1}>
      <Text>
        {running ? <Text color="green">● RUNNING</Text> : <Text color="red">● STOPPED</Text>} {'\u2502'} 📋 <Text color="yellow">{exposedLabel}</Text> {'\u2502'} Port: <Text color="green">{port}</Text> {'\u2502'} PID: <Text color="green">{pid}</Text>
        {hasDrift && <Text color="magenta" bold> {'\u2502'} ⬆ UPDATE AVAILABLE</Text>}
      </Text>
    </Box>
  );
};
