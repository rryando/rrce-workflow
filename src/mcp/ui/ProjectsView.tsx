
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { SimpleSelect } from './components/SimpleSelect';
import { saveMCPConfig, setProjectConfig } from '../config';
import type { MCPConfig } from '../types';
import type { DetectedProject } from '../../lib/detection';
import type { TaskMeta, TaskStatus } from './lib/tasks-fs';
import { listProjectTasks, updateTaskStatus } from './lib/tasks-fs';
import { useConfig } from './ConfigContext';
import type { DriftReport } from '../../lib/drift-service';

interface ProjectsViewProps {
  config: MCPConfig;
  projects: DetectedProject[];
  onConfigChange?: () => void;
}

type Mode = 'expose' | 'tasks';

const STATUS_CYCLE: TaskStatus[] = ['pending', 'in_progress', 'blocked', 'complete'];

function nextStatus(current: string | undefined): TaskStatus {
  const idx = STATUS_CYCLE.indexOf((current || '') as TaskStatus);
  if (idx === -1) return STATUS_CYCLE[0]!;
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]!;
}

function projectKey(p: DetectedProject): string {
  // Use a stable key; for global projects sourcePath is preferable but keep a hard fallback.
  return p.sourcePath ?? p.path;
}

function formatProjectLabel(p: DetectedProject, drift?: DriftReport): string {
  const root = p.sourcePath ?? p.path;
  const driftLabel = drift?.hasDrift ? ' [UPDATE AVAILABLE]' : '';
  const label = `${p.name} (${p.source})${root ? ` - ${root}` : ''}`;
  
  if (drift?.hasDrift) {
      return `${label} ${driftLabel}`;
  }
  return label;
}


export const ProjectsView = ({ config: initialConfig, projects: allProjects, onConfigChange }: ProjectsViewProps) => {
  const { driftReports, checkAllDrift } = useConfig();
  const [config, setConfig] = useState(initialConfig);
  const [mode, setMode] = useState<Mode>('expose');

  // Tasks-mode state
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [taskCache, setTaskCache] = useState<Record<string, TaskMeta[]>>({});
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const sortedProjects = useMemo(() => {
    // Deterministic order
    return [...allProjects].sort((a, b) => {
      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return projectKey(a).localeCompare(projectKey(b));
    });
  }, [allProjects]);

  const refreshTasksForProject = (project: DetectedProject) => {
    const res = listProjectTasks(project);
    setTaskCache(prev => ({ ...prev, [projectKey(project)]: res.tasks }));
  };

  const refreshAllTasks = () => {
    const next: Record<string, TaskMeta[]> = {};
    for (const p of sortedProjects) {
      next[projectKey(p)] = listProjectTasks(p).tasks;
    }
    setTaskCache(next);
  };


  // Global input handler for ProjectsView
  useInput((input, key) => {
    // mode toggle always available
    if (input === 't') {
      setErrorLine(null);
      setMode(prev => (prev === 'expose' ? 'tasks' : 'expose'));
      return;
    }

    if (input === 'u') {
      checkAllDrift();
      return;
    }

    if (mode === 'expose') {
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
      return;
    }

    // Tasks mode key bindings
    if (mode === 'tasks') {
      if (input === 'R') {
        setErrorLine(null);
        refreshAllTasks();
        return;
      }

      if (key.upArrow) {
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : Math.max(0, flattenedRows.length - 1)));
        return;
      }

      if (key.downArrow) {
        setSelectedIndex(prev => (prev < flattenedRows.length - 1 ? prev + 1 : 0));
        return;
      }

      if (key.return) {
        const row = flattenedRows[selectedIndex];
        if (row?.kind === 'project') {
          const k = projectKey(row.project);
          const next = new Set(expanded);
          if (next.has(k)) {
            next.delete(k);
          } else {
            next.add(k);
            // Lazy-load tasks on expand
            refreshTasksForProject(row.project);
          }
          setExpanded(next);
        }
        return;
      }

      if (input === 's') {
        const row = flattenedRows[selectedIndex];
        if (row?.kind === 'task') {
          setErrorLine(null);
          const desired = nextStatus(row.task.status);
          const result = updateTaskStatus(row.project, row.task.task_slug, desired);
          if (!result.ok) {
            setErrorLine(`Failed to update status: ${result.error}`);
            return;
          }
          // Update cache
          setTaskCache(prev => {
            const k = projectKey(row.project);
            const tasks = prev[k] || [];
            const updated = tasks.map(t => (t.task_slug === row.task.task_slug ? result.meta : t));
            return { ...prev, [k]: updated };
          });
        }
        return;
      }
    }
  });

  // Ensure selection always in bounds when rows change
  useEffect(() => {
    setSelectedIndex(prev => {
      if (flattenedRows.length === 0) return 0;
      return Math.min(prev, flattenedRows.length - 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, allProjects, expanded, taskCache]);

  // Expose-mode uses existing SimpleSelect flow
  const projectItems = useMemo(() => {
    return allProjects.map(p => {
      const projectConfig = config.projects.find(c =>
        (c.path && c.path === p.path) ||
        (p.source === 'global' && c.name === p.name) ||
        (!c.path && c.name === p.name)
      );

      const isExposed = projectConfig ? projectConfig.expose : config.defaults.includeNew;
      const drift = driftReports[p.path];

      return {
        label: formatProjectLabel(p, drift),
        value: p.path,
        key: p.path,
        exposed: isExposed,
      };
    });
  }, [allProjects, config, driftReports]);

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

  // Tasks-mode flattened rows
  type Row =
    | { kind: 'project'; project: DetectedProject }
    | { kind: 'task'; project: DetectedProject; task: TaskMeta };

  const flattenedRows: Row[] = useMemo(() => {
    const rows: Row[] = [];
    for (const p of sortedProjects) {
      rows.push({ kind: 'project', project: p });
      const k = projectKey(p);
      if (!expanded.has(k)) continue;
      const tasks = taskCache[k] || [];
      for (const t of tasks) {
        rows.push({ kind: 'task', project: p, task: t });
      }
      if ((taskCache[k] || []).length === 0) {
        // show empty indication as a pseudo-task row
        rows.push({ kind: 'task', project: p, task: { task_slug: '__none__', title: '(no tasks)', status: '' } });
      }
    }
    return rows;
  }, [sortedProjects, expanded, taskCache]);

  const selectedRow = flattenedRows[selectedIndex];
  const selectedTask: TaskMeta | null = selectedRow?.kind === 'task' && selectedRow.task.task_slug !== '__none__' ? selectedRow.task : null;

  if (mode === 'expose') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" flexGrow={1}>
        <Box justifyContent="space-between">
          <Text bold color="cyan"> Projects (Expose Mode) </Text>
          <Box>
            <Text dimColor>Auto-expose new: </Text>
            <Text color={config.defaults.includeNew ? 'green' : 'red'}>
              {config.defaults.includeNew ? 'ON' : 'OFF'}
            </Text>
            <Text dimColor> (Press 'a' to toggle)</Text>
          </Box>
        </Box>

        <Text color="dim"> Space toggles, Enter saves. Press 't' to switch to Tasks Mode.</Text>

        <Box marginTop={1} flexDirection="column">
          <SimpleSelect
            key={JSON.stringify(initialSelected) + config.defaults.includeNew}
            message=""
            items={projectItems}
            isMulti={true}
            initialSelected={initialSelected}
            onSelect={() => { }}
            onSubmit={handleSubmit}
            onCancel={() => { }}
          />
        </Box>
      </Box>
    );
  }

  // Tasks mode UI
  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan" flexGrow={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan"> Projects (Tasks Mode) </Text>
        <Text color="dim">t:Expose  Enter:Expand  s:Status  u:DriftCheck  R:Refresh</Text>
      </Box>

      {errorLine && (
        <Box marginTop={0}>
          <Text color="red">{errorLine}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="row" flexGrow={1}>
        {/* Left pane: tree */}
        <Box flexDirection="column" width="55%">
          {flattenedRows.length === 0 ? (
            <Text color="dim">No projects detected.</Text>
          ) : (
            flattenedRows.map((row, idx) => {
              const isSel = idx === selectedIndex;

              if (row.kind === 'project') {
                const k = projectKey(row.project);
                const isOpen = expanded.has(k);
                const count = (taskCache[k] || []).length;
                const drift = driftReports[row.project.path];
                
                return (
                  <Box key={`p:${k}`} flexDirection="column">
                    <Box>
                      <Text color={isSel ? 'cyan' : 'white'}>{isSel ? '> ' : '  '}</Text>
                      <Text color={isSel ? 'cyan' : 'white'}>
                        {isOpen ? '▾ ' : '▸ '}{formatProjectLabel(row.project, drift)}
                      </Text>
                      <Text color="dim"> {count > 0 ? ` (tasks: ${count})` : ''}</Text>
                    </Box>
                    {isSel && drift?.hasDrift && (
                      <Box marginLeft={4}>
                         <Text color="magenta" dimColor italic>
                           {drift.type === 'version' ? 'New version available. ' : 'Modifications detected. '}
                           Run 'rrce-workflow wizard' to update.
                         </Text>
                      </Box>
                    )}
                  </Box>
                );
              }

              // task
              const taskLabel = row.task.title || row.task.task_slug;
              const status = row.task.status || '';
              return (
                <Box key={`t:${projectKey(row.project)}:${row.task.task_slug}`}>
                  <Text color={isSel ? 'cyan' : 'white'}>{isSel ? '> ' : '  '}</Text>
                  <Text color="dim">    - </Text>
                  <Text color={isSel ? 'cyan' : 'white'}>{taskLabel}</Text>
                  {row.task.task_slug !== '__none__' && (
                    <Text color={status === 'complete' ? 'green' : status === 'blocked' ? 'red' : 'yellow'}>{`  [${status}]`}</Text>
                  )}
                </Box>
              );
            })
          )}

          <Box marginTop={1}>
            <Text color="gray">▲/▼ navigate • Enter expand/collapse • s cycle status • R refresh • t expose mode</Text>
          </Box>
        </Box>

        {/* Right pane: details */}
        <Box flexDirection="column" width="45%" paddingLeft={2}>
          {!selectedTask ? (
            <Text color="dim">Select a task to view details.</Text>
          ) : (
            <Box flexDirection="column">
              <Text bold color="cyan">{selectedTask.title || selectedTask.task_slug}</Text>
              {selectedTask.summary && <Text>{selectedTask.summary}</Text>}

              <Box marginTop={1} flexDirection="column">
                <Text>
                  <Text color="dim">Status: </Text>
                  <Text>{selectedTask.status || 'unknown'}</Text>
                </Text>
                <Text>
                  <Text color="dim">Updated: </Text>
                  <Text>{selectedTask.updated_at || '—'}</Text>
                </Text>
                <Text>
                  <Text color="dim">Tags: </Text>
                  <Text>{(selectedTask.tags || []).join(', ') || '—'}</Text>
                </Text>
              </Box>

              <Box marginTop={1} flexDirection="column">
                <Text bold>Checklist</Text>
                {(selectedTask.checklist || []).length === 0 ? (
                  <Text color="dim">—</Text>
                ) : (
                  (selectedTask.checklist || []).slice(0, 12).map((c: any, i: number) => (
                    <Text key={c.id || i}>
                      <Text color="dim">- </Text>
                      {c.label || c.id || 'item'} <Text color="dim">[{c.status || 'pending'}]</Text>
                    </Text>
                  ))
                )}
              </Box>

              <Box marginTop={1} flexDirection="column">
                <Text bold>Agents</Text>
                {!selectedTask.agents ? (
                  <Text color="dim">—</Text>
                ) : (
                  Object.entries(selectedTask.agents).map(([agent, info]: any) => (
                    <Text key={agent}>
                      <Text color="dim">- {agent}: </Text>
                      {info?.status || '—'}{info?.artifact ? ` (${info.artifact})` : ''}
                    </Text>
                  ))
                )}
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
