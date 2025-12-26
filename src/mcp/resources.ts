/**
 * MCP Resources - Project data access utilities
 * Shared between MCP server and other modules
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadMCPConfig, isProjectExposed, getProjectPermissions } from './config';
import { scanForProjects, type DetectedProject } from '../lib/detection';

/**
 * Get list of projects exposed via MCP
 */
export function getExposedProjects(): DetectedProject[] {
  const config = loadMCPConfig();
  const allProjects = scanForProjects();
  return allProjects.filter(project => isProjectExposed(config, project.name));
}

/**
 * Detect the active project based on the current working directory (CWD)
 */
export function detectActiveProject(): DetectedProject | undefined {
  const exposed = getExposedProjects();
  const cwd = process.cwd();
  
  // Find project where CWD starts with project path (closest match)
  // Sort by path length descending to find most specific match
  const matches = exposed.filter(p => cwd.startsWith(p.path));
  matches.sort((a, b) => b.path.length - a.path.length);
  
  return matches[0];
}

/**
 * Get project context (project-context.md)
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
 * Get project tasks from meta.json files
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
