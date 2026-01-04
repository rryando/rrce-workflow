import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DetectedProject } from '../../lib/detection';
import { listProjectTasks, updateTaskStatus } from '../../mcp/ui/lib/tasks-fs';

function makeTmpDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath: string, data: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

describe('mcp ui tasks-fs', () => {
  const tmpRoots: string[] = [];

  afterEach(() => {
    for (const d of tmpRoots.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('returns empty list when tasks dir missing', () => {
    const root = makeTmpDir('rrce-tasks-fs-');
    tmpRoots.push(root);

    // Make config so storage mode resolves as workspace/local
    writeJson(path.join(root, '.rrce-workflow', 'config.yaml'), '');

    const proj: DetectedProject = {
      name: 'demo',
      path: root,
      source: 'local' as any,
      semanticSearchEnabled: false,
      dataPath: path.join(root, '.rrce-workflow'),
    };

    const result = listProjectTasks(proj);
    expect(result.tasks).toEqual([]);
  });

  it('skips invalid meta.json files', () => {
    const root = makeTmpDir('rrce-tasks-fs-');
    tmpRoots.push(root);

    // Ensure resolveDataPath points at local .rrce-workflow
    fs.mkdirSync(path.join(root, '.rrce-workflow'), { recursive: true });
    fs.writeFileSync(path.join(root, '.rrce-workflow', 'config.yaml'), 'mode: workspace\n');

    // valid task
    writeJson(path.join(root, '.rrce-workflow', 'tasks', 't1', 'meta.json'), {
      task_slug: 't1',
      title: 'Task 1',
      status: 'pending',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    // invalid task
    fs.mkdirSync(path.join(root, '.rrce-workflow', 'tasks', 'bad'), { recursive: true });
    fs.writeFileSync(path.join(root, '.rrce-workflow', 'tasks', 'bad', 'meta.json'), '{not-json');

    const proj: DetectedProject = {
      name: 'demo',
      path: root,
      source: 'local' as any,
      semanticSearchEnabled: false,
      dataPath: path.join(root, '.rrce-workflow'),
    };

    const result = listProjectTasks(proj);
    expect(result.tasks.map(t => t.task_slug)).toEqual(['t1']);
  });

  it('updates status and updated_at in meta.json', () => {
    const root = makeTmpDir('rrce-tasks-fs-');
    tmpRoots.push(root);

    fs.mkdirSync(path.join(root, '.rrce-workflow'), { recursive: true });
    fs.writeFileSync(path.join(root, '.rrce-workflow', 'config.yaml'), 'mode: workspace\n');

    writeJson(path.join(root, '.rrce-workflow', 'tasks', 't2', 'meta.json'), {
      task_slug: 't2',
      title: 'Task 2',
      status: 'pending',
      updated_at: '2026-01-01T00:00:00.000Z',
      keep: 'field',
    });

    const proj: DetectedProject = {
      name: 'demo',
      path: root,
      source: 'local' as any,
      semanticSearchEnabled: false,
      dataPath: path.join(root, '.rrce-workflow'),
    };

    const result = updateTaskStatus(proj, 't2', 'blocked');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.meta.status).toBe('blocked');
    expect((result.meta as any).keep).toBe('field');

    const saved = JSON.parse(fs.readFileSync(path.join(root, '.rrce-workflow', 'tasks', 't2', 'meta.json'), 'utf-8'));
    expect(saved.status).toBe('blocked');
    expect(typeof saved.updated_at).toBe('string');
    expect(Date.parse(saved.updated_at)).toBeGreaterThan(Date.parse('2026-01-01T00:00:00.000Z'));
  });
});
