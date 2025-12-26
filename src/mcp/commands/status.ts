import { spinner, note } from '@clack/prompts';
import pc from 'picocolors';
import { loadMCPConfig, getMCPConfigPath } from '../config';
import { scanForProjects } from '../../lib/detection';
import { detectWorkspaceRoot } from '../../lib/paths';
import { getMCPServerStatus } from '../server';
import { checkInstallStatus } from '../install';

/**
 * Show current project status
 */
export async function handleShowStatus(): Promise<void> {
  const s = spinner();
  s.start('Loading projects...');

  const config = loadMCPConfig();
  const projects = scanForProjects();
  const workspacePath = detectWorkspaceRoot();
  const installStatus = checkInstallStatus(workspacePath);
  
  s.stop('Projects loaded');

  if (projects.length === 0) {
    note('No RRCE projects detected. Run "rrce-workflow" in a project to set it up.', 'No Projects');
    return;
  }

  const lines: string[] = [
    `${pc.bold('Installation Status')}`,
    '',
    `  Antigravity:      ${installStatus.antigravity ? pc.green('✓ Installed') : pc.dim('Not installed')}`,
    `  VSCode (Global):  ${installStatus.vscodeGlobal ? pc.green('✓ Installed') : pc.dim('Not installed')}`,
    `  VSCode (Workspace): ${installStatus.vscodeWorkspace ? pc.green('✓ Installed') : pc.dim('Not installed')}`,
    `  Claude Desktop:   ${installStatus.claude ? pc.green('✓ Installed') : pc.dim('Not installed')}`,
    '',
    `${pc.bold('Project Status')}`,
    '',
  ];

  for (const project of projects) {
    const projectConfig = config.projects.find(p => p.name === project.name);
    const isExposed = projectConfig?.expose ?? config.defaults.includeNew;
    const status = isExposed ? pc.green('✓ exposed') : pc.dim('○ hidden');
    const source = pc.dim(`(${project.source})`);
    
    lines.push(`  ${status}  ${project.name} ${source}`);
  }

  lines.push('');
  lines.push(pc.dim(`Config: ${getMCPConfigPath()}`));

  const serverStatus = getMCPServerStatus();
  if (serverStatus.running) {
    lines.push(pc.green(`Server: running on port ${serverStatus.port}`));
  } else {
    lines.push(pc.dim('Server: not running'));
  }

  note(lines.join('\n'), 'MCP Hub Status');
}
