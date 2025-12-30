/**
 * Gitignore Management - Update .gitignore with rrce-workflow entries
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StorageMode } from '../../types/prompt';

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
  
  // Add tool-specific entries
  if (tools.includes('copilot')) {
    entries.push('.github/agents/');
  }
  
  if (tools.includes('antigravity')) {
    entries.push('.agent/workflows/');
  }
  
  // Add VSCode workspace file
  entries.push('*.code-workspace');
  
  if (entries.length === 0) {
    return false;
  }
  
  // Read existing .gitignore or create new
  let existingContent = '';
  if (fs.existsSync(gitignorePath)) {
    existingContent = fs.readFileSync(gitignorePath, 'utf-8');
  }
  
  // Check if our section already exists
  const sectionMarker = '# RRCE-Workflow Generated';
  if (existingContent.includes(sectionMarker)) {
    // Already configured, skip
    return false;
  }
  
  // Build new section with commented entries (user can uncomment if needed)
  const newSection = `
${sectionMarker}
# Uncomment the following lines if you want to ignore rrce-workflow generated files:
${entries.map(e => `# ${e}`).join('\n')}
`;

  // Append to .gitignore
  const updatedContent = existingContent.trimEnd() + newSection;
  fs.writeFileSync(gitignorePath, updatedContent);
  
  return true;
}
