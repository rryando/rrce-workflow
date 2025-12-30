
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
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
  
  useInput((input) => {
    if (input === 'a') {
      const newConfig = { 
        ...config, 
        defaults: { 
          ...config.defaults, 
          includeNew: !config.defaults.includeNew 
        } 
      };
      saveMCPConfig(newConfig);
      setConfig(newConfig);
      if (onConfigChange) onConfigChange();
    }
  });

  // Merge with config to determine status
  const projectItems = allProjects.map(p => {
    // Check if explicitly configured
    const projectConfig = config.projects.find(c => 
        (c.path && c.path === p.path) || 
        (p.source === 'global' && c.name === p.name) ||
        (!c.path && c.name === p.name)
    );
    // Is exposed?
    // If explicit config exists, use it. Else use default.
    const isExposed = projectConfig ? projectConfig.expose : config.defaults.includeNew;
    
    return {
        label: p.name + ` (${p.source})` + (p.path ? ` - ${p.path}` : ''),
        value: p.path, // Standardized ID: Use root path
        key: p.path,
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
        const project = allProjects.find(p => p.path === item.value);
        
        // Only update if changed or new
        if (project) {
             // For global projects, check if we already have a configured path (the local path)
             const existingConfig = newConfig.projects.find(p => p.name === project.name);
             const projectPath = (project.source === 'global' && existingConfig?.path) 
                ? existingConfig.path 
                : project.path;

             newConfig = setProjectConfig(
                newConfig,
                project.name,
                isSelected,
                undefined, 
                projectPath
            );
        }
    });
    
    saveMCPConfig(newConfig);
    setConfig(newConfig); // Local update
    if (onConfigChange) onConfigChange();
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" flexGrow={1}>
       <Box justifyContent="space-between">
         <Text bold color="cyan"> Exposed Projects </Text>
         <Box>
           <Text dimColor>Auto-expose new: </Text>
           <Text color={config.defaults.includeNew ? "green" : "red"}>
             {config.defaults.includeNew ? "ON" : "OFF"}
           </Text>
           <Text dimColor> (Press 'a' to toggle)</Text>
         </Box>
       </Box>
       
       <Text color="dim"> Select projects to expose via the MCP server. Use Space to toggle, Enter to save.</Text>
       <Box marginTop={1} flexDirection="column">
        <SimpleSelect 
            key={JSON.stringify(initialSelected) + config.defaults.includeNew} // Force re-render on selection OR default changes
            message="" 
            items={projectItems}
            isMulti={true}
            initialSelected={initialSelected}
            onSelect={() => {}} 
            onSubmit={handleSubmit}
            onCancel={() => {}} 
        />
       </Box>
    </Box>
  );
};
