
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

  // Tasks-mode flattened rows with metadata
  type Row =
    | { kind: 'project'; project: DetectedProject; isCurrentProject: boolean }
    | { kind: 'task'; project: DetectedProject; task: TaskMeta; isLastTask: boolean };

  const flattenedRows: Row[] = useMemo(() => {
    const rows: Row[] = [];
    for (const p of sortedProjects) {
      const isCurrentProject = p.path === workspacePath;
      rows.push({ kind: 'project', project: p, isCurrentProject });
      
      const k = projectKey(p);
      if (!expanded.has(k)) continue;
      
      const tasks = taskCache[k] || [];
      tasks.forEach((t, idx) => {
        rows.push({ 
          kind: 'task', 
          project: p, 
          task: t, 
          isLastTask: idx === tasks.length - 1 
        });
      });
      
      if (tasks.length === 0) {
        rows.push({ 
          kind: 'task', 
          project: p, 
          task: { task_slug: '__none__', title: '(no tasks)', status: '' },
          isLastTask: true
        });
      }
    }
    return rows;
  }, [sortedProjects, expanded, taskCache, workspacePath]);

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
      if (row?.kind === 'task' && row.task.task_slug !== '__none__') {
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
  
  // Count totals
  const totalTasks = Object.values(taskCache).flat().length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="white" flexGrow={1}>
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between" borderBottom>
        <Box>
          <Text bold color="cyan">⚙ Tasks</Text>
          <Text color="dim"> │ </Text>
          <Text>{sortedProjects.length} projects</Text>
          <Text color="dim"> • </Text>
          <Text>{totalTasks} tasks</Text>
        </Box>
        <Text color="dim">v0.3.14</Text>
      </Box>

      {/* Error line */}
      {errorLine && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">⚠ {errorLine}</Text>
        </Box>
      )}

      {/* Main content: Tree + Details */}
      <Box flexDirection="row" flexGrow={1}>
        {/* Tree pane */}
        <Box flexDirection="column" width="50%" borderStyle="single" borderColor="dim" borderRight paddingX={1}>
          {flattenedRows.length === 0 ? (
            <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
              <Text color="dim">No projects detected.</Text>
              <Text color="dim">Run the wizard to set up projects.</Text>
            </Box>
          ) : (
            <Box flexDirection="column" marginTop={1}>
              {flattenedRows.map((row, idx) => {
                const k = projectKey(row.project);
                const isCurrentProject = row.kind === 'project' ? row.isCurrentProject : false;
                const isLastTask = row.kind === 'task' ? row.isLastTask : false;
                
                return (
                  <TaskRow 
                    key={row.kind === 'project' ? `p:${k}` : `t:${k}:${row.task.task_slug}`}
                    row={row}
                    isSelected={idx === selectedIndex}
                    isExpanded={expanded.has(k)}
                    taskCount={(taskCache[k] || []).length}
                    hasDrift={!!driftReports[row.project.path]?.hasDrift}
                    isCurrentProject={isCurrentProject}
                    isLastTask={isLastTask}
                  />
                );
              })}
            </Box>
          )}
        </Box>

        {/* Details pane */}
        <Box flexDirection="column" width="50%" paddingX={1} marginTop={1}>
          <TaskDetails task={selectedTask} />
        </Box>
      </Box>

      {/* Footer */}
      <Box paddingX={1} justifyContent="space-between" borderTop>
        <Text color="dim">↑↓:Nav  Enter:Expand  s:Cycle Status  R:Refresh</Text>
        <Text color="dim">Press 'q' to exit</Text>
      </Box>
    </Box>
  );
};
