
import React, { useEffect, useRef } from 'react';
import { Box, Text } from 'ink';

interface LogViewerProps {
  logs: string[];
  maxHeight?: number;
}

export const LogViewer = ({ logs, height }: { logs: string[], height: number }) => {
  const visibleLogs = logs.slice(-height);
  
  // Pad with empty lines if needed to maintain height
  const emptyLines = Math.max(0, height - visibleLogs.length);
  const padding = Array(emptyLines).fill('');

  const formatLog = (log: string) => {
      if (log.includes('[RAG]')) return <Text color="cyan">{log}</Text>;
      if (log.includes('[ERROR]')) return <Text color="red">{log}</Text>;
      if (log.includes('[WARN]')) return <Text color="yellow">{log}</Text>;
      if (log.includes('[INFO]')) return <Text color="green">{log}</Text>;
      if (log.includes('Success')) return <Text color="green">{log}</Text>;
      return <Text>{log}</Text>;
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="dim" paddingX={1} height={height + 2} flexGrow={1}>
      {padding.map((_, i) => (
        <Text key={`empty-${i}`}> </Text>
      ))}
      {visibleLogs.map((log, i) => (
        <Box key={`log-${i}`}>
            {formatLog(log)}
        </Box>
      ))}
    </Box>
  );
};
