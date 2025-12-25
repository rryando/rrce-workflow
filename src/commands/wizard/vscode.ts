import * as fs from 'fs';
import * as path from 'path';
import { getRRCEHome } from '../../lib/paths';
import { type DetectedProject, getProjectFolders } from '../../lib/detection';

interface VSCodeWorkspaceFolder {
  path: string;
  name?: string;
}

interface VSCodeWorkspace {
  folders: VSCodeWorkspaceFolder[];
  settings?: Record<string, unknown>;
}

// Reference folder group prefix - used to visually group linked folders
const REFERENCE_GROUP_PREFIX = '📁 References';

/**
 * Generate or update VSCode workspace file with linked project folders
 * 
 * Features:
 * - Main workspace is clearly marked as the primary project
 * - Linked folders are grouped under a "References" section (via naming)
 * - Folders are organized by project with icons for type (📚 📎 📋)
 * - Reference folders are marked as readonly in workspace settings
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

  // Clear existing folders and rebuild (to ensure proper ordering)
  const existingNonReferencesFolders = workspace.folders.filter(f => 
    f.path === '.' || (!f.name?.includes(REFERENCE_GROUP_PREFIX) && !f.name?.startsWith('📚') && !f.name?.startsWith('📎') && !f.name?.startsWith('📋'))
  );
  
  workspace.folders = [];

  // 1. Add main workspace folder first with clear label
  const mainFolder: VSCodeWorkspaceFolder = { 
    path: '.', 
    name: `🏠 ${workspaceName} (workspace)` 
  };
  workspace.folders.push(mainFolder);

  // 2. Add any other existing non-references folders
  for (const folder of existingNonReferencesFolders) {
    if (folder.path !== '.') {
      workspace.folders.push(folder);
    }
  }

  // 3. Add reference folders grouped by project
  const referenceFolderPaths: string[] = [];
  
  // Determine if we're working with DetectedProject[] or string[]
  const isDetectedProjects = linkedProjects.length > 0 && typeof linkedProjects[0] === 'object';

  if (isDetectedProjects) {
    // New behavior: use DetectedProject[] with knowledge, refs, tasks folders
    const projects = linkedProjects as DetectedProject[];
    
    for (const project of projects) {
      const folders = getProjectFolders(project);
      const sourceLabel = project.source === 'global' ? 'global' : 'local';
      
      for (const folder of folders) {
        referenceFolderPaths.push(folder.path);
        
        // Check if already exists
        const existingIndex = workspace.folders.findIndex(f => f.path === folder.path);
        if (existingIndex === -1) {
          workspace.folders.push({
            path: folder.path,
            name: `${folder.displayName} [${sourceLabel}]`,
          });
        }
      }
    }
  } else {
    // Legacy behavior: string[] of project names (global storage only)
    const projectNames = linkedProjects as string[];
    const rrceHome = customGlobalPath || getRRCEHome();
    
    for (const projectName of projectNames) {
      const projectDataPath = path.join(rrceHome, 'workspaces', projectName);
      
      const folderTypes = [
        { subpath: 'knowledge', icon: '📚', type: 'knowledge' },
        { subpath: 'refs', icon: '📎', type: 'refs' },
        { subpath: 'tasks', icon: '📋', type: 'tasks' },
      ];
      
      for (const { subpath, icon, type } of folderTypes) {
        const folderPath = path.join(projectDataPath, subpath);
        if (fs.existsSync(folderPath)) {
          referenceFolderPaths.push(folderPath);
          
          const existingIndex = workspace.folders.findIndex(f => f.path === folderPath);
          if (existingIndex === -1) {
            workspace.folders.push({
              path: folderPath,
              name: `${icon} ${projectName} (${type}) [global]`,
            });
          }
        }
      }
    }
  }

  // 4. Add workspace settings to mark reference folders as readonly
  // This uses files.readonlyInclude to make imported folders read-only
  if (referenceFolderPaths.length > 0) {
    const readonlyPatterns: Record<string, boolean> = {};
    
    for (const folderPath of referenceFolderPaths) {
      // Create a pattern that matches all files in this folder
      readonlyPatterns[`${folderPath}/**`] = true;
    }
    
    // Merge with existing readonly patterns
    const existingReadonly = (workspace.settings['files.readonlyInclude'] as Record<string, boolean>) || {};
    workspace.settings['files.readonlyInclude'] = {
      ...existingReadonly,
      ...readonlyPatterns,
    };
  }

  // 5. Add helpful workspace settings for multi-root experience
  workspace.settings['explorer.sortOrder'] = workspace.settings['explorer.sortOrder'] || 'default';
  
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
