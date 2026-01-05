/**
 * Type definitions for MCP resources
 */

// Re-export TaskMeta from ui/lib for convenience
export type { TaskMeta } from '../ui/lib/tasks-fs';

/**
 * Agent type identifiers
 */
export type AgentType = 'research' | 'planning' | 'executor' | 'documentation';

/**
 * Active agent session for a task
 */
export interface AgentSession {
  agent: AgentType;
  phase: string;
  task_slug: string;
  started_at: string;
  heartbeat: string;
}

/**
 * Individual todo item for agent progress tracking
 */
export interface AgentTodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'high' | 'medium' | 'low';
}

/**
 * Agent todo list for a task phase
 */
export interface AgentTodos {
  phase: string;
  agent: string;
  items: AgentTodoItem[];
  updated_at: string;
}
