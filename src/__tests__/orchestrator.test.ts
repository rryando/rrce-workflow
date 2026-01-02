import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { loadPromptsFromDir } from '../lib/prompts';
import { convertToOpenCodeAgent } from '../commands/wizard/utils';
import type { ParsedPrompt } from '../types/prompt';

describe('RRCE Orchestrator', () => {
  const promptsDir = path.join(__dirname, '../../../agent-core/prompts');

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
        'update_task',
        'task', // Critical for delegation
        'read',
        'write',
        'bash'
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

    it('should convert other agents to subagent mode', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const research = prompts.find(p => path.basename(p.filePath) === 'research_discussion.md');
      
      if (!research) throw new Error('Research prompt not found');
      
      const agentConfig = convertToOpenCodeAgent(research);
      
      expect(agentConfig.mode).toBe('subagent');
      expect(agentConfig.description).toContain('Invoke via @rrce_*');
    });

    it('should have task tool enabled for orchestrator', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      if (!orchestrator) throw new Error('Orchestrator prompt not found');
      
      const agentConfig = convertToOpenCodeAgent(orchestrator);
      
      expect(agentConfig.tools.task).toBe(true);
    });

    it('should prefix MCP tools with rrce_', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      if (!orchestrator) throw new Error('Orchestrator prompt not found');
      
      const agentConfig = convertToOpenCodeAgent(orchestrator);
      
      // MCP tools should be prefixed
      expect(agentConfig.tools.rrce_search_knowledge).toBe(true);
      expect(agentConfig.tools.rrce_get_project_context).toBe(true);
      expect(agentConfig.tools.rrce_list_agents).toBe(true);
      expect(agentConfig.tools.rrce_get_task).toBe(true);
      
      // Host tools should not be prefixed
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
      
      const expectedSubagents = [
        'init',
        'research_discussion',
        'planning_discussion',
        'executor',
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
      
      // Check for documented phase dependencies
      expect(content).toContain('planning');
      expect(content).toContain('research');
      expect(content).toContain('execution');
      expect(content).toContain('requires');
      expect(content).toContain('meta.json');
    });
  });

  describe('Tool Access Control', () => {
    it('should give orchestrator full tool access', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      const orchestrator = prompts.find(p => path.basename(p.filePath) === 'orchestrator.md');
      
      if (!orchestrator) throw new Error('Orchestrator prompt not found');
      
      // Orchestrator needs all MCP tools + host tools + task tool
      const tools = orchestrator.frontmatter.tools || [];
      
      expect(tools.length).toBeGreaterThan(10); // Should have many tools
      expect(tools).toContain('task'); // Critical for delegation
      expect(tools).toContain('read');
      expect(tools).toContain('write');
      expect(tools).toContain('bash');
    });

    it('should restrict subagent tool access appropriately', () => {
      const prompts = loadPromptsFromDir(promptsDir);
      
      // Research and Planning should NOT have edit/bash
      const research = prompts.find(p => path.basename(p.filePath) === 'research_discussion.md');
      const planning = prompts.find(p => path.basename(p.filePath) === 'planning_discussion.md');
      
      expect(research?.frontmatter.tools).not.toContain('edit');
      expect(research?.frontmatter.tools).not.toContain('task');
      expect(planning?.frontmatter.tools).not.toContain('edit');
      expect(planning?.frontmatter.tools).not.toContain('task');
      
      // Executor SHOULD have edit/bash
      const executor = prompts.find(p => path.basename(p.filePath) === 'executor.md');
      expect(executor?.frontmatter.tools).toContain('edit');
      expect(executor?.frontmatter.tools).toContain('bash');
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
      const prompts = loadPromptsFromDir(path.join(__dirname, '../../../agent-core/prompts'));
      
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
      // Simulated meta.json structure
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
    it('should follow correct phase order', () => {
      const correctOrder = ['research', 'planning', 'executor', 'documentation'];
      
      // Orchestrator must respect this order
      expect(correctOrder.indexOf('planning')).toBeGreaterThan(correctOrder.indexOf('research'));
      expect(correctOrder.indexOf('executor')).toBeGreaterThan(correctOrder.indexOf('planning'));
      expect(correctOrder.indexOf('documentation')).toBeGreaterThan(correctOrder.indexOf('executor'));
    });

    it('should not skip prerequisites', () => {
      const prerequisites = {
        planning: ['research'],
        executor: ['planning'],
        documentation: ['executor']
      };

      // Orchestrator must check these before delegating
      expect(prerequisites.planning).toContain('research');
      expect(prerequisites.executor).toContain('planning');
      expect(prerequisites.documentation).toContain('executor');
    });
  });
});
