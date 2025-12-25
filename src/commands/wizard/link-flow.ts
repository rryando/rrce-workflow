import { multiselect, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import { getEffectiveRRCEHome, getConfigPath } from '../../lib/paths';
import { generateVSCodeWorkspace } from './vscode';
import { scanForProjects, getProjectDisplayLabel, type DetectedProject } from '../../lib/detection';

/**
 * Run the link-only flow for adding other project knowledge to an existing workspace
 * Now supports detecting workspace-scoped sibling projects, not just global storage
 */
export async function runLinkProjectsFlow(
  workspacePath: string, 
  workspaceName: string, 
  existingProjects?: string[]
) {
  // Scan for projects using the new detection system
  const detectedProjects = scanForProjects({
    excludeWorkspace: workspaceName,
    workspacePath: workspacePath,
    scanSiblings: true,
  });
  
  // If legacy string array is passed, use that instead (for backwards compat)
  const projects = existingProjects 
    ? existingProjects.map(name => ({ name, source: 'global' as const } as DetectedProject))
    : detectedProjects;
  
  if (projects.length === 0) {
    outro(pc.yellow('No other projects found. Try setting up another project first.'));
    return;
  }

  const customGlobalPath = getEffectiveRRCEHome(workspacePath);
  
  // Build options with source labels
  const linkedProjects = await multiselect({
    message: 'Select projects to link:',
    options: projects.map(project => ({
      value: project.name,
      label: project.name,
      hint: pc.dim(getProjectDisplayLabel(project)),
    })),
    required: true,
  });

  if (isCancel(linkedProjects)) {
    cancel('Cancelled.');
    process.exit(0);
  }

  const selectedProjectNames = linkedProjects as string[];

  if (selectedProjectNames.length === 0) {
    outro('No projects selected.');
    return;
  }

  // Get the full DetectedProject objects for selected projects
  const selectedProjects = projects.filter(p => selectedProjectNames.includes(p.name));

  const s = spinner();
  s.start('Linking projects');

  // Update config.yaml with linked projects
  const configFilePath = getConfigPath(workspacePath);
  let configContent = fs.readFileSync(configFilePath, 'utf-8');

  // Check if linked_projects section exists
  if (configContent.includes('linked_projects:')) {
    // Append to existing section - find and update
    const lines = configContent.split('\n');
    const linkedIndex = lines.findIndex(l => l.trim() === 'linked_projects:');
    if (linkedIndex !== -1) {
      // Find where to insert new projects (after existing ones)
      let insertIndex = linkedIndex + 1;
      while (insertIndex < lines.length && lines[insertIndex]?.startsWith('  - ')) {
        insertIndex++;
      }
      // Add new projects that aren't already there
      for (const name of selectedProjectNames) {
        if (!configContent.includes(`  - ${name}`)) {
          lines.splice(insertIndex, 0, `  - ${name}`);
          insertIndex++;
        }
      }
      configContent = lines.join('\n');
    }
  } else {
    // Add new linked_projects section
    configContent += `\nlinked_projects:\n`;
    selectedProjectNames.forEach(name => {
      configContent += `  - ${name}\n`;
    });
  }

  fs.writeFileSync(configFilePath, configContent);

  // Update VSCode workspace file with full project info (includes refs, tasks)
  generateVSCodeWorkspace(workspacePath, workspaceName, selectedProjects, customGlobalPath);

  s.stop('Projects linked');

  // Show summary with project sources
  const workspaceFile = `${workspaceName}.code-workspace`;
  const summary = [
    `Linked projects:`,
    ...selectedProjects.map(p => `  ✓ ${p.name} ${pc.dim(`(${p.source})`)}`),
    ``,
    `Workspace file: ${pc.cyan(workspaceFile)}`,
    ``,
    pc.dim('Includes: knowledge, refs, tasks folders'),
  ];

  note(summary.join('\n'), 'Link Summary');

  outro(pc.green(`✓ Projects linked! Open ${pc.bold(workspaceFile)} in VSCode to access linked knowledge.`));
}
