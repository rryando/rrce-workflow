/**
 * MCP Config Service
 * Singleton service with caching for efficient config access
 * Acts as single source of truth for all config operations
 */

import { EventEmitter } from 'events';
import type { MCPConfig } from './types';
import { loadMCPConfig as loadFromDisk, saveMCPConfig as saveToDisk, getMCPConfigPath } from './config';

/**
 * Event emitter for config change notifications
 * Emits 'change' event with old and new config when config is saved
 */
export const configEmitter = new EventEmitter();

// Type-safe wrapper for configEmitter
export function onConfigChange(listener: (oldConfig: MCPConfig, newConfig: MCPConfig) => void): void {
  configEmitter.on('change', listener);
}

export function offConfigChange(listener: (oldConfig: MCPConfig, newConfig: MCPConfig) => void): void {
  configEmitter.off('change', listener);
}

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
   * Save config, update cache, and emit change event
   */
  save(config: MCPConfig): void {
    const oldConfig = this.cache;
    saveToDisk(config);
    this.cache = config;
    this.cacheTime = Date.now();

    // Emit change event for subscribers (use new config as old if cache was empty)
    configEmitter.emit('change', oldConfig ?? config, config);
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

  /**
   * Get current cache age in milliseconds
   */
  getCacheAge(): number {
    return this.cache ? Date.now() - this.cacheTime : Infinity;
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string {
    return getMCPConfigPath();
  }
}

// Singleton instance
export const configService = new MCPConfigService();
