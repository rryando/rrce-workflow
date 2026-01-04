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
  surgicalUpdateOpenCodeAgents,
  enableProviderCaching
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
        agent: {
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
      
      expect(written.agent.user_agent).toBeDefined(); // Preserved
      expect(written.agent.rrce_init.description).toBe('New Init'); // Updated
      expect(written.agent.rrce_new).toBeDefined(); // Added
      expect(written.agent.rrce_old).toBeUndefined(); // Deleted (stale)
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
    it('creates agents only for orchestrator and executor, commands for others (workspace mode)', () => {
      (os.homedir as any).mockReturnValue('/home/user');
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readdirSync as any).mockReturnValue([
        { name: 'rrce_old.md', isFile: () => true },
      ]);
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const prompts = [
        {
          filePath: '/tmp/orchestrator.md',
          frontmatter: { description: 'Orchestrator', mode: 'primary', tools: ['read'] },
          content: 'Orchestrator content',
        },
        {
          filePath: '/tmp/executor.md',
          frontmatter: { description: 'Executor', tools: ['read', 'edit', 'bash'] },
          content: 'Executor content',
        },
        {
          filePath: '/tmp/research_discussion.md',
          frontmatter: { description: 'Research', tools: ['read'] },
          content: 'Research content',
        },
      ] as any;

      surgicalUpdateOpenCodeAgents(prompts, 'workspace', '/data/path');

      // Should clear old files
      expect(unlinkSpy).toHaveBeenCalled();
      
      // Should write orchestrator and executor as agents
      expect(writeSpy).toHaveBeenCalledWith(
        '/data/path/.opencode/agent/rrce_orchestrator.md',
        expect.stringContaining('Orchestrator content')
      );
      expect(writeSpy).toHaveBeenCalledWith(
        '/data/path/.opencode/agent/rrce_executor.md',
        expect.stringContaining('Executor content')
      );
      
      // Should write research as a command (not agent)
      expect(writeSpy).toHaveBeenCalledWith(
        '/data/path/.opencode/command/rrce_research.md',
        expect.stringContaining('Research content')
      );
    });

    it('updates global mode with agents and commands', () => {
      (os.homedir as any).mockReturnValue('/home/user');
      
      const existingConfig = {
        agent: {
          user_agent: { description: 'User' },
          rrce_old: { description: 'Stale agent' }
        }
      };
      
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(existingConfig));
      (fs.readdirSync as any).mockReturnValue([]);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const prompts = [
        {
          filePath: '/tmp/orchestrator.md',
          frontmatter: { description: 'Orchestrator', mode: 'primary', tools: ['read'] },
          content: 'Orchestrator content',
        },
        {
          filePath: '/tmp/executor.md',
          frontmatter: { description: 'Executor', tools: ['read', 'edit'] },
          content: 'Executor content',
        },
        {
          filePath: '/tmp/init.md',
          frontmatter: { description: 'Init', tools: ['read'] },
          content: 'Init content',
        },
      ] as any;

      surgicalUpdateOpenCodeAgents(prompts, 'global', '/data/path');

      // Should write prompt files for agents (orchestrator, executor)
      expect(writeSpy).toHaveBeenCalledWith(
        '/home/user/.config/opencode/prompts/rrce-orchestrator.md',
        expect.stringContaining('Orchestrator content')
      );
      expect(writeSpy).toHaveBeenCalledWith(
        '/home/user/.config/opencode/prompts/rrce-executor.md',
        expect.stringContaining('Executor content')
      );
      
      // Should write command file for init
      expect(writeSpy).toHaveBeenCalledWith(
        '/home/user/.config/opencode/command/rrce_init.md',
        expect.stringContaining('Init content')
      );
      
      // Should update opencode.json surgically
      const configWriteCall = writeSpy.mock.calls.find(
        call => (call[0] as string).endsWith('opencode.json')
      );
      expect(configWriteCall).toBeDefined();
      
      if (configWriteCall) {
        const written = JSON.parse(configWriteCall[1] as string);
        expect(written.agent.user_agent).toBeDefined(); // Preserved
        expect(written.agent.rrce_orchestrator).toBeDefined(); // Added
        expect(written.agent.rrce_executor).toBeDefined(); // Added
        expect(written.agent.rrce_old).toBeUndefined(); // Removed (stale)
        expect(written.agent.rrce_init).toBeUndefined(); // Not an agent anymore
      }
    });
  });

  describe('enableProviderCaching', () => {
    it('enables caching for all providers in new config', () => {
      (os.homedir as any).mockReturnValue('/home/user');
      (fs.existsSync as any).mockReturnValue(false);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      enableProviderCaching();

      expect(writeSpy).toHaveBeenCalled();
      const writeCall = writeSpy.mock.calls[0];
      if (!writeCall) throw new Error('write was not called');
      const written = JSON.parse(writeCall[1] as string);

      // All providers should have caching enabled
      expect(written.provider.anthropic.options.setCacheKey).toBe(true);
      expect(written.provider.openai.options.setCacheKey).toBe(true);
      expect(written.provider.openrouter.options.setCacheKey).toBe(true);
      expect(written.provider.google.options.setCacheKey).toBe(true);
    });

    it('preserves existing provider settings while adding caching', () => {
      (os.homedir as any).mockReturnValue('/home/user');
      
      const existingConfig = {
        provider: {
          anthropic: {
            model: 'claude-sonnet-4-20250514',
            options: {
              maxTokens: 8192
            }
          },
          openai: {
            model: 'gpt-4o'
          }
        },
        agent: {
          rrce_init: { description: 'Init' }
        }
      };
      
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(existingConfig));
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      enableProviderCaching();

      expect(writeSpy).toHaveBeenCalled();
      const writeCall = writeSpy.mock.calls[0];
      if (!writeCall) throw new Error('write was not called');
      const written = JSON.parse(writeCall[1] as string);

      // Existing settings preserved
      expect(written.provider.anthropic.model).toBe('claude-sonnet-4-20250514');
      expect(written.provider.anthropic.options.maxTokens).toBe(8192);
      expect(written.provider.openai.model).toBe('gpt-4o');
      expect(written.agent.rrce_init).toBeDefined();

      // Caching added
      expect(written.provider.anthropic.options.setCacheKey).toBe(true);
      expect(written.provider.openai.options.setCacheKey).toBe(true);
      expect(written.provider.openrouter.options.setCacheKey).toBe(true);
      expect(written.provider.google.options.setCacheKey).toBe(true);
    });

    it('handles corrupted config gracefully', () => {
      (os.homedir as any).mockReturnValue('/home/user');
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue('not valid json');
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      enableProviderCaching();

      // Should still write a valid config with caching enabled
      expect(writeSpy).toHaveBeenCalled();
      const writeCall = writeSpy.mock.calls[0];
      if (!writeCall) throw new Error('write was not called');
      const written = JSON.parse(writeCall[1] as string);
      
      expect(written.provider.anthropic.options.setCacheKey).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});
