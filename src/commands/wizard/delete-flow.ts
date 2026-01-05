
import { select, multiselect, confirm, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { type DetectedProject } from '../../lib/detection';
import { configService, saveMCPConfig, removeProjectConfig } from '../../mcp/config';

export async function runDeleteGlobalProjectFlow(
  availableProjects: DetectedProject[]
): Promise<void> {
  // Filter for global projects only (technically we can delete anything detected, but wizard says "Global Project")
  // Actually, detections include local folders if scanned.
  // We should be careful to only delete GLOBAL storage ones to avoid deleting user source code.
  
  const globalProjects = availableProjects.filter(p => p.source === 'global');

  if (globalProjects.length === 0) {
    note('No globally stored projects found to delete.', 'Info');
    return;
  }

  const selectedProjects = await multiselect({
    message: 'Select global projects to DELETE (Irreversible)',
    options: globalProjects.map(p => ({
      value: p.name,
      label: p.name,
      hint: p.dataPath
    })),
    required: false,
  });

  if (isCancel(selectedProjects)) {
    cancel('Deletion cancelled.');
    return;
  }

  const projectsToDelete = selectedProjects as string[];

  if (projectsToDelete.length === 0) {
    note('No projects selected.', 'Cancelled');
    return;
  }

  const confirmed = await confirm({
    message: `${pc.red('WARNING:')} This will PERMANENTLY DELETE the knowledge/config for ${projectsToDelete.length} detected global projects.\nAre you sure?`,
    initialValue: false,
  });

  if (!confirmed || isCancel(confirmed)) {
    cancel('Deletion cancelled.');
    return;
  }

  const s = spinner();
  s.start('Deleting projects...');

  try {
    const mcpConfig = configService.load();
    let configChanged = false;

    for (const projectName of projectsToDelete) {
      const project = globalProjects.find(p => p.name === projectName);
      if (!project) continue;

      // 1. Remove directory
      if (fs.existsSync(project.dataPath)) {
        fs.rmSync(project.dataPath, { recursive: true, force: true });
      }

      // 2. Remove from MCP config
      // We pass the config object reference, it mutates it (or returns new one?? let's check config.ts type)
      // removeProjectConfig returns the modified config.
      const newConfig = removeProjectConfig(mcpConfig, projectName);
      // We are reusing the same object in memory if calling repeatedly, but let's be safe
      // Actually removeProjectConfig might filter array. 
      // check config.ts: config.projects = config.projects.filter... it mutates the object property but returns the object.
      // So mcpConfig is updated.
      configChanged = true;
    }

    if (configChanged) {
        saveMCPConfig(mcpConfig);
    }

    s.stop(`Successfully deleted ${projectsToDelete.length} projects.`);
    
    // Slight pause to let user read
    await new Promise(r => setTimeout(r, 1000));

  } catch (error) {
    s.stop('Error occurred during deletion');
    note(`Failed to delete some projects: ${error}`, 'Error');
  }
}
