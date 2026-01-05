import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface DriftReport {
  hasDrift: boolean;
  type: 'version' | 'modified' | 'none';
  modifiedFiles: string[];
  deletedFiles?: string[];
  version: {
    current: string;
    running: string;
  };
}

export interface FileChanges {
  modified: string[];
  deleted: string[];
}

export interface ChecksumEntry {
  hash: string;
  mtime: number;
}

export interface ChecksumManifest {
  [relPath: string]: ChecksumEntry;
}

export class DriftService {
  static CHECKSUM_FILENAME = '.rrce-checksums.json';

  static calculateHash(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex');
  }

  static getManifestPath(projectPath: string): string {
    return path.join(projectPath, this.CHECKSUM_FILENAME);
  }

  static loadManifest(projectPath: string): ChecksumManifest {
    const manifestPath = this.getManifestPath(projectPath);
    if (!fs.existsSync(manifestPath)) {
      return {};
    }
    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }

  static saveManifest(projectPath: string, manifest: ChecksumManifest): void {
    const manifestPath = this.getManifestPath(projectPath);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }

  /**
   * Generates a manifest for the current state of files in the project
   */
  static generateManifest(projectPath: string, files: string[]): ChecksumManifest {
    const manifest: ChecksumManifest = {};
    for (const file of files) {
      const fullPath = path.join(projectPath, file);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        manifest[file] = {
          hash: this.calculateHash(fullPath),
          mtime: stats.mtimeMs,
        };
      }
    }
    return manifest;
  }

  /**
   * Compares current files against the manifest to detect modifications and deletions
   */
  static detectModifiedFiles(projectPath: string): FileChanges {
    const manifest = this.loadManifest(projectPath);
    const modified: string[] = [];
    const deleted: string[] = [];

    for (const [relPath, entry] of Object.entries(manifest)) {
      const fullPath = path.join(projectPath, relPath);
      if (!fs.existsSync(fullPath)) {
        deleted.push(relPath);
        continue;
      }

      const stats = fs.statSync(fullPath);
      // Fast check: if mtime is same, assume hash is same
      if (stats.mtimeMs === entry.mtime) {
        continue;
      }

      // Slow check: verify hash
      const currentHash = this.calculateHash(fullPath);
      if (currentHash !== entry.hash) {
        modified.push(relPath);
      }
    }

    return { modified, deleted };
  }

  /**
   * Returns array of deleted file paths from manifest
   */
  static detectDeletedFiles(projectPath: string): string[] {
    const manifest = this.loadManifest(projectPath);
    const deleted: string[] = [];

    for (const relPath of Object.keys(manifest)) {
      const fullPath = path.join(projectPath, relPath);
      if (!fs.existsSync(fullPath)) {
        deleted.push(relPath);
      }
    }

    return deleted;
  }

  /**
   * Full drift check: version + modifications
   */
  static checkDrift(
    projectPath: string,
    currentVersion: string | undefined,
    runningVersion: string
  ): DriftReport {
    const { modified, deleted } = this.detectModifiedFiles(projectPath);
    
    let type: 'version' | 'modified' | 'none' = 'none';
    let hasDrift = false;

    if (currentVersion !== runningVersion) {
      hasDrift = true;
      type = 'version';
    } else if (modified.length > 0 || deleted.length > 0) {
      hasDrift = true;
      type = 'modified';
    }

    return {
      hasDrift,
      type,
      modifiedFiles: modified,
      deletedFiles: deleted,
      version: {
        current: currentVersion || '0.0.0',
        running: runningVersion,
      },
    };
  }
}
