import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import { logger } from '../logger';
import { getExposedProjects } from '../resources';
import { configService, isProjectExposed } from '../config';
import { projectService } from '../../lib/detection-service';
import { findClosestProject } from '../../lib/detection';

// Domain-specific tool handlers
import { projectTools, handleProjectTool } from './tools/project';
import { searchTools, handleSearchTool } from './tools/search';
import { taskTools, handleTaskTool } from './tools/task';
import { sessionTools, handleSessionTool } from './tools/session';
import { agentTools, handleAgentTool } from './tools/agent';
import { cleanupTools, handleCleanupTool } from './tools/cleanup';

/**
 * Normalize a tool name by stripping common prefixes.
 * Prompts reference tools as `rrce_search_knowledge` but they're registered as `search_knowledge`.
 * Some MCP clients may also add their own prefixes (e.g., `rrce-mcp-hub_search_knowledge`).
 * This ensures both prefixed and bare names resolve correctly.
 */
function normalizeToolName(name: string): string {
  // Strip `rrce_` prefix (used in agent prompts)
  if (name.startsWith('rrce_')) {
    return name.slice(5);
  }
  // Strip `rrce-mcp-hub_` prefix (used by some MCP clients)
  if (name.startsWith('rrce-mcp-hub_')) {
    return name.slice(13);
  }
  return name;
}

/**
 * Register MCP tool handlers
 */
export function registerToolHandlers(server: Server): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      ...projectTools,
      ...searchTools,
      ...taskTools,
      ...sessionTools,
      ...agentTools,
      ...cleanupTools,
    ];

    // Check if any projects are exposed. If not, add a help setup tool.
    const projects = getExposedProjects();
    if (projects.length === 0) {
      tools.push({
        name: 'help_setup',
        description: 'Get help on how to configure projects for the RRCE MCP Server',
        inputSchema: { type: 'object', properties: {} },
      });
    }

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: rawName, arguments: args } = request.params;
    const name = normalizeToolName(rawName);
    const argsWithCaller = applyCallerContext(name, args, request);
    if (name !== rawName) {
      logger.info(`Calling tool: ${rawName} → ${name}`, argsWithCaller);
    } else {
      logger.info(`Calling tool: ${name}`, argsWithCaller);
    }

    try {
      // Try project tools
      const projectResult = await handleProjectTool(name, argsWithCaller);
      if (projectResult) return projectResult;

      // Try search tools
      const searchResult = await handleSearchTool(name, argsWithCaller);
      if (searchResult) return searchResult;

      // Try task tools
      const taskResult = await handleTaskTool(name, argsWithCaller);
      if (taskResult) return taskResult;

      // Try session tools
      const sessionResult = await handleSessionTool(name, argsWithCaller);
      if (sessionResult) return sessionResult;

      // Try agent tools
      const agentResult = await handleAgentTool(name, argsWithCaller);
      if (agentResult) return agentResult;

      // Try cleanup tools
      const cleanupResult = await handleCleanupTool(name, argsWithCaller);
      if (cleanupResult) return cleanupResult;

      throw new Error(`Unknown tool: ${rawName}`);
    } catch (error) {
      logger.error(`Tool execution failed: ${rawName}`, error);
      throw error;
    }
  });
}

interface CallerContext {
  project?: string;
  path?: string;
}

function applyCallerContext(
  toolName: string,
  args: Record<string, any> | undefined,
  request: { params: { _meta?: Record<string, unknown> } }
): Record<string, any> | undefined {
  const callerPath = getCallerPath(request);
  if (!callerPath) return args;

  const callerProject = resolveCallerProject(callerPath);
  if (!callerProject) return args;

  const nextArgs = { ...(args || {}) } as Record<string, any>;
  if (!nextArgs.project && callerProject.project) {
    nextArgs.project = callerProject.project;
  }
  if (!nextArgs.path && toolName === 'resolve_path' && callerProject.path) {
    nextArgs.path = callerProject.path;
  }

  return nextArgs;
}

function getCallerPath(request: { params: { _meta?: Record<string, unknown> } }): string | undefined {
  const params = request.params as Record<string, unknown>;
  const meta = (params?._meta as Record<string, unknown> | undefined) ||
    ((request as Record<string, unknown>)._meta as Record<string, unknown> | undefined) ||
    ((request as Record<string, unknown>).meta as Record<string, unknown> | undefined);

  const caller = (meta?.caller as Record<string, unknown> | undefined) ||
    (meta?.client as Record<string, unknown> | undefined) ||
    (meta?.source as Record<string, unknown> | undefined) ||
    (meta?.requester as Record<string, unknown> | undefined) ||
    meta;

  const candidates = [
    caller?.workspaceRoot,
    caller?.workspace_root,
    caller?.projectPath,
    caller?.project_path,
    caller?.cwd,
    caller?.root,
    caller?.path,
    meta?.workspaceRoot,
    meta?.workspace_root,
    meta?.projectPath,
    meta?.project_path,
    meta?.cwd,
    meta?.root,
    meta?.path
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function resolveCallerProject(callerPath: string): CallerContext | undefined {
  const config = configService.load();
  const knownProjects = config.projects
    .filter(p => !!p.path)
    .map(p => ({ name: p.name, path: p.path! }));

  const projects = projectService.scan({ knownProjects });
  const exposed = projects.filter(p => isProjectExposed(config, p.name, p.sourcePath || p.path));
  const closest = findClosestProject(exposed, callerPath);

  if (closest) {
    return { project: closest.name, path: closest.sourcePath || closest.path };
  }

  if (callerPath) {
    const fallbackName = path.basename(callerPath);
    if (fallbackName) {
      return { project: fallbackName, path: callerPath };
    }
  }

  return undefined;
}
