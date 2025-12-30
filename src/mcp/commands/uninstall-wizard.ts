import { multiselect, note, isCancel, confirm } from '@clack/prompts';
import pc from 'picocolors';
import { checkInstallStatus, uninstallFromConfig, getTargetLabel, type InstallTarget } from '../install';

/**
 * Uninstall Wizard - Remove RRCE from selected IDEs
 */
export async function runUninstallWizard(workspacePath?: string): Promise<void> {
  const status = checkInstallStatus(workspacePath);
  
  // Filter to show only installed IDEs
  const installedOptions: { value: string; label: string; hint: string }[] = [];
  
  if (status.opencode) {
    installedOptions.push({
      value: 'opencode',
      label: 'OpenCode',
      hint: pc.green('Currently installed'),
    });
  }
  
  if (status.antigravity) {
    installedOptions.push({
      value: 'antigravity',
      label: 'Antigravity IDE',
      hint: pc.green('Currently installed'),
    });
  }
  
  if (status.vscodeGlobal) {
    installedOptions.push({
      value: 'vscode-global',
      label: 'VSCode (Global Settings)',
      hint: pc.green('Currently installed'),
    });
  }
  
  if (status.vscodeWorkspace) {
    installedOptions.push({
      value: 'vscode-workspace',
      label: 'VSCode (Workspace Config)',
      hint: pc.green('Currently installed'),
    });
  }
  
  if (status.claude) {
    installedOptions.push({
      value: 'claude',
      label: 'Claude Desktop',
      hint: pc.green('Currently installed'),
    });
  }

  if (installedOptions.length === 0) {
    note(
      pc.yellow('RRCE MCP Server is not installed in any supported IDE.'),
      'Nothing to Uninstall'
    );
    return;
  }

  const selected = await multiselect({
    message: 'Select IDEs to remove RRCE MCP Server from:',
    options: installedOptions,
    required: false,
  });

  if (isCancel(selected) || selected.length === 0) {
    return;
  }

  // Confirmation prompt
  const confirmed = await confirm({
    message: `Remove RRCE from ${selected.length} IDE(s)?`,
    initialValue: false,
  });

  if (isCancel(confirmed) || !confirmed) {
    note(pc.dim('Uninstall cancelled.'), 'Cancelled');
    return;
  }

  const targets = selected as InstallTarget[];
  const results: string[] = [];
  let successCount = 0;
  let failureCount = 0;

  for (const target of targets) {
    const success = uninstallFromConfig(target, workspacePath);
    const label = getTargetLabel(target);
    
    if (success) {
      results.push(`${label}: ${pc.green('✓ Removed')}`);
      successCount++;
    } else {
      results.push(`${label}: ${pc.red('✗ Failed')}`);
      failureCount++;
    }
  }

  if (results.length > 0) {
    const summary = failureCount > 0 
      ? `${successCount} succeeded, ${failureCount} failed`
      : `All ${successCount} uninstalled successfully`;
    
    note(results.join('\n'), `Uninstall Results (${summary})`);
  }
}
