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
  
  // 1. Get globally exposed projects
  const globalProjects = allProjects.filter(project => isProjectExposed(config, project.name, project.dataPath));
  
  // 2. Get locally linked projects (smart resolution)
  const activeProject = detectActiveProject(globalProjects); // Pass preliminary list
  let linkedProjects: DetectedProject[] = [];

  if (activeProject) {
    const localConfigPath = path.join(activeProject.dataPath, 'config.yaml'); // New config location
    // Also check legacy .rrce-workflow.yaml? 'paths.ts' handles that, but here we need quick read.
    // Let's rely on standard paths.
    
    // We need to resolve the path properly. Let's use getConfigPath helper if we can, but 
    // we need to import it. Since we can't easily import circular deps or new deps without checking,
    // let's stick to reading the config file found in the active project path.
    
    // Check both locations just to be safe/compliant with paths.ts logic
    let cfgContent: string | null = null;
    if (fs.existsSync(path.join(activeProject.dataPath, '.rrce-workflow', 'config.yaml'))) {
       cfgContent = fs.readFileSync(path.join(activeProject.dataPath, '.rrce-workflow', 'config.yaml'), 'utf-8');
    } else if (fs.existsSync(path.join(activeProject.dataPath, '.rrce-workflow.yaml'))) {
       cfgContent = fs.readFileSync(path.join(activeProject.dataPath, '.rrce-workflow.yaml'), 'utf-8');
    }

    if (cfgContent) {
      if (cfgContent.includes('linked_projects:')) { // Simple check
         // Parse linked projects manually to avoid heavy yaml parser dep if not already present?
         // config.ts uses simple regex/line parsing. Let's do similar.
         const lines = cfgContent.split('\n');
         let inLinked = false;
         for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('linked_projects:')) {
                inLinked = true;
                continue;
            }
            if (inLinked) {
                if (trimmed.startsWith('-') || trimmed.startsWith('linked_projects')) { 
                    // continue parsing 
                } else if (trimmed !== '' && !trimmed.startsWith('#')) {
                    // exited section
                    inLinked = false;
                }
                
                if (inLinked && trimmed.startsWith('-')) {
                    // Extract name. format: "- name" or "- name:source"
                    const val = trimmed.replace(/^-\s*/, '').trim();
                    const [pName] = val.split(':'); // Take name part
                    
                    // Find this project in allProjects
                    // Avoid duplicates
                    if (!globalProjects.some(p => p.name === pName) && 
                        !linkedProjects.some(p => p.name === pName)) {
                        const found = allProjects.find(p => p.name === pName);
                        if (found) {
                            // Mark as linked for context clarity? DetectedProject doesn't have a 'linked' flag.
                            // We return it as is.
                            linkedProjects.push(found);
                        }
                    }
                }
            }
         }
      }
    }
  }

  return [...globalProjects, ...linkedProjects];
}

/**
 * Detect the active project based on the current working directory (CWD)
 */
export function detectActiveProject(knownProjects?: DetectedProject[]): DetectedProject | undefined {
  // If no projects provided, scan mostly-global ones (avoid recursion loop by NOT calling getExposedProjects)
  let scanList = knownProjects;
  if (!scanList) {
     const config = loadMCPConfig();
     const all = scanForProjects();
     // Only consider global ones for base detection to start with
     scanList = all.filter(project => isProjectExposed(config, project.name, project.dataPath));
  }
  
  const cwd = process.cwd();
  
  // Find project where CWD starts with project path (closest match)
  const matches = scanList.filter(p => cwd.startsWith(p.path));
  matches.sort((a, b) => b.path.length - a.path.length);
  
  return matches[0];
}

/**
 * Get project context (project-context.md)
 */
export function getProjectContext(projectName: string): string | null {
  const config = loadMCPConfig();
  const projects = scanForProjects();
  
  // Find the SPECIFIC project that is exposed (disambiguate by path if need be)
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.dataPath));
  
  if (!project) {
    return null;
  }

  const permissions = getProjectPermissions(config, projectName, project.dataPath);
  if (!permissions.knowledge) {
    return null;
  }
  
  if (!project.knowledgePath) {
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
  const projects = scanForProjects();
  
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.dataPath));
  
  if (!project) {
    return [];
  }

  const permissions = getProjectPermissions(config, projectName, project.dataPath);
  if (!permissions.tasks) {
    return [];
  }
  
  if (!project.tasksPath || !fs.existsSync(project.tasksPath)) {
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
    const permissions = getProjectPermissions(config, project.name, project.dataPath);
    
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
