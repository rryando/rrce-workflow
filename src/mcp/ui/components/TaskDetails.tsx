import React from 'react';
import { Box, Text } from 'ink';
import type { TaskMeta } from '../lib/tasks-fs';
import {
  getStatusColor,
  getChecklistProgress,
  getCheckbox,
  getProgressBar,
} from '../ui-helpers';

interface TaskDetailsProps {
  task: TaskMeta | null;
}

export const TaskDetails = ({ task }: TaskDetailsProps) => {
  if (!task) {
    return (
      <Box flexDirection="column" justifyContent="center" alignItems="center" gap={1} flexGrow={1}>
        <Text bold color="dim">─ No Task Selected ─</Text>
        <Text color="dim">Use ↑/↓ to navigate, Enter to expand projects</Text>
        <Text color="dim">Press 's' to cycle task status</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} flexDirection="column">
        <Text bold color="cyan">{task.title || task.task_slug}</Text>
        {task.summary && <Text color="white">{task.summary}</Text>}
      </Box>

      <Text dimColor>──────────────────────────────────────────</Text>

      <Box marginTop={1} paddingX={1} flexDirection="column">
        <Text bold color="white">📋 STATUS</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text><Text color="dim">Status: </Text> <Text color={getStatusColor(task.status || '')}>{task.status || 'unknown'}</Text></Text>
          <Text><Text color="dim">Updated:</Text> <Text>{task.updated_at || '—'}</Text></Text>
          <Text>
            <Text color="dim">Tags:   </Text> {' '}
            {(() => {
              const tags = task.tags || [];
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
        {task.checklist && task.checklist.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Box marginBottom={1}>
              <Text backgroundColor="white">{getProgressBar(getChecklistProgress(task.checklist).percentage)}</Text>
              <Text dimColor> {' '}{getChecklistProgress(task.checklist).completed}/{getChecklistProgress(task.checklist).total} ({getChecklistProgress(task.checklist).percentage}%)</Text>
            </Box>
          </Box>
        )}
        {(task.checklist || []).length === 0 ? (
          <Text color="dim">—</Text>
        ) : (
          (task.checklist || []).slice(0, 12).map((c: any, i: number) => {
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
          {!task.agents ? (
            <Text color="dim">—</Text>
          ) : (
            Object.entries(task.agents).map(([agent, info]: any) => (
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
  );
};
