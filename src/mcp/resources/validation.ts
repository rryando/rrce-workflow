/**
 * Task validation and search utilities
 */

import { getProjectTasks, getTask } from './tasks';
import type { TaskMeta } from './types';

/**
 * Search across all tasks by keyword, status, agent phase, or date
 */
export function searchTasks(
  projectName: string,
  options: {
    keyword?: string;
    status?: string;
    agent?: string;
    since?: string;
    limit?: number;
  } = {}
): Array<TaskMeta & { relevance?: number }> {
  const allTasks = getProjectTasks(projectName) as TaskMeta[];
  const limit = options.limit ?? 20;
  
  let filtered = allTasks;
  
  // Filter by status
  if (options.status) {
    filtered = filtered.filter(t => t.status === options.status);
  }
  
  // Filter by agent phase status
  if (options.agent) {
    filtered = filtered.filter(t => {
      const agents = (t as any).agents as Record<string, any> | undefined;
      if (!agents) return false;
      return agents[options.agent!]?.status !== undefined;
    });
  }
  
  // Filter by date (updated since)
  if (options.since) {
    const sinceDate = new Date(options.since).getTime();
    filtered = filtered.filter(t => {
      const updatedAt = (t as any).updated_at as string | undefined;
      if (!updatedAt) return false;
      return new Date(updatedAt).getTime() >= sinceDate;
    });
  }
  
  // Filter and score by keyword
  if (options.keyword) {
    const kw = options.keyword.toLowerCase();
    filtered = filtered.map(t => {
      const title = (t.title || '').toLowerCase();
      const summary = (t.summary || '').toLowerCase();
      
      let relevance = 0;
      if (title.includes(kw)) relevance += 2;
      if (summary.includes(kw)) relevance += 1;
      if (t.task_slug.toLowerCase().includes(kw)) relevance += 1;
      
      return { ...t, relevance };
    }).filter(t => t.relevance > 0) as Array<TaskMeta & { relevance: number }>;
    
    // Sort by relevance
    (filtered as Array<TaskMeta & { relevance: number }>).sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
  } else {
    // Sort by updated_at descending
    filtered.sort((a, b) => {
      const aDate = new Date((a as any).updated_at || 0).getTime();
      const bDate = new Date((b as any).updated_at || 0).getTime();
      return bDate - aDate;
    });
  }
  
  return filtered.slice(0, limit);
}

/**
 * Validate if a task phase has all required prerequisites
 */
export function validatePhase(
  projectName: string,
  taskSlug: string,
  phase: 'research' | 'planning' | 'execution' | 'documentation'
): {
  valid: boolean;
  phase: string;
  status: string;
  missing_items: string[];
  suggestions: string[];
} {
  const task = getTask(projectName, taskSlug);
  
  if (!task) {
    return {
      valid: false,
      phase,
      status: 'not_found',
      missing_items: ['Task does not exist'],
      suggestions: [`Create task with: create_task(project: "${projectName}", task_slug: "${taskSlug}")`]
    };
  }

  const agents = (task as any).agents as Record<string, any> | undefined;
  const phaseData = agents?.[phase === 'execution' ? 'executor' : phase];
  const status = phaseData?.status || 'pending';
  const missing: string[] = [];
  const suggestions: string[] = [];

  // Phase-specific validation rules
  switch (phase) {
    case 'research':
      if (status !== 'complete') {
        missing.push('Research phase not complete');
        suggestions.push(`Run research phase: /rrce_research ${taskSlug}`);
      }
      if (!phaseData?.artifact) {
        missing.push('Research artifact not saved');
        suggestions.push('Save research brief to complete the phase');
      }
      break;
      
    case 'planning':
      // Check research prerequisite
      const researchStatus = agents?.research?.status;
      if (researchStatus !== 'complete') {
        missing.push('Research phase not complete');
        suggestions.push(`Complete research first: /rrce_research ${taskSlug}`);
      }
      if (status !== 'complete') {
        missing.push('Planning phase not complete');
        suggestions.push(`Run planning phase: /rrce_plan ${taskSlug}`);
      }
      if (!phaseData?.artifact) {
        missing.push('Planning artifact not saved');
      }
      if (!phaseData?.task_count) {
        missing.push('Task breakdown not defined');
      }
      break;
      
    case 'execution':
      // Check planning prerequisite
      const planningStatus = agents?.planning?.status;
      if (planningStatus !== 'complete') {
        missing.push('Planning phase not complete');
        suggestions.push(`Complete planning first: /rrce_plan ${taskSlug}`);
      }
      if (status !== 'complete') {
        missing.push('Execution phase not complete');
        suggestions.push(`Run execution phase: /rrce_execute ${taskSlug}`);
      }
      break;
      
    case 'documentation':
      // Check execution prerequisite
      const executorStatus = agents?.executor?.status;
      if (executorStatus !== 'complete') {
        missing.push('Execution phase not complete');
        suggestions.push(`Complete execution first: /rrce_execute ${taskSlug}`);
      }
      if (status !== 'complete') {
        missing.push('Documentation phase not complete');
        suggestions.push(`Run documentation phase: /rrce_docs ${taskSlug}`);
      }
      break;
  }

  return {
    valid: missing.length === 0,
    phase,
    status,
    missing_items: missing,
    suggestions
  };
}
