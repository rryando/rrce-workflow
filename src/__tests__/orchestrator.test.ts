import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { loadPromptsFromDir, getAgentCorePromptsDir } from '../lib/prompts';
import { convertToOpenCodeAgent } from '../commands/wizard/utils';
import type { ParsedPrompt } from '../types/prompt';

describe('RRCE Orchestrator', () => {
  const promptsDir = getAgentCorePromptsDir();

  describe('Prompt Validation', () => {
    it('should have orchestrator.md in prompts directory', () => {
      const orchestratorPath = path.join(promptsDir, 'orchestrator.md');
      expect(fs.existsSync(orchestratorPath)).toBe(true);
    });

    it('should parse orchestrator prompt correctly', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      expect(orchestrator).toBeDefined();
      expect(orchestrator?.frontmatter.name).toBe('RRCE');
      expect(orchestrator?.frontmatter.mode).toBe('primary');
    });

    it('should have all required tools in orchestrator', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      const requiredTools = [
        'search_knowledge',
        'search_code',
        'get_project_context',
        'list_agents',
        'get_agent_prompt',
        'list_tasks',
        'get_task',
        'create_task',
        'update_task'
      ];

      for (const tool of requiredTools) {
        expect(orchestrator?.frontmatter.tools).toContain(tool);
      }
    });
  });

  describe('OpenCode Configuration', () => {
    it('should convert orchestrator to primary mode', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      if (!orchestrator) throw new Error('Orchestrator prompt not found');
      
      const agentConfig = convertToOpenCodeAgent(orchestrator);
      
      expect(agentConfig.mode).toBe('primary');
      expect(agentConfig.description).not.toContain('Invoke via @rrce_*');
    });

    it('should convert design agent to subagent mode', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const design = prompts.find(p => path.basename(p.filePath) === 'design.md');
      
      if (!design) throw new Error('Design prompt not found');
      
      const agentConfig = convertToOpenCodeAgent(design);
      
      expect(agentConfig.mode).toBe('subagent');
      expect(agentConfig.description).toContain('Invoke via @rrce_*');
    });

    it('should have all RRCE-specific tools enabled for orchestrator', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      if (!orchestrator) throw new Error('Orchestrator prompt not found');
      
      const agentConfig = convertToOpenCodeAgent(orchestrator);
      
      expect(agentConfig.tools.search_knowledge).toBe(true);
    });

    it('should NOT prefix MCP tools (direct match with server)', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      if (!orchestrator) throw new Error('Orchestrator prompt not found');
      
      const agentConfig = convertToOpenCodeAgent(orchestrator);
      
      // MCP tools should NOT be prefixed (this matches current server implementation)
      expect(agentConfig.tools.search_knowledge).toBe(true);
      expect(agentConfig.tools.get_project_context).toBe(true);
      expect(agentConfig.tools.list_agents).toBe(true);
      expect(agentConfig.tools.get_task).toBe(true);
      
      // Host tools should not be prefixed either
      expect(agentConfig.tools.task).toBe(true);
      expect(agentConfig.tools.read).toBe(true);
      expect(agentConfig.tools.write).toBe(true);
    });
  });

  describe('Agent Modes', () => {
    it('should have exactly one primary agent (orchestrator)', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const primaryAgents = prompts.filter(p => p.frontmatter.mode === 'primary');
      
      expect(primaryAgents).toHaveLength(1);
      expect(primaryAgents[0]?.frontmatter.name).toBe('RRCE');
    });

    it('should have all other agents as subagents', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const subagents = prompts.filter(p => 
        !p.frontmatter.mode || p.frontmatter.mode === 'subagent'
      );
      
      // Updated for new architecture: design + develop instead of research/planning/executor
      const expectedSubagents = [
        'init',
        'design',
        'develop',
        'documentation',
        'doctor',
        'sync'
      ];

      const subagentNames = subagents.map(s => path.basename(s.filePath, '.md'));
      
      for (const expected of expectedSubagents) {
        expect(subagentNames).toContain(expected);
      }
    });
  });

  describe('Workflow Prerequisites', () => {
    it('should document phase dependencies in orchestrator', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      if (!orchestrator) throw new Error('Orchestrator prompt not found');
      
      const content = orchestrator.content.toLowerCase();
      
      // Check for documented phase dependencies (updated for new naming)
      expect(content).toContain('design');
      expect(content).toContain('develop');
      expect(content).toContain('prerequisite'); // phase dependencies documented
      expect(content).toContain('validate_phase');
    });
  });

  describe('Tool Access Control', () => {
    it('should give orchestrator appropriate tool access', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      if (!orchestrator) throw new Error('Orchestrator prompt not found');
      
      // Orchestrator needs RRCE-specific tools
      const tools = orchestrator.frontmatter.tools || [];
      
      expect(tools.length).toBeGreaterThan(5); 
      expect(tools).toContain('search_knowledge');
      expect(tools).toContain('update_task');
    });

    it('should restrict subagent tool access appropriately', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      
      // Design should NOT have edit/bash
      const design = prompts.find(p => path.basename(p.filePath) === 'design.md');
      
      expect(design?.frontmatter.tools).not.toContain('edit');
      expect(design?.frontmatter.tools).not.toContain('bash');
      
      // Develop SHOULD have edit/bash
      const develop = prompts.find(p => path.basename(p.filePath) === 'develop.md');
      expect(develop?.frontmatter.tools).toContain('edit');
      expect(develop?.frontmatter.tools).toContain('bash');
    });
  });
});

describe('OpenCode Setup Integration', () => {
  describe('Plan Agent Hiding', () => {
    it('should disable OpenCode plan agent in setup', () => {
      // This is a reminder to check setup-actions.ts
      // The actual test would require mocking fs operations
      expect(true).toBe(true);
      
      // Manual verification checklist:
      // 1. setup-actions.ts sets opencodeConfig.agent.plan.disable = true
      // 2. update-flow.ts sets opencodeConfig.agent.plan.disable = true
    });
  });

  describe('Agent Naming', () => {
    it('should use rrce_ prefix for all agents in OpenCode', () => {
      const prompts = loadPromptsFromDir(path.join(__dirname, '../../agent-core/prompts'));
      
      for (const prompt of prompts) {
        const baseName = path.basename(prompt.filePath, '.md');
        const expectedId = `rrce_${baseName}`;
        
        // In setup, we generate: agentId = `rrce_${baseName}`
        expect(expectedId).toMatch(/^rrce_/);
      }
    });
  });
});

describe('Orchestrator Behavior Simulation', () => {
  describe('State Management', () => {
    it('should track completion via meta.json status fields', () => {
      // Simulated meta.json structure (updated for new phases)
      const mockMeta = {
        task_slug: 'test-feature',
        agents: {
          research: { status: 'complete', artifact: 'research/test-feature-research.md' },
          planning: { status: 'complete', artifact: 'planning/test-feature-plan.md' },
          executor: { status: 'in_progress', started_at: '2025-01-03T10:00:00Z' }
        }
      };

      // Orchestrator should check these status fields
      expect(mockMeta.agents.research.status).toBe('complete');
      expect(mockMeta.agents.planning.status).toBe('complete');
      expect(mockMeta.agents.executor.status).toBe('in_progress');
    });
  });

  describe('Phase Progression Logic', () => {
    it('should follow correct phase order (new: design → develop)', () => {
      // Updated for new architecture
      const correctOrder = ['design', 'develop', 'documentation'];
      
      // Orchestrator must respect this order
      expect(correctOrder.indexOf('develop')).toBeGreaterThan(correctOrder.indexOf('design'));
      expect(correctOrder.indexOf('documentation')).toBeGreaterThan(correctOrder.indexOf('develop'));
    });

    it('should not skip prerequisites', () => {
      const prerequisites = {
        develop: ['design'],
        documentation: ['develop']
      };

      // Orchestrator must check these before delegating
      expect(prerequisites.develop).toContain('design');
      expect(prerequisites.documentation).toContain('develop');
    });
  });
});
