import React from 'react';
import { Box, Text } from 'ink';

interface StatusBoardProps {
  exposedLabel: string;
  port: number;
  pid: number;
}

export const StatusBoard = ({ exposedLabel, port, pid }: StatusBoardProps) => {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text>
        📋 <Text color="yellow">{exposedLabel}</Text> {'\u2502'} Port: <Text color="green">{port}</Text> {'\u2502'} PID: <Text color="green">{pid}</Text>
      </Text>
    </Box>
  );
};
