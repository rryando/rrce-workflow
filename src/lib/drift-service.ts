import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface DriftReport {
  hasDrift: boolean;
  type: 'version' | 'modified' | 'none';
  modifiedFiles: string[];
  version: {
    current: string;
    running: string;
  };
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
   * Compares current files against the manifest to detect modifications
   */
  static detectModifiedFiles(projectPath: string): string[] {
    const manifest = this.loadManifest(projectPath);
    const modifiedFiles: string[] = [];

    for (const [relPath, entry] of Object.entries(manifest)) {
      const fullPath = path.join(projectPath, relPath);
      if (!fs.existsSync(fullPath)) {
        continue; // Or should we mark it as modified? Plan says "modified", maybe deleted is drift too.
      }

      const stats = fs.statSync(fullPath);
      // Fast check: if mtime is same, assume hash is same
      if (stats.mtimeMs === entry.mtime) {
        continue;
      }

      // Slow check: verify hash
      const currentHash = this.calculateHash(fullPath);
      if (currentHash !== entry.hash) {
        modifiedFiles.push(relPath);
      }
    }

    return modifiedFiles;
  }

  /**
   * Full drift check: version + modifications
   */
  static checkDrift(
    projectPath: string,
    currentVersion: string | undefined,
    runningVersion: string
  ): DriftReport {
    const modifiedFiles = this.detectModifiedFiles(projectPath);
    
    let type: 'version' | 'modified' | 'none' = 'none';
    let hasDrift = false;

    if (currentVersion !== runningVersion) {
      hasDrift = true;
      type = 'version';
    } else if (modifiedFiles.length > 0) {
      hasDrift = true;
      type = 'modified';
    }

    return {
      hasDrift,
      type,
      modifiedFiles,
      version: {
        current: currentVersion || '0.0.0',
        running: runningVersion,
      },
    };
  }
}
