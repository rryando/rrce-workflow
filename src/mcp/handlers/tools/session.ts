import {
  startSession,
  endSession,
  updateAgentTodos,
  cleanStaleSessions
} from '../../resources';

export const sessionTools = [
  {
    name: 'start_session',
    description: 'Start an agent session for active task tracking. Call this when beginning work on a task phase.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        task_slug: { type: 'string', description: 'The slug of the task' },
        agent: { type: 'string', description: 'Agent type: research, planning, executor, or documentation' },
        phase: { type: 'string', description: 'Current phase description (e.g., "clarification", "task breakdown")' },
      },
      required: ['project', 'task_slug', 'agent', 'phase'],
    },
  },
  {
    name: 'end_session',
    description: 'End an agent session. Call this before emitting completion signal.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        task_slug: { type: 'string', description: 'The slug of the task' },
      },
      required: ['project', 'task_slug'],
    },
  },
  {
    name: 'cleanup_sessions',
    description: 'Remove stale agent sessions (no heartbeat for 30+ minutes). Call this when the dashboard shows ghost sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
      },
      required: ['project'],
    },
  },
  {
    name: 'update_agent_todos',
    description: 'Update the agent todo list for a task. Use this to track granular work items during a phase.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        task_slug: { type: 'string', description: 'The slug of the task' },
        phase: { type: 'string', description: 'Current phase' },
        agent: { type: 'string', description: 'Agent type' },
        items: { 
          type: 'array', 
          description: 'Todo items array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
              priority: { type: 'string', enum: ['high', 'medium', 'low'] }
            },
            required: ['id', 'content', 'status', 'priority']
          }
        },
      },
      required: ['project', 'task_slug', 'phase', 'agent', 'items'],
    },
  },
];

export async function handleSessionTool(name: string, args: Record<string, any> | undefined) {
  if (!args) {
    return { content: [{ type: 'text', text: `Tool '${name}' requires arguments.` }], isError: true };
  }

  switch (name) {
    case 'start_session': {
      const params = args as { project: string; task_slug: string; agent: string; phase: string };
      const result = startSession(params.project, params.task_slug, params.agent as any, params.phase);
      return { content: [{ type: 'text', text: result.message }], isError: !result.success };
    }

    case 'end_session': {
      const params = args as { project: string; task_slug: string };
      const result = endSession(params.project, params.task_slug);
      return { content: [{ type: 'text', text: result.message }], isError: !result.success };
    }

    case 'cleanup_sessions': {
      const params = args as { project: string };
      const result = cleanStaleSessions(params.project);
      const msg = result.cleaned.length > 0
        ? `Cleaned ${result.cleaned.length} stale session(s): ${result.cleaned.join(', ')}`
        : 'No stale sessions found.';
      return { content: [{ type: 'text', text: msg }] };
    }

    case 'update_agent_todos': {
      const params = args as { project: string; task_slug: string; phase: string; agent: string; items: any[] };
      const result = updateAgentTodos(params.project, params.task_slug, params.phase, params.agent, params.items);
      return { content: [{ type: 'text', text: result.message }], isError: !result.success };
    }

    default:
      return null;
  }
}
