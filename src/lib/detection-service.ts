/**
 * Project Detection Service
 * Singleton service with caching for efficient project scanning
 */

import { scanForProjects, type DetectedProject } from './detection';

// Define locally since ScanOptions is not exported from detection
interface ScanOptions {
  excludeWorkspace?: boolean;
  workspacePath?: string;
}

class ProjectDetectionService {
  private cache: DetectedProject[] | null = null;
  private cacheTime: number = 0;
  private readonly TTL = 30000; // 30 seconds cache TTL (scanning is expensive)
  private lastOptions: ScanOptions | null = null;
  
  /**
   * Scan for projects with caching
   * Returns cached version if still valid and options match
   */
  scan(options?: ScanOptions): DetectedProject[] {
    const now = Date.now();
    const optionsMatch = JSON.stringify(options) === JSON.stringify(this.lastOptions);
    
    if (this.cache && optionsMatch && (now - this.cacheTime) < this.TTL) {
      return this.cache;
    }
    
    this.cache = scanForProjects(options);
    this.cacheTime = now;
    this.lastOptions = options || null;
    return this.cache;
  }
  
  /**
   * Force a fresh scan, bypassing cache
   */
  refresh(options?: ScanOptions): DetectedProject[] {
    this.invalidate();
    return this.scan(options);
  }
  
  /**
   * Invalidate cache, forcing next scan to read from disk
   */
  invalidate(): void {
    this.cache = null;
    this.lastOptions = null;
  }
  
  /**
   * Check if cache is currently valid
   */
  isCacheValid(): boolean {
    return this.cache !== null && (Date.now() - this.cacheTime) < this.TTL;
  }
  
  /**
   * Get cached projects without triggering a scan
   * Returns null if cache is invalid
   */
  getCached(): DetectedProject[] | null {
    if (this.isCacheValid()) {
      return this.cache;
    }
    return null;
  }
}

// Singleton instance
export const projectService = new ProjectDetectionService();
