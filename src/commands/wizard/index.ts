import { intro, select, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import { getGitUser } from '../../lib/git';
import { 
  detectWorkspaceRoot, 
  getWorkspaceName, 
  getLocalWorkspacePath,
  getConfigPath
} from '../../lib/paths';
import { scanForProjects } from '../../lib/detection';

// Import flows
import { runSetupFlow } from './setup-flow';
import { runLinkProjectsFlow } from './link-flow';
import { runSyncToGlobalFlow } from './sync-flow';
import { runUpdateFlow } from './update-flow';

export async function runWizard() {
  intro(pc.cyan(pc.inverse(' RRCE-Workflow Setup ')));

  const s = spinner();
  s.start('Detecting environment');

  const workspacePath = detectWorkspaceRoot();
  const workspaceName = getWorkspaceName(workspacePath);
  const gitUser = getGitUser();

  await new Promise(r => setTimeout(r, 800)); // Dramatic pause
  s.stop('Environment detected');

  note(
    `Git User:  ${pc.bold(gitUser || '(not found)')}
Workspace: ${pc.bold(workspaceName)}`,
    'Context'
  );

  // Scan for existing projects (global storage + home directory)
  const detectedProjects = scanForProjects({
    excludeWorkspace: workspaceName,
    workspacePath: workspacePath,
  });
  
  // Check if already configured (using getConfigPath for new/legacy support)
  const configFilePath = getConfigPath(workspacePath);
  const isAlreadyConfigured = fs.existsSync(configFilePath);
  
  // Check current storage mode from config
  let currentStorageMode: string | null = null;
  if (isAlreadyConfigured) {
    try {
      const configContent = fs.readFileSync(configFilePath, 'utf-8');
      const modeMatch = configContent.match(/mode:\s*(global|workspace)/);
      currentStorageMode = modeMatch?.[1] ?? null;
    } catch {
      // Ignore parse errors
    }
  }

  // Check if workspace has local data that could be synced
  const localDataPath = getLocalWorkspacePath(workspacePath);
  const hasLocalData = fs.existsSync(localDataPath);

  // If already configured, show menu
  if (isAlreadyConfigured) {
    const menuOptions: { value: string; label: string; hint?: string }[] = [];
    
    // Add link option if other projects exist
    if (detectedProjects.length > 0) {
      menuOptions.push({ 
        value: 'link', 
        label: 'Link other project knowledge', 
        hint: `${detectedProjects.length} projects detected (global + sibling)` 
      });
    }
    
    // Add sync to global option if using workspace-only mode
    if (currentStorageMode === 'workspace' && hasLocalData) {
      menuOptions.push({ 
        value: 'sync-global', 
        label: 'Sync to global storage', 
        hint: 'Share knowledge with other projects' 
      });
    }
    
    menuOptions.push({ value: 'update', label: 'Update from package', hint: 'Get latest prompts & templates' });
    menuOptions.push({ value: 'exit', label: 'Exit' });

    const action = await select({
      message: 'This workspace is already configured. What would you like to do?',
      options: menuOptions,
    });

    if (isCancel(action) || action === 'exit') {
      outro('Exited.');
      process.exit(0);
    }

    if (action === 'link') {
      await runLinkProjectsFlow(workspacePath, workspaceName);
      return;
    }

    if (action === 'sync-global') {
      await runSyncToGlobalFlow(workspacePath, workspaceName);
      return;
    }

    if (action === 'update') {
      await runUpdateFlow(workspacePath, workspaceName, currentStorageMode);
      return;
    }
  }

  // Run full setup flow for new workspaces
  await runSetupFlow(workspacePath, workspaceName, detectedProjects);
}
