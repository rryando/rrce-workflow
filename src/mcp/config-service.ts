/**
 * MCP Config Service
 * Singleton service with caching for efficient config access
 */

import type { MCPConfig } from './types';
import { loadMCPConfig as loadFromDisk, saveMCPConfig as saveToDisk } from './config';

class MCPConfigService {
  private cache: MCPConfig | null = null;
  private cacheTime: number = 0;
  private readonly TTL = 5000; // 5 seconds cache TTL
  
  /**
   * Load config with caching
   * Returns cached version if still valid, otherwise reads from disk
   */
  load(): MCPConfig {
    const now = Date.now();
    if (this.cache && (now - this.cacheTime) < this.TTL) {
      return this.cache;
    }
    
    this.cache = loadFromDisk();
    this.cacheTime = now;
    return this.cache;
  }
  
  /**
   * Save config and update cache
   */
  save(config: MCPConfig): void {
    saveToDisk(config);
    this.cache = config;
    this.cacheTime = Date.now();
  }
  
  /**
   * Invalidate cache, forcing next load to read from disk
   */
  invalidate(): void {
    this.cache = null;
  }
  
  /**
   * Check if cache is currently valid
   */
  isCacheValid(): boolean {
    return this.cache !== null && (Date.now() - this.cacheTime) < this.TTL;
  }
}

// Singleton instance
export const configService = new MCPConfigService();
