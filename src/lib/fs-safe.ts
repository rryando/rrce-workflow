import * as fs from 'fs';
import * as path from 'path';

/**
 * Write a file atomically using tmp+rename.
 * Atomic on POSIX when tmp and target are on the same filesystem.
 */
export function writeFileAtomic(targetPath: string, content: string | Buffer): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${targetPath}.tmp`;
  try {
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    // Clean up tmp file on failure
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

/**
 * Write a JSON object atomically.
 */
export function writeJsonAtomic(targetPath: string, data: unknown): void {
  writeFileAtomic(targetPath, JSON.stringify(data, null, 2));
}

/**
 * Validate that a slug is safe for use as a path component.
 * Rejects path traversal attempts (.. , /, absolute paths).
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') return false;
  if (slug.includes('/') || slug.includes('\\')) return false;
  if (slug === '.' || slug === '..') return false;
  if (slug.includes('..')) return false;
  return true;
}
