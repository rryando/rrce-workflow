import { confirm, spinner, note, outro, cancel, isCancel } from '@clack/prompts';
import pc from 'picocolors';
import * as fs from 'fs';
import * as path from 'path';
import { 
  ensureDir, 
  getLocalWorkspacePath, 
  getGlobalWorkspacePath,
  getEffectiveRRCEHome,
  getConfigPath
} from '../../lib/paths';
import { copyDirRecursive } from './utils';

/**
 * Sync workspace knowledge to global storage so other projects can reference it
 */
export async function runSyncToGlobalFlow(workspacePath: string, workspaceName: string) {
  const localPath = getLocalWorkspacePath(workspacePath);
  const customGlobalPath = getEffectiveRRCEHome(workspacePath);
  const globalPath = path.join(customGlobalPath, 'workspaces', workspaceName);

  // Check what exists locally
  const subdirs = ['knowledge', 'prompts', 'templates', 'tasks', 'refs'];
  const existingDirs = subdirs.filter(dir => 
    fs.existsSync(path.join(localPath, dir))
  );

  if (existingDirs.length === 0) {
    outro(pc.yellow('No data found in workspace storage to sync.'));
    return;
  }

  // Show what will be synced
  note(
    `The following will be copied to global storage:\n${existingDirs.map(d => `  • ${d}/`).join('\n')}\n\nDestination: ${pc.cyan(globalPath)}`,
    'Sync Preview'
  );

  const shouldSync = await confirm({
    message: 'Proceed with sync to global storage?',
    initialValue: true,
  });

  if (isCancel(shouldSync) || !shouldSync) {
    outro('Sync cancelled.');
    return;
  }

  const s = spinner();
  s.start('Syncing to global storage');

  try {
    // Ensure global directory exists
    ensureDir(globalPath);

    // Copy each directory
    for (const dir of existingDirs) {
      const srcDir = path.join(localPath, dir);
      const destDir = path.join(globalPath, dir);
      ensureDir(destDir);
      
      // Copy files recursively
      copyDirRecursive(srcDir, destDir);
    }

    // Update the config to reflect 'both' mode
    const configFilePath = getConfigPath(workspacePath);
    let configContent = fs.readFileSync(configFilePath, 'utf-8');
    configContent = configContent.replace(/mode:\s*workspace/, 'mode: both');
    fs.writeFileSync(configFilePath, configContent);

    s.stop('Sync complete');

    const summary = [
      `Synced directories:`,
      ...existingDirs.map(d => `  ✓ ${d}/`),
      ``,
      `Global path: ${pc.cyan(globalPath)}`,
      `Storage mode updated to: ${pc.bold('both')}`,
      ``,
      `Other projects can now link this knowledge!`,
    ];

    note(summary.join('\n'), 'Sync Summary');

    outro(pc.green('✓ Workspace knowledge synced to global storage!'));

  } catch (error) {
    s.stop('Error occurred');
    cancel(`Failed to sync: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
