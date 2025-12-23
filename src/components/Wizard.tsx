import * as React from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import type { StorageMode } from '../types/prompt';
import { getGitUser } from '../lib/git';
import { detectWorkspaceRoot, getWorkspaceName } from '../lib/paths';

interface WizardProps {
  onComplete: (config: WizardConfig) => void;
}

export interface WizardConfig {
  workspaceName: string;
  workspacePath: string;
  storageMode: StorageMode;
  tools: {
    copilot: boolean;
    antigravity: boolean;
  };
  gitUser: string | null;
}

type WizardStep = 'welcome' | 'storage' | 'tools' | 'confirm';

const storageModeItems = [
  { label: 'Global (~/.rrce-workflow/)', value: 'global' as StorageMode },
  { label: 'Workspace (.rrce-workflow/)', value: 'workspace' as StorageMode },
  { label: 'Both', value: 'both' as StorageMode },
];

export function Wizard({ onComplete }: WizardProps) {
  const workspacePath = detectWorkspaceRoot();
  const workspaceName = getWorkspaceName(workspacePath);
  const gitUser = getGitUser();

  const [step, setStep] = React.useState<WizardStep>('welcome');
  const [storageMode, setStorageMode] = React.useState<StorageMode>('global');
  const [tools, setTools] = React.useState({ copilot: true, antigravity: true });

  useInput((input, key) => {
    if (step === 'welcome' && key.return) {
      setStep('storage');
    } else if (step === 'confirm' && key.return) {
      onComplete({
        workspaceName,
        workspacePath,
        storageMode,
        tools,
        gitUser,
      });
    }
  });

  const handleStorageSelect = (item: { value: StorageMode }) => {
    setStorageMode(item.value);
    setStep('tools');
  };

  const handleToolsSelect = (item: { value: string }) => {
    if (item.value === 'done') {
      setStep('confirm');
    } else if (item.value === 'copilot') {
      setTools((t: typeof tools) => ({ ...t, copilot: !t.copilot }));
    } else if (item.value === 'antigravity') {
      setTools((t: typeof tools) => ({ ...t, antigravity: !t.antigravity }));
    }
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2}>
        <Text bold color="cyan">RRCE-Workflow Setup</Text>
      </Box>

      <Box marginTop={1}>
        {step === 'welcome' && (
          <Box flexDirection="column">
            <Text>Welcome! Detecting your environment...</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>
                <Text color="green">✓</Text> Git user: <Text bold>{gitUser || '(not found)'}</Text>
              </Text>
              <Text>
                <Text color="green">✓</Text> Workspace: <Text bold>{workspaceName}</Text>
              </Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Press Enter to continue...</Text>
            </Box>
          </Box>
        )}

        {step === 'storage' && (
          <Box flexDirection="column">
            <Text>Where should workflow data be stored?</Text>
            <Box marginTop={1}>
              <SelectInput items={storageModeItems} onSelect={handleStorageSelect} />
            </Box>
          </Box>
        )}

        {step === 'tools' && (
          <Box flexDirection="column">
            <Text>Which AI tools do you use?</Text>
            <Box marginTop={1}>
              <SelectInput
                items={[
                  { label: `[${tools.copilot ? 'x' : ' '}] GitHub Copilot (VSCode)`, value: 'copilot' },
                  { label: `[${tools.antigravity ? 'x' : ' '}] Antigravity IDE`, value: 'antigravity' },
                  { label: '───────────────', value: 'sep' },
                  { label: 'Done', value: 'done' },
                ]}
                onSelect={handleToolsSelect}
              />
            </Box>
          </Box>
        )}

        {step === 'confirm' && (
          <Box flexDirection="column">
            <Text bold color="green">Configuration Summary</Text>
            <Box marginTop={1} flexDirection="column">
              <Text>• Storage: <Text bold>{storageMode}</Text></Text>
              <Text>• Copilot: <Text bold>{tools.copilot ? 'Yes' : 'No'}</Text></Text>
              <Text>• Antigravity: <Text bold>{tools.antigravity ? 'Yes' : 'No'}</Text></Text>
            </Box>
            <Box marginTop={1}>
              <Text dimColor>Press Enter to create configuration...</Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
