
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DetectedProject } from '../../lib/detection';
import type { TaskMeta, TaskStatus } from './lib/tasks-fs';
import { listProjectTasks, updateTaskStatus } from './lib/tasks-fs';
import { useConfig } from './ConfigContext';
import { projectKey, sortProjects } from '../../lib/project-utils';
import { TaskRow } from './components/TaskRow';
import { TaskDetails } from './components/TaskDetails';

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

export const TasksView = ({ projects: allProjects, workspacePath }: TasksViewProps) => {
  const { driftReports } = useConfig();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [taskCache, setTaskCache] = useState<Record<string, TaskMeta[]>>({});
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const sortedProjects = useMemo(() => {
    return sortProjects(allProjects, workspacePath);
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
              const k = projectKey(row.project);
              return (
                <TaskRow 
                  key={row.kind === 'project' ? `p:${k}` : `t:${k}:${row.task.task_slug}`}
                  row={row}
                  isSelected={idx === selectedIndex}
                  isExpanded={expanded.has(k)}
                  taskCount={(taskCache[k] || []).length}
                  hasDrift={!!driftReports[row.project.path]?.hasDrift}
                />
              );
            })
          )}

          <Box marginTop={1}>
            <Text color="gray">▲/▼ navigate • Enter expand/collapse • s cycle status • R refresh</Text>
          </Box>
        </Box>

        <Box flexDirection="column" width="45%" paddingLeft={2}>
          <TaskDetails task={selectedTask} />
        </Box>
      </Box>
    </Box>
  );
};
