import { multiselect, note, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import { checkInstallStatus, installToConfig, getTargetLabel, type InstallTarget } from '../install';

/**
 * Install Wizard with VSCode support
 */
export async function runInstallWizard(workspacePath?: string): Promise<void> {
  const status = checkInstallStatus(workspacePath);
  
  const options: { value: string; label: string; hint: string }[] = [
    { 
      value: 'antigravity', 
      label: 'Antigravity IDE', 
      hint: status.antigravity ? pc.green('✓ Installed') : pc.dim('Not installed'),
    },
    { 
      value: 'vscode-global', 
      label: 'VSCode (Global Settings)', 
      hint: status.vscodeGlobal ? pc.green('✓ Installed') : pc.dim('Not installed'),
    },
    { 
      value: 'vscode-workspace', 
      label: 'VSCode (Workspace Config)', 
      hint: status.vscodeWorkspace ? pc.green('✓ Installed') : pc.dim('Not installed'),
    },
    { 
      value: 'claude', 
      label: 'Claude Desktop', 
      hint: status.claude ? pc.green('✓ Installed') : pc.dim('Not installed'),
    },
  ];

  const selected = await multiselect({
    message: 'Select where to install RRCE MCP Server:',
    options,
    initialValues: [
      ...(status.antigravity ? ['antigravity'] : []),
      ...(status.vscodeGlobal ? ['vscode-global'] : []),
      ...(status.vscodeWorkspace ? ['vscode-workspace'] : []),
      ...(status.claude ? ['claude'] : []),
    ],
    required: false,
  });

  if (isCancel(selected)) return;

  const targets = selected as InstallTarget[];
  const results: string[] = [];

  for (const target of targets) {
    const success = installToConfig(target, workspacePath);
    const label = getTargetLabel(target);
    results.push(`${label}: ${success ? pc.green('✓ Success') : pc.red('✗ Failed')}`);
  }

  if (results.length > 0) {
    note(results.join('\n'), 'Installation Results');
  }
}
