import React from 'react';
import { Box, Text } from 'ink';

export const CommandBar = () => {
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1}>
      <Text>
        <Text color="cyan" bold>q</Text>:Quit  <Text color="cyan" bold>p</Text>:Projects  <Text color="cyan" bold>i</Text>:Install  <Text color="cyan" bold>r</Text>:Reload  <Text color="cyan" bold>c</Text>:Clear  <Text color="cyan" bold>?</Text>:Help
      </Text>
    </Box>
  );
};
