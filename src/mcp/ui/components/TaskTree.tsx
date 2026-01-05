import React from 'react';
import { Box, Text } from 'ink';
import { projectKey } from '../../../lib/project-utils';
import { TaskRow } from './TaskRow';
import type { TaskMeta } from '../lib/tasks-fs';
import type { DetectedProject } from '../../../lib/detection';

export type TaskViewRow =
  | { kind: 'project'; project: DetectedProject; isCurrentProject: boolean }
  | { kind: 'task'; project: DetectedProject; task: TaskMeta; isLastTask: boolean };

interface TaskTreeProps {
  flattenedRows: TaskViewRow[];
  selectedIndex: number;
  expanded: Set<string>;
  taskCache: Record<string, TaskMeta[]>;
  driftReports: Record<string, any>;
}

export const TaskTree = ({
  flattenedRows,
  selectedIndex,
  expanded,
  taskCache,
  driftReports
}: TaskTreeProps) => {
  return (
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
  );
};
