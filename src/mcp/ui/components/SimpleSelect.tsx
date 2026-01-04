
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

export interface SelectItem<T> {
  label: string;
  value: T;
  key?: string;
}

interface SimpleSelectProps<T> {
  items: SelectItem<T>[];
  onSelect: (item: SelectItem<T>) => void; // For single select: fires on Enter. For multi: fires on Enter with final selection? NO.
  // Let's support both modes.
  // Single mode: Enter triggers onSelect(item).
  // Multi mode: Space toggles, Enter triggers onSubmit(selectedItems).
  
  isMulti?: boolean;
  initialSelected?: T[]; // Values
  onSubmit?: (selected: T[]) => void;
  onCancel?: () => void;
  message?: string;
}

export function SimpleSelect<T>({ 
  items, 
  onSelect, 
  isMulti = false, 
  initialSelected = [], 
  onSubmit, 
  onCancel,
  message 
}: SimpleSelectProps<T>) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedValues, setSelectedValues] = useState<Set<T>>(new Set(initialSelected));

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : items.length - 1));
    }
    if (key.downArrow) {
      setSelectedIndex(prev => (prev < items.length - 1 ? prev + 1 : 0));
    }
    
    if (input === ' ' && isMulti) {
        // Toggle selection
        const item = items[selectedIndex];
        if (item) {
            const newSet = new Set(selectedValues);
            if (newSet.has(item.value)) {
                newSet.delete(item.value);
            } else {
                newSet.add(item.value);
            }
            setSelectedValues(newSet);
        }
    }
    
    if (key.return) {
        if (isMulti) {
            onSubmit?.(Array.from(selectedValues));
        } else {
            const item = items[selectedIndex];
            if (item) onSelect(item);
        }
    }
    
    if (key.escape) {
        onCancel?.();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="white" padding={1}>
      {message && <Box marginBottom={1}><Text bold>{message}</Text></Box>}
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        const isChecked = isMulti && selectedValues.has(item.value);
        
        return (
          <Box key={item.key || String(item.value)} flexDirection="column">
            <Box>
              <Text color={isSelected ? 'cyan' : 'white'}>
                {isSelected ? '> ' : '  '}
              </Text>
              {isMulti && (
                  <Text color={isChecked ? 'green' : 'gray'}>
                      {isChecked ? '[x] ' : '[ ] '}
                  </Text>
              )}
              <Text color={isSelected ? 'cyan' : 'white'}>
                {item.label.split('\n')[0]}
              </Text>
            </Box>
            {item.label.includes('\n') && (
              <Box paddingLeft={isSelected ? 2 : 2}>
                {isMulti && <Text>    </Text>}
                <Text dimColor>
                  {item.label.split('\n').slice(1).join('\n')}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}
      
      <Box marginTop={1}>
        <Text color="gray">
            {isMulti 
                ? 'Space to toggle, Enter to confirm, Esc to cancel' 
                : 'Enter to select, Esc to cancel'}
        </Text>
      </Box>
    </Box>
  );
}
