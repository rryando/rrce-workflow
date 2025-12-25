/**
 * MCP Server Implementation using @modelcontextprotocol/sdk
 * Provides stdio transport for VSCode Copilot integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadMCPConfig, isProjectExposed, getProjectPermissions } from './config';
import { scanForProjects, type DetectedProject } from '../lib/detection';
import { getAgentCorePromptsDir } from '../lib/prompts';
import * as fs from 'fs';
import * as path from 'path';

interface ServerStatus {
  running: boolean;
  port?: number;
  pid?: number;
}

// In-memory server state
let serverState: ServerStatus = { running: false };
let mcpServer: Server | null = null;

/**
 * Start the MCP server with stdio transport
 */
export async function startMCPServer(): Promise<{ port: number; pid: number }> {
  const config = loadMCPConfig();
  
  // Create the MCP server
  mcpServer = new Server(
    {
      name: 'rrce-mcp-hub',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
      },
    }
  );

  // Register resource handlers
  registerResourceHandlers(mcpServer);
  
  // Register tool handlers
  registerToolHandlers(mcpServer);

  // Register prompt handlers
  registerPromptHandlers(mcpServer);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  serverState = {
    running: true,
    port: config.server.port,
    pid: process.pid,
  };

  // Log to stderr (not stdout, which is used for MCP protocol)
  console.error(`RRCE MCP Hub started (pid: ${process.pid})`);
  console.error(`Exposed projects: ${getExposedProjects().map(p => p.name).join(', ')}`);

  return { port: config.server.port, pid: process.pid };
}

/**
 * Register MCP resource handlers
 */
function registerResourceHandlers(server: Server): void {
  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const projects = getExposedProjects();
    const resources: Array<{
      uri: string;
      name: string;
      description: string;
      mimeType: string;
    }> = [];

    // Add project list resource
    resources.push({
      uri: 'rrce://projects',
      name: 'Project List',
      description: 'List of all RRCE projects exposed via MCP',
      mimeType: 'application/json',
    });

    // Add per-project resources
    for (const project of projects) {
      const config = loadMCPConfig();
      const permissions = getProjectPermissions(config, project.name);

      if (permissions.knowledge) {
        resources.push({
          uri: `rrce://projects/${project.name}/context`,
          name: `${project.name} - Project Context`,
          description: `Project context and architecture for ${project.name}`,
          mimeType: 'text/markdown',
        });
      }

      if (permissions.tasks) {
        resources.push({
          uri: `rrce://projects/${project.name}/tasks`,
          name: `${project.name} - Tasks`,
          description: `Task list and status for ${project.name}`,
          mimeType: 'application/json',
        });
      }
    }

    return { resources };
  });

  // Read a specific resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    // Handle project list
    if (uri === 'rrce://projects') {
      const projects = getExposedProjects();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              projects.map(p => ({
                name: p.name,
                source: p.source,
                path: p.path,
              })),
              null,
              2
            ),
          },
        ],
      };
    }

    // Handle project-specific resources
    const projectMatch = uri.match(/^rrce:\/\/projects\/([^/]+)\/(.+)$/);
    if (projectMatch) {
      const [, projectName, resourceType] = projectMatch;
      const content = getProjectResource(projectName, resourceType);
      
      if (content === null) {
        throw new Error(`Resource not found: ${uri}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: resourceType === 'tasks' ? 'application/json' : 'text/markdown',
            text: content,
          },
        ],
      };
    }

    throw new Error(`Unknown resource: ${uri}`);
  });
}

/**
 * Register MCP tool handlers
 */
function registerToolHandlers(server: Server): void {
  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'search_knowledge',
          description: 'Search across all exposed project knowledge bases',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to find in knowledge files',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'list_projects',
          description: 'List all projects exposed via MCP',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_project_context',
          description: 'Get the project context/architecture for a specific project',
          inputSchema: {
            type: 'object',
            properties: {
              project: {
                type: 'string',
                description: 'Name of the project to get context for',
              },
            },
            required: ['project'],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'search_knowledge': {
        const query = (args as { query: string }).query;
        const results = searchKnowledge(query);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'list_projects': {
        const projects = getExposedProjects();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                projects.map(p => ({
                  name: p.name,
                  source: p.source,
                  path: p.path,
                })),
                null,
                2
              ),
            },
          ],
        };
      }

      case 'get_project_context': {
        const projectName = (args as { project: string }).project;
        const context = getProjectContext(projectName);
        
        if (!context) {
          return {
            content: [
              {
                type: 'text',
                text: `No project context found for "${projectName}"`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: context,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });
}

/**
 * Agent prompt definitions for MCP
 */
const AGENT_PROMPTS = [
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
 * Register MCP prompt handlers
 */
function registerPromptHandlers(server: Server): void {
  // List available prompts
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: AGENT_PROMPTS.map(p => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments.map(a => ({
          name: a.name,
          description: a.description,
          required: a.required,
        })),
      })),
    };
  });

  // Get a specific prompt
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    
    const promptDef = AGENT_PROMPTS.find(p => p.name === name);
    if (!promptDef) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    // Load the prompt file
    const promptsDir = getAgentCorePromptsDir();
    const promptPath = path.join(promptsDir, promptDef.file);
    
    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptDef.file}`);
    }

    let promptContent = fs.readFileSync(promptPath, 'utf-8');

    // Replace argument placeholders if provided
    if (args) {
      for (const [key, value] of Object.entries(args)) {
        promptContent = promptContent.replace(
          new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
          String(value)
        );
      }
    }

    return {
      description: promptDef.description,
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: promptContent,
          },
        },
      ],
    };
  });
}

/**
 * Get a specific resource for a project
 */
function getProjectResource(projectName: string, resourceType: string): string | null {
  switch (resourceType) {
    case 'context':
      return getProjectContext(projectName);
    case 'tasks':
      return JSON.stringify(getProjectTasks(projectName), null, 2);
    default:
      return null;
  }
}

/**
 * Stop the MCP server
 */
export function stopMCPServer(): void {
  if (mcpServer) {
    mcpServer.close();
    mcpServer = null;
  }
  serverState = { running: false };
  console.error('RRCE MCP Hub stopped');
}

/**
 * Get current server status
 */
export function getMCPServerStatus(): ServerStatus {
  return { ...serverState };
}

/**
 * Get list of projects that should be exposed via MCP
 */
export function getExposedProjects(): DetectedProject[] {
  const config = loadMCPConfig();
  const allProjects = scanForProjects();
  return allProjects.filter(project => isProjectExposed(config, project.name));
}

/**
 * Get project context for MCP resource
 */
export function getProjectContext(projectName: string): string | null {
  const config = loadMCPConfig();
  
  if (!isProjectExposed(config, projectName)) {
    return null;
  }

  const permissions = getProjectPermissions(config, projectName);
  if (!permissions.knowledge) {
    return null;
  }

  const projects = scanForProjects();
  const project = projects.find(p => p.name === projectName);
  
  if (!project?.knowledgePath) {
    return null;
  }

  const contextPath = path.join(project.knowledgePath, 'project-context.md');
  
  if (!fs.existsSync(contextPath)) {
    return null;
  }

  return fs.readFileSync(contextPath, 'utf-8');
}

/**
 * Get project tasks for MCP resource
 */
export function getProjectTasks(projectName: string): object[] {
  const config = loadMCPConfig();
  
  if (!isProjectExposed(config, projectName)) {
    return [];
  }

  const permissions = getProjectPermissions(config, projectName);
  if (!permissions.tasks) {
    return [];
  }

  const projects = scanForProjects();
  const project = projects.find(p => p.name === projectName);
  
  if (!project?.tasksPath || !fs.existsSync(project.tasksPath)) {
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
        } catch {
          // Skip invalid JSON
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return tasks;
}

/**
 * Search across all exposed project knowledge bases
 */
export function searchKnowledge(query: string): Array<{
  project: string;
  file: string;
  matches: string[];
}> {
  const config = loadMCPConfig();
  const projects = getExposedProjects();
  const results: Array<{ project: string; file: string; matches: string[] }> = [];
  
  const queryLower = query.toLowerCase();

  for (const project of projects) {
    const permissions = getProjectPermissions(config, project.name);
    
    if (!permissions.knowledge || !project.knowledgePath) continue;
    
    try {
      const files = fs.readdirSync(project.knowledgePath);
      
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        
        const filePath = path.join(project.knowledgePath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Simple line-by-line search
        const lines = content.split('\n');
        const matches: string[] = [];
        
        for (const line of lines) {
          if (line.toLowerCase().includes(queryLower)) {
            matches.push(line.trim());
          }
        }
        
        if (matches.length > 0) {
          results.push({
            project: project.name,
            file,
            matches: matches.slice(0, 5), // Limit to 5 matches per file
          });
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return results;
}
