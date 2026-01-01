/**
 * Unit tests for src/lib/paths.ts
 * 
 * Tests path resolution functions including:
 * - getRRCEHome
 * - getEffectiveGlobalPath
 * - resolveDataPath
 * - detectWorkspaceRoot
 * - getConfigPath
 * - listGlobalProjects
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTestEnv, createMockPreferences, type TestEnv } from '../helpers/test-env';

describe('paths.ts', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv('paths');
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('getRRCEHome', () => {
    it('should return RRCE_HOME from environment variable', async () => {
      // Dynamic import to pick up mocked env
      const { getRRCEHome } = await import('../../lib/paths');
      
      // Note: getRRCEHome reads from module-level constant, 
      // so it reflects the env at import time
      const result = getRRCEHome();
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should return a valid path', async () => {
      const { getRRCEHome } = await import('../../lib/paths');
      const result = getRRCEHome();
      
      // Should be an absolute path
      expect(path.isAbsolute(result)).toBe(true);
    });
  });

  describe('getDefaultRRCEHome', () => {
    it('should return RRCE_HOME env var if set', async () => {
      const customPath = path.join(env.testDir, 'custom-rrce');
      process.env.RRCE_HOME = customPath;
      
      // Dynamic import to get fresh module
      const pathsModule = await import('../../lib/paths');
      const result = pathsModule.getDefaultRRCEHome();
      
      expect(result).toBe(customPath);
    });

    it('should fall back to ~/.rrce-workflow if RRCE_HOME not set', async () => {
      delete process.env.RRCE_HOME;
      process.env.HOME = env.testDir;
      
      const pathsModule = await import('../../lib/paths');
      const result = pathsModule.getDefaultRRCEHome();
      
      expect(result).toBe(path.join(env.testDir, '.rrce-workflow'));
    });
  });

  describe('resolveDataPath', () => {
    it('should return global path for global mode', async () => {
      const { resolveDataPath } = await import('../../lib/paths');
      
      const result = resolveDataPath('global', 'my-project', '/workspace/my-project');
      
      expect(result).toContain('workspaces');
      expect(result).toContain('my-project');
      expect(result).not.toContain('/workspace/');
    });

    it('should return workspace path for workspace mode', async () => {
      const { resolveDataPath } = await import('../../lib/paths');
      
      const workspaceRoot = '/workspace/my-project';
      const result = resolveDataPath('workspace', 'my-project', workspaceRoot);
      
      expect(result).toBe(path.join(workspaceRoot, '.rrce-workflow'));
    });

    it('should default to global mode for unknown mode', async () => {
      const { resolveDataPath } = await import('../../lib/paths');
      
      // @ts-expect-error Testing invalid input
      const result = resolveDataPath('unknown', 'my-project', '/workspace');
      
      expect(result).toContain('workspaces');
      expect(result).toContain('my-project');
    });
  });

  describe('resolveAllDataPaths', () => {
    it('should return single path for global mode', async () => {
      const { resolveAllDataPaths } = await import('../../lib/paths');
      
      const result = resolveAllDataPaths('global', 'my-project', '/workspace');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toContain('workspaces');
    });

    it('should return single path for workspace mode', async () => {
      const { resolveAllDataPaths } = await import('../../lib/paths');
      
      const result = resolveAllDataPaths('workspace', 'my-project', '/workspace');
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toContain('.rrce-workflow');
    });
  });

  describe('getConfigPath', () => {
    it('should prefer new local config path', async () => {
      const { getConfigPath, ensureDir } = await import('../../lib/paths');
      
      // Create a workspace with new-style config
      const workspaceRoot = path.join(env.testDir, 'my-workspace');
      const newConfigDir = path.join(workspaceRoot, '.rrce-workflow');
      ensureDir(newConfigDir);
      fs.writeFileSync(path.join(newConfigDir, 'config.yaml'), 'name: test');
      
      const result = getConfigPath(workspaceRoot);
      
      expect(result).toBe(path.join(newConfigDir, 'config.yaml'));
    });

    it('should fall back to legacy config path', async () => {
      const { getConfigPath, ensureDir } = await import('../../lib/paths');
      
      // Create a workspace with legacy config
      const workspaceRoot = path.join(env.testDir, 'legacy-workspace');
      ensureDir(workspaceRoot);
      fs.writeFileSync(path.join(workspaceRoot, '.rrce-workflow.yaml'), 'name: legacy');
      
      const result = getConfigPath(workspaceRoot);
      
      expect(result).toBe(path.join(workspaceRoot, '.rrce-workflow.yaml'));
    });

    it('should return new path if no config exists', async () => {
      const { getConfigPath, ensureDir } = await import('../../lib/paths');
      
      const workspaceRoot = path.join(env.testDir, 'new-workspace');
      ensureDir(workspaceRoot);
      
      const result = getConfigPath(workspaceRoot);
      
      expect(result).toBe(path.join(workspaceRoot, '.rrce-workflow', 'config.yaml'));
    });
  });

  describe('listGlobalProjects', () => {
    it('should list projects in workspaces directory', async () => {
      const { listGlobalProjects, ensureDir, getEffectiveGlobalPath } = await import('../../lib/paths');
      
      // Get the actual effective path being used
      const effectivePath = getEffectiveGlobalPath();
      const workspacesPath = path.join(effectivePath, 'workspaces');
      
      // Create some project directories in the actual effective path
      ensureDir(path.join(workspacesPath, 'project-a'));
      ensureDir(path.join(workspacesPath, 'project-b'));
      ensureDir(path.join(workspacesPath, 'project-c'));
      
      const result = listGlobalProjects();
      
      expect(result).toContain('project-a');
      expect(result).toContain('project-b');
      expect(result).toContain('project-c');
    });

    it('should exclude specified workspace', async () => {
      const { listGlobalProjects, ensureDir, getEffectiveGlobalPath } = await import('../../lib/paths');
      
      // Get the actual effective path being used
      const effectivePath = getEffectiveGlobalPath();
      const workspacesPath = path.join(effectivePath, 'workspaces');
      
      ensureDir(path.join(workspacesPath, 'project-a'));
      ensureDir(path.join(workspacesPath, 'project-b'));
      
      const result = listGlobalProjects('project-a');
      
      expect(result).not.toContain('project-a');
      expect(result).toContain('project-b');
    });

    it('should return empty array if workspaces dir does not exist', async () => {
      const { listGlobalProjects, getEffectiveGlobalPath } = await import('../../lib/paths');
      
      // Get the actual effective path being used and remove its workspaces dir
      const effectivePath = getEffectiveGlobalPath();
      const workspacesPath = path.join(effectivePath, 'workspaces');
      
      // Remove workspaces dir
      fs.rmSync(workspacesPath, { recursive: true, force: true });
      
      const result = listGlobalProjects();
      
      expect(result).toEqual([]);
    });
  });

  describe('getWorkspaceName', () => {
    it('should return directory basename', async () => {
      const { getWorkspaceName } = await import('../../lib/paths');
      
      const result = getWorkspaceName('/home/user/projects/my-awesome-project');
      
      expect(result).toBe('my-awesome-project');
    });
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      const { ensureDir } = await import('../../lib/paths');
      
      const newDir = path.join(env.testDir, 'new', 'nested', 'directory');
      expect(fs.existsSync(newDir)).toBe(false);
      
      ensureDir(newDir);
      
      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      const { ensureDir } = await import('../../lib/paths');
      
      const existingDir = path.join(env.testDir, 'existing');
      fs.mkdirSync(existingDir);
      
      expect(() => ensureDir(existingDir)).not.toThrow();
    });
  });

  describe('checkWriteAccess', () => {
    it('should return true for writable directory', async () => {
      const { checkWriteAccess } = await import('../../lib/paths');
      
      const result = checkWriteAccess(env.testDir);
      
      expect(result).toBe(true);
    });

    it('should create directory if it does not exist', async () => {
      const { checkWriteAccess } = await import('../../lib/paths');
      
      const newDir = path.join(env.testDir, 'check-write-test');
      expect(fs.existsSync(newDir)).toBe(false);
      
      const result = checkWriteAccess(newDir);
      
      expect(result).toBe(true);
      expect(fs.existsSync(newDir)).toBe(true);
    });
  });

  describe('getGlobalWorkspacePath', () => {
    it('should return correct global workspace path', async () => {
      const { getGlobalWorkspacePath } = await import('../../lib/paths');
      
      const result = getGlobalWorkspacePath('my-project');
      
      expect(result).toContain('workspaces');
      expect(result).toContain('my-project');
    });
  });

  describe('getLocalWorkspacePath', () => {
    it('should return correct local workspace path', async () => {
      const { getLocalWorkspacePath } = await import('../../lib/paths');
      
      const result = getLocalWorkspacePath('/home/user/my-project');
      
      expect(result).toBe('/home/user/my-project/.rrce-workflow');
    });
  });

  describe('getAgentPromptPath', () => {
    it('should return .github/agents for copilot', async () => {
      const { getAgentPromptPath } = await import('../../lib/paths');
      
      const result = getAgentPromptPath('/workspace', 'copilot');
      
      expect(result).toBe('/workspace/.github/agents');
    });

    it('should return .agent/workflows for antigravity', async () => {
      const { getAgentPromptPath } = await import('../../lib/paths');
      
      const result = getAgentPromptPath('/workspace', 'antigravity');
      
      expect(result).toBe('/workspace/.agent/workflows');
    });
  });

  describe('getGlobalProjectKnowledgePath', () => {
    it('should return correct knowledge path', async () => {
      const { getGlobalProjectKnowledgePath } = await import('../../lib/paths');
      
      const result = getGlobalProjectKnowledgePath('my-project');
      
      expect(result).toContain('workspaces');
      expect(result).toContain('my-project');
      expect(result).toContain('knowledge');
    });
  });
});
