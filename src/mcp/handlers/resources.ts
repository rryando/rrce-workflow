import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { logger } from '../logger';
import { loadMCPConfig, getProjectPermissions } from '../config';
import { getExposedProjects, getProjectContext, getProjectTasks } from '../resources';

/**
 * Register MCP resource handlers
 */
export function registerResourceHandlers(server: Server): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logger.debug('Listing resources');
    const projects = getExposedProjects();
    const resources: Array<{ uri: string; name: string; description: string; mimeType: string }> = [];

    resources.push({
      uri: 'rrce://projects',
      name: 'Project List',
      description: 'List of all RRCE projects exposed via MCP',
      mimeType: 'application/json',
    });

    for (const project of projects) {
      const config = loadMCPConfig();
      const permissions = getProjectPermissions(config, project.name, project.dataPath);

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

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    logger.info(`Reading resource: ${uri}`);

    try {
      if (uri === 'rrce://projects') {
        const projects = getExposedProjects();
        return {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(projects.map(p => ({ name: p.name, source: p.source, path: p.path })), null, 2),
          }],
        };
      }

      const projectMatch = uri.match(/^rrce:\/\/projects\/([^/]+)\/(.+)$/);
      if (projectMatch && projectMatch[1] && projectMatch[2]) {
        const projectName = projectMatch[1];
        const resourceType = projectMatch[2];
        
        const content = resourceType === 'context' 
          ? getProjectContext(projectName)
          : JSON.stringify(getProjectTasks(projectName), null, 2);
        
        if (content === null) throw new Error(`Resource not found: ${uri}`);

        return {
          contents: [{
            uri,
            mimeType: resourceType === 'tasks' ? 'application/json' : 'text/markdown',
            text: content,
          }],
        };
      }

      throw new Error(`Unknown resource: ${uri}`);
    } catch (error) {
      logger.error(`Failed to read resource: ${uri}`, error);
      throw error;
    }
  });
}
