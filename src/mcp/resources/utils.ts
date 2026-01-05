/**
 * Utility functions shared across resource modules
 */

import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { SKIP_DIRS } from './constants';
import type { DetectedProject } from '../../lib/detection';

/**
 * Estimate token count from text (conservative: chars / 4)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Helper to get project scan root and gitignore configuration
 */
export function getScanContext(project: DetectedProject, scanRoot: string) {
  const gitignorePath = path.join(scanRoot, '.gitignore');
  const ig = fs.existsSync(gitignorePath)
    ? ignore().add(fs.readFileSync(gitignorePath, 'utf-8'))
    : null;

  const toPosixRelativePath = (absolutePath: string): string => {
    const rel = path.relative(scanRoot, absolutePath);
    return rel.split(path.sep).join('/');
  };

  const isUnderGitDir = (absolutePath: string): boolean => {
    const rel = toPosixRelativePath(absolutePath);
    return rel === '.git' || rel.startsWith('.git/');
  };

  const isIgnoredByGitignore = (absolutePath: string, isDir: boolean): boolean => {
    if (!ig) return false;
    const rel = toPosixRelativePath(absolutePath);
    return ig.ignores(isDir ? `${rel}/` : rel);
  };

  const shouldSkipEntryDir = (absolutePath: string): boolean => {
    const dirName = path.basename(absolutePath);
    if (dirName === '.git') return true;
    if (SKIP_DIRS.includes(dirName)) return true;
    if (isIgnoredByGitignore(absolutePath, true)) return true;
    return false;
  };

  const shouldSkipEntryFile = (absolutePath: string): boolean => {
    if (isUnderGitDir(absolutePath)) return true;
    if (isIgnoredByGitignore(absolutePath, false)) return true;
    return false;
  };

  return { shouldSkipEntryDir, shouldSkipEntryFile };
}
