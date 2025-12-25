import { multiselect, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import { getEffectiveRRCEHome, getConfigPath } from '../../lib/paths';
import { generateVSCodeWorkspace } from './vscode';
import { scanForProjects, getProjectDisplayLabel, type DetectedProject } from '../../lib/detection';

/**
 * Run the link-only flow for adding other project knowledge to an existing workspace
 * Scans global storage and home directory for .rrce-workflow projects
 */
export async function runLinkProjectsFlow(
  workspacePath: string, 
  workspaceName: string
) {
  // Scan for projects (global storage + home directory)
  const projects = scanForProjects({
    excludeWorkspace: workspaceName,
    workspacePath: workspacePath,
  });
  
  if (projects.length === 0) {
    outro(pc.yellow('No other projects found. Try setting up another project first.'));
    return;
  }

  const customGlobalPath = getEffectiveRRCEHome(workspacePath);
  
  // Build options with source labels - use unique key (name:source) as value
  // This allows user to choose between global and sibling sources for same project
  const linkedProjects = await multiselect({
    message: 'Select projects to link:',
    options: projects.map(project => ({
      value: `${project.name}:${project.source}`,  // Unique key
      label: `${project.name} ${pc.dim(`(${project.source})`)}`,
      hint: pc.dim(project.source === 'global' 
        ? `~/.rrce-workflow/workspaces/${project.name}`
        : project.dataPath
      ),
    })),
    required: true,
  });

  if (isCancel(linkedProjects)) {
    cancel('Cancelled.');
    process.exit(0);
  }

  const selectedKeys = linkedProjects as string[];

  if (selectedKeys.length === 0) {
    outro('No projects selected.');
    return;
  }

  // Get the full DetectedProject objects for selected projects
  const selectedProjects = projects.filter(p => 
    selectedKeys.includes(`${p.name}:${p.source}`)
  );

  const s = spinner();
  s.start('Linking projects');

  // Update config.yaml with linked projects (store as name:source pairs)
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
      for (const project of selectedProjects) {
        const entry = `  - ${project.name}:${project.source}`;
        if (!configContent.includes(entry)) {
          lines.splice(insertIndex, 0, entry);
          insertIndex++;
        }
      }
      configContent = lines.join('\n');
    }
  } else {
    // Add new linked_projects section
    configContent += `\nlinked_projects:\n`;
    selectedProjects.forEach(project => {
      configContent += `  - ${project.name}:${project.source}\n`;
    });
  }

  fs.writeFileSync(configFilePath, configContent);

  // Update VSCode workspace file with full project info
  generateVSCodeWorkspace(workspacePath, workspaceName, selectedProjects, customGlobalPath);

  s.stop('Projects linked');

  // Show summary with project sources
  const workspaceFile = `${workspaceName}.code-workspace`;
  const summary = [
    `Linked projects:`,
    ...selectedProjects.map(p => `  ✓ ${p.name} ${pc.dim(`(${p.source})`)}`),
    ``,
    `Workspace file: ${pc.cyan(workspaceFile)}`,
  ];

  note(summary.join('\n'), 'Link Summary');

  outro(pc.green(`✓ Projects linked! Open ${pc.bold(workspaceFile)} in VSCode to access linked data.`));
}
