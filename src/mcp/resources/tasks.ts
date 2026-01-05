/**
 * Task CRUD operations
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { logger } from '../logger';
import { loadMCPConfig, isProjectExposed, getProjectPermissions } from '../config';
import { projectService } from '../../lib/detection-service';
import type { TaskMeta } from './types';

/**
 * Get project tasks from meta.json files
 */
export function getProjectTasks(projectName: string): object[] {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project) {
    return [];
  }

  const permissions = getProjectPermissions(config, projectName, project.sourcePath || project.path);
  if (!permissions.tasks) {
    return [];
  }
  
  if (!project.tasksPath || !fs.existsSync(project.tasksPath)) {
    return [];
  }

  const tasks: object[] = [];
  
  try {
    const taskDirs = fs.readdirSync(project.tasksPath, { withFileTypes: true });
    
    for (const dir of taskDirs) {
      if (!dir.isDirectory()) continue;
      
      const metaPath = path.join(project.tasksPath, dir.name, 'meta.json');
      
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
          tasks.push(meta);
        } catch (err) {
          logger.error(`[getProjectTasks] Failed to parse meta.json in ${dir.name}`, err);
        }
      }
    }
  } catch (err) {
    logger.error(`[getProjectTasks] Failed to read tasks directory ${project.tasksPath}`, err);
  }

  return tasks;
}

/**
 * Get a specific task by slug
 */
export function getTask(projectName: string, taskSlug: string): TaskMeta | null {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) return null;

  const metaPath = path.join(project.tasksPath, taskSlug, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as TaskMeta;
  } catch (err) {
    logger.error(`[getTask] Failed to parse meta.json for task ${taskSlug}`, err);
    return null;
  }
}

/**
 * Create a new task
 */
export async function createTask(projectName: string, taskSlug: string, taskData: Partial<TaskMeta>): Promise<TaskMeta | null> {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) {
    throw new Error(`Project '${projectName}' not found or not configured with a tasks path.`);
  }

  const taskDir = path.join(project.tasksPath, taskSlug);
  if (fs.existsSync(taskDir)) {
    throw new Error(`Task with slug '${taskSlug}' already exists.`);
  }

  fs.mkdirSync(taskDir, { recursive: true });
  fs.mkdirSync(path.join(taskDir, 'research'), { recursive: true });
  fs.mkdirSync(path.join(taskDir, 'planning'), { recursive: true });
  fs.mkdirSync(path.join(taskDir, 'execution'), { recursive: true });
  fs.mkdirSync(path.join(taskDir, 'docs'), { recursive: true });

  // Load template from global storage
  const rrceHome = process.env.RRCE_HOME || path.join(os.homedir(), '.rrce-workflow');
  const templatePath = path.join(rrceHome, 'templates', 'meta.template.json');
  
  let meta: any = {
    task_id: crypto.randomUUID(),
    task_slug: taskSlug,
    status: "draft",
    agents: {}
  };

  if (fs.existsSync(templatePath)) {
    try {
      const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
      meta = { ...template, ...meta };
    } catch (e) {
      logger.error('Failed to load meta template', e);
    }
  }

  // Populate initial fields
  meta.created_at = new Date().toISOString();
  meta.updated_at = meta.created_at;
  meta.workspace = {
    name: project.name,
    path: project.path || project.dataPath,
    hash: project.name
  };

  // Merge taskData
  Object.assign(meta, taskData);

  const metaPath = path.join(taskDir, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return meta as TaskMeta;
}

/**
 * Update an existing task
 */
export async function updateTask(projectName: string, taskSlug: string, taskData: Partial<TaskMeta>): Promise<TaskMeta | null> {
  const meta = getTask(projectName, taskSlug);
  if (!meta) throw new Error(`Task '${taskSlug}' not found.`);

  // Smart merge
  const updatedMeta = {
    ...meta,
    ...taskData,
    updated_at: new Date().toISOString(),
    // Ensure nested objects are merged if they exist in taskData
    agents: taskData.agents ? { ...meta.agents, ...taskData.agents } : meta.agents,
    workspace: (meta as any).workspace // Protect workspace metadata
  };

  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) return null;

  const metaPath = path.join(project.tasksPath, taskSlug, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(updatedMeta, null, 2));

  return updatedMeta as TaskMeta;
}

/**
 * Delete a task
 */
export function deleteTask(projectName: string, taskSlug: string): boolean {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project || !project.tasksPath) return false;

  const taskDir = path.join(project.tasksPath, taskSlug);
  if (!fs.existsSync(taskDir)) return false;

  if (fs.rmSync) {
    fs.rmSync(taskDir, { recursive: true, force: true });
  } else {
    // @ts-ignore - Fallback for older Node
    fs.rmdirSync(taskDir, { recursive: true });
  }
  
  return true;
}
