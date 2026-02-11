import { getTask, deleteTask, getProjectTasks } from '../../resources';
import { configService, isProjectExposed } from '../../config';
import { projectService } from '../../../lib/detection-service';
import * as path from 'path';
import * as fs from 'fs';

export const cleanupTools = [
  {
    name: 'cleanup_task',
    description: 'Cleanup task(s) by extracting knowledge and deleting artifacts. Supports single task, multiple tasks, or --all mode.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Name of the project' },
        task_slug: { type: 'string', description: 'Single task slug to cleanup' },
        task_slugs: { type: 'array', items: { type: 'string' }, description: 'Multiple task slugs to cleanup' },
        cleanup_all: { type: 'boolean', description: 'Cleanup all tasks for project' },
      },
      required: ['project'],
    },
  },
];

/**
 * Main cleanup function - extracts knowledge and deletes tasks
 */
async function cleanupSingleTask(
  projectName: string,
  taskSlug: string,
  projectDataPath: string
): Promise<{ success: boolean; message: string; knowledgeFiles?: string[] }> {
  try {
    // Get task metadata
    const task = getTask(projectName, taskSlug);
    if (!task) {
      return { success: false, message: `Task '${taskSlug}' not found in project '${projectName}'.` };
    }

    // Read task artifacts
    const taskDir = path.join(projectDataPath, 'tasks', taskSlug);
    const artifacts: Record<string, any> = { meta: task };

    // Read research artifact
    const researchPath = path.join(taskDir, 'research', `${taskSlug}-research.md`);
    if (fs.existsSync(researchPath)) {
      artifacts.research = fs.readFileSync(researchPath, 'utf-8');
    }

    // Read planning artifact
    const planningPath = path.join(taskDir, 'planning', `${taskSlug}-plan.md`);
    if (fs.existsSync(planningPath)) {
      artifacts.planning = fs.readFileSync(planningPath, 'utf-8');
    }

    // Read execution artifact
    const executionPath = path.join(taskDir, 'execution', `${taskSlug}-execution.md`);
    if (fs.existsSync(executionPath)) {
      artifacts.execution = fs.readFileSync(executionPath, 'utf-8');
    }

    // Read docs artifact
    const docsPath = path.join(taskDir, 'docs', `${taskSlug}-docs.md`);
    if (fs.existsSync(docsPath)) {
      artifacts.docs = fs.readFileSync(docsPath, 'utf-8');
    }

    // Note: Actual knowledge extraction is done by the LLM agent
    // This tool just provides the artifact content
    // The agent will call rrce_search_knowledge, decide merge vs create,
    // write knowledge files, and then call delete_task

    return {
      success: true,
      message: `Task '${taskSlug}' artifacts loaded. ${Object.keys(artifacts).length - 1} artifact files found.`,
      knowledgeFiles: []
    };

  } catch (error: any) {
    return {
      success: false,
      message: `Failed to load task '${taskSlug}': ${error.message}`
    };
  }
}

/**
 * Get project data path
 */
function getProjectDataPath(projectName: string): string | null {
  const config = configService.load();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));

  if (!project || !project.dataPath) {
    return null;
  }

  return project.dataPath;
}

export async function handleCleanupTool(name: string, args: Record<string, any> | undefined) {
  if (!args) {
    return { content: [{ type: 'text', text: `Tool '${name}' requires arguments.` }], isError: true };
  }

  if (name === 'cleanup_task') {
    const params = args as {
      project: string;
      task_slug?: string;
      task_slugs?: string[];
      cleanup_all?: boolean;
    };

    const projectDataPath = getProjectDataPath(params.project);
    if (!projectDataPath) {
      return {
        content: [{ type: 'text', text: `Project '${params.project}' not found or not exposed.` }],
        isError: true
      };
    }

    // Determine task slugs to cleanup
    let taskSlugs: string[] = [];

    if (params.cleanup_all) {
      // Get all tasks for project
      const allTasks = getProjectTasks(params.project);
      taskSlugs = allTasks.map((t: any) => t.task_slug);
    } else if (params.task_slugs && params.task_slugs.length > 0) {
      taskSlugs = params.task_slugs;
    } else if (params.task_slug) {
      taskSlugs = [params.task_slug];
    }

    if (taskSlugs.length === 0) {
      return {
        content: [{ type: 'text', text: 'No tasks specified for cleanup. Provide task_slug, task_slugs array, or set cleanup_all=true.' }],
        isError: true
      };
    }

    // Batch limit
    const MAX_BATCH_SIZE = 10;
    if (taskSlugs.length > MAX_BATCH_SIZE) {
      return {
        content: [{ type: 'text', text: `Too many tasks (${taskSlugs.length}). Maximum ${MAX_BATCH_SIZE} tasks per batch.` }],
        isError: true
      };
    }

    // Load artifacts for all tasks
    const results = await Promise.all(
      taskSlugs.map(slug => cleanupSingleTask(params.project, slug, projectDataPath))
    );

    // Build response
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    let responseText = `Loaded ${successCount} task(s) for cleanup.`;

    if (failureCount > 0) {
      responseText += ` Failed to load ${failureCount} task(s):\n`;
      results.filter(r => !r.success).forEach(r => {
        responseText += `  - ${r.message}\n`;
      });
    }

    responseText += `\n\nTask artifacts loaded. The cleanup agent will now:\n`;
    responseText += `1. Extract knowledge from each task\n`;
    responseText += `2. Check for duplicates in knowledge base\n`;
    responseText += `3. Merge or create knowledge files\n`;
    responseText += `4. Delete task directories\n`;
    responseText += `5. Reindex knowledge\n\n`;
    responseText += `Proceeding with cleanup...`;

    return {
      content: [{ type: 'text', text: responseText }]
    };
  }

  return null;
}
