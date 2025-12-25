/**
 * Agent Prompt Definitions
 * Shared between MCP server and other modules
 */

export interface PromptArgument {
  name: string;
  description: string;
  required: boolean;
}

export interface AgentPromptDef {
  name: string;
  description: string;
  file: string;
  arguments: PromptArgument[];
}

/**
 * RRCE Agent prompts for MCP
 */
export const AGENT_PROMPTS: AgentPromptDef[] = [
  {
    name: 'init',
    description: 'Initialize project context by analyzing codebase structure, tech stack, and conventions',
    file: 'init.md',
    arguments: [
      { name: 'PROJECT_NAME', description: 'Project name (optional, auto-detected if omitted)', required: false },
    ],
  },
  {
    name: 'research',
    description: 'Research and clarify requirements for a new task',
    file: 'research_discussion.md',
    arguments: [
      { name: 'REQUEST', description: 'Description of the task or feature to research', required: true },
      { name: 'TASK_SLUG', description: 'Kebab-case identifier for the task', required: true },
      { name: 'TITLE', description: 'Human-readable title for the task', required: false },
    ],
  },
  {
    name: 'plan',
    description: 'Create an actionable execution plan from research findings',
    file: 'planning_orchestrator.md',
    arguments: [
      { name: 'TASK_SLUG', description: 'Task slug to create plan for', required: true },
    ],
  },
  {
    name: 'execute',
    description: 'Implement the planned work with code and tests',
    file: 'executor.md',
    arguments: [
      { name: 'TASK_SLUG', description: 'Task slug to execute', required: true },
      { name: 'BRANCH', description: 'Git branch reference (optional)', required: false },
    ],
  },
  {
    name: 'docs',
    description: 'Generate documentation for completed work',
    file: 'documentation.md',
    arguments: [
      { name: 'DOC_TYPE', description: 'Type of documentation (api, architecture, runbook, changelog)', required: true },
      { name: 'TASK_SLUG', description: 'Task slug if documenting specific task', required: false },
    ],
  },
  {
    name: 'sync',
    description: 'Reconcile knowledge base with actual codebase state',
    file: 'sync.md',
    arguments: [
      { name: 'SCOPE', description: 'Specific path or module to sync (optional)', required: false },
    ],
  },
];

/**
 * Get prompt definition by name
 */
export function getPromptDef(name: string): AgentPromptDef | undefined {
  return AGENT_PROMPTS.find(p => p.name === name);
}
