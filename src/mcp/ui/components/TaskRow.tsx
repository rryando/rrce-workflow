import React from 'react';
import { Box, Text } from 'ink';
import type { DetectedProject } from '../../../lib/detection';
import type { TaskMeta } from '../lib/tasks-fs';
import {
  getStatusIcon,
  getStatusColor,
  getFolderIcon,
} from '../ui-helpers';
import { formatProjectLabel, projectKey } from '../../../lib/project-utils';

interface TaskRowProps {
  row: { kind: 'project'; project: DetectedProject } | { kind: 'task'; project: DetectedProject; task: TaskMeta };
  isSelected: boolean;
  isExpanded: boolean;
  taskCount: number;
  hasDrift: boolean;
}

export const TaskRow = ({ row, isSelected, isExpanded, taskCount, hasDrift }: TaskRowProps) => {
  if (row.kind === 'project') {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={isSelected ? 'cyan' : 'white'}>{isSelected ? '> ' : '  '}</Text>
          <Text color={isSelected ? 'cyan' : 'white'}>
            {getFolderIcon(isExpanded)} {formatProjectLabel(row.project)}
          </Text>
          {hasDrift && <Text color="magenta"> ⚠</Text>}
          <Text color="dim"> {taskCount > 0 ? `(${taskCount})` : ''}</Text>
        </Box>
      </Box>
    );
  }

  const taskLabel = row.task.title || row.task.task_slug;
  const status = row.task.status || '';
  
  return (
    <Box>
      <Text color={isSelected ? 'cyan' : 'white'}>{isSelected ? '> ' : '  '}</Text>
      <Text color="dim">    - </Text>
      <Text color={isSelected ? 'cyan' : 'white'}>{taskLabel}</Text>
      {row.task.task_slug !== '__none__' && (
        <Text backgroundColor={getStatusColor(status)} color="black">
          {` ${getStatusIcon(status)} ${status.toUpperCase().replace('_', ' ')} `}
        </Text>
      )}
    </Box>
  );
};
