import React from 'react';
import { Box, Text } from 'ink';

export const Header = () => (
  <Box flexDirection="column" paddingBottom={1}>
    <Box borderStyle="double" borderColor="cyan" paddingX={2} justifyContent="center">
      <Text bold color="white"> RRCE MCP Hub </Text>
    </Box>
  </Box>
);
