import { describe, it, expect } from 'vitest';

import { convertToOpenCodeAgent } from '../../../commands/wizard/utils';

describe('commands/wizard/utils', () => {
  describe('convertToOpenCodeAgent', () => {
    it('creates a subagent and preserves tool mapping', () => {
      const prompt = {
        filePath: '/tmp/init.md',
        frontmatter: {
          description: 'Test agent description',
          tools: ['read', 'write', 'bash', 'search_knowledge', 'get_project_context'],
        },
        content: 'Hello from agent',
      } as any;

      const agent = convertToOpenCodeAgent(prompt);

      expect(agent.mode).toBe('subagent');
      expect(agent.description).toContain('Test agent description');
      expect(agent.description).toContain('Invoke via @rrce_*');

      // Host tools
      expect(agent.tools.read).toBe(true);
      expect(agent.tools.write).toBe(true);
      expect(agent.tools.bash).toBe(true);

      // MCP tools must be prefixed
      expect(agent.tools.rrce_search_knowledge).toBe(true);
      expect(agent.tools.rrce_get_project_context).toBe(true);

      // Always enabled
      expect(agent.tools.webfetch).toBe(true);
    });

    it('uses prompt file reference and rrce_ invocation hint', () => {
      const prompt = {
        filePath: '/tmp/init.md',
        frontmatter: {
          description: 'Desc',
          tools: ['read'],
        },
        content: 'Inline content',
      } as any;

      const agent = convertToOpenCodeAgent(prompt, true, './prompts/rrce-init.md');

      expect(agent.prompt).toBe('{file:./prompts/rrce-init.md}');
      expect(agent.mode).toBe('subagent');
    });
  });
});
