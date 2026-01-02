import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';

vi.mock('fs');
vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/home/user')
}));
vi.mock('../../../lib/paths', () => ({
  ensureDir: vi.fn(),
  getDefaultRRCEHome: () => '/home/user/.rrce-workflow'
}));
vi.mock('../../../mcp/install', () => ({
  OPENCODE_CONFIG: '/home/user/.config/opencode/opencode.json',
  OPENCODE_CONFIG_DIR: '/home/user/.config/opencode',
  ANTIGRAVITY_CONFIG: '/home/user/.gemini/antigravity.json',
  CLAUDE_CONFIG: '/home/user/.config/claude/claude_desktop_config.json',
  VSCODE_GLOBAL_CONFIG: '/home/user/.config/Code/User/settings.json',
  installToConfig: vi.fn(),
  getTargetLabel: vi.fn()
}));

import { 
  convertToOpenCodeAgent, 
  updateOpenCodeConfig, 
  clearDirectory,
  surgicalUpdateOpenCodeAgents 
} from '../../../commands/wizard/utils';
import { detectExistingProject } from '../../../commands/wizard/setup-actions';

describe('commands/wizard/utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (os.homedir as any).mockReturnValue('/home/user');
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

  describe('clearDirectory', () => {
    it('removes all files but not subdirectories', () => {
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue([
        { name: 'file1.md', isFile: () => true, isDirectory: () => false },
        { name: 'file2.md', isFile: () => true, isDirectory: () => false },
        { name: 'subdir', isFile: () => false, isDirectory: () => true },
      ]);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      clearDirectory('/some/path');

      expect(unlinkSpy).toHaveBeenCalledTimes(2);
      expect(unlinkSpy).toHaveBeenCalledWith('/some/path/file1.md');
      expect(unlinkSpy).toHaveBeenCalledWith('/some/path/file2.md');
    });

    it('does nothing if directory does not exist', () => {
      (fs.existsSync as any).mockReturnValue(false);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync');

      clearDirectory('/nonexistent/path');

      expect(unlinkSpy).not.toHaveBeenCalled();
    });
  });

  describe('detectExistingProject', () => {
    it('detects global mode project', () => {
      (fs.existsSync as any).mockImplementation((p: string) => 
        p === '/home/user/.rrce-workflow/workspaces/test-project/config.yaml'
      );

      const result = detectExistingProject('/path/to/workspace', 'test-project');
      
      expect(result.isExisting).toBe(true);
      expect(result.currentMode).toBe('global');
      expect(result.configPath).toBe('/home/user/.rrce-workflow/workspaces/test-project/config.yaml');
    });

    it('detects workspace mode project', () => {
      (fs.existsSync as any).mockImplementation((p: string) => 
        p === '/path/to/workspace/.rrce-workflow/config.yaml'
      );

      const result = detectExistingProject('/path/to/workspace', 'test-project');
      
      expect(result.isExisting).toBe(true);
      expect(result.currentMode).toBe('workspace');
      expect(result.configPath).toBe('/path/to/workspace/.rrce-workflow/config.yaml');
    });

    it('detects orphaned OpenCode agents', () => {
      const opencodeConfig = {
        agents: {
          rrce_init: { description: 'Init' }
        }
      };
      
      (fs.existsSync as any).mockImplementation((p: string) => 
        p.endsWith('opencode.json')
      );
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(opencodeConfig));

      const result = detectExistingProject('/path/to/workspace', 'test-project');
      
      expect(result.isExisting).toBe(true);
      expect(result.currentMode).toBe(null);
      expect(result.configPath).toBe(null);
    });

    it('returns false for fresh project', () => {
      (fs.existsSync as any).mockReturnValue(false);

      const result = detectExistingProject('/path/to/workspace', 'test-project');
      
      expect(result.isExisting).toBe(false);
      expect(result.currentMode).toBe(null);
      expect(result.configPath).toBe(null);
    });
  });

  describe('surgicalUpdateOpenCodeAgents', () => {
    it('clears old agents in workspace mode', () => {
      (os.homedir as any).mockReturnValue('/home/user');
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue([
        { name: 'rrce_old.md', isFile: () => true },
        { name: 'rrce_stale.md', isFile: () => true },
      ]);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const prompts = [
        {
          filePath: '/tmp/init.md',
          frontmatter: { description: 'Init', tools: ['read'] },
          content: 'Init content',
        },
        {
          filePath: '/tmp/research.md',
          frontmatter: { description: 'Research', tools: ['read'] },
          content: 'Research content',
        },
      ] as any;

      surgicalUpdateOpenCodeAgents(prompts, 'workspace', '/data/path');

      // Should clear old files first
      expect(unlinkSpy).toHaveBeenCalledTimes(2);
      
      // Should write new agents
      expect(writeSpy).toHaveBeenCalledWith(
        '/data/path/.opencode/agent/rrce_init.md',
        expect.stringContaining('Init content')
      );
      expect(writeSpy).toHaveBeenCalledWith(
        '/data/path/.opencode/agent/rrce_research.md',
        expect.stringContaining('Research content')
      );
    });

    it('updates global mode using surgical config update', () => {
      (os.homedir as any).mockReturnValue('/home/user');
      
      const existingConfig = {
        agents: {
          user_agent: { description: 'User' },
          rrce_old: { description: 'Stale agent' }
        }
      };
      
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(existingConfig));
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const prompts = [
        {
          filePath: '/tmp/init.md',
          frontmatter: { description: 'Init', tools: ['read'] },
          content: 'Init content',
        },
      ] as any;

      surgicalUpdateOpenCodeAgents(prompts, 'global', '/data/path');

      // Should write prompt file
      expect(writeSpy).toHaveBeenCalledWith(
        '/home/user/.config/opencode/prompts/rrce-init.md',
        'Init content'
      );
      
      // Should update opencode.json surgically
      const configWriteCall = writeSpy.mock.calls.find(
        call => (call[0] as string).endsWith('opencode.json')
      );
      expect(configWriteCall).toBeDefined();
      
      if (configWriteCall) {
        const written = JSON.parse(configWriteCall[1] as string);
        expect(written.agents.user_agent).toBeDefined(); // Preserved
        expect(written.agents.rrce_init).toBeDefined(); // Added
        expect(written.agents.rrce_old).toBeUndefined(); // Removed (stale)
      }
    });
  });
});
