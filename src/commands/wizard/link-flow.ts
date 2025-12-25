import { multiselect, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { listGlobalProjects, getEffectiveRRCEHome } from '../../lib/paths';
import { generateVSCodeWorkspace } from './vscode';

/**
 * Run the link-only flow for adding other project knowledge to an existing workspace
 */
export async function runLinkProjectsFlow(
  workspacePath: string, 
  workspaceName: string, 
  existingProjects?: string[]
) {
  // Get projects if not provided
  const projects = existingProjects ?? listGlobalProjects(workspaceName);
  
  if (projects.length === 0) {
    outro(pc.yellow('No other projects found in global storage.'));
    return;
  }

  const customGlobalPath = getEffectiveRRCEHome(workspacePath);
  
  const linkedProjects = await multiselect({
    message: 'Select projects to link:',
    options: projects.map(name => ({
      value: name,
      label: name,
      hint: `${customGlobalPath}/workspaces/${name}/knowledge`
    })),
    required: true,
  });

  if (isCancel(linkedProjects)) {
    cancel('Cancelled.');
    process.exit(0);
  }

  const selectedProjects = linkedProjects as string[];

  if (selectedProjects.length === 0) {
    outro('No projects selected.');
    return;
  }

  const s = spinner();
  s.start('Linking projects');

  // Update .rrce-workflow.yaml with linked projects
  const configFilePath = path.join(workspacePath, '.rrce-workflow.yaml');
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
      for (const name of selectedProjects) {
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
    selectedProjects.forEach(name => {
      configContent += `  - ${name}\n`;
    });
  }

  fs.writeFileSync(configFilePath, configContent);

  // Update VSCode workspace file
  generateVSCodeWorkspace(workspacePath, workspaceName, selectedProjects, customGlobalPath);

  s.stop('Projects linked');

  // Show summary
  const workspaceFile = `${workspaceName}.code-workspace`;
  const summary = [
    `Linked projects:`,
    ...selectedProjects.map(p => `  ✓ ${p}`),
    ``,
    `Workspace file: ${pc.cyan(workspaceFile)}`,
  ];

  note(summary.join('\n'), 'Link Summary');

  outro(pc.green(`✓ Projects linked! Open ${pc.bold(workspaceFile)} in VSCode to access linked knowledge.`));
}
