
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DetectedProject } from '../../lib/detection';
import type { TaskMeta, TaskStatus } from './lib/tasks-fs';
import { listProjectTasks, updateTaskStatus } from './lib/tasks-fs';
import { useConfig } from './ConfigContext';
import {
  getStatusIcon,
  getStatusColor,
  getChecklistProgress,
  getCheckbox,
  getProgressBar,
  getFolderIcon,
} from './ui-helpers';

interface TasksViewProps {
  projects: DetectedProject[];
  workspacePath: string;
}

const STATUS_CYCLE: TaskStatus[] = ['pending', 'in_progress', 'blocked', 'complete'];

function nextStatus(current: string | undefined): TaskStatus {
  const idx = STATUS_CYCLE.indexOf((current || '') as TaskStatus);
  if (idx === -1) return STATUS_CYCLE[0]!;
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]!;
}

function projectKey(p: DetectedProject): string {
  return p.sourcePath ?? p.path;
}

function formatProjectLabel(p: DetectedProject): string {
  return `${p.name} (${p.source})`;
}

export const TasksView = ({ projects: allProjects, workspacePath }: TasksViewProps) => {
  const { driftReports } = useConfig();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [taskCache, setTaskCache] = useState<Record<string, TaskMeta[]>>({});
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const sortedProjects = useMemo(() => {
    return [...allProjects].sort((a, b) => {
      // workspacePath prioritization
      const aIsCurrent = a.path === workspacePath;
      const bIsCurrent = b.path === workspacePath;
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;

      const byName = a.name.localeCompare(b.name);
      if (byName !== 0) return byName;
      return projectKey(a).localeCompare(projectKey(b));
    });
  }, [allProjects, workspacePath]);

  // Auto-expand current project on mount
  useEffect(() => {
    const current = sortedProjects.find(p => p.path === workspacePath);
    if (current) {
      const k = projectKey(current);
      setExpanded(prev => {
        const next = new Set(prev);
        if (!next.has(k)) {
          next.add(k);
          refreshTasksForProject(current);
        }
        return next;
      });
    }
  }, [sortedProjects, workspacePath]);

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
        rows.push({ kind: 'task', project: p, task: { task_slug: '__none__', title: '(no tasks)', status: '' } });
      }
    }
    return rows;
  }, [sortedProjects, expanded, taskCache]);

  useInput((input, key) => {
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
        setTaskCache(prev => {
          const k = projectKey(row.project);
          const tasks = prev[k] || [];
          const updated = tasks.map(t => (t.task_slug === row.task.task_slug ? result.meta : t));
          return { ...prev, [k]: updated };
        });
      }
      return;
    }
  });

  useEffect(() => {
    setSelectedIndex(prev => {
      if (flattenedRows.length === 0) return 0;
      return Math.min(prev, flattenedRows.length - 1);
    });
  }, [flattenedRows]);

  const selectedRow = flattenedRows[selectedIndex];
  const selectedTask: TaskMeta | null = selectedRow?.kind === 'task' && selectedRow.task.task_slug !== '__none__' ? selectedRow.task : null;

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="white" flexGrow={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="cyan">⚙ Tasks</Text>
          <Text dimColor> • </Text>
          <Text>{sortedProjects.length} projects</Text>
          <Text dimColor> • </Text>
          <Text>{Object.values(taskCache).flat().length} tasks</Text>
        </Box>
        <Text color="dim">↑/↓:Nav Enter:Expand s:Status R:Refresh</Text>
      </Box>

      {errorLine && (
        <Box marginTop={0}>
          <Text color="red">{errorLine}</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="row" flexGrow={1}>
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
                        {getFolderIcon(isOpen)} {formatProjectLabel(row.project)}
                      </Text>
                      {drift?.hasDrift && <Text color="magenta"> ⚠</Text>}
                      <Text color="dim"> {count > 0 ? `(${count})` : ''}</Text>
                    </Box>
                  </Box>
                );
              }

              const taskLabel = row.task.title || row.task.task_slug;
              const status = row.task.status || '';
              return (
                <Box key={`t:${projectKey(row.project)}:${row.task.task_slug}`}>
                  <Text color={isSel ? 'cyan' : 'white'}>{isSel ? '> ' : '  '}</Text>
                  <Text color="dim">    - </Text>
                  <Text color={isSel ? 'cyan' : 'white'}>{taskLabel}</Text>
                  {row.task.task_slug !== '__none__' && (
                    <Text backgroundColor={getStatusColor(status)} color="black">
                      {` ${getStatusIcon(status)} ${status.toUpperCase().replace('_', ' ')} `}
                    </Text>
                  )}
                </Box>
              );
            })
          )}

          <Box marginTop={1}>
            <Text color="gray">▲/▼ navigate • Enter expand/collapse • s cycle status • R refresh</Text>
          </Box>
        </Box>

        <Box flexDirection="column" width="45%" paddingLeft={2}>
          {!selectedTask ? (
            <Box flexDirection="column" justifyContent="center" alignItems="center" gap={1} flexGrow={1}>
              <Text bold color="dim">─ No Task Selected ─</Text>
              <Text color="dim">Use ↑/↓ to navigate, Enter to expand projects</Text>
              <Text color="dim">Press 's' to cycle task status</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Box marginBottom={1} flexDirection="column">
                <Text bold color="cyan">{selectedTask.title || selectedTask.task_slug}</Text>
                {selectedTask.summary && <Text color="white">{selectedTask.summary}</Text>}
              </Box>

              <Text dimColor>──────────────────────────────────────────</Text>

              <Box marginTop={1} paddingX={1} flexDirection="column">
                <Text bold color="white">📋 STATUS</Text>
                <Box flexDirection="column" marginTop={1}>
                  <Text><Text color="dim">Status: </Text> <Text color={getStatusColor(selectedTask.status || '')}>{selectedTask.status || 'unknown'}</Text></Text>
                  <Text><Text color="dim">Updated:</Text> <Text>{selectedTask.updated_at || '—'}</Text></Text>
                  <Text>
                    <Text color="dim">Tags:   </Text> {' '}
                    {(() => {
                      const tags = selectedTask.tags || [];
                      return tags.length > 0
                        ? tags.map((tag: string, i: number) => (
                            <Text key={tag}>
                              <Text color="cyan">{tag}</Text>
                              {i < tags.length - 1 && <Text color="dim">, </Text>}
                            </Text>
                          ))
                        : <Text color="dim">—</Text>;
                    })()}
                  </Text>
                </Box>
              </Box>

              <Box marginTop={1}>
                <Text dimColor>──────────────────────────────────────────</Text>
              </Box>

              <Box marginTop={1} paddingX={1} flexDirection="column">
                <Text bold color="white">📋 CHECKLIST</Text>
                {selectedTask.checklist && selectedTask.checklist.length > 0 && (
                  <Box marginTop={1} flexDirection="column">
                    <Box marginBottom={1}>
                      <Text backgroundColor="white">{getProgressBar(getChecklistProgress(selectedTask.checklist).percentage)}</Text>
                      <Text dimColor> {' '}{getChecklistProgress(selectedTask.checklist).completed}/{getChecklistProgress(selectedTask.checklist).total} ({getChecklistProgress(selectedTask.checklist).percentage}%)</Text>
                    </Box>
                  </Box>
                )}
                {(selectedTask.checklist || []).length === 0 ? (
                  <Text color="dim">—</Text>
                ) : (
                  (selectedTask.checklist || []).slice(0, 12).map((c: any, i: number) => {
                    const isDone = c.status === 'done';
                    return (
                      <Text key={c.id || i} color={isDone ? 'dim' : 'white'}>
                        <Text color={isDone ? 'green' : 'dim'}>{getCheckbox(c.status || 'pending')} </Text>
                        {c.label || c.id || 'item'}
                      </Text>
                    );
                  })
                )}
              </Box>

              <Box marginTop={1}>
                <Text dimColor>──────────────────────────────────────────</Text>
              </Box>

              <Box marginTop={1} paddingX={1} flexDirection="column">
                <Text bold color="white">🤖 AGENTS</Text>
                <Box marginTop={1} flexDirection="column">
                  {!selectedTask.agents ? (
                    <Text color="dim">—</Text>
                  ) : (
                    Object.entries(selectedTask.agents).map(([agent, info]: any) => (
                      <Text key={agent}>
                        <Text color="dim">- {agent}: </Text>
                        {info?.status === 'complete' && <Text color="green">✓</Text>}
                        {info?.status === 'in_progress' && <Text color="yellow">⟳</Text>}
                        {info?.status === 'pending' && <Text color="dim">○</Text>}
                        {info?.blocked && <Text color="red">✕</Text>}
                        <Text color={info?.status === 'complete' ? 'dim' : 'white'}> {info?.status || '—'}</Text>
                        {info?.artifact && <Text dimColor> ({info.artifact})</Text>}
                      </Text>
                    ))
                  )}
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
