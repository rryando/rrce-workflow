import { execSync } from 'child_process';

/**
 * Get git user name from config
 */
export function getGitUser(): string | null {
  try {
    const result = execSync('git config user.name', { encoding: 'utf-8' });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get git user email from config
 */
export function getGitEmail(): string | null {
  try {
    const result = execSync('git config user.email', { encoding: 'utf-8' });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check if current directory is a git repository
 */
export function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --git-dir', { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
