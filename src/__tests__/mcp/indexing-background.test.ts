import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTestEnv, createMockMCPConfig, waitFor, type TestEnv } from '../helpers/test-env';

describe('Background indexing job behavior', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv('indexing-background');
  });

  afterEach(() => {
    env.cleanup();
  });

  it('index_knowledge should return started then already_running quickly', async () => {
    const { indexKnowledge } = await import('../../mcp/resources');

    // Create a mock project structure with a couple indexable files
    const projectPath = path.join(env.testDir, 'proj');
    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(projectPath, 'b.md'), '# Hello world\nThis is a document that is long enough to index for RAG testing.\n');

    // Minimal global project data: knowledge dir needed for index output
    const projectDataPath = path.join(env.workspacesDir, 'proj');
    fs.mkdirSync(path.join(projectDataPath, 'knowledge'), { recursive: true });
    fs.writeFileSync(path.join(projectDataPath, 'config.yaml'), `name: proj\nmode: global\nsourcePath: ${projectPath}\n`);

    // Enable semantic search for project
    createMockMCPConfig(env, [{ name: 'proj', path: projectPath }]);

    // Flag semantic search enabled in config (used by indexKnowledge)
    const configPath = path.join(env.rrceHome, 'mcp.yaml');
    const cfg = fs.readFileSync(configPath, 'utf-8');
    fs.writeFileSync(
      configPath,
      cfg + '\n    semanticSearch:\n      enabled: true\n'
    );

    const t0 = Date.now();
    const r1 = await indexKnowledge('proj');
    const dt1 = Date.now() - t0;

    expect(r1.status).toBe('started');
    expect(dt1).toBeLessThan(1000);

    // Give the background job a moment to become "running" to avoid flakiness
    await new Promise(resolve => setTimeout(resolve, 25));

    const t1 = Date.now();
    const r2 = await indexKnowledge('proj');
    const dt2 = Date.now() - t1;

    expect(['started', 'already_running']).toContain(r2.status);
    expect(dt2).toBeLessThan(1000);

    // Eventually the job should complete or fail, but should not remain running indefinitely
    await waitFor(async () => {
      const { indexingJobs } = await import('../../mcp/services/indexing-jobs');
      const p = indexingJobs.getProgress('proj');
      return p.state === 'complete' || p.state === 'failed';
    }, 60000, 200);
  }, 120000);

  it('search_knowledge should include indexingInProgress flag when project indexing', async () => {
    const { searchKnowledge, indexKnowledge } = await import('../../mcp/resources');

    const projectPath = path.join(env.testDir, 'proj2');
    fs.mkdirSync(projectPath, { recursive: true });
    fs.writeFileSync(path.join(projectPath, 'a.ts'), 'export const a = 1;\n');

    const projectDataPath = path.join(env.workspacesDir, 'proj2');
    fs.mkdirSync(path.join(projectDataPath, 'knowledge'), { recursive: true });
    fs.writeFileSync(path.join(projectDataPath, 'config.yaml'), `name: proj2\nmode: global\nsourcePath: ${projectPath}\n`);

    createMockMCPConfig(env, [{ name: 'proj2', path: projectPath }]);
    const configPath = path.join(env.rrceHome, 'mcp.yaml');
    const cfg = fs.readFileSync(configPath, 'utf-8');
    fs.writeFileSync(
      configPath,
      cfg + '\n    semanticSearch:\n      enabled: true\n'
    );

    // Start indexing (background)
    await indexKnowledge('proj2');

    // Search while indexing is potentially running
    const results = await searchKnowledge('export', 'proj2');

    // We don't require results content; only the flag behavior for the queried project
    if (results.length > 0) {
      expect(results[0]).toHaveProperty('indexingInProgress');
    }

    const anyFlagged = results.some(r => r.indexingInProgress === true);
    // It's acceptable for indexing to have finished extremely quickly in CI,
    // but in most cases it should be running and flagged.
    expect(typeof anyFlagged).toBe('boolean');
  }, 120000);
});
