import * as fs from 'fs';
import * as path from 'path';
import { getRRCEHome } from '../../lib/paths';

interface VSCodeWorkspaceFolder {
  path: string;
  name?: string;
}

interface VSCodeWorkspace {
  folders: VSCodeWorkspaceFolder[];
  settings?: Record<string, unknown>;
}

/**
 * Generate or update VSCode workspace file with linked project knowledge folders
 */
export function generateVSCodeWorkspace(
  workspacePath: string, 
  workspaceName: string, 
  linkedProjects: string[],
  customGlobalPath?: string
) {
  const workspaceFilePath = path.join(workspacePath, `${workspaceName}.code-workspace`);
  
  let workspace: VSCodeWorkspace;
  
  // Check if workspace file already exists
  if (fs.existsSync(workspaceFilePath)) {
    try {
      const content = fs.readFileSync(workspaceFilePath, 'utf-8');
      workspace = JSON.parse(content);
    } catch {
      // If parse fails, create new
      workspace = { folders: [] };
    }
  } else {
    workspace = { folders: [] };
  }

  // Ensure main workspace folder is first
  const mainFolder: VSCodeWorkspaceFolder = { path: '.' };
  const existingMainIndex = workspace.folders.findIndex(f => f.path === '.');
  if (existingMainIndex === -1) {
    workspace.folders.unshift(mainFolder);
  }

  // Add linked project knowledge folders
  const rrceHome = customGlobalPath || getRRCEHome();
  for (const projectName of linkedProjects) {
    const knowledgePath = path.join(rrceHome, 'workspaces', projectName, 'knowledge');
    const folderEntry: VSCodeWorkspaceFolder = {
      path: knowledgePath,
      name: `📚 ${projectName} (knowledge)`
    };

    // Check if already exists
    const existingIndex = workspace.folders.findIndex(f => f.path === knowledgePath);
    if (existingIndex === -1) {
      workspace.folders.push(folderEntry);
    }
  }

  // Write workspace file
  fs.writeFileSync(workspaceFilePath, JSON.stringify(workspace, null, 2));
}
