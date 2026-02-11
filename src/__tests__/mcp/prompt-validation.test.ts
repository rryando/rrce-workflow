/**
 * Prompt Validation Tests
 *
 * Validates prompt and template integrity:
 * - No Handlebars syntax in prompts or templates
 * - No stale command references
 * - meta.template.json has all fields prompts reference
 * - No duplicate task() code blocks in design.md
 * - All include directives reference existing files
 * - All prompt frontmatters have version field
 * - Unreplaced variable warning in renderPrompt()
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROMPTS_DIR = path.join(__dirname, '../../../agent-core/prompts');
const TEMPLATES_DIR = path.join(__dirname, '../../../agent-core/templates');

/**
 * Read all .md files from a directory (non-recursive)
 */
function readMdFiles(dir: string): { name: string; content: string }[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => ({
      name: f,
      content: fs.readFileSync(path.join(dir, f), 'utf-8'),
    }));
}

describe('Prompt Validation', () => {
  describe('No Handlebars syntax', () => {
    test('prompts should not contain {{#each}} or {{/each}}', () => {
      const files = readMdFiles(PROMPTS_DIR);
      for (const file of files) {
        expect(file.content, `${file.name} contains Handlebars {{#each}}`).not.toMatch(/\{\{#each\b/);
        expect(file.content, `${file.name} contains Handlebars {{/each}}`).not.toMatch(/\{\{\/each\}\}/);
      }
    });

    test('templates should not contain {{#each}} or {{/each}}', () => {
      const files = readMdFiles(TEMPLATES_DIR);
      for (const file of files) {
        expect(file.content, `${file.name} contains Handlebars {{#each}}`).not.toMatch(/\{\{#each\b/);
        expect(file.content, `${file.name} contains Handlebars {{/each}}`).not.toMatch(/\{\{\/each\}\}/);
      }
    });

    test('doc sub-templates should not contain Handlebars syntax', () => {
      const docsDir = path.join(TEMPLATES_DIR, 'docs');
      const files = readMdFiles(docsDir);
      for (const file of files) {
        expect(file.content, `docs/${file.name} contains Handlebars syntax`).not.toMatch(/\{\{[#/]/);
      }
    });
  });

  describe('No stale command references', () => {
    const staleCommands = [
      '/plan ',
      '/execute ',
      '/rrce_research',
      '/rrce_plan',
      '/rrce_execute',
      '@rrce_executor',
      'rrce-workflow run planning',
      'rrce-workflow run research',
    ];

    test('templates should not reference stale commands', () => {
      const files = readMdFiles(TEMPLATES_DIR);
      for (const file of files) {
        for (const cmd of staleCommands) {
          expect(file.content, `${file.name} contains stale command "${cmd}"`).not.toContain(cmd);
        }
      }
    });

    test('prompts should not reference stale agent names', () => {
      const files = readMdFiles(PROMPTS_DIR);
      // Exclude _base.md and partial files from this check
      const agentFiles = files.filter(f => !f.name.startsWith('_'));
      for (const file of agentFiles) {
        expect(file.content, `${file.name} references old "@rrce_executor"`).not.toContain('@rrce_executor');
      }
    });
  });

  describe('meta.template.json field coverage', () => {
    test('should have completed_at in all agent objects', () => {
      const meta = JSON.parse(
        fs.readFileSync(path.join(TEMPLATES_DIR, 'meta.template.json'), 'utf-8')
      );

      for (const agentName of ['research', 'planning', 'executor', 'documentation']) {
        expect(meta.agents[agentName], `agents.${agentName} missing`).toBeDefined();
        expect(meta.agents[agentName]).toHaveProperty('completed_at');
      }
    });

    test('should have task_count in planning agent', () => {
      const meta = JSON.parse(
        fs.readFileSync(path.join(TEMPLATES_DIR, 'meta.template.json'), 'utf-8')
      );
      expect(meta.agents.planning).toHaveProperty('task_count');
    });

    test('should have tasks_completed and tests_passed in executor agent', () => {
      const meta = JSON.parse(
        fs.readFileSync(path.join(TEMPLATES_DIR, 'meta.template.json'), 'utf-8')
      );
      expect(meta.agents.executor).toHaveProperty('tasks_completed');
      expect(meta.agents.executor).toHaveProperty('tests_passed');
    });
  });

  describe('No duplicate task() blocks in design.md', () => {
    test('design.md should have at most one task() delegation block', () => {
      const content = fs.readFileSync(path.join(PROMPTS_DIR, 'design.md'), 'utf-8');
      // Match standalone task({ but not rrce_update_task({ or similar tool calls
      const taskBlocks = content.match(/(?<![a-zA-Z_])task\(\{[\s\S]*?subagent_type[\s\S]*?\}\)/g) || [];
      expect(taskBlocks.length, 'Found duplicate task() delegation blocks in design.md').toBeLessThanOrEqual(1);
    });
  });

  describe('Include directives reference existing files', () => {
    test('all <!-- include: --> directives should reference existing files', () => {
      const files = readMdFiles(PROMPTS_DIR);
      const includePattern = /<!--\s*include:\s*(_[a-zA-Z0-9_-]+\.md)\s*-->/g;

      for (const file of files) {
        let match;
        while ((match = includePattern.exec(file.content)) !== null) {
          const includedFile = match[1];
          const includePath = path.join(PROMPTS_DIR, includedFile);
          expect(
            fs.existsSync(includePath),
            `${file.name} includes "${includedFile}" which does not exist`
          ).toBe(true);
        }
      }
    });

    test('all <!-- include-if: --> directives should reference existing files', () => {
      const files = readMdFiles(PROMPTS_DIR);
      const includeIfPattern = /<!--\s*include-if:\s*\S+\s+(_[a-zA-Z0-9_-]+\.md)\s*-->/g;

      for (const file of files) {
        let match;
        while ((match = includeIfPattern.exec(file.content)) !== null) {
          const includedFile = match[1];
          const includePath = path.join(PROMPTS_DIR, includedFile);
          expect(
            fs.existsSync(includePath),
            `${file.name} conditionally includes "${includedFile}" which does not exist`
          ).toBe(true);
        }
      }
    });
  });

  describe('Prompt frontmatter version field', () => {
    test('all agent prompts should have version in frontmatter', () => {
      const promptFiles = ['design.md', 'develop.md', 'init.md', 'orchestrator.md',
        'sync.md', 'documentation.md', 'cleanup.md', 'doctor.md'];

      for (const file of promptFiles) {
        const content = fs.readFileSync(path.join(PROMPTS_DIR, file), 'utf-8');
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        expect(frontmatterMatch, `${file} has no frontmatter`).not.toBeNull();

        const frontmatter = frontmatterMatch![1];
        expect(frontmatter, `${file} frontmatter missing version field`).toMatch(/^version:\s/m);
      }
    });
  });

  describe('Unreplaced variable warning', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('renderPrompt should warn on unreplaced UPPER_CASE variables', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { renderPrompt } = await import('../../mcp/prompts');

      renderPrompt('Hello {{MISSING_VAR}} world', {});

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('{{MISSING_VAR}}')
      );
    });

    test('renderPrompt should not warn on lowercase/agent-filled variables', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const { renderPrompt } = await import('../../mcp/prompts');

      renderPrompt('Hello {{task_slug}} world', {});

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
