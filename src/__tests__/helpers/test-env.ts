/**
 * Test Environment Utilities
 * 
 * Provides helpers for creating isolated test environments with:
 * - Temporary directories
 * - Environment variable mocking
 * - Automatic cleanup
 * 
 * Pattern derived from scripts/verify-resources.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface TestEnv {
  /** Root directory for this test */
  testDir: string;
  /** RRCE_HOME path within test environment */
  rrceHome: string;
  /** Workspaces directory within RRCE_HOME */
  workspacesDir: string;
  /** Original environment variables (for restoration) */
  originalEnv: NodeJS.ProcessEnv;
  /** Cleanup function - call in afterEach */
  cleanup: () => void;
}

export interface TestEnvOptions {
  /** Create workspaces directory structure */
  createWorkspaces?: boolean;
  /** Create a mock project with given name */
  mockProject?: string;
  /** Mock project storage mode */
  mockProjectMode?: 'global' | 'workspace';
}

/**
 * Creates an isolated test environment with mocked RRCE paths
 * 
 * @param name - Unique name for this test environment
 * @param options - Configuration options
 * @returns TestEnv object with paths and cleanup function
 * 
 * @example
 * ```typescript
 * let env: TestEnv;
 * 
 * beforeEach(() => {
 *   env = createTestEnv('paths-test');
 * });
 * 
 * afterEach(() => {
 *   env.cleanup();
 * });
 * ```
 */
export function createTestEnv(name: string, options: TestEnvOptions = {}): TestEnv {
  const testDir = path.join(os.tmpdir(), `rrce-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const rrceHome = path.join(testDir, '.rrce-workflow');
  const workspacesDir = path.join(rrceHome, 'workspaces');

  // Store original environment
  const originalEnv = { ...process.env };

  // Create directory structure
  fs.mkdirSync(rrceHome, { recursive: true });
  
  if (options.createWorkspaces !== false) {
    fs.mkdirSync(workspacesDir, { recursive: true });
  }

  // Create mock project if requested
  if (options.mockProject) {
    const mode = options.mockProjectMode || 'global';
    
    if (mode === 'global') {
      const projectDir = path.join(workspacesDir, options.mockProject);
      fs.mkdirSync(path.join(projectDir, 'knowledge'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'tasks'), { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, 'config.yaml'),
        `name: ${options.mockProject}\nmode: global\nsourcePath: ${path.join(testDir, options.mockProject)}\n`
      );
    } else {
      const projectDir = path.join(testDir, options.mockProject);
      const rrceDir = path.join(projectDir, '.rrce-workflow');
      fs.mkdirSync(path.join(rrceDir, 'knowledge'), { recursive: true });
      fs.mkdirSync(path.join(rrceDir, 'tasks'), { recursive: true });
      fs.writeFileSync(
        path.join(rrceDir, 'config.yaml'),
        `name: ${options.mockProject}\nmode: workspace\n`
      );
    }
  }

  // Mock environment variables
  process.env.RRCE_HOME = rrceHome;
  process.env.HOME = testDir;

  const cleanup = () => {
    // Restore original environment
    Object.keys(process.env).forEach(key => {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    });
    Object.assign(process.env, originalEnv);

    // Remove test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors in CI
      console.warn(`Warning: Failed to cleanup test dir ${testDir}:`, err);
    }
  };

  return {
    testDir,
    rrceHome,
    workspacesDir,
    originalEnv,
    cleanup,
  };
}

/**
 * Creates a mock MCP config file in the test environment
 */
export function createMockMCPConfig(env: TestEnv, projects: Array<{ name: string; path: string; expose?: boolean }>) {
  const config = {
    version: 1,
    projects: projects.map(p => ({
      name: p.name,
      path: p.path,
      expose: p.expose ?? true,
      permissions: { knowledge: true, tasks: true, prompts: true },
    })),
    defaults: {
      permissions: { knowledge: true, tasks: true, prompts: true },
    },
  };

  const configPath = path.join(env.rrceHome, 'mcp.yaml');
  const yaml = `version: 1\nprojects:\n${projects.map(p => `  - name: ${p.name}\n    path: ${p.path}\n    expose: ${p.expose ?? true}`).join('\n')}\n`;
  fs.writeFileSync(configPath, yaml);
  
  return configPath;
}

/**
 * Creates a mock preferences file
 */
export function createMockPreferences(env: TestEnv, preferences: Record<string, unknown> = {}) {
  const prefsPath = path.join(env.rrceHome, 'preferences.json');
  fs.writeFileSync(prefsPath, JSON.stringify(preferences, null, 2));
  return prefsPath;
}

/**
 * Creates a mock project-context.md file
 */
export function createMockProjectContext(env: TestEnv, projectName: string, content?: string) {
  const projectDir = path.join(env.workspacesDir, projectName);
  const knowledgeDir = path.join(projectDir, 'knowledge');
  
  fs.mkdirSync(knowledgeDir, { recursive: true });
  
  const contextContent = content || `# Project Context – ${projectName}\n\nTest project context.\n`;
  const contextPath = path.join(knowledgeDir, 'project-context.md');
  fs.writeFileSync(contextPath, contextContent);
  
  return contextPath;
}

/**
 * Creates a mock task in the test environment
 */
export function createMockTask(
  env: TestEnv,
  projectName: string,
  taskSlug: string,
  meta: Record<string, unknown> = {}
) {
  const tasksDir = path.join(env.workspacesDir, projectName, 'tasks', taskSlug);
  fs.mkdirSync(tasksDir, { recursive: true });

  const defaultMeta = {
    task_id: `${taskSlug}-001`,
    task_slug: taskSlug,
    title: `Test Task: ${taskSlug}`,
    status: 'draft',
    summary: 'A test task',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...meta,
  };

  const metaPath = path.join(tasksDir, 'meta.json');
  fs.writeFileSync(metaPath, JSON.stringify(defaultMeta, null, 2));

  return { tasksDir, metaPath, meta: defaultMeta };
}

/**
 * Waits for a condition to be true (useful for async tests)
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}
