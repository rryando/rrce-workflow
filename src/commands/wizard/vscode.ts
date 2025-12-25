import * as fs from 'fs';
import * as path from 'path';
import { getRRCEHome } from '../../lib/paths';
import { type DetectedProject } from '../../lib/detection';

interface VSCodeWorkspaceFolder {
  path: string;
  name?: string;
}

interface VSCodeWorkspace {
  folders: VSCodeWorkspaceFolder[];
  settings?: Record<string, unknown>;
}

/**
 * Generate or update VSCode workspace file with linked project folders
 * 
 * Now imports the full .rrce-workflow data folder for each linked project
 * instead of separate knowledge/refs/tasks folders
 */
export function generateVSCodeWorkspace(
  workspacePath: string, 
  workspaceName: string, 
  linkedProjects: string[] | DetectedProject[],
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
      workspace = { folders: [], settings: {} };
    }
  } else {
    workspace = { folders: [], settings: {} };
  }

  // Initialize settings if not present
  if (!workspace.settings) {
    workspace.settings = {};
  }

  // Clear existing linked project folders (those with 📁 prefix) and rebuild
  workspace.folders = workspace.folders.filter(f => 
    f.path === '.' || (!f.name?.startsWith('📁') && !f.name?.startsWith('📚') && !f.name?.startsWith('📎') && !f.name?.startsWith('📋'))
  );

  // Ensure main workspace folder is first with clear label
  const mainFolderIndex = workspace.folders.findIndex(f => f.path === '.');
  if (mainFolderIndex === -1) {
    workspace.folders.unshift({ 
      path: '.', 
      name: `🏠 ${workspaceName} (workspace)` 
    });
  } else {
    // Update the name if it exists
    workspace.folders[mainFolderIndex] = {
      path: '.',
      name: `🏠 ${workspaceName} (workspace)`
    };
  }

  // Add linked project data folders
  const referenceFolderPaths: string[] = [];
  
  // Determine if we're working with DetectedProject[] or string[]
  const isDetectedProjects = linkedProjects.length > 0 && typeof linkedProjects[0] === 'object';

  if (isDetectedProjects) {
    // New behavior: use DetectedProject[] - import full data folder
    const projects = linkedProjects as DetectedProject[];
    
    for (const project of projects) {
      const sourceLabel = project.source === 'global' ? 'global' : 'local';
      
      // Import the full .rrce-workflow data folder
      const folderPath = project.dataPath;
      
      if (fs.existsSync(folderPath)) {
        referenceFolderPaths.push(folderPath);
        
        workspace.folders.push({
          path: folderPath,
          name: `📁 ${project.name} [${sourceLabel}]`,
        });
      }
    }
  } else {
    // Legacy behavior: string[] of project names (global storage only)
    const projectNames = linkedProjects as string[];
    const rrceHome = customGlobalPath || getRRCEHome();
    
    for (const projectName of projectNames) {
      const folderPath = path.join(rrceHome, 'workspaces', projectName);
      
      if (fs.existsSync(folderPath)) {
        referenceFolderPaths.push(folderPath);
        
        workspace.folders.push({
          path: folderPath,
          name: `📁 ${projectName} [global]`,
        });
      }
    }
  }

  // Add workspace settings to mark reference folders as readonly
  if (referenceFolderPaths.length > 0) {
    const readonlyPatterns: Record<string, boolean> = {};
    
    for (const folderPath of referenceFolderPaths) {
      readonlyPatterns[`${folderPath}/**`] = true;
    }
    
    // Merge with existing readonly patterns (clear old linked project patterns first)
    const existingReadonly = (workspace.settings['files.readonlyInclude'] as Record<string, boolean>) || {};
    const cleanedReadonly: Record<string, boolean> = {};
    
    // Keep non-.rrce-workflow patterns
    for (const [pattern, value] of Object.entries(existingReadonly)) {
      if (!pattern.includes('.rrce-workflow') && !pattern.includes('rrce-workflow/workspaces')) {
        cleanedReadonly[pattern] = value;
      }
    }
    
    workspace.settings['files.readonlyInclude'] = {
      ...cleanedReadonly,
      ...readonlyPatterns,
    };
  }

  // Write workspace file with nice formatting
  fs.writeFileSync(workspaceFilePath, JSON.stringify(workspace, null, 2));
}

/**
 * Remove a project's folders from the workspace file
 */
export function removeProjectFromWorkspace(
  workspacePath: string,
  workspaceName: string,
  projectName: string
) {
  const workspaceFilePath = path.join(workspacePath, `${workspaceName}.code-workspace`);
  
  if (!fs.existsSync(workspaceFilePath)) {
    return;
  }

  try {
    const content = fs.readFileSync(workspaceFilePath, 'utf-8');
    const workspace: VSCodeWorkspace = JSON.parse(content);
    
    // Filter out folders that match the project name
    workspace.folders = workspace.folders.filter(f => 
      !f.name?.includes(projectName)
    );
    
    // Also remove readonly patterns for this project
    if (workspace.settings?.['files.readonlyInclude']) {
      const readonly = workspace.settings['files.readonlyInclude'] as Record<string, boolean>;
      for (const pattern of Object.keys(readonly)) {
        if (pattern.includes(projectName)) {
          delete readonly[pattern];
        }
      }
    }
    
    fs.writeFileSync(workspaceFilePath, JSON.stringify(workspace, null, 2));
  } catch {
    // Ignore errors
  }
}
