
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import * as fs from 'fs';
import * as path from 'path';
import { SimpleSelect } from './components/SimpleSelect';
import { saveMCPConfig, setProjectConfig } from '../config';
import type { MCPConfig } from '../types';
import type { DetectedProject } from '../../lib/detection';
import { useConfig } from './ConfigContext';
import { indexingJobs } from '../services/indexing-jobs';
import { findProjectConfig } from '../config-utils';
import { projectKey, sortProjects, formatProjectLabel } from '../../lib/project-utils';
import { formatRelativeTime } from './ui-helpers';
import { ProjectsHeader, ProjectsFooter } from './components/ProjectViews';
import { getIndexStats } from './lib/projects';

interface ProjectsViewProps {
  config: MCPConfig;
  projects: DetectedProject[];
  onConfigChange?: () => void;
  workspacePath: string;
}

export const ProjectsView = ({ config: initialConfig, projects: allProjects, onConfigChange, workspacePath }: ProjectsViewProps) => {
  const { driftReports, checkAllDrift } = useConfig();
  const [config, setConfig] = useState(initialConfig);
  const [indexingStats, setIndexingStats] = useState<Record<string, any>>({});

  const sortedProjects = useMemo(() => {
    return sortProjects(allProjects, workspacePath);
  }, [allProjects, workspacePath]);

  // Indexing status polling
  useEffect(() => {
    const updateStats = () => {
      const next: Record<string, any> = {};
      for (const p of allProjects) {
        const projConfig = findProjectConfig(config, { name: p.name, path: p.path });
        const enabled = projConfig?.semanticSearch?.enabled || (p as any).semanticSearchEnabled || false;
        const prog = indexingJobs.getProgress(p.name);
        next[p.name] = { enabled, ...prog };
      }
      setIndexingStats(next);
    };

    updateStats();
    const interval = setInterval(updateStats, 2000);
    return () => clearInterval(interval);
  }, [allProjects, config]);

  useInput((input, key) => {
    if (input === 'u') {
      checkAllDrift();
      return;
    }

    if (input === 'a') {
      const newConfig = {
        ...config,
        defaults: {
          ...config.defaults,
          includeNew: !config.defaults.includeNew,
        },
      };
      saveMCPConfig(newConfig);
      setConfig(newConfig);
      onConfigChange?.();
    }
  });

  const projectItems = useMemo(() => {
    return sortedProjects.map(p => {
      const projectConfig = findProjectConfig(config, { name: p.name, path: p.path });

      const isExposed = projectConfig ? projectConfig.expose : config.defaults.includeNew;
      const drift = driftReports[p.path];
      const idx = indexingStats[p.name];
      const stats = getIndexStats(p);
      const isCurrentProject = p.path === workspacePath;

      let label = formatProjectLabel(p);
      if (isCurrentProject) {
        label += ' (current)';
      }
      if (drift?.hasDrift) {
        label += ' ⚠';
      }

      // Build stats row
      let statsRow = '';
      if (idx?.state === 'running') {
        statsRow = `  ⟳ Indexing... ${idx.itemsDone}/${idx.itemsTotal ?? '?'}`;
      } else if (idx?.state === 'failed') {
        statsRow = '  ✕ Index failed';
      } else if (stats.knowledgeCount > 0 || stats.codeCount > 0) {
        const parts = [];
        if (stats.knowledgeCount > 0) parts.push(`📚 ${stats.knowledgeCount} docs`);
        if (stats.codeCount > 0) parts.push(`💻 ${stats.codeCount} files`);
        if (stats.lastIndexed) parts.push(`🕐 ${formatRelativeTime(stats.lastIndexed)}`);
        statsRow = `  📊 ${parts.join(' │ ')}`;
      } else if (isExposed) {
        statsRow = '  📊 Not indexed';
      }

      // Combine label with stats
      const fullLabel = statsRow ? `${label}\n${statsRow}` : label;

      return {
        label: fullLabel,
        value: p.path,
        key: p.path,
        exposed: isExposed,
        indexing: idx,
        isCurrentProject,
      };
    });
  }, [sortedProjects, config, driftReports, indexingStats, workspacePath]);

  const initialSelected = useMemo(() => {
    return projectItems.filter(p => p.exposed).map(p => p.value);
  }, [projectItems]);

  const handleSubmit = (selectedIds: string[]) => {
    let newConfig = { ...config };

    projectItems.forEach(item => {
      const isSelected = selectedIds.includes(item.value);
      const project = allProjects.find(p => p.path === item.value);

      if (project) {
        const existingConfig = findProjectConfig(newConfig, { name: project.name, path: project.path });
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
    setConfig(newConfig);
    onConfigChange?.();
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="white" flexGrow={1}>
      <ProjectsHeader autoExpose={config.defaults.includeNew} />

      <Box marginTop={1} paddingX={1}>
        <Text color="dim">Manage which projects are exposed to the MCP server.</Text>
      </Box>

      <Box marginTop={1} paddingX={1} flexDirection="column" flexGrow={1}>
        <SimpleSelect
          key={JSON.stringify(initialSelected) + config.defaults.includeNew + JSON.stringify(indexingStats)}
          message=""
          items={projectItems}
          isMulti={true}
          initialSelected={initialSelected}
          onSelect={() => { }}
          onSubmit={handleSubmit}
          onCancel={() => { }}
        />
      </Box>
      
      <ProjectsFooter />
    </Box>
  );
};
