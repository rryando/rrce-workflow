/**
 * Setup Flow - Main orchestration for the wizard setup process
 * Uses extracted modules for prompts and actions
 */

import { spinner, note, outro, cancel, isCancel, confirm, select } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import type { StorageMode } from '../../types/prompt';
import { type DetectedProject } from '../../lib/detection';
import { resolveGlobalPath } from '../../lib/tui-utils';
import { isOpenCodeInstalled, isAntigravityInstalled, isVSCodeInstalled } from '../../mcp/install';

// Import extracted prompt functions
import {
  promptStorageMode,
  promptTools,
  promptMCPExposure,
  promptLinkedProjects,
  promptGitignore,
  promptRAG,
  promptConfirmation,
} from './setup-prompts';

// Import extracted action functions
import {
  type SetupConfig,
  createDirectoryStructure,
  installAgentPrompts,
  createWorkspaceConfig,
  registerWithMCP,
  getDataPaths,
  installToSelectedIDEs,
} from './setup-actions';

// Re-export for other modules
export { updateGitignore } from './gitignore';
import { generateVSCodeWorkspace } from './vscode';

/**
 * Express Setup - Quick start with recommended defaults (3 steps only)
 */
async function runExpressSetup(
  workspacePath: string,
  workspaceName: string,
  existingProjects: DetectedProject[],
  s: ReturnType<typeof spinner>
): Promise<void> {
  // Step 1: Storage mode
  const storageModeResult = await select({
    message: 'Where should workflow data be stored?',
    options: [
      { value: 'global', label: 'Global (~/.rrce-workflow/)', hint: 'Recommended - cross-project access' },
      { value: 'workspace', label: 'Workspace (.rrce-workflow/)', hint: 'Self-contained' },
    ],
    initialValue: 'global',
  });
  
  if (isCancel(storageModeResult)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  const storageMode = storageModeResult as StorageMode;
  
  // Resolve global path if needed
  let customGlobalPath: string | undefined;
  if (storageMode === 'global') {
    customGlobalPath = await resolveGlobalPath();
    if (!customGlobalPath) {
      cancel('Setup cancelled - no global path selected.');
      process.exit(0);
    }
  }
  
  // Build tools preview based on what's installed
  const toolsPreview: string[] = [];
  if (isOpenCodeInstalled()) toolsPreview.push('OpenCode');
  if (isVSCodeInstalled()) toolsPreview.push('GitHub Copilot');
  if (isAntigravityInstalled()) toolsPreview.push('Antigravity');
  const toolsText = toolsPreview.length > 0 ? toolsPreview.join(', ') : 'None detected';

  // Step 2: Show preview and confirm
  note(
    `${pc.bold('Express Setup will configure:')}\n` +
    `• Storage: ${storageMode === 'global' ? 'Global' : 'Workspace'}\n` +
    `• MCP Server: Enabled\n` +
    `• Semantic Search (RAG): Enabled\n` +
    `• Git ignore entries: Added (as comments)\n` +
    `• AI Tools: ${toolsText}`,
    'Configuration Preview'
  );
  
  const confirmed = await confirm({
    message: 'Proceed with express setup?',
    initialValue: true,
  });
  
  if (isCancel(confirmed) || !confirmed) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  // Build tools list based on what's installed
  const defaultTools: string[] = [];
  if (isOpenCodeInstalled()) defaultTools.push('opencode');
  if (isVSCodeInstalled()) defaultTools.push('copilot');
  if (isAntigravityInstalled()) defaultTools.push('antigravity');

  // Build config with defaults
  const config: SetupConfig = {
    storageMode,
    globalPath: customGlobalPath,
    tools: defaultTools,
    linkedProjects: [],
    addToGitignore: false,
    exposeToMCP: true,
    enableRAG: true,
  };
  
  // Execute setup
  await executeSetup(config, workspacePath, workspaceName, existingProjects, s);
  
  // Offer to start MCP server
  const startMCP = await confirm({
    message: 'Start MCP server now?',
    initialValue: true,
  });
  
  if (startMCP && !isCancel(startMCP)) {
    const { runMCP } = await import('../../mcp/index');
    await runMCP();
  } else {
    outro(pc.green(`✓ Express setup complete! Run ${pc.cyan('npx rrce-workflow mcp')} to start the server.`));
  }
}

/**
 * Run the full setup flow for new workspaces
 */
export async function runSetupFlow(
  workspacePath: string,
  workspaceName: string,
  existingProjects: DetectedProject[]
): Promise<void> {
  const s = spinner();
  
  // Ask for setup mode first
  const setupModeResult = await select({
    message: 'Setup mode:',
    options: [
      { value: 'express', label: 'Express Setup', hint: 'Quick start with recommended defaults (3 steps)' },
      { value: 'custom', label: 'Custom Setup', hint: 'Full configuration options' },
    ],
    initialValue: 'express',
  });
  
  if (isCancel(setupModeResult)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  // Express setup path
  if (setupModeResult === 'express') {
    return runExpressSetup(workspacePath, workspaceName, existingProjects, s);
  }
  
  // === Custom Setup Flow ===
  
  // Collect configuration through prompts
  const storageMode = await promptStorageMode();
  
  // Resolve global path if needed
  let customGlobalPath: string | undefined;
  if (storageMode === 'global') {
    customGlobalPath = await resolveGlobalPath();
    if (!customGlobalPath) {
      cancel('Setup cancelled - no global path selected.');
      process.exit(0);
    }
  }
  
  const tools = await promptTools();
  const exposeToMCP = await promptMCPExposure();

  
  // Skip linking for global mode (as requested by user preference)
  let linkedProjects: string[] = [];
  if (storageMode !== 'global') {
    linkedProjects = await promptLinkedProjects(existingProjects);
  }
  
  const addToGitignore = await promptGitignore();
  const enableRAG = await promptRAG();
  const confirmed = await promptConfirmation();
  
  if (!confirmed) {
    outro('Setup cancelled by user.');
    process.exit(0);
  }
  
  // Build config
  const config: SetupConfig = {
    storageMode,
    globalPath: customGlobalPath,
    tools,
    linkedProjects,
    addToGitignore,
    exposeToMCP,
    enableRAG,
  };
  
  // Execute setup
  await executeSetup(config, workspacePath, workspaceName, existingProjects, s);
  
  // Post-setup flow
  await handlePostSetup(config, workspacePath, workspaceName, linkedProjects);
}

/**
 * Execute the actual setup process
 */
async function executeSetup(
  config: SetupConfig,
  workspacePath: string,
  workspaceName: string,
  allProjects: DetectedProject[],
  s: ReturnType<typeof spinner>
): Promise<void> {
  s.start('Generating configuration');
  
  try {
    const dataPaths = getDataPaths(config.storageMode, workspaceName, workspacePath, config.globalPath);
    
    // Create directory structure
    createDirectoryStructure(dataPaths);
    
    // Install agent prompts and metadata
    installAgentPrompts(config, workspacePath, dataPaths);
    
    // Create workspace config (only for workspace mode)
    createWorkspaceConfig(config, workspacePath, workspaceName);
    
    // Update .gitignore if requested
    if (config.addToGitignore) {
      const { updateGitignore } = await import('./gitignore');
      updateGitignore(workspacePath, config.storageMode, config.tools);
    }
    
    // Generate VSCode workspace file if needed
    // Only if using Copilot in workspace mode (needs local config) OR if linking projects
    const needsVSCodeWorkspace = (config.storageMode === 'workspace' && config.tools.includes('copilot')) || 
                                 config.linkedProjects.length > 0;

    if (needsVSCodeWorkspace) {
      const selectedProjects = allProjects.filter(p => 
        config.linkedProjects.includes(`${p.name}:${p.source}`)
      );
      generateVSCodeWorkspace(workspacePath, workspaceName, selectedProjects, config.globalPath);
    }
    
    // Register with MCP server
    await registerWithMCP(config, workspacePath, workspaceName);
    
    // Install RRCE to selected IDEs (OpenCode, VSCode, Antigravity)
    const ideResults = installToSelectedIDEs(config.tools);
    
    s.stop('Configuration generated');
    
    // Show summary
    const dataSummary = getDataPaths(config.storageMode, workspaceName, workspacePath, config.globalPath);
    const summary = [
      `${pc.green('✓')} Data stored at: ${pc.dim(dataSummary[0])}`,
      config.tools.length > 0 ? `${pc.green('✓')} Tools: ${config.tools.join(', ')}` : null,
      config.exposeToMCP ? `${pc.green('✓')} MCP server configured` : null,
      config.enableRAG ? `${pc.green('✓')} Semantic Search enabled` : null,
      config.linkedProjects.length > 0 ? `${pc.green('✓')} Linked ${config.linkedProjects.length} project(s)` : null,
      ideResults.success.length > 0 
        ? `${pc.green('✓')} RRCE installed to: ${ideResults.success.join(', ')}` 
        : null,
      ideResults.failed.length > 0 
        ? `${pc.yellow('⚠')} Failed to install to: ${ideResults.failed.join(', ')}` 
        : null,
    ].filter(Boolean);
    
    // Add restart hint if any IDEs were installed
    if (ideResults.success.length > 0) {
      summary.push('');
      summary.push(pc.dim('💡 You may need to restart your IDE or refresh MCP config for changes to take effect.'));
    }
    
    note(summary.join('\n'), 'Setup Complete');
    
  } catch (error) {
    s.stop('Error occurred');
    cancel(
      `Setup failed: ${error instanceof Error ? error.message : String(error)}\n\n` +
      `${pc.dim('Tip: You can re-run the wizard to try again.')}`
    );
    process.exit(1);
  }
}

/**
 * Handle post-setup actions (MCP server start, etc.)
 */
async function handlePostSetup(
  config: SetupConfig,
  workspacePath: string,
  workspaceName: string,
  linkedProjects: string[]
): Promise<void> {
  if (config.exposeToMCP) {
    const shouldConfigureMCP = await confirm({
      message: 'Would you like to start the MCP server now?',
      initialValue: true,
    });
    
    if (shouldConfigureMCP && !isCancel(shouldConfigureMCP)) {
      const { runMCP } = await import('../../mcp/index');
      await runMCP();
    } else {
      if (linkedProjects.length > 0) {
        outro(pc.green(`✓ Setup complete! Open ${pc.bold(`${workspaceName}.code-workspace`)} in VSCode.`));
      } else {
        outro(pc.green(`✓ Setup complete! Run ${pc.cyan('npx rrce-workflow mcp')} to start the server.`));
      }
    }
  } else {
    if (linkedProjects.length > 0) {
      outro(pc.green(`✓ Setup complete! Open ${pc.bold(`${workspaceName}.code-workspace`)} in VSCode.`));
    } else {
      outro(pc.green(`✓ Setup complete! Your agents are ready to use.`));
    }
  }
}
