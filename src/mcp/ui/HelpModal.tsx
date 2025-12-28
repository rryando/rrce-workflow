import React from 'react';
import { Box, Text } from 'ink';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal = ({ onClose }: HelpModalProps) => {
  return (
    <Box borderStyle="double" borderColor="yellow" padding={1} flexDirection="column">
      <Text bold color="yellow">⌨️  Keyboard Shortcuts</Text>
      <Box flexDirection="column" marginTop={1}>
        <Box marginTop={1}><Text bold color="cyan">Configuration:</Text></Box>
        <Text>  <Text bold>p</Text> - Configure Projects (Opens Wizard)</Text>
        <Text>  <Text bold>i</Text> - Install to IDEs (Opens Wizard)</Text>
        
        <Box marginTop={1}><Text bold color="cyan">Server Control:</Text></Box>
        <Text>  <Text bold>r</Text> - Reload Configuration</Text>
        <Text>  <Text bold>c</Text> - Clear Logs</Text>
        <Text>  <Text bold>q</Text> - Stop Server & Exit</Text>
        
        <Box marginTop={1}><Text bold color="cyan">Other:</Text></Box>
        <Text>  <Text bold>?</Text> - Toggle this Help</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Press '?' again to close</Text>
      </Box>
    </Box>
  );
};
