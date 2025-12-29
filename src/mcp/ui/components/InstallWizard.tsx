
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { SimpleSelect } from './SimpleSelect';
import { checkInstallStatus, installToConfig, getTargetLabel, type InstallTarget } from '../../install';

interface InstallWizardProps {
  workspacePath?: string;
  onComplete: () => void;
  onCancel: () => void;
}

export const InstallWizard = ({ workspacePath, onComplete, onCancel }: InstallWizardProps) => {
  const [status, setStatus] = useState(checkInstallStatus(workspacePath));
  const [message, setMessage] = useState('');

  const options: { value: string; label: string; hint: string }[] = [
    { 
      value: 'opencode',
      label: 'OpenCode',
      hint: status.opencode ? 'INSTALLED' : 'Not installed',
    },
    { 
      value: 'antigravity', 
      label: 'Antigravity IDE', 
      hint: status.antigravity ? 'INSTALLED' : 'Not installed',
    },
    { 
      value: 'vscode-global', 
      label: 'VSCode (Global Settings)', 
      hint: status.vscodeGlobal ? 'INSTALLED' : 'Not installed',
    },
    { 
      value: 'vscode-workspace', 
      label: 'VSCode (Workspace Config)', 
      hint: status.vscodeWorkspace ? 'INSTALLED' : 'Not installed',
    },
    { 
      value: 'claude', 
      label: 'Claude Desktop', 
      hint: status.claude ? 'INSTALLED' : 'Not installed',
    },
  ];

  const initialSelected = [
      ...(status.opencode ? ['opencode'] : []),
      ...(status.antigravity ? ['antigravity'] : []),
      ...(status.vscodeGlobal ? ['vscode-global'] : []),
      ...(status.vscodeWorkspace ? ['vscode-workspace'] : []),
      ...(status.claude ? ['claude'] : []),
  ];

  const handleSubmit = (selectedIds: string[]) => {
      // In this TUI version, we simply treat "selection" as "ensure installed".
      // If unselected, we could technically uninstall, but the logic usually only supports install.
      // For now, let's just reinstall selected.
      
      const targets = selectedIds as InstallTarget[];
      let results: string[] = [];

      targets.forEach(target => {
          const success = installToConfig(target, workspacePath);
          const label = getTargetLabel(target);
          results.push(`${label}: ${success ? 'Success' : 'Failed'}`);
      });
      
      // Refresh status
      setStatus(checkInstallStatus(workspacePath));
      setMessage(`Installation updated: ${results.join(', ')}`);
      
      setTimeout(() => {
          setMessage('');
          onComplete();
      }, 2000);
  };

  return (
    <Box flexDirection="column">
      {message && <Text color="green">{message}</Text>}
      <SimpleSelect 
        message="Select integrations to install:"
        items={options.map(o => ({
            value: o.value,
            label: o.label + (o.hint === 'INSTALLED' ? ' (Installed)' : ''),
            key: o.value
        }))}
        isMulti={true}
        initialSelected={initialSelected}
        onSelect={() => {}}
        onSubmit={handleSubmit}
        onCancel={onCancel}
      />
    </Box>
  );
};
