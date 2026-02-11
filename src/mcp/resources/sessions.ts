/**
 * Agent session and todo management
 */

import * as fs from 'fs';
import * as path from 'path';
import { configService, isProjectExposed } from '../config';
import { projectService } from '../../lib/detection-service';
import type { AgentType, AgentSession, AgentTodoItem, AgentTodos } from './types';
import { writeJsonAtomic, isValidSlug } from '../../lib/fs-safe';

const STALE_SESSION_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Start or update an agent session for a task
 */
export function startSession(
  projectName: string,
  taskSlug: string,
  agent: AgentType,
  phase: string
): { success: boolean; message: string } {
  if (!isValidSlug(taskSlug)) {
    return { success: false, message: `Invalid task slug: '${taskSlug}'` };
  }

  const config = configService.load();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));

  if (!project || !project.tasksPath) {
    return { success: false, message: `Project '${projectName}' not found or not exposed.` };
  }

  const taskDir = path.join(project.tasksPath, taskSlug);
  if (!fs.existsSync(taskDir)) {
    return { success: false, message: `Task '${taskSlug}' not found.` };
  }

  const session: AgentSession = {
    agent,
    phase,
    task_slug: taskSlug,
    started_at: new Date().toISOString(),
    heartbeat: new Date().toISOString()
  };

  const sessionPath = path.join(taskDir, 'session.json');
  writeJsonAtomic(sessionPath, session);

  return { success: true, message: `Session started for ${agent} agent on task '${taskSlug}' (phase: ${phase})` };
}

/**
 * End an agent session for a task
 */
export function endSession(projectName: string, taskSlug: string): { success: boolean; message: string } {
  if (!isValidSlug(taskSlug)) {
    return { success: false, message: `Invalid task slug: '${taskSlug}'` };
  }

  const config = configService.load();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));

  if (!project || !project.tasksPath) {
    return { success: false, message: `Project '${projectName}' not found or not exposed.` };
  }

  const sessionPath = path.join(project.tasksPath, taskSlug, 'session.json');
  if (!fs.existsSync(sessionPath)) {
    return { success: true, message: `No active session for task '${taskSlug}'.` };
  }

  fs.unlinkSync(sessionPath);
  return { success: true, message: `Session ended for task '${taskSlug}'.` };
}

/**
 * Update agent todos for a task
 */
export function updateAgentTodos(
  projectName: string,
  taskSlug: string,
  phase: string,
  agent: string,
  items: AgentTodoItem[]
): { success: boolean; message: string; count?: number } {
  if (!isValidSlug(taskSlug)) {
    return { success: false, message: `Invalid task slug: '${taskSlug}'` };
  }

  const config = configService.load();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));

  if (!project || !project.tasksPath) {
    return { success: false, message: `Project '${projectName}' not found or not exposed.` };
  }

  const taskDir = path.join(project.tasksPath, taskSlug);
  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }

  const todos: AgentTodos = {
    phase,
    agent,
    items,
    updated_at: new Date().toISOString()
  };

  const todosPath = path.join(taskDir, 'agent-todos.json');
  writeJsonAtomic(todosPath, todos);

  return { success: true, message: `Updated ${items.length} todo items for task '${taskSlug}'.`, count: items.length };
}

/**
 * Get agent todos for a task
 */
export function getAgentTodos(projectName: string, taskSlug: string): AgentTodos | null {
  if (!isValidSlug(taskSlug)) return null;

  const config = configService.load();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));

  if (!project || !project.tasksPath) return null;

  const todosPath = path.join(project.tasksPath, taskSlug, 'agent-todos.json');
  if (!fs.existsSync(todosPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(todosPath, 'utf-8')) as AgentTodos;
  } catch {
    return null;
  }
}

/**
 * Get active session for a task
 */
export function getSession(projectName: string, taskSlug: string): AgentSession | null {
  if (!isValidSlug(taskSlug)) return null;

  const config = configService.load();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));

  if (!project || !project.tasksPath) return null;

  const sessionPath = path.join(project.tasksPath, taskSlug, 'session.json');
  if (!fs.existsSync(sessionPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as AgentSession;
  } catch {
    return null;
  }
}

/**
 * Clean up stale sessions for a project.
 * Removes session.json files whose heartbeat is older than the threshold.
 * Also removes orphaned agent-todos.json for tasks with no active session.
 */
export function cleanStaleSessions(
  projectName: string,
  thresholdMs: number = STALE_SESSION_THRESHOLD_MS
): { cleaned: string[]; errors: string[] } {
  const config = configService.load();
  const projects = projectService.scan();
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));

  if (!project || !project.tasksPath) {
    return { cleaned: [], errors: [] };
  }

  const cleaned: string[] = [];
  const errors: string[] = [];
  const now = Date.now();

  try {
    const taskDirs = fs.readdirSync(project.tasksPath, { withFileTypes: true });
    for (const entry of taskDirs) {
      if (!entry.isDirectory()) continue;

      const sessionPath = path.join(project.tasksPath, entry.name, 'session.json');
      if (!fs.existsSync(sessionPath)) continue;

      try {
        const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as AgentSession;
        const heartbeat = new Date(session.heartbeat || session.started_at).getTime();

        if (now - heartbeat > thresholdMs) {
          fs.unlinkSync(sessionPath);
          cleaned.push(entry.name);

          // Also clean orphaned agent-todos.json
          const todosPath = path.join(project.tasksPath, entry.name, 'agent-todos.json');
          if (fs.existsSync(todosPath)) {
            fs.unlinkSync(todosPath);
          }
        }
      } catch {
        errors.push(entry.name);
      }
    }
  } catch {
    // tasksPath unreadable
  }

  return { cleaned, errors };
}
