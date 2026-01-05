import React from 'react';
import { Box, Text } from 'ink';
import type { TaskMeta, AgentTodos } from '../lib/tasks-fs';
import {
  getStatusColor,
  getChecklistProgress,
  getCheckbox,
  getProgressBar,
  getPhaseIcon,
  getTodoStatusIcon,
  formatRelativeTime,
} from '../ui-helpers';

interface TaskDetailsProps {
  task: TaskMeta | null;
  agentTodos?: AgentTodos | null;
}

export const TaskDetails = ({ task, agentTodos }: TaskDetailsProps) => {
  if (!task) {
    return (
      <Box flexDirection="column" justifyContent="center" alignItems="center" gap={1} flexGrow={1}>
        <Text bold color="dim">─ No Task Selected ─</Text>
        <Text color="dim">Use ↑/↓ to navigate</Text>
        <Text color="dim">Enter to expand projects</Text>
        <Text color="dim">'s' to cycle task status</Text>
      </Box>
    );
  }

  const progress = getChecklistProgress(task.checklist || []);

  return (
    <Box flexDirection="column">
      {/* Title & Summary */}
      <Box marginBottom={0} flexDirection="column">
        <Text bold color="cyan">{task.title || task.task_slug}</Text>
        {task.summary && (
          <Box marginTop={0}>
            <Text color="white" wrap="wrap">
              {task.summary.length > 150 ? task.summary.substring(0, 147) + '...' : task.summary}
            </Text>
          </Box>
        )}
      </Box>

      <Box marginY={0}>
        <Text color="dim">────────────────────────────────────────</Text>
      </Box>

      {/* Status Section */}
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold color="white">📋 STATUS</Text>
          <Text color={getStatusColor(task.status || '')}>{task.status?.toUpperCase() || 'UNKNOWN'}</Text>
        </Box>
        <Box flexDirection="column" marginTop={0} marginLeft={1}>
          <Box>
            <Text color="dim">Updated: </Text>
            <Text>{formatRelativeTime(task.updated_at || '')}</Text>
          </Box>
          {task.tags && task.tags.length > 0 && (
            <Box>
              <Text color="dim">Tags:    </Text>
              <Text color="cyan">{task.tags.join(', ')}</Text>
            </Box>
          )}
        </Box>
      </Box>

      <Box marginY={0}>
        <Text color="dim">────────────────────────────────────────</Text>
      </Box>

      {/* Checklist Section */}
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold color="white">📋 CHECKLIST </Text>
          {progress.total > 0 && (
            <Text color="dim">
              {getProgressBar(progress.percentage, 8)} {progress.completed}/{progress.total}
            </Text>
          )}
        </Box>
        <Box flexDirection="column" marginLeft={1}>
          {(task.checklist || []).length === 0 ? (
            <Text color="dim">No checklist items</Text>
          ) : (
            (task.checklist || []).slice(0, 10).map((c: any, i: number) => {
              const isDone = c.status === 'done';
              return (
                <Text key={c.id || i} color={isDone ? 'dim' : 'white'}>
                  <Text color={isDone ? 'green' : 'dim'}>{getCheckbox(c.status || 'pending')} </Text>
                  {(c.label || c.id || 'item').substring(0, 40)}
                </Text>
              );
            })
          )}
          {(task.checklist || []).length > 10 && (
            <Text color="dim">  ...and {(task.checklist || []).length - 10} more</Text>
          )}
        </Box>
      </Box>

      <Box marginY={0}>
        <Text color="dim">────────────────────────────────────────</Text>
      </Box>

      {/* Agent Todos Section (from agent-todos.json) */}
      {agentTodos && agentTodos.items.length > 0 && (
        <>
          <Box flexDirection="column">
            <Box>
              <Text bold color="white">🎯 AGENT TODOS </Text>
              <Text color="dim">({agentTodos.agent} • {agentTodos.phase})</Text>
            </Box>
            <Box flexDirection="column" marginLeft={1}>
              {agentTodos.items.slice(0, 5).map((item, i) => (
                <Text key={item.id || i}>
                  <Text color={item.status === 'completed' ? 'green' : item.status === 'in_progress' ? 'yellow' : 'dim'}>
                    {getTodoStatusIcon(item.status)}{' '}
                  </Text>
                  <Text color={item.status === 'completed' ? 'dim' : 'white'}>
                    {item.content.substring(0, 40)}
                  </Text>
                </Text>
              ))}
              {agentTodos.items.length > 5 && (
                <Text color="dim">  ...and {agentTodos.items.length - 5} more</Text>
              )}
            </Box>
          </Box>
          <Box marginY={0}>
            <Text color="dim">────────────────────────────────────────</Text>
          </Box>
        </>
      )}

      {/* Agents Section */}
      <Box flexDirection="column">
        <Text bold color="white">🤖 AGENTS</Text>
        <Box flexDirection="column" marginLeft={1}>
          {!task.agents || Object.keys(task.agents).length === 0 ? (
            <Text color="dim">No agent activity yet</Text>
          ) : (
            Object.entries(task.agents).map(([agent, info]: any) => (
              <Box key={agent}>
                <Text>{getPhaseIcon(agent)} </Text>
                <Text color="dim">{agent}: </Text>
                {info?.status === 'complete' && <Text color="green">✓ </Text>}
                {info?.status === 'in_progress' && <Text color="yellow">⟳ </Text>}
                {info?.status === 'pending' && <Text color="dim">○ </Text>}
                {info?.blocked && <Text color="red">✕ </Text>}
                <Text color={info?.status === 'complete' ? 'dim' : 'white'}>
                  {info?.status || 'pending'}
                </Text>
              </Box>
            ))
          )}
        </Box>
      </Box>
    </Box>
  );
};
