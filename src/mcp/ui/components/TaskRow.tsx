import React from 'react';
import { Box, Text } from 'ink';
import type { DetectedProject } from '../../../lib/detection';
import type { TaskMeta } from '../lib/tasks-fs';
import {
  getStatusIcon,
  getStatusColor,
  getFolderIcon,
  getTreeBranch,
  getPhaseIcon,
  getAgentStatusIcon,
  getProgressBar,
  getChecklistProgress,
  formatRelativeTime,
} from '../ui-helpers';
import { formatProjectLabel } from '../../../lib/project-utils';

interface TaskRowProps {
  row: { kind: 'project'; project: DetectedProject } | { kind: 'task'; project: DetectedProject; task: TaskMeta };
  isSelected: boolean;
  isExpanded: boolean;
  taskCount: number;
  hasDrift: boolean;
  isCurrentProject?: boolean;
  isLastTask?: boolean;
}

/**
 * Get the current active agent phase from task.agents
 */
function getActiveAgent(task: TaskMeta): { agent: string; status: string } | null {
  if (!task.agents) return null;
  
  // Check for in_progress agent first
  for (const [agent, info] of Object.entries(task.agents)) {
    if (info?.status === 'in_progress') {
      return { agent, status: 'in_progress' };
    }
  }
  
  // Find the latest completed agent
  const agentOrder = ['documentation', 'executor', 'planning', 'research'];
  for (const agent of agentOrder) {
    if (task.agents[agent]?.status === 'complete') {
      return { agent, status: 'complete' };
    }
  }
  
  return null;
}

export const TaskRow = ({ 
  row, 
  isSelected, 
  isExpanded, 
  taskCount, 
  hasDrift,
  isCurrentProject = false,
  isLastTask = false
}: TaskRowProps) => {
  if (row.kind === 'project') {
    const projectColor = isSelected ? 'cyan' : (isCurrentProject ? 'yellow' : 'white');
    const isBold = isSelected || isCurrentProject;
    
    return (
      <Box>
        <Text color={isSelected ? 'cyan' : 'dim'}>{isSelected ? '▸ ' : '  '}</Text>
        <Text bold={isBold} color={projectColor}>
          {getFolderIcon(isExpanded)} {formatProjectLabel(row.project)}
        </Text>
        {isCurrentProject && <Text color="yellow" dimColor> (current)</Text>}
        {hasDrift && <Text color="magenta"> ⚠</Text>}
        <Text color="dim"> {taskCount > 0 ? `[${taskCount}]` : ''}</Text>
      </Box>
    );
  }

  // Task row
  const task = row.task;
  const taskLabel = task.title || task.task_slug;
  const status = task.status || '';
  const isPlaceholder = task.task_slug === '__none__';
  
  // Get tree branch character
  const branch = getTreeBranch(isLastTask);
  
  // Get active agent info
  const activeAgent = getActiveAgent(task);
  
  // Get checklist progress
  const progress = getChecklistProgress(task.checklist || []);
  
  // Get relative time
  const relativeTime = task.updated_at ? formatRelativeTime(task.updated_at) : '';

  if (isPlaceholder) {
    return (
      <Box>
        <Text color="dim">  {branch} </Text>
        <Text color="dim" italic>{taskLabel}</Text>
      </Box>
    );
  }
  
  return (
    <Box>
      {/* Selection indicator */}
      <Text color={isSelected ? 'cyan' : 'dim'}>{isSelected ? '▸ ' : '  '}</Text>
      
      {/* Tree branch */}
      <Text color="dim">{branch} </Text>
      
      {/* Task icon and title */}
      <Text color={isSelected ? 'cyan' : 'white'}>📋 </Text>
      <Box flexGrow={1}>
        <Text bold={isSelected} color={isSelected ? 'cyan' : 'white'}>
          {taskLabel.length > 25 ? taskLabel.substring(0, 22) + '...' : taskLabel}
        </Text>
      </Box>
      
      {/* Phase indicator */}
      {activeAgent && (
        <Text>
          <Text color="dim"> </Text>
          <Text>{getPhaseIcon(activeAgent.agent)}</Text>
          <Text color={activeAgent.status === 'in_progress' ? 'yellow' : 'green'}>
            {getAgentStatusIcon(activeAgent.status)}
          </Text>
        </Text>
      )}
      
      {/* Progress bar (if has checklist items) */}
      {progress.total > 0 && (
        <Text color="dim">
          {' '}{getProgressBar(progress.percentage, 6)} {progress.completed}/{progress.total}
        </Text>
      )}
      
      {/* Relative time */}
      {relativeTime && relativeTime !== '—' && (
        <Text color="dim"> {relativeTime}</Text>
      )}
      
      {/* Status badge for non-active tasks - Quieter version */}
      {!activeAgent && status && (
        <Text color={getStatusColor(status)}>
          {` ${getStatusIcon(status)} ${status}`}
        </Text>
      )}
    </Box>
  );
};
