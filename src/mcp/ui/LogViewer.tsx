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

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="dim" paddingX={1} height={height + 2} flexGrow={1}>
      {padding.map((_, i) => (
        <Text key={`empty-${i}`}> </Text>
      ))}
      {visibleLogs.map((log, i) => (
        <Text key={`log-${i}`} wrap="truncate-end">
          {log}
        </Text>
      ))}
    </Box>
  );
};
