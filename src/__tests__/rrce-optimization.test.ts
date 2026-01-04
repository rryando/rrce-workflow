import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Token Optimization Tests for RRCE Workflow
 * 
 * These tests validate the token usage optimizations made to subagent prompts.
 * Target: 70% reduction in prompt size (from ~15K to ~4K tokens per agent)
 */

describe('RRCE Token Optimization Tests', () => {
  const PROMPTS_DIR = path.join(__dirname, '../../agent-core/prompts');
  
  // Simple token estimation (rough approximation: 1 token ≈ 4 characters)
  const estimateTokens = (text: string): number => {
    return Math.ceil(text.length / 4);
  };

  describe('Prompt Size Validation', () => {
    test('research_discussion.md should be under 5K tokens', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'research_discussion.md'),
        'utf-8'
      );
      const tokens = estimateTokens(content);
      
      expect(tokens).toBeLessThan(5000);
      console.log(`Research prompt: ${tokens} tokens (target: <5K)`);
    });

    test('planning_discussion.md should be under 5K tokens', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'planning_discussion.md'),
        'utf-8'
      );
      const tokens = estimateTokens(content);
      
      expect(tokens).toBeLessThan(5000);
      console.log(`Planning prompt: ${tokens} tokens (target: <5K)`);
    });

    test('executor.md should be under 6K tokens', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'executor.md'),
        'utf-8'
      );
      const tokens = estimateTokens(content);
      
      // Executor needs more complexity, so slightly higher threshold
      expect(tokens).toBeLessThan(6000);
      console.log(`Executor prompt: ${tokens} tokens (target: <6K)`);
    });

    test('orchestrator.md should be under 5K tokens', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'orchestrator.md'),
        'utf-8'
      );
      const tokens = estimateTokens(content);
      
      expect(tokens).toBeLessThan(5000);
      console.log(`Orchestrator prompt: ${tokens} tokens (target: <5K)`);
    });
  });

  describe('Session State Management', () => {
    test('research prompt should include session state guidance', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'research_discussion.md'),
        'utf-8'
      );
      
      expect(content).toContain('## Session State');
      expect(content).toContain('First turn ONLY');
      expect(content).toContain('Store results');
      expect(content).toContain('Only re-search if');
    });

    test('planning prompt should include session state guidance', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'planning_discussion.md'),
        'utf-8'
      );
      
      expect(content).toContain('Session State');
      expect(content).toContain('First turn');
    });
  });

  describe('Orchestrator Session Reuse', () => {
    test('orchestrator should mention session_id parameter', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'orchestrator.md'),
        'utf-8'
      );
      
      expect(content).toContain('session_id');
      expect(content).toContain('Session Naming');
      expect(content).toContain('research-${TASK_SLUG}');
      expect(content).toContain('planning-${TASK_SLUG}');
      expect(content).toContain('executor-${TASK_SLUG}');
    });

    test('orchestrator should have delegation protocol', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'orchestrator.md'),
        'utf-8'
      );
      
      // New: check for token-optimized delegation
      expect(content).toContain('Delegation Protocol');
      expect(content).toContain('CONTEXT SUMMARY');
      expect(content).toContain('Token-Optimized');
    });
  });

  describe('Hybrid Research Approach', () => {
    test('research prompt should implement hybrid clarification', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'research_discussion.md'),
        'utf-8'
      );
      
      expect(content).toContain('Hybrid');
      expect(content).toContain('Max 2');
      expect(content).toContain('critical questions');
      expect(content).toContain('assumptions');
    });
  });

  describe('Prompt Structure Validation', () => {
    test('all prompts should have YAML frontmatter', () => {
      const prompts = ['research_discussion.md', 'planning_discussion.md', 'executor.md', 'orchestrator.md'];
      
      prompts.forEach(promptFile => {
        const content = fs.readFileSync(path.join(PROMPTS_DIR, promptFile), 'utf-8');
        expect(content).toMatch(/^---\n/);
        expect(content).toContain('name:');
        expect(content).toContain('description:');
        expect(content).toContain('tools:');
      });
    });

    test('subagent prompts should have required sections (combined with _base.md)', () => {
      const subagents = [
        'research_discussion.md',
        'planning_discussion.md',
        'executor.md'
      ];
      
      // Read the base protocol that's injected at runtime
      const baseContent = fs.readFileSync(path.join(PROMPTS_DIR, '_base.md'), 'utf-8');
      
      // Base protocol should contain shared sections
      expect(baseContent).toContain('## Path Resolution');
      expect(baseContent).toContain('## Completion Signal');
      expect(baseContent).toContain('## Workspace Constraints');
      
      subagents.forEach(promptFile => {
        const content = fs.readFileSync(path.join(PROMPTS_DIR, promptFile), 'utf-8');
        
        // Core sections that remain in agent-specific prompts
        expect(content).toContain('## Workflow');
        // Note: Rules and Constraints may be in base or agent-specific
      });
    });
  });

  describe('OpenCode Configuration', () => {
    test('opencode.json should exist and be valid JSON', () => {
      const configPath = path.join(__dirname, '../../opencode.json');
      expect(fs.existsSync(configPath)).toBe(true);
      
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(config).toHaveProperty('agent');
    });

    test('provider caching should be enabled (model-agnostic)', () => {
      const configPath = path.join(__dirname, '../../opencode.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      // Caching should be enabled for all major providers
      expect(config.provider?.anthropic?.options?.setCacheKey).toBe(true);
      expect(config.provider?.openai?.options?.setCacheKey).toBe(true);
    });

    test('agents should NOT have hardcoded models (user choice)', () => {
      const configPath = path.join(__dirname, '../../opencode.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      // Agents should NOT have model set - let user choose
      expect(config.agent.rrce_research_discussion.model).toBeUndefined();
      expect(config.agent.rrce_planning_discussion.model).toBeUndefined();
      expect(config.agent.rrce_executor.model).toBeUndefined();
    });

    test('research agent should have task/todo tools disabled', () => {
      const configPath = path.join(__dirname, '../../opencode.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      expect(config.agent.rrce_research_discussion.tools.task).toBe(false);
      expect(config.agent.rrce_research_discussion.tools.todowrite).toBe(false);
      expect(config.agent.rrce_research_discussion.tools.todoread).toBe(false);
    });
  });
});

describe('Token Usage Regression Tests', () => {
  /**
   * These tests would ideally track actual token usage across API calls.
   * For now, they serve as placeholders for integration testing.
   */
  
  test.skip('research phase should use <20K tokens total (3 rounds)', async () => {
    // TODO: Implement integration test with actual API calls
    // Simulate research with 3 question rounds
    // Track total token usage via API response
    // Assert < 20K tokens
  });

  test.skip('full workflow should use <80K tokens (research → plan → execute)', async () => {
    // TODO: Implement full workflow integration test
    // Run complete RRCE workflow
    // Sum token usage from all API responses
    // Assert < 80K tokens total
  });

  test.skip('session reuse should show cache hits on turn 2+', async () => {
    // TODO: Mock Anthropic API response
    // Verify cache_creation_input_tokens on turn 1
    // Verify cache_read_input_tokens on turn 2+
  });
});
