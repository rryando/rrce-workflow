
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { SimpleSelect } from './components/SimpleSelect';
import { saveMCPConfig, setProjectConfig } from '../config';
import type { MCPConfig } from '../types';
import type { DetectedProject } from '../../lib/detection';

interface ProjectsViewProps {
  config: MCPConfig;
  projects: DetectedProject[];
  onConfigChange?: () => void;
}

export const ProjectsView = ({ config: initialConfig, projects: allProjects, onConfigChange }: ProjectsViewProps) => {
  const [config, setConfig] = useState(initialConfig);
  
  // Merge with config to determine status
  const projectItems = allProjects.map(p => {
    // Check if explicitly configured
    const projectConfig = config.projects.find(c => 
        (c.path && c.path === p.path) || (!c.path && c.name === p.name)
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
    
    // For each detected project, check if it's in the selectedIds list
    projectItems.forEach(item => {
        const isSelected = selectedIds.includes(item.value);
        const project = allProjects.find(p => p.dataPath === item.value);
        
        // Only update if changed or new
        // Actually, the simplest way is to ensure all are recorded if we want persistence
        if (project) {
             newConfig = setProjectConfig(
                newConfig,
                project.name,
                isSelected,
                undefined, 
                project.path 
            );
        }
    });
    
    saveMCPConfig(newConfig);
    setConfig(newConfig); // Local update
    if (onConfigChange) onConfigChange();
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" flexGrow={1}>
       <Text bold color="cyan"> Exposed Projects </Text>
       <Text color="dim"> Select projects to expose via the MCP server. Use Space to toggle, Enter to save.</Text>
       <Box marginTop={1} flexDirection="column">
        <SimpleSelect 
            key={JSON.stringify(initialSelected)} // Force re-render on external updates if any
            message="" // No header needed inside the view
            items={projectItems}
            isMulti={true}
            initialSelected={initialSelected}
            onSelect={() => {}} 
            onSubmit={handleSubmit}
            onCancel={() => {}} // No cancel in tab view, just switch tabs
        />
       </Box>
    </Box>
  );
};
