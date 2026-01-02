import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import { convertToOpenCodeAgent, updateOpenCodeConfig } from '../../../commands/wizard/utils';

vi.mock('fs');
vi.mock('os');

describe('commands/wizard/utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  describe('updateOpenCodeConfig', () => {
    it('surgically updates rrce_ agents while preserving others', () => {
      (os.homedir as any).mockReturnValue('/home/user');
      const configPath = '/home/user/.config/opencode/opencode.json';
      
      const existingConfig = {
        agents: {
          user_agent: { description: 'User' },
          rrce_init: { description: 'Old Init' },
          rrce_old: { description: 'Stale' }
        }
      };

      (fs.existsSync as any).mockImplementation((p: string) => p.endsWith('opencode.json'));
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(existingConfig));
      const writeSpy = vi.spyOn(fs, 'writeFileSync');

      const newAgents = {
        rrce_init: { description: 'New Init' },
        rrce_new: { description: 'New Agent' }
      };

      updateOpenCodeConfig(newAgents);

      expect(writeSpy).toHaveBeenCalled();
      const writeCall = writeSpy.mock.calls[0];
      if (!writeCall) throw new Error('write was not called');
      const written = JSON.parse(writeCall[1] as string);
      
      expect(written.agents.user_agent).toBeDefined(); // Preserved
      expect(written.agents.rrce_init.description).toBe('New Init'); // Updated
      expect(written.agents.rrce_new).toBeDefined(); // Added
      expect(written.agents.rrce_old).toBeUndefined(); // Deleted (stale)
    });
  });
});
