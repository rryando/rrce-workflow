/**
 * Project discovery and context utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { configService, isProjectExposed, getProjectPermissions } from '../config';
import { type DetectedProject, findClosestProject } from '../../lib/detection';
import { projectService } from '../../lib/detection-service';

// Cache for linked projects config reads (keyed by config file path)
const LINKED_PROJECTS_CACHE_TTL_MS = 30_000;
const linkedProjectsCache = new Map<string, { content: string | null; cachedAt: number; fileMtime: number }>();

function readLinkedProjectsConfig(dataPath: string): string | null {
  const candidates = [
    path.join(dataPath, '.rrce-workflow', 'config.yaml'),
    path.join(dataPath, '.rrce-workflow.yaml'),
  ];

  for (const cfgPath of candidates) {
    if (!fs.existsSync(cfgPath)) continue;
    try {
      const stat = fs.statSync(cfgPath);
      const now = Date.now();
      const cached = linkedProjectsCache.get(cfgPath);
      if (cached && cached.fileMtime === stat.mtimeMs && (now - cached.cachedAt) < LINKED_PROJECTS_CACHE_TTL_MS) {
        return cached.content;
      }
      const content = fs.readFileSync(cfgPath, 'utf-8');
      linkedProjectsCache.set(cfgPath, { content, cachedAt: now, fileMtime: stat.mtimeMs });
      return content;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Get list of projects exposed via MCP
 */
export function getExposedProjects(): DetectedProject[] {
  const config = configService.load();
  
  // Extract known projects from config to ensure we find workspace-mode and global projects
  const knownProjects = config.projects
    .filter(p => !!p.path)
    .map(p => ({ name: p.name, path: p.path! }));

  const allProjects = projectService.scan({ knownProjects });
  
  // 1. Resolve linked projects first to get the full pool of potential projects
  const activeProject = detectActiveProject(allProjects); 
  const potentialProjects = [...allProjects];

  if (activeProject) {
    const cfgContent = readLinkedProjectsConfig(activeProject.dataPath);

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
    const config = configService.load();
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

// Cache for project-context.md content per project
const PROJECT_CONTEXT_CACHE_TTL_MS = 30_000; // 30 seconds
const projectContextCache = new Map<string, { content: string | null; cachedAt: number; fileMtime: number }>();

/**
 * Clear project context cache
 */
export function clearProjectContextCache(): void {
  projectContextCache.clear();
  linkedProjectsCache.clear();
}

/**
 * Get project context (project-context.md)
 * Results are cached per project with a 30-second TTL and mtime check.
 */
export function getProjectContext(projectName: string): string | null {
  const config = configService.load();
  const projects = projectService.scan();

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

  // Check cache
  const now = Date.now();
  const cached = projectContextCache.get(contextPath);
  try {
    const stat = fs.statSync(contextPath);
    const fileMtime = stat.mtimeMs;

    if (cached && cached.fileMtime === fileMtime && (now - cached.cachedAt) < PROJECT_CONTEXT_CACHE_TTL_MS) {
      return cached.content;
    }

    const content = fs.readFileSync(contextPath, 'utf-8');
    projectContextCache.set(contextPath, { content, cachedAt: now, fileMtime });
    return content;
  } catch {
    return null;
  }
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
