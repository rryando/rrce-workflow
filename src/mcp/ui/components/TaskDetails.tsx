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
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="cyan">{task.title || task.task_slug}</Text>
        {task.summary && (
          <Text color="white" wrap="wrap">
            {task.summary.length > 100 ? task.summary.substring(0, 97) + '...' : task.summary}
          </Text>
        )}
      </Box>

      <Text dimColor>────────────────────────────────────</Text>

      {/* Status Section */}
      <Box marginTop={1} flexDirection="column">
        <Text bold color="white">📋 STATUS</Text>
        <Box flexDirection="column" marginTop={0} marginLeft={1}>
          <Box>
            <Text color="dim">Status:  </Text>
            <Text color={getStatusColor(task.status || '')}>{task.status || 'unknown'}</Text>
          </Box>
          <Box>
            <Text color="dim">Updated: </Text>
            <Text>{formatRelativeTime(task.updated_at || '')}</Text>
          </Box>
          {task.tags && task.tags.length > 0 && (
            <Box>
              <Text color="dim">Tags:    </Text>
              {task.tags.map((tag: string, i: number) => (
                <Text key={tag}>
                  <Text color="cyan">{tag}</Text>
                  {i < task.tags!.length - 1 && <Text color="dim">, </Text>}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      <Text dimColor>────────────────────────────────────</Text>

      {/* Checklist Section */}
      <Box marginTop={1} flexDirection="column">
        <Box>
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
            (task.checklist || []).slice(0, 8).map((c: any, i: number) => {
              const isDone = c.status === 'done';
              return (
                <Text key={c.id || i} color={isDone ? 'dim' : 'white'}>
                  <Text color={isDone ? 'green' : 'dim'}>{getCheckbox(c.status || 'pending')} </Text>
                  {(c.label || c.id || 'item').substring(0, 35)}
                </Text>
              );
            })
          )}
          {(task.checklist || []).length > 8 && (
            <Text color="dim">...and {(task.checklist || []).length - 8} more</Text>
          )}
        </Box>
      </Box>

      <Text dimColor>────────────────────────────────────</Text>

      {/* Agent Todos Section (from agent-todos.json) */}
      {agentTodos && agentTodos.items.length > 0 && (
        <>
          <Box marginTop={1} flexDirection="column">
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
                    {item.content.substring(0, 35)}
                  </Text>
                </Text>
              ))}
              {agentTodos.items.length > 5 && (
                <Text color="dim">...and {agentTodos.items.length - 5} more</Text>
              )}
            </Box>
          </Box>
          <Text dimColor>────────────────────────────────────</Text>
        </>
      )}

      {/* Agents Section */}
      <Box marginTop={1} flexDirection="column">
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
