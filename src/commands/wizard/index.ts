import { intro, select, spinner, note, outro, cancel, isCancel, confirm } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { getGitUser } from '../../lib/git';
import { 
  detectWorkspaceRoot, 
  getWorkspaceName, 
  getLocalWorkspacePath,
  getConfigPath,
  getEffectiveRRCEHome,
  getDefaultRRCEHome
} from '../../lib/paths';
import { projectService } from '../../lib/detection-service';
import { getAgentCoreDir } from '../../lib/prompts';

// Import flows
import { runSetupFlow } from './setup-flow';
import { runLinkProjectsFlow } from './link-flow';
import { runSyncToGlobalFlow } from './sync-flow';
import { runUpdateFlow, runSilentUpdate } from './update-flow';
import { runDeleteGlobalProjectFlow } from './delete-flow';
import { runMCP } from '../../mcp/index';
// Dynamic import for config to avoid cyclic load if possible, but static here is fine as long as we catch errors
import { configService, saveMCPConfig, cleanStaleProjects } from '../../mcp/config';

/**
 * Get the current package version from package.json
 */
function getPackageVersion(): string {
  try {
    const agentCoreDir = getAgentCoreDir();
    const packageJsonPath = path.join(path.dirname(agentCoreDir), 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
    }
  } catch (e) {
    // Ignore
  }
  return '0.0.0';
}

/**
 * Get the last synced version from config.yaml or mcp.yaml
 */
function getLastSyncedVersion(workspacePath: string, workspaceName: string): string | undefined {
  // Check config.yaml first
  const configFilePath = getConfigPath(workspacePath);
  if (fs.existsSync(configFilePath)) {
    try {
      const content = fs.readFileSync(configFilePath, 'utf-8');
      const config = parse(content) as any;
      if (config.last_synced_version) {
        return config.last_synced_version;
      }
    } catch (e) {}
  }
  
  // Check mcp.yaml as fallback
  const rrceHome = getEffectiveRRCEHome(workspacePath) || getDefaultRRCEHome();
  const mcpPath = path.join(rrceHome, 'mcp.yaml');
  if (fs.existsSync(mcpPath)) {
    try {
      const content = fs.readFileSync(mcpPath, 'utf-8');
      const config = parse(content) as any;
      const project = config.projects?.find((p: any) => p.name === workspaceName);
      if (project?.last_synced_version) {
        return project.last_synced_version;
      }
    } catch (e) {}
  }
  
  return undefined;
}

/**
 * Check for version drift and prompt for auto-update
 * Returns true if update was applied (or skipped by user), false if user cancelled
 */
async function checkAndPromptUpdate(
  workspacePath: string,
  workspaceName: string,
  currentStorageMode: string | null
): Promise<boolean> {
  const runningVersion = getPackageVersion();
  const lastSyncedVersion = getLastSyncedVersion(workspacePath, workspaceName);
  
  // No version drift - return early
  if (lastSyncedVersion === runningVersion) {
    return true;
  }
  
  // Version drift detected!
  const versionInfo = lastSyncedVersion 
    ? `${pc.dim(lastSyncedVersion)} → ${pc.green(runningVersion)}`
    : `${pc.dim('unknown')} → ${pc.green(runningVersion)}`;
  
  note(
    `${pc.bold(pc.cyan('Update available!'))} ${versionInfo}\n\n` +
    `New prompts, templates, and agent improvements are ready to install.\n` +
    `Your custom knowledge and configuration will be preserved.`,
    '📦 Version Update'
  );
  
  const shouldUpdate = await confirm({
    message: 'Apply update now?',
    initialValue: true,
  });
  
  if (isCancel(shouldUpdate)) {
    return false;
  }
  
  if (shouldUpdate) {
    // Run silent update (no extra prompts)
    await runSilentUpdate(workspacePath, workspaceName, currentStorageMode);
    
    note(
      `${pc.green('✓')} Updated to version ${pc.bold(runningVersion)}\n\n` +
      `All agent prompts, templates, and IDE integrations have been synced.`,
      'Update Complete'
    );
  }
  
  return true;
}

export async function runWizard() {
  intro(pc.cyan(pc.inverse(' RRCE-Workflow Setup ')));

  const s = spinner();
  s.start('Detecting environment');

  const workspacePath = detectWorkspaceRoot();
  const workspaceName = getWorkspaceName(workspacePath);
  const gitUser = getGitUser();

  // Perform stale config cleanup silently or with notification
  try {
      const mcpConfig = configService.load();
      const { config: cleanConfig, removed } = cleanStaleProjects(mcpConfig);
      if (removed.length > 0) {
          saveMCPConfig(cleanConfig);
          // We can notify user or keep it silent. Let's log it to console but not interrupt flow excessively
          // console.log(pc.yellow(`Cleaned up stale projects: ${removed.join(', ')}`));
      }
  } catch (e) {
      // Ignore config errors during startup cleanup
  }

  await new Promise(r => setTimeout(r, 800)); // Dramatic pause
  s.stop('Environment detected');

  note(
    `Git User:  ${pc.bold(gitUser || '(not found)')}
Workspace: ${pc.bold(workspaceName)}`,
    'Context'
  );

  // Scan for existing projects (global storage + home directory)
  const detectedProjects = projectService.scan({
    excludeWorkspace: workspaceName,
    workspacePath: workspacePath,
  });
  
  // Check if already configured (using getConfigPath for new/legacy support)
  const configFilePath = getConfigPath(workspacePath);
  let isAlreadyConfigured = fs.existsSync(configFilePath);
  
  // Check current storage mode from config or MCP status
  let currentStorageMode: string | null = null;
  
  if (isAlreadyConfigured) {
    try {
      const configContent = fs.readFileSync(configFilePath, 'utf-8');
      const modeMatch = configContent.match(/mode:\s*(global|workspace)/);
      currentStorageMode = modeMatch?.[1] ?? null;
    } catch {
      // Ignore parse errors
    }
  } else {
      // Not configured via local file. Check if registered in MCP as global project
      // We need to check if there is an MCP project pointing to this workspace path
      try {
          const mcpConfig = configService.load(); // Imported dynamically above or statically
          // Check for project where path === workspacePath AND it exists (we are in it, so it exists)
          const mcpProject = mcpConfig.projects.find(p => p.path === workspacePath);
          
          if (mcpProject) {
              isAlreadyConfigured = true;
              currentStorageMode = 'global'; // Assume global or at least managed externally
          }
      } catch (e) {
          // ignore
      }
  }

  // Check if workspace has local data that could be synced
  const localDataPath = getLocalWorkspacePath(workspacePath);
  const hasLocalData = fs.existsSync(localDataPath);

  // If already configured, check for updates and show simplified menu
  if (isAlreadyConfigured) {
    // Check for version drift and prompt for auto-update BEFORE showing menu
    const continueToMenu = await checkAndPromptUpdate(workspacePath, workspaceName, currentStorageMode);
    if (!continueToMenu) {
      outro('Exited.');
      process.exit(0);
    }
    
    // Build simplified menu options
    const menuOptions: { value: string; label: string; hint?: string }[] = [];
    
    // Primary action: MCP Dashboard
    menuOptions.push({ 
      value: 'mcp', 
      label: '🔌 MCP Dashboard', 
      hint: 'Manage projects & AI integrations' 
    });
    
    // Secondary: Manage Projects submenu items (shown conditionally)
    if (detectedProjects.some(p => p.source === 'global') || detectedProjects.length > 0) {
      menuOptions.push({
        value: 'manage',
        label: '📁 Manage Projects',
        hint: 'Link, delete, or sync projects'
      });
    }
    
    // Add sync to global option if using workspace-only mode
    if (currentStorageMode === 'workspace' && hasLocalData) {
      menuOptions.push({ 
        value: 'sync-global', 
        label: '☁️  Sync to global storage', 
        hint: 'Share knowledge with other projects' 
      });
    }
    
    // Advanced: Manual update & reconfigure (for users who want more control)
    menuOptions.push({ value: 'advanced', label: '⚙️  Advanced', hint: 'Update, reconfigure, or troubleshoot' });
    menuOptions.push({ value: 'exit', label: '↩  Exit' });

    const action = await select({
      message: 'What would you like to do?',
      options: menuOptions,
    });

    if (isCancel(action) || action === 'exit') {
      outro('Exited.');
      process.exit(0);
    }

    if (action === 'mcp') {
      await runMCP();
      return;
    }
    
    // Handle Manage Projects submenu
    if (action === 'manage') {
      const manageOptions: { value: string; label: string; hint?: string }[] = [];
      
      if (detectedProjects.some(p => p.source === 'global')) {
        manageOptions.push({
          value: 'delete-global',
          label: '🗑️  Delete global project(s)',
          hint: 'Remove knowledge and configuration'
        });
      }
      
      if (detectedProjects.length > 0) {
        manageOptions.push({ 
          value: 'link',  
          label: '🔗 Link other project knowledge', 
          hint: `${detectedProjects.length} projects detected` 
        });
      }
      
      manageOptions.push({ value: 'back', label: '↩  Back to main menu' });
      
      const manageAction = await select({
        message: 'Project Management',
        options: manageOptions,
      });
      
      if (isCancel(manageAction) || manageAction === 'back') {
        // Re-run wizard to show main menu
        return runWizard();
      }
      
      if (manageAction === 'delete-global') {
        await runDeleteGlobalProjectFlow(detectedProjects);
        return;
      }
      
      if (manageAction === 'link') {
        await runLinkProjectsFlow(workspacePath, workspaceName);
        return;
      }
    }

    if (action === 'sync-global') {
      await runSyncToGlobalFlow(workspacePath, workspaceName);
      return;
    }
    
    // Handle Advanced submenu
    if (action === 'advanced') {
      const advancedOptions: { value: string; label: string; hint?: string }[] = [
        { value: 'update', label: '📦 Manual Update', hint: 'Force update from package' },
        { value: 'reconfigure', label: '🔧 Reconfigure Project', hint: 'Change storage mode, tools, etc.' },
        { value: 'back', label: '↩  Back to main menu' }
      ];
      
      const advancedAction = await select({
        message: 'Advanced Options',
        options: advancedOptions,
      });
      
      if (isCancel(advancedAction) || advancedAction === 'back') {
        // Re-run wizard to show main menu
        return runWizard();
      }
      
      if (advancedAction === 'update') {
        await runUpdateFlow(workspacePath, workspaceName, currentStorageMode);
        return;
      }
      
      if (advancedAction === 'reconfigure') {
        // Fall through to runSetupFlow
      }
    }
  }

  // Run full setup flow for new workspaces
  await runSetupFlow(workspacePath, workspaceName, detectedProjects);
}

