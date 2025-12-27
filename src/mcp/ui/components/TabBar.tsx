
import React from 'react';
import { Box, Text, useInput } from 'ink';

export interface Tab {
  id: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export const TabBar = ({ tabs, activeTab, onChange }: TabBarProps) => {
  useInput((input, key) => {
    if (key.leftArrow) {
      const index = tabs.findIndex(t => t.id === activeTab);
      const nextIndex = (index - 1 + tabs.length) % tabs.length;
      onChange(tabs[nextIndex].id);
    }
    
    if (key.rightArrow) {
      const index = tabs.findIndex(t => t.id === activeTab);
      const nextIndex = (index + 1) % tabs.length;
      onChange(tabs[nextIndex].id);
    }
    
    // Support number keys for quick switching (1-9)
    const num = parseInt(input);
    if (!isNaN(num) && num > 0 && num <= tabs.length) {
      onChange(tabs[num - 1].id);
    }
  });

  return (
    <Box borderStyle="single" paddingX={1} borderColor="gray">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTab;
        return (
          <Box key={tab.id} marginRight={2}>
            <Text 
              color={isActive ? 'cyan' : 'gray'} 
              bold={isActive}
              backgroundColor={isActive ? 'black' : undefined}
            >
              {isActive ? `[ ${tab.label} ]` : `  ${tab.label}  `}
            </Text>
          </Box>
        );
      })}
      <Box flexGrow={1} />
      <Text color="dim">Use ◄/► arrows to navigate</Text>
    </Box>
  );
};
