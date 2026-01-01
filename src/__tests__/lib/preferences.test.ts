/**
 * Unit tests for src/lib/preferences.ts
 * 
 * Tests user preference functions including:
 * - loadUserPreferences
 * - saveUserPreferences
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTestEnv, type TestEnv } from '../helpers/test-env';

describe('preferences.ts', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv('preferences');
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('loadUserPreferences', () => {
    it('should return empty object when no preferences file exists', async () => {
      const { loadUserPreferences } = await import('../../lib/preferences');
      
      const result = loadUserPreferences();
      
      expect(result).toEqual({});
    });

    it('should load preferences from file', async () => {
      const { loadUserPreferences } = await import('../../lib/preferences');
      
      // Create preferences file
      const prefsDir = path.join(env.testDir, '.rrce-workflow');
      fs.mkdirSync(prefsDir, { recursive: true });
      fs.writeFileSync(
        path.join(prefsDir, 'preferences.json'),
        JSON.stringify({
          defaultGlobalPath: '/custom/path',
          useCustomGlobalPath: true
        })
      );
      
      const result = loadUserPreferences();
      
      expect(result.defaultGlobalPath).toBe('/custom/path');
      expect(result.useCustomGlobalPath).toBe(true);
    });

    it('should return empty object for invalid JSON', async () => {
      const { loadUserPreferences } = await import('../../lib/preferences');
      
      // Create invalid preferences file
      const prefsDir = path.join(env.testDir, '.rrce-workflow');
      fs.mkdirSync(prefsDir, { recursive: true });
      fs.writeFileSync(
        path.join(prefsDir, 'preferences.json'),
        'not valid json {'
      );
      
      const result = loadUserPreferences();
      
      expect(result).toEqual({});
    });
  });

  describe('saveUserPreferences', () => {
    it('should create preferences file if it does not exist', async () => {
      const { saveUserPreferences, loadUserPreferences } = await import('../../lib/preferences');
      
      const prefsPath = path.join(env.testDir, '.rrce-workflow', 'preferences.json');
      expect(fs.existsSync(prefsPath)).toBe(false);
      
      saveUserPreferences({ defaultGlobalPath: '/my/custom/path' });
      
      expect(fs.existsSync(prefsPath)).toBe(true);
      const saved = loadUserPreferences();
      expect(saved.defaultGlobalPath).toBe('/my/custom/path');
    });

    it('should merge with existing preferences', async () => {
      const { saveUserPreferences, loadUserPreferences } = await import('../../lib/preferences');
      
      // Create initial preferences
      const prefsDir = path.join(env.testDir, '.rrce-workflow');
      fs.mkdirSync(prefsDir, { recursive: true });
      fs.writeFileSync(
        path.join(prefsDir, 'preferences.json'),
        JSON.stringify({ defaultGlobalPath: '/original/path' })
      );
      
      // Save new preference
      saveUserPreferences({ useCustomGlobalPath: true });
      
      // Verify both are present
      const result = loadUserPreferences();
      expect(result.defaultGlobalPath).toBe('/original/path');
      expect(result.useCustomGlobalPath).toBe(true);
    });

    it('should overwrite existing values', async () => {
      const { saveUserPreferences, loadUserPreferences } = await import('../../lib/preferences');
      
      // Create initial preferences
      const prefsDir = path.join(env.testDir, '.rrce-workflow');
      fs.mkdirSync(prefsDir, { recursive: true });
      fs.writeFileSync(
        path.join(prefsDir, 'preferences.json'),
        JSON.stringify({ defaultGlobalPath: '/original/path' })
      );
      
      // Overwrite
      saveUserPreferences({ defaultGlobalPath: '/new/path' });
      
      const result = loadUserPreferences();
      expect(result.defaultGlobalPath).toBe('/new/path');
    });

    it('should write valid JSON', async () => {
      const { saveUserPreferences } = await import('../../lib/preferences');
      
      saveUserPreferences({ 
        defaultGlobalPath: '/test/path',
        useCustomGlobalPath: true 
      });
      
      const prefsPath = path.join(env.testDir, '.rrce-workflow', 'preferences.json');
      const content = fs.readFileSync(prefsPath, 'utf-8');
      
      // Should not throw
      expect(() => JSON.parse(content)).not.toThrow();
      
      const parsed = JSON.parse(content);
      expect(parsed.defaultGlobalPath).toBe('/test/path');
      expect(parsed.useCustomGlobalPath).toBe(true);
    });
  });
});
