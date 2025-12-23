import * as React from 'react';
import { Box, Text } from 'ink';
import { Wizard, type WizardConfig } from './components/Wizard';
import { AgentSelector } from './components/AgentSelector';
import { loadPromptsFromDir, getAgentCorePromptsDir } from './lib/prompts';
import { ensureDir, getAgentPromptPath, resolveDataPath, getRRCEHome } from './lib/paths';
import type { ParsedPrompt } from './types/prompt';
import * as fs from 'fs';
import * as path from 'path';

type AppMode = 'wizard' | 'select' | 'done';

interface AppProps {
  command?: string;
}

export function App({ command }: AppProps) {
  const [mode, setMode] = React.useState<AppMode>(command === 'wizard' ? 'wizard' : 'select');
  const [selectedPrompt, setSelectedPrompt] = React.useState<ParsedPrompt | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  // Load prompts from agent-core
  const prompts = loadPromptsFromDir(getAgentCorePromptsDir());

  const handleWizardComplete = (config: WizardConfig) => {
    // Create config file
    const dataPath = resolveDataPath(config.storageMode, config.workspaceName, config.workspacePath);
    ensureDir(dataPath);

    // Copy prompts to appropriate locations
    if (config.tools.copilot) {
      const copilotPath = getAgentPromptPath(config.workspacePath, 'copilot');
      ensureDir(copilotPath);
      copyPromptsToDir(prompts, copilotPath, '.agent.md');
    }

    if (config.tools.antigravity) {
      const antigravityPath = getAgentPromptPath(config.workspacePath, 'antigravity');
      ensureDir(antigravityPath);
      copyPromptsToDir(prompts, antigravityPath, '.md');
    }

    // Create workspace config
    const workspaceConfigPath = path.join(config.workspacePath, '.rrce-workflow.yaml');
    const configContent = `# RRCE-Workflow Configuration
version: 1

storage:
  mode: ${config.storageMode}

project:
  name: "${config.workspaceName}"
`;
    fs.writeFileSync(workspaceConfigPath, configContent);

    setMessage(`✓ Setup complete! Created config and copied agents.`);
    setMode('done');
  };

  const handleAgentSelect = (prompt: ParsedPrompt) => {
    setSelectedPrompt(prompt);
    setMessage(`Selected: ${prompt.frontmatter.name}\n\nUse this agent in your IDE by invoking @${prompt.frontmatter.name}`);
    setMode('done');
  };

  if (mode === 'wizard') {
    return <Wizard onComplete={handleWizardComplete} />;
  }

  if (mode === 'done') {
    return (
      <Box flexDirection="column" padding={1}>
        <Box borderStyle="round" borderColor="green" paddingX={2}>
          <Text bold color="green">RRCE-Workflow</Text>
        </Box>
        <Box marginTop={1}>
          <Text>{message}</Text>
        </Box>
      </Box>
    );
  }

  if (prompts.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="yellow">No prompts found. Run `rrce-workflow wizard` to set up.</Text>
      </Box>
    );
  }

  return (
    <AgentSelector
      prompts={prompts}
      workspaceName={path.basename(process.cwd())}
      onSelect={handleAgentSelect}
    />
  );
}

function copyPromptsToDir(prompts: ParsedPrompt[], targetDir: string, extension: string) {
  for (const prompt of prompts) {
    const baseName = path.basename(prompt.filePath, '.md');
    const targetName = baseName + extension;
    const targetPath = path.join(targetDir, targetName);
    
    // Read the full content including frontmatter
    const content = fs.readFileSync(prompt.filePath, 'utf-8');
    fs.writeFileSync(targetPath, content);
  }
}
