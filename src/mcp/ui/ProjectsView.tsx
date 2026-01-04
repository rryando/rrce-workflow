
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { SimpleSelect } from './components/SimpleSelect';
import { saveMCPConfig, setProjectConfig } from '../config';
import type { MCPConfig } from '../types';
import type { DetectedProject } from '../../lib/detection';
import { useConfig } from './ConfigContext';
import { indexingJobs } from '../services/indexing-jobs';
import { findProjectConfig } from '../config-utils';

interface ProjectsViewProps {
  config: MCPConfig;
  projects: DetectedProject[];
  onConfigChange?: () => void;
}

function projectKey(p: DetectedProject): string {
  return p.sourcePath ?? p.path;
}

function formatProjectLabel(p: DetectedProject): string {
  const root = p.sourcePath ?? p.path;
  return `${p.name} (${p.source})${root ? ` - ${root}` : ''}`;
}

export const ProjectsView = ({ config: initialConfig, projects: allProjects, onConfigChange }: ProjectsViewProps) => {
  const { driftReports, checkAllDrift } = useConfig();
  const [config, setConfig] = useState(initialConfig);
  const [indexingStats, setIndexingStats] = useState<Record<string, any>>({});

  const sortedProjects = useMemo(() => {
    return [...allProjects].sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return projectKey(a).localeCompare(projectKey(b));
    });
  }, [allProjects]);

  // Indexing status polling
  useEffect(() => {
    const updateStats = () => {
      const next: Record<string, any> = {};
      for (const p of allProjects) {
        let projConfig = findProjectConfig(config, { name: p.name, path: p.path });
        if (!projConfig && p.source === 'global') {
          projConfig = config.projects.find(c => c.name === p.name);
        }
        const enabled = projConfig?.semanticSearch?.enabled || p.semanticSearchEnabled || false;
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
      const projectConfig = config.projects.find(c =>
        (c.path && c.path === p.path) ||
        (p.source === 'global' && c.name === p.name) ||
        (!c.path && c.name === p.name)
      );

      const isExposed = projectConfig ? projectConfig.expose : config.defaults.includeNew;
      const drift = driftReports[p.path];
      const idx = indexingStats[p.name];

      let label = formatProjectLabel(p);
      if (idx?.state === 'running') {
        label += ` [⟳ Indexing ${idx.itemsDone}/${idx.itemsTotal ?? '?'}]`;
      } else if (idx?.state === 'failed') {
        label += ` [✕ Index Fail]`;
      } else if (idx?.enabled && idx?.state === 'complete') {
        label += ` [✓ Indexed]`;
      }
      if (drift?.hasDrift) {
        label += ` ⚠`;
      }

      return {
        label,
        value: p.path,
        key: p.path,
        exposed: isExposed,
        indexing: idx,
      };
    });
  }, [sortedProjects, config, driftReports, indexingStats]);

  const initialSelected = useMemo(() => {
    return projectItems.filter(p => p.exposed).map(p => p.value);
  }, [projectItems]);

  const handleSubmit = (selectedIds: string[]) => {
    let newConfig = { ...config };

    projectItems.forEach(item => {
      const isSelected = selectedIds.includes(item.value);
      const project = allProjects.find(p => p.path === item.value);

      if (project) {
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
    setConfig(newConfig);
    onConfigChange?.();
  };

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" flexGrow={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="cyan"> Projects </Text>
          <Text dimColor> • </Text>
          <Text color={config.defaults.includeNew ? 'green' : 'red'}>
            Auto-expose: {config.defaults.includeNew ? 'ON' : 'OFF'}
          </Text>
        </Box>
        <Box>
          <Text color="dim">a:Toggle Auto u:Drift Space:Select Enter:Save</Text>
        </Box>
      </Box>

      <Text color="dim"> Manage which projects are exposed to the MCP server. Indexing status shown in-line.</Text>

      <Box marginTop={1} flexDirection="column" flexGrow={1}>
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
      
      <Box marginTop={1} borderStyle="single" borderColor="dim" paddingX={1}>
         <Text color="dim">Use 'rrce-workflow wizard' to manage project exposures and settings.</Text>
      </Box>
    </Box>
  );
};
