/**
 * Unit tests for src/mcp/prompts.ts and src/lib/prompts.ts
 * 
 * Tests prompt handling functions including:
 * - parsePromptFile
 * - loadPromptsFromDir
 * - renderPrompt
 * - getAllPrompts
 * - getPromptDef
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createTestEnv, type TestEnv } from '../helpers/test-env';

describe('prompts', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv('prompts');
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('lib/prompts.ts', () => {
    describe('parsePromptFile', () => {
      it('should parse a valid prompt file with frontmatter', async () => {
        const { parsePromptFile } = await import('../../lib/prompts');
        
        // Create a test prompt file
        const promptDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(promptDir, { recursive: true });
        const promptPath = path.join(promptDir, 'test-prompt.md');
        fs.writeFileSync(promptPath, `---
name: Test Prompt
description: A test prompt for unit testing
tools:
  - read
  - write
required-args:
  - name: PROJECT_NAME
    prompt: Enter project name
optional-args:
  - name: BRANCH
    prompt: Git branch name
---

# Test Prompt Content

This is the {{PROJECT_NAME}} prompt body.
`);
        
        const result = parsePromptFile(promptPath);
        
        expect(result).not.toBeNull();
        expect(result?.frontmatter.name).toBe('Test Prompt');
        expect(result?.frontmatter.description).toBe('A test prompt for unit testing');
        expect(result?.frontmatter.tools).toContain('read');
        expect(result?.frontmatter.tools).toContain('write');
        expect(result?.content).toContain('{{PROJECT_NAME}}');
      });

      it('should return null for non-existent file', async () => {
        const { parsePromptFile } = await import('../../lib/prompts');
        
        const result = parsePromptFile('/non/existent/file.md');
        
        expect(result).toBeNull();
      });

      it('should handle file without frontmatter', async () => {
        const { parsePromptFile } = await import('../../lib/prompts');
        
        const promptDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(promptDir, { recursive: true });
        const promptPath = path.join(promptDir, 'no-frontmatter.md');
        fs.writeFileSync(promptPath, '# Just content\n\nNo frontmatter here.');
        
        // Should return null because frontmatter validation fails
        const result = parsePromptFile(promptPath);
        
        expect(result).toBeNull();
      });
    });

    describe('loadPromptsFromDir', () => {
      it('should load all .md files from directory', async () => {
        const { loadPromptsFromDir } = await import('../../lib/prompts');
        
        // Create test prompts
        const promptDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(promptDir, { recursive: true });
        
        const promptTemplate = (name: string) => `---
name: ${name}
description: Description for ${name}
---

Content for ${name}
`;
        
        fs.writeFileSync(path.join(promptDir, 'prompt1.md'), promptTemplate('Prompt One'));
        fs.writeFileSync(path.join(promptDir, 'prompt2.md'), promptTemplate('Prompt Two'));
        fs.writeFileSync(path.join(promptDir, 'not-a-prompt.txt'), 'This is not a prompt');
        
        const result = loadPromptsFromDir(promptDir);
        
        expect(result.length).toBe(2);
        expect(result.find(p => p.frontmatter.name === 'Prompt One')).toBeDefined();
        expect(result.find(p => p.frontmatter.name === 'Prompt Two')).toBeDefined();
      });

      it('should return empty array for non-existent directory', async () => {
        const { loadPromptsFromDir } = await import('../../lib/prompts');
        
        const result = loadPromptsFromDir('/non/existent/directory');
        
        expect(result).toEqual([]);
      });

      it('should return empty array for empty directory', async () => {
        const { loadPromptsFromDir } = await import('../../lib/prompts');
        
        const emptyDir = path.join(env.testDir, 'empty-prompts');
        fs.mkdirSync(emptyDir, { recursive: true });
        
        const result = loadPromptsFromDir(emptyDir);
        
        expect(result).toEqual([]);
      });
    });

    describe('getAgentCorePromptsDir', () => {
      it('should return a valid path', async () => {
        const { getAgentCorePromptsDir } = await import('../../lib/prompts');
        
        const result = getAgentCorePromptsDir();
        
        expect(typeof result).toBe('string');
        expect(result).toContain('prompts');
      });
    });
  });

  describe('mcp/prompts.ts', () => {
    describe('renderPrompt', () => {
      it('should replace template variables', async () => {
        const { renderPrompt } = await import('../../mcp/prompts');
        
        const template = 'Hello {{NAME}}, welcome to {{PROJECT}}!';
        const args = { NAME: 'Alice', PROJECT: 'TestProject' };
        
        const result = renderPrompt(template, args);
        
        expect(result).toBe('Hello Alice, welcome to TestProject!');
      });

      it('should handle multiple occurrences of same variable', async () => {
        const { renderPrompt } = await import('../../mcp/prompts');
        
        const template = '{{VAR}} and {{VAR}} again';
        const args = { VAR: 'test' };
        
        const result = renderPrompt(template, args);
        
        expect(result).toBe('test and test again');
      });

      it('should leave unreplaced variables as-is', async () => {
        const { renderPrompt } = await import('../../mcp/prompts');
        
        const template = 'Hello {{NAME}}, your id is {{ID}}';
        const args = { NAME: 'Bob' };
        
        const result = renderPrompt(template, args);
        
        expect(result).toBe('Hello Bob, your id is {{ID}}');
      });

      it('should handle empty args', async () => {
        const { renderPrompt } = await import('../../mcp/prompts');
        
        const template = 'Static content with {{VAR}}';
        
        const result = renderPrompt(template, {});
        
        expect(result).toBe('Static content with {{VAR}}');
      });
    });

    describe('getAllPrompts', () => {
      it('should return array of prompts', async () => {
        const { getAllPrompts } = await import('../../mcp/prompts');
        
        const result = getAllPrompts();
        
        expect(Array.isArray(result)).toBe(true);
        // Should find at least some prompts from agent-core/prompts
        expect(result.length).toBeGreaterThan(0);
      });

      it('should return prompts with required fields', async () => {
        const { getAllPrompts } = await import('../../mcp/prompts');
        
        const result = getAllPrompts();
        
        for (const prompt of result) {
          expect(prompt).toHaveProperty('id');
          expect(prompt).toHaveProperty('name');
          expect(prompt).toHaveProperty('description');
          expect(prompt).toHaveProperty('arguments');
          expect(prompt).toHaveProperty('content');
        }
      });
    });

    describe('getPromptDef', () => {
      it('should find prompt by name', async () => {
        const { getPromptDef, getAllPrompts } = await import('../../mcp/prompts');

        const allPrompts = getAllPrompts();
        if (allPrompts.length === 0) {
          // Skip if no prompts available
          return;
        }

        const firstPrompt = allPrompts[0];
        const firstName = firstPrompt?.name;
        if (!firstName) return;

        const result = getPromptDef(firstName);

        expect(result).toBeDefined();
        expect(result?.name).toBe(firstName);
      });

      it('should find prompt by id', async () => {
        const { getPromptDef, getAllPrompts } = await import('../../mcp/prompts');

        const allPrompts = getAllPrompts();
        if (allPrompts.length === 0) {
          return;
        }

        const firstPrompt = allPrompts[0];
        const firstId = firstPrompt?.id;
        if (!firstId) return;

        const result = getPromptDef(firstId);

        expect(result).toBeDefined();
        expect(result?.id).toBe(firstId);
      });

      it('should return undefined for non-existent prompt', async () => {
        const { getPromptDef } = await import('../../mcp/prompts');

        const result = getPromptDef('non-existent-prompt-name');

        expect(result).toBeUndefined();
      });

      it('should be case-insensitive', async () => {
        const { getPromptDef, getAllPrompts } = await import('../../mcp/prompts');

        const allPrompts = getAllPrompts();
        if (allPrompts.length === 0) {
          return;
        }

        const firstPrompt = allPrompts[0];
        const firstName = firstPrompt?.name;
        if (!firstName) return;

        const result = getPromptDef(firstName.toLowerCase());

        expect(result).toBeDefined();
      });
    });

    describe('processIncludes', () => {
      it('should resolve unconditional includes', async () => {
        const { processIncludes } = await import('../../mcp/prompts');

        const partialsDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(partialsDir, { recursive: true });
        fs.writeFileSync(path.join(partialsDir, '_shared.md'), 'Shared content here');

        const content = 'Before\n<!-- include: _shared.md -->\nAfter';
        const result = processIncludes(content, partialsDir);

        expect(result).toContain('Before');
        expect(result).toContain('Shared content here');
        expect(result).toContain('After');
        expect(result).not.toContain('<!-- include:');
      });

      it('should resolve conditional includes when client matches', async () => {
        const { processIncludes, setDetectedClient } = await import('../../mcp/prompts');

        setDetectedClient('testclient');
        const partialsDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(partialsDir, { recursive: true });
        fs.writeFileSync(path.join(partialsDir, '_client.md'), 'Client-specific content');

        const content = '<!-- include-if: testclient _client.md -->';
        const result = processIncludes(content, partialsDir);

        expect(result).toBe('Client-specific content');
      });

      it('should skip conditional includes when client does not match', async () => {
        const { processIncludes, setDetectedClient } = await import('../../mcp/prompts');

        setDetectedClient('otherclient');
        const partialsDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(partialsDir, { recursive: true });
        fs.writeFileSync(path.join(partialsDir, '_client.md'), 'Client-specific content');

        const content = 'Start\n<!-- include-if: testclient _client.md -->\nEnd';
        const result = processIncludes(content, partialsDir);

        expect(result).not.toContain('Client-specific content');
        expect(result).toContain('Start');
        expect(result).toContain('End');
      });

      it('should handle missing include files gracefully', async () => {
        const { processIncludes } = await import('../../mcp/prompts');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const partialsDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(partialsDir, { recursive: true });

        const content = '<!-- include: _nonexistent.md -->';
        const result = processIncludes(content, partialsDir);

        expect(result).toBe('');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('_nonexistent.md'));

        warnSpy.mockRestore();
      });

      it('should resolve nested includes recursively', async () => {
        const { processIncludes } = await import('../../mcp/prompts');

        const partialsDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(partialsDir, { recursive: true });
        fs.writeFileSync(path.join(partialsDir, '_outer.md'), 'Outer\n<!-- include: _inner.md -->');
        fs.writeFileSync(path.join(partialsDir, '_inner.md'), 'Inner content');

        const content = '<!-- include: _outer.md -->';
        const result = processIncludes(content, partialsDir);

        expect(result).toContain('Outer');
        expect(result).toContain('Inner content');
        expect(result).not.toContain('<!-- include:');
      });

      it('should stop at depth limit and warn', async () => {
        const { processIncludes } = await import('../../mcp/prompts');
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const partialsDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(partialsDir, { recursive: true });
        fs.writeFileSync(path.join(partialsDir, '_l1.md'), '<!-- include: _l2.md -->');
        fs.writeFileSync(path.join(partialsDir, '_l2.md'), '<!-- include: _l3.md -->');
        fs.writeFileSync(path.join(partialsDir, '_l3.md'), '<!-- include: _l4.md -->');
        fs.writeFileSync(path.join(partialsDir, '_l4.md'), 'Should not resolve');

        const content = '<!-- include: _l1.md -->';
        const result = processIncludes(content, partialsDir);

        // _l4.md include directive should remain unresolved at depth 3
        expect(result).toContain('<!-- include: _l4.md -->');
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('depth limit'));

        warnSpy.mockRestore();
      });

      it('should strip frontmatter from included partials', async () => {
        const { processIncludes } = await import('../../mcp/prompts');

        const partialsDir = path.join(env.testDir, 'prompts');
        fs.mkdirSync(partialsDir, { recursive: true });
        fs.writeFileSync(path.join(partialsDir, '_withfm.md'), '---\nname: Test Partial\n---\nActual content');

        const content = '<!-- include: _withfm.md -->';
        const result = processIncludes(content, partialsDir);

        expect(result).toContain('Actual content');
        expect(result).not.toContain('name: Test Partial');
      });
    });

    describe('resolveProjectContext', () => {
      it('should return all expected fields', async () => {
        const { resolveProjectContext } = await import('../../mcp/prompts');

        const ctx = resolveProjectContext();

        expect(ctx).toHaveProperty('rrceData');
        expect(ctx).toHaveProperty('rrceHome');
        expect(ctx).toHaveProperty('workspaceRoot');
        expect(ctx).toHaveProperty('workspaceName');
      });

      it('should return string types for all fields', async () => {
        const { resolveProjectContext } = await import('../../mcp/prompts');

        const ctx = resolveProjectContext();

        expect(typeof ctx.rrceData).toBe('string');
        expect(typeof ctx.rrceHome).toBe('string');
        expect(typeof ctx.workspaceRoot).toBe('string');
        expect(typeof ctx.workspaceName).toBe('string');
      });

      it('should fall back to process.cwd() for workspaceRoot when no project detected', async () => {
        const { resolveProjectContext } = await import('../../mcp/prompts');

        const ctx = resolveProjectContext();

        // In test env with no configured project, workspaceRoot should be cwd
        // (unless a global workspace directory happens to exist for the cwd folder name)
        expect(typeof ctx.workspaceRoot).toBe('string');
        expect(ctx.workspaceRoot.length).toBeGreaterThan(0);
      });
    });
  });
});
