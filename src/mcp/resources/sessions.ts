/**
 * Agent session and todo management
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadMCPConfig, isProjectExposed } from '../config';
import { projectService } from '../../lib/detection-service';
import type { AgentType, AgentSession, AgentTodoItem, AgentTodos } from './types';

/**
 * Start or update an agent session for a task
 */
export function startSession(
  projectName: string, 
  taskSlug: string, 
  agent: AgentType, 
  phase: string
): { success: boolean; message: string } {
  const config = loadMCPConfig();
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
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));

  return { success: true, message: `Session started for ${agent} agent on task '${taskSlug}' (phase: ${phase})` };
}

/**
 * End an agent session for a task
 */
export function endSession(projectName: string, taskSlug: string): { success: boolean; message: string } {
  const config = loadMCPConfig();
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
  const config = loadMCPConfig();
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
  fs.writeFileSync(todosPath, JSON.stringify(todos, null, 2));

  return { success: true, message: `Updated ${items.length} todo items for task '${taskSlug}'.`, count: items.length };
}

/**
 * Get agent todos for a task
 */
export function getAgentTodos(projectName: string, taskSlug: string): AgentTodos | null {
  const config = loadMCPConfig();
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
  const config = loadMCPConfig();
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
