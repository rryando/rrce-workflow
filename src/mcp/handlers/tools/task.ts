import {
  getProjectTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  searchTasks,
  validatePhase
} from '../../resources';
import { isValidSlug } from '../../../lib/fs-safe';

export const taskTools = [
  {
    name: 'list_tasks',
    description: 'List all tasks for a project',
    inputSchema: {
      type: 'object',
      properties: { project: { type: 'string', description: 'Name of the project' } },
      required: ['project'],
    },
  },
  {
    name: 'get_task',
    description: 'Get details of a specific task',
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
    name: 'create_task',
    description: 'Create a new task in the project',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        task_slug: { type: 'string', description: 'The slug for the new task (kebab-case)' },
        title: { type: 'string', description: 'The title of the task' },
        summary: { type: 'string', description: 'Brief summary of the task' },
      },
      required: ['project', 'task_slug'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        task_slug: { type: 'string', description: 'The slug of the task' },
        updates: { type: 'object', description: 'The fields to update in meta.json', additionalProperties: true },
      },
      required: ['project', 'task_slug', 'updates'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task from the project',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        task_slug: { type: 'string', description: 'The slug of the task to delete' },
      },
      required: ['project', 'task_slug'],
    },
  },
  {
    name: 'search_tasks',
    description: 'Search across all tasks by keyword, status, agent phase, or date. Returns matching tasks sorted by relevance.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        keyword: { type: 'string', description: 'Search in title/summary' },
        status: { type: 'string', description: 'Filter by status (draft, in_progress, complete, etc.)' },
        agent: { type: 'string', description: 'Filter by agent phase (research, planning, executor, documentation)' },
        since: { type: 'string', description: 'ISO date - tasks updated after this date' },
        limit: { type: 'number', description: 'Max results (default: 20)' }
      },
      required: ['project'],
    },
  },
  {
    name: 'validate_phase',
    description: 'Check if a task phase has all prerequisites complete. Returns validation result with missing items and suggestions.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        task_slug: { type: 'string', description: 'The task slug' },
        phase: { type: 'string', enum: ['research', 'planning', 'execution', 'documentation'], description: 'Phase to validate' }
      },
      required: ['project', 'task_slug', 'phase'],
    },
  },
];

export async function handleTaskTool(name: string, args: Record<string, any> | undefined) {
  if (!args) {
    return { content: [{ type: 'text', text: `Tool '${name}' requires arguments.` }], isError: true };
  }

  switch (name) {
    case 'list_tasks': {
      const params = args as { project: string };
      const tasks = getProjectTasks(params.project);
      return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
    }

    case 'get_task': {
      const params = args as { project: string; task_slug: string };
      if (!isValidSlug(params.task_slug)) {
        return { content: [{ type: 'text', text: `Invalid task slug: '${params.task_slug}'` }], isError: true };
      }
      const task = getTask(params.project, params.task_slug);
      if (!task) {
        return { content: [{ type: 'text', text: `Task '${params.task_slug}' not found in project '${params.project}'.` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    }

    case 'create_task': {
      const params = args as { project: string; task_slug: string; title?: string; summary?: string };
      if (!isValidSlug(params.task_slug)) {
        return { content: [{ type: 'text', text: `Invalid task slug: '${params.task_slug}'` }], isError: true };
      }
      try {
        const taskData = {
            title: params.title || params.task_slug,
            summary: params.summary || ""
        };
        const task = await createTask(params.project, params.task_slug, taskData);
        return { content: [{ type: 'text', text: `✓ Task '${params.task_slug}' created. meta.json saved.\n${JSON.stringify(task, null, 2)}` }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Failed to create task '${params.task_slug}': ${error.message}` }], isError: true };
      }
    }

    case 'update_task': {
      const params = args as { project: string; task_slug: string; updates: any };
      if (!isValidSlug(params.task_slug)) {
        return { content: [{ type: 'text', text: `Invalid task slug: '${params.task_slug}'` }], isError: true };
      }
      try {
        const task = await updateTask(params.project, params.task_slug, params.updates);
        return { content: [{ type: 'text', text: `✓ Task '${params.task_slug}' updated. meta.json saved.\n${JSON.stringify(task, null, 2)}` }] };
      } catch (error: any) {
        return { content: [{ type: 'text', text: `Failed to update task '${params.task_slug}': ${error.message}` }], isError: true };
      }
    }

    case 'delete_task': {
      const params = args as { project: string; task_slug: string };
      if (!isValidSlug(params.task_slug)) {
        return { content: [{ type: 'text', text: `Invalid task slug: '${params.task_slug}'` }], isError: true };
      }
      const success = deleteTask(params.project, params.task_slug);
      return { content: [{ type: 'text', text: success ? `✓ Task '${params.task_slug}' deleted.` : `✗ Failed to delete '${params.task_slug}'.` }] };
    }

    case 'search_tasks': {
      const params = args as { 
        project: string; 
        keyword?: string; 
        status?: string; 
        agent?: string; 
        since?: string; 
        limit?: number 
      };
      const results = searchTasks(params.project, {
        keyword: params.keyword,
        status: params.status,
        agent: params.agent,
        since: params.since,
        limit: params.limit
      });
      return { content: [{ type: 'text', text: JSON.stringify({ count: results.length, tasks: results }, null, 2) }] };
    }

    case 'validate_phase': {
      const params = args as {
        project: string;
        task_slug: string;
        phase: 'research' | 'planning' | 'execution' | 'documentation'
      };
      if (!isValidSlug(params.task_slug)) {
        return { content: [{ type: 'text', text: `Invalid task slug: '${params.task_slug}'` }], isError: true };
      }
      const result = validatePhase(params.project, params.task_slug, params.phase);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    default:
      return null;
  }
}
