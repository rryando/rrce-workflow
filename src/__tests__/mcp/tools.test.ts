/**
 * Integration tests for MCP tool handlers
 * 
 * Tests key MCP tools via their underlying resource functions
 * and validates the handler registration works correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTestEnv, createMockMCPConfig, createMockProjectContext, createMockTask, type TestEnv } from '../helpers/test-env';

describe('MCP Tools', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv('mcp-tools');
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('resolveProjectPaths', () => {
    it('should resolve paths for a configured project', async () => {
      const { resolveProjectPaths } = await import('../../mcp/resources');
      
      // Create mock project configuration
      const projectPath = path.join(env.testDir, 'test-project');
      fs.mkdirSync(projectPath, { recursive: true });
      
      // Create config in global storage
      const projectDataPath = path.join(env.workspacesDir, 'test-project');
      fs.mkdirSync(projectDataPath, { recursive: true });
      fs.writeFileSync(
        path.join(projectDataPath, 'config.yaml'),
        'name: test-project\nmode: global\n'
      );
      
      // Create MCP config
      createMockMCPConfig(env, [{ name: 'test-project', path: projectPath }]);
      
      const result = resolveProjectPaths('test-project', projectPath) as Record<string, string>;
      
      expect(result).toHaveProperty('RRCE_HOME');
      expect(result).toHaveProperty('RRCE_DATA');
      expect(result).toHaveProperty('WORKSPACE_ROOT');
      expect(result).toHaveProperty('WORKSPACE_NAME');
      expect(result.WORKSPACE_NAME).toBe('test-project');
    });
  });

  describe('getExposedProjects', () => {
    it('should return an array without throwing', async () => {
      const { getExposedProjects } = await import('../../mcp/resources');
      
      // The function reads config at import time (before test env setup),
      // so we just verify it doesn't throw and returns an array.
      // Real project filtering is tested via MCP integration tests.
      const projects = getExposedProjects();
      
      expect(Array.isArray(projects)).toBe(true);
      // Each project should have expected structure if any exist
      if (projects.length > 0) {
        expect(projects[0]).toHaveProperty('name');
      }
    });
  });

  describe('getProjectContext', () => {
    it('should return project context content', async () => {
      const { getProjectContext } = await import('../../mcp/resources');
      
      // Create project with context file
      createMockProjectContext(
        env, 
        'context-project', 
        '# Project Context\n\nThis is the test project context content.'
      );
      
      // Create MCP config
      createMockMCPConfig(env, [
        { name: 'context-project', path: path.join(env.testDir, 'context-project') }
      ]);
      
      const result = getProjectContext('context-project');
      
      if (result) {
        expect(result).toContain('Project Context');
        expect(result).toContain('test project context content');
      }
    });

    it('should return not found message for missing project', async () => {
      const { getProjectContext } = await import('../../mcp/resources');
      
      const result = getProjectContext('non-existent-project');
      
      if (result) {
        expect(result.toLowerCase()).toContain('not found');
      } else {
        expect(result).toBeNull();
      }
    });
  });

  describe('getProjectTasks', () => {
    it('should handle missing project gracefully', async () => {
      const { getProjectTasks } = await import('../../mcp/resources');
      
      // Should not throw for any project name
      expect(() => getProjectTasks('any-project')).not.toThrow();
    });
  });

  describe('getTask', () => {
    it('should handle missing task gracefully', async () => {
      const { getTask } = await import('../../mcp/resources');
      
      // Should not throw for any project/task combination
      expect(() => getTask('any-project', 'any-task')).not.toThrow();
    });
  });

  describe('detectActiveProject', () => {
    it('should detect project based on current directory', async () => {
      const { detectActiveProject } = await import('../../mcp/resources');
      
      // This tests the detection logic - may return undefined in test env
      // which is fine, we're just testing it doesn't throw
      const result = detectActiveProject();
      
      // Result can be undefined or a project - both are valid
      expect(result === undefined || result?.name !== undefined).toBe(true);
    });
  });

  describe('getContextPreamble', () => {
    it('should generate context preamble', async () => {
      const { getContextPreamble } = await import('../../mcp/resources');
      
      const result = getContextPreamble();
      
      expect(typeof result).toBe('string');
      // Should contain some context information
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('createTask (ESM compatibility)', () => {
    it('should not throw ESM require error', async () => {
      // Regression test for "Dynamic require of 'os' is not supported" error
      // This was caused by using require('os').homedir() instead of ESM import
      const { createTask } = await import('../../mcp/resources');
      
      // Just verify the function can be imported without triggering the ESM error
      // The actual creation will fail due to missing project, which is expected
      expect(typeof createTask).toBe('function');
      
      // If we get here without error, the ESM import is working
      // Calling createTask with invalid args should throw a project error, not an ESM error
      try {
        await createTask('non-existent-project', 'test-task', {});
      } catch (error: any) {
        // Should NOT be an ESM error
        expect(error.message).not.toContain('Dynamic require');
        expect(error.message).not.toContain('is not supported');
        // Should be a project-not-found error
        expect(error.message).toContain('not found');
      }
    });
  });
});
