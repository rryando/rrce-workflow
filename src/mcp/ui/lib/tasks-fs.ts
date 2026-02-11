import * as fs from 'fs';
import * as path from 'path';
import type { DetectedProject } from '../../../lib/detection';
import { getConfigPath, resolveDataPath } from '../../../lib/paths';

export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'complete' | string;

// ============================================================================
// Session Tracking Types & Helpers
// ============================================================================

export type AgentType = 'research' | 'planning' | 'executor' | 'documentation';

export interface AgentSession {
  agent: AgentType;
  phase: string;
  task_slug: string;
  started_at: string;
  heartbeat: string;
}

const SESSION_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function readSession(project: DetectedProject, taskSlug: string): AgentSession | null {
  const rrceData = getProjectRRCEData(project);
  const sessionPath = path.join(rrceData, 'tasks', taskSlug, 'session.json');
  
  if (!fs.existsSync(sessionPath)) {
    return null;
  }
  
  try {
    const raw = fs.readFileSync(sessionPath, 'utf-8');
    return JSON.parse(raw) as AgentSession;
  } catch {
    return null;
  }
}

export function writeSession(project: DetectedProject, taskSlug: string, session: AgentSession): void {
  const rrceData = getProjectRRCEData(project);
  const taskDir = path.join(rrceData, 'tasks', taskSlug);
  const sessionPath = path.join(taskDir, 'session.json');
  
  // Ensure task directory exists
  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }
  
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
}

export function clearSession(project: DetectedProject, taskSlug: string): void {
  const rrceData = getProjectRRCEData(project);
  const sessionPath = path.join(rrceData, 'tasks', taskSlug, 'session.json');
  
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

export function isSessionStale(session: AgentSession, thresholdMs: number = SESSION_STALE_THRESHOLD_MS): boolean {
  const heartbeatTime = Date.parse(session.heartbeat);
  if (isNaN(heartbeatTime)) return true;
  return Date.now() - heartbeatTime > thresholdMs;
}

// ============================================================================
// Agent Todos Types & Helpers
// ============================================================================

export type TodoStatus = 'pending' | 'in_progress' | 'completed';
export type TodoPriority = 'high' | 'medium' | 'low';

export interface AgentTodoItem {
  id: string;
  content: string;
  status: TodoStatus;
  priority: TodoPriority;
}

export interface AgentTodos {
  phase: string;
  agent: string;
  items: AgentTodoItem[];
  updated_at: string;
}

export function readAgentTodos(project: DetectedProject, taskSlug: string): AgentTodos | null {
  const rrceData = getProjectRRCEData(project);
  const todosPath = path.join(rrceData, 'tasks', taskSlug, 'agent-todos.json');
  
  if (!fs.existsSync(todosPath)) {
    return null;
  }
  
  try {
    const raw = fs.readFileSync(todosPath, 'utf-8');
    return JSON.parse(raw) as AgentTodos;
  } catch {
    return null;
  }
}

export function writeAgentTodos(project: DetectedProject, taskSlug: string, todos: AgentTodos): void {
  const rrceData = getProjectRRCEData(project);
  const taskDir = path.join(rrceData, 'tasks', taskSlug);
  const todosPath = path.join(taskDir, 'agent-todos.json');
  
  // Ensure task directory exists
  if (!fs.existsSync(taskDir)) {
    fs.mkdirSync(taskDir, { recursive: true });
  }
  
  fs.writeFileSync(todosPath, JSON.stringify(todos, null, 2));
}

export interface AgentInfo {
  status: 'pending' | 'in_progress' | 'complete' | string;
  artifact?: string;
  completed_at?: string;
  notes?: string;
  blocked?: boolean;
  [key: string]: any;
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'pending' | 'done' | string;
  owner?: string;
  notes?: string;
}

export interface Reference {
  id: string;
  source: string;
  relevance: string;
  snippet?: string;
  phase?: 'research' | 'planning' | 'execution';
}

export interface OpenQuestion {
  id: string;
  question: string;
  status: 'open' | 'resolved';
  resolution?: string;
  raised_in?: 'research' | 'planning' | 'execution';
}

export interface Decision {
  id: string;
  decision: string;
  rationale: string;
  made_in?: 'research' | 'planning' | 'execution';
}

export interface TaskMeta {
  task_slug: string;
  title?: string;
  summary?: string;
  status?: TaskStatus;
  updated_at?: string;
  created_at?: string;
  tags?: string[];
  checklist?: ChecklistItem[];
  references?: Reference[];
  open_questions?: OpenQuestion[];
  decisions?: Decision[];
  agents?: Record<string, AgentInfo>;
}

export interface ProjectTasksResult {
  projectName: string;
  tasksPath: string;
  tasks: TaskMeta[];
}

function detectStorageModeFromConfig(workspaceRoot: string): 'global' | 'workspace' {
  const configPath = getConfigPath(workspaceRoot);
  try {
    const rrceHome = getEffectiveGlobalBase();
    if (configPath.startsWith(rrceHome)) {
      return 'global';
    }

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      if (content.includes('mode: workspace')) return 'workspace';
      if (content.includes('mode: global')) return 'global';
    }
  } catch {
    // ignore
  }
  return 'global';
}

function getEffectiveGlobalBase(): string {
  const dummy = resolveDataPath('global' as any, '__rrce_dummy__', '');
  return path.dirname(path.dirname(dummy));
}

export function getProjectRRCEData(project: DetectedProject): string {
  const workspaceRoot = project.sourcePath || project.path;
  const mode = detectStorageModeFromConfig(workspaceRoot);
  return resolveDataPath(mode as any, project.name, workspaceRoot);
}

export function listProjectTasks(project: DetectedProject): ProjectTasksResult {
  const rrceData = getProjectRRCEData(project);
  const tasksPath = path.join(rrceData, 'tasks');

  if (!fs.existsSync(tasksPath)) {
    return { projectName: project.name, tasksPath, tasks: [] };
  }

  const tasks: TaskMeta[] = [];

  try {
    const entries = fs.readdirSync(tasksPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(tasksPath, entry.name, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;

      try {
        const raw = fs.readFileSync(metaPath, 'utf-8');
        const meta = JSON.parse(raw) as TaskMeta;
        if (!meta.task_slug) meta.task_slug = entry.name;
        tasks.push(meta);
      } catch {
        // skip invalid JSON
      }
    }
  } catch {
    // ignore
  }

  tasks.sort((a, b) => {
    const aTime = Date.parse(a.updated_at || a.created_at || '') || 0;
    const bTime = Date.parse(b.updated_at || b.created_at || '') || 0;
    if (aTime !== bTime) return bTime - aTime;
    return String(a.task_slug).localeCompare(String(b.task_slug));
  });

  return { projectName: project.name, tasksPath, tasks };
}

export function updateTaskStatus(project: DetectedProject, taskSlug: string, status: TaskStatus): { ok: true; meta: TaskMeta } | { ok: false; error: string } {
  const rrceData = getProjectRRCEData(project);
  const metaPath = path.join(rrceData, 'tasks', taskSlug, 'meta.json');

  if (!fs.existsSync(metaPath)) {
    return { ok: false, error: `meta.json not found for task '${taskSlug}'` };
  }

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as TaskMeta;
    const next: TaskMeta = {
      ...meta,
      status,
      updated_at: new Date().toISOString(),
    };

    fs.writeFileSync(metaPath, JSON.stringify(next, null, 2));
    return { ok: true, meta: next };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
