/**
 * Project discovery and context utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { loadMCPConfig, isProjectExposed, getProjectPermissions } from '../config';
import { type DetectedProject, findClosestProject } from '../../lib/detection';
import { projectService } from '../../lib/detection-service';

/**
 * Get list of projects exposed via MCP
 */
export function getExposedProjects(): DetectedProject[] {
  const config = loadMCPConfig();
  
  // Extract known projects from config to ensure we find workspace-mode and global projects
  const knownProjects = config.projects
    .filter(p => !!p.path)
    .map(p => ({ name: p.name, path: p.path! }));

  const allProjects = projectService.scan({ knownProjects });
  
  // 1. Resolve linked projects first to get the full pool of potential projects
  const activeProject = detectActiveProject(allProjects); 
  const potentialProjects = [...allProjects];

  if (activeProject) {
    let cfgContent: string | null = null;
    if (fs.existsSync(path.join(activeProject.dataPath, '.rrce-workflow', 'config.yaml'))) {
      cfgContent = fs.readFileSync(path.join(activeProject.dataPath, '.rrce-workflow', 'config.yaml'), 'utf-8');
    } else if (fs.existsSync(path.join(activeProject.dataPath, '.rrce-workflow.yaml'))) {
      cfgContent = fs.readFileSync(path.join(activeProject.dataPath, '.rrce-workflow.yaml'), 'utf-8');
    }

    if (cfgContent) {
      if (cfgContent.includes('linked_projects:')) {
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
              inLinked = false;
            }
            
            if (inLinked && trimmed.startsWith('-')) {
              const val = trimmed.replace(/^-\s*/, '').trim();
              const [pName] = val.split(':');
              
              if (!potentialProjects.some(p => p.name === pName)) {
                const found = allProjects.find(p => p.name === pName);
                if (found) {
                  potentialProjects.push(found);
                }
              }
            }
          }
        }
      }
    }
  }

  // 2. Filter ALL potential projects through the SSOT configuration
  // Use project.path (the root) for standardized lookup
  return potentialProjects.filter(project => isProjectExposed(config, project.name, project.sourcePath || project.path));
}

/**
 * Detect the active project based on the current working directory (CWD)
 */
export function detectActiveProject(knownProjects?: DetectedProject[]): DetectedProject | undefined {
  // If no projects provided, scan mostly-global ones (avoid recursion loop by NOT calling getExposedProjects)
  let scanList = knownProjects;
  if (!scanList) {
    const config = loadMCPConfig();
    // Use known projects for detection to ensure we find the active project even if not in standard scan
    const knownProjectsMap = config.projects
      .filter(p => !!p.path)
      .map(p => ({ name: p.name, path: p.path! }));
      
    const all = projectService.scan({ knownProjects: knownProjectsMap });
    // Only consider global ones for base detection to start with
    scanList = all.filter(project => isProjectExposed(config, project.name, project.sourcePath || project.path));
  }
  
  return findClosestProject(scanList);
}

/**
 * Get project context (project-context.md)
 */
export function getProjectContext(projectName: string): string | null {
  const config = loadMCPConfig();
  const projects = projectService.scan();
  
  // Find the SPECIFIC project that is exposed (disambiguate by path if need be)
  const project = projects.find(p => p.name === projectName && isProjectExposed(config, p.name, p.sourcePath || p.path));
  
  if (!project) {
    return null;
  }

  const permissions = getProjectPermissions(config, projectName, project.sourcePath || project.path);
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
 * Get RAG index path for a project
 */
export function getRAGIndexPath(project: DetectedProject): string {
  const scanRoot = project.path || project.dataPath;
  return path.join(project.knowledgePath || path.join(scanRoot, '.rrce-workflow', 'knowledge'), 'embeddings.json');
}

/**
 * Get Code-specific RAG index path for a project
 */
export function getCodeIndexPath(project: DetectedProject): string {
  const scanRoot = project.path || project.dataPath;
  return path.join(project.knowledgePath || path.join(scanRoot, '.rrce-workflow', 'knowledge'), 'code-embeddings.json');
}
