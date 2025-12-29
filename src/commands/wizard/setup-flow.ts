import { group, text, select, multiselect, confirm, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import type { StorageMode } from '../../types/prompt';
import { 
  ensureDir, 
  getAgentPromptPath,
  syncMetadataToAll,
  copyDirToAllStoragePaths,
  getDefaultRRCEHome
} from '../../lib/paths';
import { loadPromptsFromDir, getAgentCorePromptsDir, getAgentCoreDir } from '../../lib/prompts';
import { copyPromptsToDir } from './utils';
import { generateVSCodeWorkspace } from './vscode';
import { type DetectedProject } from '../../lib/detection';
import { resolveGlobalPath } from '../../lib/tui-utils';

interface SetupConfig {
  storageMode: StorageMode;
  globalPath?: string;
  tools: string[];
  linkedProjects: string[];
  addToGitignore: boolean;
  exposeToMCP: boolean;
  enableRAG: boolean;
}

/**
 * Express Setup - Quick start with recommended defaults (3 steps only)
 */
async function runExpressSetup(
  workspacePath: string,
  workspaceName: string,
  existingProjects: DetectedProject[],
  s: ReturnType<typeof spinner>
): Promise<void> {
  // Step 1: Storage mode (respects global/workspace preference)
  const storageMode = await select({
    message: 'Where should workflow data be stored?',
    options: [
      { value: 'global', label: 'Global (~/.rrce-workflow/)', hint: 'Recommended - cross-project access' },
      { value: 'workspace', label: 'Workspace (.rrce-workflow/)', hint: 'Self-contained' },
    ],
    initialValue: 'global',
  });
  
  if (isCancel(storageMode)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  // Resolve global path if needed
  let customGlobalPath: string | undefined;
  if (storageMode === 'global') {
    customGlobalPath = await resolveGlobalPath();
    if (!customGlobalPath) {
      cancel('Setup cancelled - no global path selected.');
      process.exit(0);
    }
  }
  
  // Step 2: Confirm with summary of defaults
  note(
    `${pc.bold('Express Setup will configure:')}\n` +
    `• Storage: ${storageMode === 'global' ? 'Global' : 'Workspace'}\n` +
    `• MCP Server: Enabled\n` +
    `• Semantic Search (RAG): Enabled\n` +
    `• Git ignore entries: Added (as comments)\n` +
    `• AI Tools: All available`,
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
  
  // Generate with defaults
  s.start('Generating configuration');
  
  try {
    await generateConfiguration({
      storageMode: storageMode as StorageMode,
      globalPath: customGlobalPath,
      tools: ['copilot', 'antigravity'], // All tools
      linkedProjects: [], // No linking in express mode
      addToGitignore: true,
      exposeToMCP: true,
      enableRAG: true,
    }, workspacePath, workspaceName, existingProjects);
    
    s.stop('Configuration generated');
    
    // Summary
    const summary = [
      `${pc.green('✓')} Agent prompts installed`,
      `${pc.green('✓')} MCP server configured`,
      `${pc.green('✓')} Semantic Search enabled`,
    ];
    note(summary.join('\n'), 'Setup Complete');
    
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
  } catch (error) {
    s.stop('Error occurred');
    cancel(`Express setup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
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
  const setupMode = await select({
    message: 'Setup mode:',
    options: [
      { value: 'express', label: 'Express Setup', hint: 'Quick start with recommended defaults (3 steps)' },
      { value: 'custom', label: 'Custom Setup', hint: 'Full configuration options' },
    ],
    initialValue: 'express',
  });
  
  if (isCancel(setupMode)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }
  
  // Express setup - minimal prompts with smart defaults
  if (setupMode === 'express') {
    return runExpressSetup(workspacePath, workspaceName, existingProjects, s);
  }
  
  // Full custom setup flow
  const config = await group(
    {
      storageMode: () =>
        select({
          message: 'Where should workflow data be stored?',
          options: [
            { value: 'global', label: 'Global (~/.rrce-workflow/)', hint: 'Cross-project access, clean workspace' },
            { value: 'workspace', label: 'Workspace (.rrce-workflow/)', hint: 'Self-contained, version with repo' },
          ],
          initialValue: 'global',
        }),
      tools: () =>
        multiselect({
          message: 'Which AI tools do you use?',
          options: [
            { value: 'copilot', label: 'GitHub Copilot', hint: 'VSCode' },
            { value: 'antigravity', label: 'Antigravity IDE' },
          ],
          required: false,
        }),
      exposeToMCP: () =>
        confirm({
          message: 'Expose this project to MCP (AI Agent) server?',
          initialValue: true,
        }),
      linkedProjects: () => {
        // Only show if there are other projects to link
        if (existingProjects.length === 0) {
          return Promise.resolve([]);
        }
        return multiselect({
          message: 'Link knowledge from other projects?',
          options: existingProjects.map(project => ({
            value: `${project.name}:${project.source}`,  // Unique key
            label: `${project.name} ${pc.dim(`(${project.source})`)}`,
            hint: pc.dim(project.source === 'global' 
              ? `~/.rrce-workflow/workspaces/${project.name}`
              : project.dataPath
            ),
          })),
          required: false,
        });
      },
      addToGitignore: () =>
        confirm({
          message: 'Add generated folders to .gitignore? (as comments - uncomment if needed)',
          initialValue: true,
        }),
      enableRAG: () => 
        confirm({
          message: `Enable Semantic Search (Local Mini RAG)?\n${pc.yellow('⚠ First use will download a ~100MB model')}`,
          initialValue: true,
        }),
      confirm: () =>
        confirm({
          message: 'Create configuration?',
          initialValue: true,
        }),
    },
    {
      onCancel: () => {
        cancel('Setup process cancelled.');
        process.exit(0);
      },
    }
  );

  if (!config.confirm) {
    outro('Setup cancelled by user.');
    process.exit(0);
  }

  // Determine global path for 'global' mode
  let customGlobalPath: string | undefined;
  
  if (config.storageMode === 'global') {
    customGlobalPath = await resolveGlobalPath();
    if (!customGlobalPath) {
      cancel('Setup cancelled - no writable global path available.');
      process.exit(1);
    }
  }
  
  if (config.storageMode === 'global') {
      const targetGlobalPath = path.join(customGlobalPath || getDefaultRRCEHome(), 'workspaces', workspaceName);
      if (fs.existsSync(targetGlobalPath)) {
          const overwriteAction = await select({
              message: `Project '${workspaceName}' already exists globally.`,
              options: [
                  { value: 'overwrite', label: 'Overwrite existing project', hint: 'Will replace global config' },
                  { value: 'cancel', label: 'Cancel setup' }
              ],
          });
          
          if (isCancel(overwriteAction) || overwriteAction === 'cancel') {
              cancel('Setup cancelled.');
              process.exit(0);
          }
          // If overwrite, we just proceed. ensureDir will be called later.
      }
  }

  s.start('Generating configuration');

  try {
    await generateConfiguration({
      storageMode: config.storageMode as StorageMode,
      globalPath: customGlobalPath,
      tools: config.tools as string[],
      linkedProjects: config.linkedProjects as string[],
      addToGitignore: config.addToGitignore as boolean,
      exposeToMCP: config.exposeToMCP as boolean,
      enableRAG: (config.enableRAG) as boolean,
    }, workspacePath, workspaceName, existingProjects);

    s.stop('Configuration generated');
    
    // Show summary
    const dataPaths = getDataPaths(
      config.storageMode as StorageMode, 
      workspaceName, 
      workspacePath,
      customGlobalPath
    );
    
    const summary = [
      `Storage: ${config.storageMode}`,
    ];
    
    if (customGlobalPath && customGlobalPath !== getDefaultRRCEHome()) {
      summary.push(`Global path: ${pc.cyan(customGlobalPath)}`);
    }
    
    if (dataPaths.length > 0) {
      summary.push(`Data paths:`);
      dataPaths.forEach(p => summary.push(`  - ${p}`));
    }
    
    const selectedTools = config.tools as string[];
    if (selectedTools.length > 0) {
      summary.push(`Tools: ${selectedTools.join(', ')}`);
    }

    const linkedProjects = config.linkedProjects as string[];
    if (linkedProjects.length > 0) {
      summary.push(`Linked projects: ${linkedProjects.join(', ')}`);
      summary.push(`Workspace file: ${pc.cyan(`${workspaceName}.code-workspace`)}`);
    }
    
    note(summary.join('\n'), 'Setup Summary');
    
    // MCP Configuration handling
    // If user opted to expose to MCP during setup, we don't need to ask again
    // But we might want to ask to START the server if it's not running?
    // For now, let's keep it simple: if they didn't expose, ask if they want to configure.
    
    if (config.exposeToMCP) {
        // Already handled in generateConfiguration, just let them know
        note(`${pc.green('✓')} Project exposed to MCP Hub`, 'MCP Configuration');
        
        // Maybe ask to start server if installed?
        // For now, just finish gracefully.
        if (linkedProjects.length > 0) {
            outro(pc.green(`✓ Setup complete! Open ${pc.bold(`${workspaceName}.code-workspace`)} in VSCode to access linked knowledge.`));
        } else {
            outro(pc.green(`✓ Setup complete! Your agents are ready to use.`));
        }
    } else {
        // Gateway to MCP Setup (Validation: only if NOT exposed)
        const shouldConfigureMCP = await confirm({
          message: 'Would you like to configure the MCP server now?',
          initialValue: true,
        });

        if (shouldConfigureMCP && !isCancel(shouldConfigureMCP)) {
          const { runMCP } = await import('../../mcp/index');
          await runMCP();
        } else {
          // Show appropriate outro message
          if (linkedProjects.length > 0) {
            outro(pc.green(`✓ Setup complete! Open ${pc.bold(`${workspaceName}.code-workspace`)} in VSCode to access linked knowledge.`));
          } else {
            outro(pc.green(`✓ Setup complete! Your agents are ready to use.`));
          }
        }
    }

  } catch (error) {
    s.stop('Error occurred');
    cancel(`Failed to setup: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Generate configuration files and directories
 */
async function generateConfiguration(
  config: SetupConfig,
  workspacePath: string,
  workspaceName: string,
  allProjects: DetectedProject[] = []
): Promise<void> {
  const dataPaths = getDataPaths(config.storageMode, workspaceName, workspacePath, config.globalPath);
  
  for (const dataPath of dataPaths) {
    ensureDir(dataPath);
    // Create agent metadata subdirectories (data only, no prompts)
    ensureDir(path.join(dataPath, 'knowledge'));
    ensureDir(path.join(dataPath, 'refs'));
    ensureDir(path.join(dataPath, 'tasks'));
    ensureDir(path.join(dataPath, 'templates'));
  }

  // Get the agent-core directory path
  const agentCoreDir = getAgentCoreDir();
  
  // Sync metadata (knowledge, refs, tasks) from agent-core to all storage locations
  syncMetadataToAll(agentCoreDir, dataPaths);
  
  // Also copy templates to all storage locations
  copyDirToAllStoragePaths(path.join(agentCoreDir, 'templates'), 'templates', dataPaths);

  // Load prompts for IDE-specific locations
  const prompts = loadPromptsFromDir(getAgentCorePromptsDir());

  // Copy prompts to tool-specific locations (for IDE integration)
  // Only copy to local workspace if we are in workspace mode
  // If in global mode, we assume the user wants to avoid local clutter or relies on global paths
  if (config.storageMode === 'workspace') {
      if (config.tools.includes('copilot')) {
        const copilotPath = getAgentPromptPath(workspacePath, 'copilot');
        ensureDir(copilotPath);
        copyPromptsToDir(prompts, copilotPath, '.agent.md');
      }

      if (config.tools.includes('antigravity')) {
        const antigravityPath = getAgentPromptPath(workspacePath, 'antigravity');
        ensureDir(antigravityPath);
        copyPromptsToDir(prompts, antigravityPath, '.md');
      }
  }

  // Create workspace config (inside .rrce-workflow folder)
  // ONLY if storageMode is 'workspace'. In global mode, we rely on mcp.yaml registration.
  if (config.storageMode === 'workspace') {
      const workspaceConfigPath = path.join(workspacePath, '.rrce-workflow', 'config.yaml');
      ensureDir(path.dirname(workspaceConfigPath));
      
      let configContent = `# RRCE-Workflow Configuration
version: 1

storage:
  mode: ${config.storageMode}`;

      // Add custom global path if different from default
      if (config.globalPath && config.globalPath !== getDefaultRRCEHome()) {
        configContent += `\n  globalPath: "${config.globalPath}"`;
      }

      configContent += `

project:
  name: "${workspaceName}"

tools:
  copilot: ${config.tools.includes('copilot')}
  antigravity: ${config.tools.includes('antigravity')}
`;

      // Add linked projects if any
      if (config.linkedProjects.length > 0) {
        configContent += `\nlinked_projects:\n`;
        config.linkedProjects.forEach(name => {
          configContent += `  - ${name}\n`;
        });
      }

      fs.writeFileSync(workspaceConfigPath, configContent);
  }

  // Add generated folders to .gitignore if user opted in
  if (config.addToGitignore) {
    updateGitignore(workspacePath, config.storageMode, config.tools);
  }

  // Generate VSCode workspace file if using copilot or has linked projects
  if (config.tools.includes('copilot') || config.linkedProjects.length > 0) {
    // Look up the full DetectedProject objects for selected project keys (format: name:source)
    const selectedProjects = allProjects.filter(p => 
      config.linkedProjects.includes(`${p.name}:${p.source}`)
    );
    generateVSCodeWorkspace(workspacePath, workspaceName, selectedProjects, config.globalPath);
  }

  // Expose to MCP if requested
  if (config.exposeToMCP) {
    try {
      // Dynamic imports to avoid circular deps or heavy loads if not needed
      const { loadMCPConfig, saveMCPConfig, setProjectConfig } = await import('../../mcp/config');
      const { getWorkspaceName } = await import('../../lib/paths');
      
      const mcpConfig = loadMCPConfig();
      const currentProjectName = workspaceName; // Already validated in setup-flow
      
      // We need to know the SOURCE of this project. 
      // Since we are running IN the project, and we just set it up...
      // If storageMode is global, source is global.
      // If storageMode is workspace, source is workspace.
      
      // Actually, scanForProjects would detect it. But we can just add it blindly if we trust our paths.
      // However, the MCP config only stores the NAME and EXPOSE status. 
      // The `scanForProjects` function in `lib/detection` is responsible for finding the path.
      // So as long as we add it to the config, `scanForProjects` will find it (if it's in a scannable location?)
      
      // Wait, `mcp.yaml` config purely stores "project X is exposed: true".
      // It relies on `scanForProjects` to find "project X".
      // If `scanForProjects` can't find it (e.g. custom location not in home dir scan), then exposing it does nothing.
      // BUT `scanForProjects` scans the `workspaces` dir in global home.
      
      if (config.storageMode === 'workspace') {
          // If in workspace mode, it might NOT be found by default scan if it's in a random folder.
           // Setting project config with RAG option if enabled
          setProjectConfig(
            mcpConfig, 
            currentProjectName, 
            true, 
            undefined, // permissions
            undefined, // path
            config.enableRAG ? { enabled: true } : undefined // semanticSearch
          );
          saveMCPConfig(mcpConfig);
      } else {
          // Global mode -> definitely in `~/.rrce-workflow/workspaces/` so it will be found.
          // BUT we must register the current workspace PATH so `detection/scan` can know about it?
          // Wait, `npx rrce` running in THIS folder needs to know it is configured.
          // Detection checks `mcp.yaml`.
          // So we MUST provide `path`.
          setProjectConfig(
            mcpConfig, 
            currentProjectName, 
            true, 
            undefined, // permissions
            workspacePath, // <--- IMPORTANT: Register absolute path so config scanner finds it
            config.enableRAG ? { enabled: true } : undefined // semanticSearch
          );
          saveMCPConfig(mcpConfig);
      }

    } catch (e) {
      // Non-fatal: Don't fail setup if MCP config fails
      note(
        `${pc.yellow('⚠')} Could not register project with MCP\n` +
        `Error: ${e instanceof Error ? e.message : String(e)}\n\n` +
        `You can configure MCP later: ${pc.cyan('npx rrce-workflow mcp')}`,
        'MCP Registration Warning'
      );
    }
  }
}

/**
 * Get data paths based on storage mode and custom global path
 */
function getDataPaths(
  mode: StorageMode, 
  workspaceName: string, 
  workspaceRoot: string,
  customGlobalPath?: string
): string[] {
  const globalPath = path.join(customGlobalPath || getDefaultRRCEHome(), 'workspaces', workspaceName);
  const workspacePath = path.join(workspaceRoot, '.rrce-workflow');
  
  switch (mode) {
    case 'global':
      return [globalPath];
    case 'workspace':
      return [workspacePath];
    default:
      return [globalPath];
  }
}

/**
 * Add generated folders to .gitignore based on storage mode and selected tools
 */
export function updateGitignore(workspacePath: string, storageMode: StorageMode, tools: string[]): boolean {
  const gitignorePath = path.join(workspacePath, '.gitignore');
  
  // Determine which entries to add based on config
  const entries: string[] = [];
  
  // Always add .rrce-workflow/ for workspace mode (data folder)
  if (storageMode === 'workspace') {
    entries.push('.rrce-workflow/');
  }
  
  // Add IDE-specific folders based on selected tools
  if (tools.includes('copilot')) {
    entries.push('.github/agents/');
  }
  if (tools.includes('antigravity')) {
    entries.push('.agent/');
  }
  
  if (entries.length === 0) {
    return false; // Nothing to add
  }
  
  try {
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf-8');
    }
    
    const lines = content.split('\n').map(line => line.trim());
    const newEntries: string[] = [];
    
    for (const entry of entries) {
      // Check if entry already exists (active or commented)
      const entryWithoutSlash = entry.replace(/\/$/, '');
      const commentedEntry = `# ${entry}`;
      const commentedEntryNoSlash = `# ${entryWithoutSlash}`;
      if (!lines.some(line => 
        line === entry || 
        line === entryWithoutSlash ||
        line === commentedEntry ||
        line === commentedEntryNoSlash
      )) {
        newEntries.push(entry);
      }
    }
    
    if (newEntries.length === 0) {
      return false; // All entries already present
    }
    
    // Add entries to gitignore as comments
    let newContent = content;
    if (!newContent.endsWith('\n') && newContent !== '') {
      newContent += '\n';
    }
    
    // Add a comment header if not present
    if (newContent === '' || !content.includes('# rrce-workflow')) {
      newContent += '\n# rrce-workflow generated folders (uncomment to ignore)\n';
    }
    
    // Add entries as comments so IDEs can still read them
    newContent += newEntries.map(e => `# ${e}`).join('\n') + '\n';
    
    fs.writeFileSync(gitignorePath, newContent);
    return true;
  } catch {
    return false;
  }
}
