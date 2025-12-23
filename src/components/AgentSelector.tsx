import * as React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import type { ParsedPrompt } from '../types/prompt';

interface AgentSelectorProps {
  prompts: ParsedPrompt[];
  workspaceName: string;
  onSelect: (prompt: ParsedPrompt) => void;
}

export function AgentSelector({ prompts, workspaceName, onSelect }: AgentSelectorProps) {
  const items = prompts.map((p, i) => ({
    key: p.filePath,
    label: `${p.frontmatter.name} - ${p.frontmatter.description}`,
    value: p,
  }));

  const handleSelect = (item: { value: ParsedPrompt }) => {
    onSelect(item.value);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2}>
        <Text bold color="cyan">RRCE-Workflow</Text>
        <Text> </Text>
        <Text dimColor>| {workspaceName}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>Select an agent:</Text>
        <Box marginTop={1}>
          <SelectInput items={items} onSelect={handleSelect} />
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>↑↓ to navigate, Enter to select</Text>
      </Box>
    </Box>
  );
}
