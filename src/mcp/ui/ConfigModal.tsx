
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { SimpleSelect } from './components/SimpleSelect';
import { loadMCPConfig, saveMCPConfig } from '../config';
import { scanForProjects } from '../../lib/detection';
import { setProjectConfig } from '../config';

interface ConfigModalProps {
  onBack: () => void;
}

export const ConfigModal = ({ onBack }: ConfigModalProps) => {
  const [config, setConfig] = useState(loadMCPConfig());
  // Scan filtering out current workspace if needed - but here we want all.
  // We want to list all detected projects.
  const allProjects = scanForProjects();
  
  // Merge with config to determine status
  const projectItems = allProjects.map(p => {
    // Check if explicitly configured
    const projectConfig = config.projects.find(c => 
        (c.path && c.path === p.dataPath) || (!c.path && c.name === p.name)
    );
    // Is exposed?
    // If explicit config exists, use it. Else use default.
    const isExposed = projectConfig ? projectConfig.expose : config.defaults.includeNew;
    
    return {
        label: p.name + ` (${p.source})` + (p.path ? ` - ${p.path}` : ''),
        value: p.dataPath, // Unique ID
        key: p.dataPath,
        exposed: isExposed
    };
  });
  
  const initialSelected = projectItems
    .filter(p => p.exposed)
    .map(p => p.value);

  const handleSubmit = (selectedIds: string[]) => {
    let newConfig = { ...config };
    
    // For each detected project, update its config
    // This allows "Saving" the state.
    // Note: This logic forces entries for all manipulated projects.
    
    projectItems.forEach(item => {
        const isSelected = selectedIds.includes(item.value);
        const project = allProjects.find(p => p.dataPath === item.value);
        if (project) {
            newConfig = setProjectConfig(
                newConfig,
                project.name,
                isSelected,
                undefined, // Keep existing permissions or defaults
                project.path // Ensure path is stored
            );
        }
    });
    
    saveMCPConfig(newConfig);
    onBack();
  };

  return (
    <Box flexDirection="column">
      <SimpleSelect 
        message="Select projects to expose via MCP:"
        items={projectItems}
        isMulti={true}
        initialSelected={initialSelected}
        onSelect={() => {}} // Unused in multi
        onSubmit={handleSubmit}
        onCancel={onBack}
      />
    </Box>
  );
};
