/**
 * Project Sorting Utility
 * Shared between ProjectsView and TasksView for consistent project ordering
 */

import type { DetectedProject } from '../lib/detection';

/**
 * Sort projects with current project prioritization
 * Current project (based on workspacePath) appears first, then alphabetical
 */
export function sortProjects(
  projects: DetectedProject[],
  workspacePath: string | undefined
): DetectedProject[] {
  return [...projects].sort((a, b) => {
    // workspacePath prioritization
    const aIsCurrent = workspacePath ? a.path === workspacePath : false;
    const bIsCurrent = workspacePath ? b.path === workspacePath : false;

    if (aIsCurrent && !bIsCurrent) return -1;
    if (!aIsCurrent && bIsCurrent) return 1;

    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) return byName;

    // Tertiary sort by path for stability
    const aKey = a.sourcePath ?? a.path;
    const bKey = b.sourcePath ?? b.path;
    return aKey.localeCompare(bKey);
  });
}

/**
 * Get unique key for a project (used for sorting consistency)
 */
export function projectKey(project: DetectedProject): string {
  return project.sourcePath ?? project.path;
}

/**
 * Format project label for display
 */
export function formatProjectLabel(project: DetectedProject): string {
  const root = project.sourcePath ?? project.path;
  return `${project.name} (${project.source})${root ? ` - ${root}` : ''}`;
}
