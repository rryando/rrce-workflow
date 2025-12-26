
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { SimpleSelect } from './components/SimpleSelect';
import { installToConfig, checkInstallStatus } from '../install';
import { detectWorkspaceRoot } from '../../lib/paths';

interface InstallModalProps {
  onBack: () => void;
}

export const InstallModal = ({ onBack }: InstallModalProps) => {
  const [step, setStep] = useState<'select' | 'installing' | 'done'>('select');
  const [statusMsg, setStatusMsg] = useState('');

  const items = [
    { label: 'VSCode (User Settings)', value: 'vscode-global' },
    { label: 'VSCode (Workspace)', value: 'vscode-workspace' },
    { label: 'Claude Desktop', value: 'claude' },
    { label: 'Antigravity', value: 'antigravity' },
  ];

  // We could verify pre-installation status here, but for now let's just show options.

  const handleInstall = async (targets: string[]) => {
    setStep('installing');
    setStatusMsg('Installing...');
    
    // Process installations
    try {
        const workspacePath = detectWorkspaceRoot();
        const results = [];
        
        for (const target of targets) {
            const result = await installToConfig(target as any, workspacePath);
            results.push(`${target}: ${result ? 'Success' : 'Failed'}`);
        }
        
        setStatusMsg(results.join('\n'));
        setStep('done');
    } catch (e) {
        setStatusMsg(`Error: ${e}`);
        setStep('done');
    }
  };

  if (step === 'done') {
      return (
          <Box flexDirection="column" borderStyle="round" borderColor="green" padding={1}>
              <Text bold color="green">Installation Complete</Text>
              <Text>{statusMsg}</Text>
              <Box marginTop={1}>
                  <SimpleSelect 
                      items={[{ label: 'Back to Dashboard', value: 'back' }]}
                      onSelect={onBack}
                  />
              </Box>
          </Box>
      );
  }

  return (
    <Box flexDirection="column">
      <SimpleSelect 
        message="Select IDEs to install/update MCP config:"
        items={items}
        isMulti={true}
        onSubmit={handleInstall}
        onSelect={() => {}}
        onCancel={onBack}
      />
    </Box>
  );
};
