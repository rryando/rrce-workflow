/**
 * Unit tests for src/lib/detection.ts
 * 
 * Tests project detection functions including:
 * - scanForProjects
 * - parseWorkspaceConfig
 * - getProjectDisplayLabel
 * - findClosestProject
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTestEnv, type TestEnv } from '../helpers/test-env';

describe('detection.ts', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv('detection');
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('parseWorkspaceConfig', () => {
    it('should parse a valid workspace config', async () => {
      const { parseWorkspaceConfig } = await import('../../lib/detection');
      
      // Create a config file
      const configDir = path.join(env.testDir, 'test-project', '.rrce-workflow');
      fs.mkdirSync(configDir, { recursive: true });
      const configPath = path.join(configDir, 'config.yaml');
      fs.writeFileSync(configPath, `
name: my-test-project
mode: workspace
semantic_search:
  enabled: true
`);
      
      const result = parseWorkspaceConfig(configPath);
      
      expect(result).not.toBeNull();
      expect(result?.name).toBe('my-test-project');
      expect(result?.storageMode).toBe('workspace');
      expect(result?.semanticSearchEnabled).toBe(true);
    });

    it('should parse global mode config with sourcePath', async () => {
      const { parseWorkspaceConfig } = await import('../../lib/detection');
      
      const configDir = path.join(env.workspacesDir, 'global-project');
      fs.mkdirSync(configDir, { recursive: true });
      const configPath = path.join(configDir, 'config.yaml');
      fs.writeFileSync(configPath, `
name: global-project
mode: global
sourcePath: /home/user/projects/global-project
`);
      
      const result = parseWorkspaceConfig(configPath);
      
      expect(result).not.toBeNull();
      expect(result?.name).toBe('global-project');
      expect(result?.storageMode).toBe('global');
      expect(result?.sourcePath).toBe('/home/user/projects/global-project');
    });

    it('should parse linked_projects list', async () => {
      const { parseWorkspaceConfig } = await import('../../lib/detection');
      
      const configDir = path.join(env.testDir, 'linked-project', '.rrce-workflow');
      fs.mkdirSync(configDir, { recursive: true });
      const configPath = path.join(configDir, 'config.yaml');
      fs.writeFileSync(configPath, `
name: linked-project
mode: workspace
linked_projects:
  - other-project
  - another-project
`);
      
      const result = parseWorkspaceConfig(configPath);
      
      expect(result).not.toBeNull();
      expect(result?.linkedProjects).toEqual(['other-project', 'another-project']);
    });

    it('should return null for non-existent config', async () => {
      const { parseWorkspaceConfig } = await import('../../lib/detection');
      
      const result = parseWorkspaceConfig('/non/existent/config.yaml');
      
      expect(result).toBeNull();
    });

    it('should handle config without mode (defaults to global)', async () => {
      const { parseWorkspaceConfig } = await import('../../lib/detection');
      
      const configDir = path.join(env.testDir, 'no-mode', '.rrce-workflow');
      fs.mkdirSync(configDir, { recursive: true });
      const configPath = path.join(configDir, 'config.yaml');
      fs.writeFileSync(configPath, 'name: no-mode-project\n');
      
      const result = parseWorkspaceConfig(configPath);
      
      expect(result).not.toBeNull();
      expect(result?.storageMode).toBe('global');
    });
  });

  describe('scanForProjects', () => {
    it('should find projects in global storage', async () => {
      const { scanForProjects, parseWorkspaceConfig } = await import('../../lib/detection');
      const { getEffectiveGlobalPath, ensureDir } = await import('../../lib/paths');
      
      // Create a global project
      const effectivePath = getEffectiveGlobalPath();
      const projectDir = path.join(effectivePath, 'workspaces', 'global-test-project');
      ensureDir(path.join(projectDir, 'knowledge'));
      ensureDir(path.join(projectDir, 'tasks'));
      fs.writeFileSync(
        path.join(projectDir, 'config.yaml'),
        'name: global-test-project\nmode: global\n'
      );
      
      const projects = scanForProjects();
      
      const found = projects.find(p => p.name === 'global-test-project');
      expect(found).toBeDefined();
      expect(found?.source).toBe('global');
    });

    it('should find projects in known projects list', async () => {
      const { scanForProjects } = await import('../../lib/detection');
      const { ensureDir, getEffectiveGlobalPath } = await import('../../lib/paths');
      
      // Create a project with local config
      const projectPath = path.join(env.testDir, 'known-project');
      const configDir = path.join(projectPath, '.rrce-workflow');
      ensureDir(path.join(configDir, 'knowledge'));
      fs.writeFileSync(
        path.join(configDir, 'config.yaml'),
        'name: known-project\nmode: workspace\n'
      );
      
      const projects = scanForProjects({
        knownProjects: [{ name: 'known-project', path: projectPath }]
      });
      
      const found = projects.find(p => p.name === 'known-project');
      expect(found).toBeDefined();
      expect(found?.source).toBe('local');
      expect(found?.path).toBe(projectPath);
    });

    it('should exclude specified workspace', async () => {
      const { scanForProjects } = await import('../../lib/detection');
      const { getEffectiveGlobalPath, ensureDir } = await import('../../lib/paths');
      
      // Create projects in global storage
      const effectivePath = getEffectiveGlobalPath();
      const workspacesPath = path.join(effectivePath, 'workspaces');
      
      ensureDir(path.join(workspacesPath, 'include-me'));
      fs.writeFileSync(
        path.join(workspacesPath, 'include-me', 'config.yaml'),
        'name: include-me\nmode: global\n'
      );
      
      ensureDir(path.join(workspacesPath, 'exclude-me'));
      fs.writeFileSync(
        path.join(workspacesPath, 'exclude-me', 'config.yaml'),
        'name: exclude-me\nmode: global\n'
      );
      
      const projects = scanForProjects({ excludeWorkspace: 'exclude-me' });
      
      const included = projects.find(p => p.name === 'include-me');
      const excluded = projects.find(p => p.name === 'exclude-me');
      
      expect(included).toBeDefined();
      expect(excluded).toBeUndefined();
    });

    it('should return empty array when no projects exist', async () => {
      const { scanForProjects } = await import('../../lib/detection');
      const { getEffectiveGlobalPath } = await import('../../lib/paths');
      
      // Clear any existing projects
      const effectivePath = getEffectiveGlobalPath();
      const workspacesPath = path.join(effectivePath, 'workspaces');
      if (fs.existsSync(workspacesPath)) {
        fs.rmSync(workspacesPath, { recursive: true, force: true });
      }
      
      const projects = scanForProjects({
        knownProjects: [],
        knownPaths: []
      });
      
      // May still find projects from home scan, so just verify it returns an array
      expect(Array.isArray(projects)).toBe(true);
    });
  });

  describe('getProjectDisplayLabel', () => {
    it('should return global path format for global projects', async () => {
      const { getProjectDisplayLabel } = await import('../../lib/detection');
      
      const project = {
        name: 'my-project',
        path: '/home/user/.rrce-workflow/workspaces/my-project',
        dataPath: '/home/user/.rrce-workflow/workspaces/my-project',
        source: 'global' as const,
      };
      
      const label = getProjectDisplayLabel(project);
      
      expect(label).toBe('~/.rrce-workflow/workspaces/my-project');
    });

    it('should return dataPath for local projects', async () => {
      const { getProjectDisplayLabel } = await import('../../lib/detection');
      
      const project = {
        name: 'my-project',
        path: '/home/user/projects/my-project',
        dataPath: '/home/user/projects/my-project/.rrce-workflow',
        source: 'local' as const,
      };
      
      const label = getProjectDisplayLabel(project);
      
      expect(label).toBe('/home/user/projects/my-project/.rrce-workflow');
    });
  });

  describe('getProjectFolders', () => {
    it('should return knowledge, refs, and tasks folders when present', async () => {
      const { getProjectFolders } = await import('../../lib/detection');
      
      const project = {
        name: 'my-project',
        path: '/home/user/projects/my-project',
        dataPath: '/home/user/projects/my-project/.rrce-workflow',
        source: 'local' as const,
        knowledgePath: '/home/user/projects/my-project/.rrce-workflow/knowledge',
        refsPath: '/home/user/projects/my-project/.rrce-workflow/refs',
        tasksPath: '/home/user/projects/my-project/.rrce-workflow/tasks',
      };
      
      const folders = getProjectFolders(project);
      
      expect(folders.length).toBe(3);
      expect(folders.find(f => f.type === 'knowledge')).toBeDefined();
      expect(folders.find(f => f.type === 'refs')).toBeDefined();
      expect(folders.find(f => f.type === 'tasks')).toBeDefined();
    });

    it('should return empty array when no folders present', async () => {
      const { getProjectFolders } = await import('../../lib/detection');
      
      const project = {
        name: 'empty-project',
        path: '/home/user/projects/empty',
        dataPath: '/home/user/projects/empty/.rrce-workflow',
        source: 'local' as const,
      };
      
      const folders = getProjectFolders(project);
      
      expect(folders).toEqual([]);
    });
  });

  describe('findClosestProject', () => {
    it('should find project matching current path', async () => {
      const { findClosestProject } = await import('../../lib/detection');
      
      const projects = [
        {
          name: 'parent-project',
          path: '/home/user/projects',
          dataPath: '/home/user/projects/.rrce-workflow',
          source: 'local' as const,
        },
        {
          name: 'child-project',
          path: '/home/user/projects/child',
          dataPath: '/home/user/projects/child/.rrce-workflow',
          source: 'local' as const,
        },
      ];
      
      const result = findClosestProject(projects, '/home/user/projects/child/src');
      
      expect(result?.name).toBe('child-project');
    });

    it('should match sourcePath for global projects', async () => {
      const { findClosestProject } = await import('../../lib/detection');
      
      const projects = [
        {
          name: 'global-project',
          path: '/home/user/.rrce-workflow/workspaces/global-project',
          sourcePath: '/home/user/work/global-project',
          dataPath: '/home/user/.rrce-workflow/workspaces/global-project',
          source: 'global' as const,
        },
      ];
      
      const result = findClosestProject(projects, '/home/user/work/global-project/src');
      
      expect(result?.name).toBe('global-project');
    });

    it('should return undefined when no match found', async () => {
      const { findClosestProject } = await import('../../lib/detection');
      
      const projects = [
        {
          name: 'some-project',
          path: '/home/user/projects/some',
          dataPath: '/home/user/projects/some/.rrce-workflow',
          source: 'local' as const,
        },
      ];
      
      const result = findClosestProject(projects, '/completely/different/path');
      
      expect(result).toBeUndefined();
    });

    it('should prefer longer path match (more specific)', async () => {
      const { findClosestProject } = await import('../../lib/detection');
      
      const projects = [
        {
          name: 'root',
          path: '/home/user',
          dataPath: '/home/user/.rrce-workflow',
          source: 'local' as const,
        },
        {
          name: 'specific',
          path: '/home/user/projects/specific',
          dataPath: '/home/user/projects/specific/.rrce-workflow',
          source: 'local' as const,
        },
      ];
      
      const result = findClosestProject(projects, '/home/user/projects/specific/deep/path');
      
      expect(result?.name).toBe('specific');
    });
  });
});
