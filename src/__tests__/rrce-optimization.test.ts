import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Token Optimization Tests for RRCE Workflow
 * 
 * These tests validate the token usage optimizations made to agent prompts.
 * Updated for v2.0 architecture: design + develop pattern
 */

describe('RRCE Token Optimization Tests', () => {
  const PROMPTS_DIR = path.join(__dirname, '../../agent-core/prompts');
  
  // Simple token estimation (rough approximation: 1 token ≈ 4 characters)
  const estimateTokens = (text: string): number => {
    return Math.ceil(text.length / 4);
  };

  describe('Prompt Size Validation', () => {
    test('design.md should be under 8K tokens (merged research + planning)', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'design.md'),
        'utf-8'
      );
      const tokens = estimateTokens(content);
      
      // Design combines research + planning, so larger threshold
      expect(tokens).toBeLessThan(8000);
      console.log(`Design prompt: ${tokens} tokens (target: <8K)`);
    });

    test('develop.md should be under 6K tokens', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'develop.md'),
        'utf-8'
      );
      const tokens = estimateTokens(content);
      
      expect(tokens).toBeLessThan(6000);
      console.log(`Develop prompt: ${tokens} tokens (target: <6K)`);
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

  describe('Design Agent Structure', () => {
    test('design prompt should have two-phase flow', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'design.md'),
        'utf-8'
      );
      
      expect(content).toContain('## Phase 1: Research Mode');
      expect(content).toContain('## Phase 2: Planning Mode');
      expect(content).toContain('Proceed to planning?');
      expect(content).toContain('Ready to develop?');
    });

    test('design prompt should include interactive transitions', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'design.md'),
        'utf-8'
      );
      
      expect(content).toContain('(y/n)');
      expect(content).toContain('task tool');
      expect(content).toContain('subagent_type');
    });

    test('design prompt should implement hybrid clarification', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'design.md'),
        'utf-8'
      );
      
      expect(content).toContain('Max 2');
      expect(content).toContain('critical questions');
      expect(content).toContain('assumptions');
    });
  });

  describe('Develop Agent Structure', () => {
    test('develop prompt should require design completion', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'develop.md'),
        'utf-8'
      );
      
      expect(content).toContain('validate_phase');
      expect(content).toContain('design');
      expect(content).toContain('research + planning');
    });

    test('develop prompt should have authority section', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'develop.md'),
        'utf-8'
      );
      
      expect(content).toContain('## Authority');
      expect(content).toContain('ONLY agent');
      expect(content).toContain('modify');
    });
  });

  describe('Orchestrator Session Reuse', () => {
    test('orchestrator should mention session_id parameter', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'orchestrator.md'),
        'utf-8'
      );
      
      expect(content).toContain('session_id');
      expect(content).toContain('develop-${TASK_SLUG}');
    });

    test('orchestrator should have delegation protocol', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'orchestrator.md'),
        'utf-8'
      );
      
      expect(content).toContain('Delegation Protocol');
      expect(content).toContain('CONTEXT SUMMARY');
      expect(content).toContain('token-efficient');
    });

    test('orchestrator should reference new command names', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, 'orchestrator.md'),
        'utf-8'
      );
      
      expect(content).toContain('/rrce_design');
      expect(content).toContain('/rrce_develop');
      expect(content).toContain('@rrce_develop');
      
      // Should NOT reference old commands
      expect(content).not.toContain('/rrce_research');
      expect(content).not.toContain('/rrce_plan');
      expect(content).not.toContain('/rrce_execute');
      expect(content).not.toContain('@rrce_executor');
    });
  });

  describe('Base Protocol Validation', () => {
    test('_base.md should have consolidated patterns', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, '_base.md'),
        'utf-8'
      );
      
      expect(content).toContain('## Path Resolution');
      expect(content).toContain('## Completion Signal');
      expect(content).toContain('## Workspace Constraints');
      expect(content).toContain('## Error Recovery');
      expect(content).toContain('## Token Awareness');
      expect(content).toContain('## Abort Handling');
      expect(content).toContain('## Phase Transition Pattern');
    });

    test('_base.md should reference Develop agent (not Executor)', () => {
      const content = fs.readFileSync(
        path.join(PROMPTS_DIR, '_base.md'),
        'utf-8'
      );
      
      expect(content).toContain('Develop');
      expect(content).not.toContain('Executor');
    });
  });

  describe('Prompt Structure Validation', () => {
    test('all prompts should have YAML frontmatter', () => {
      const prompts = ['design.md', 'develop.md', 'orchestrator.md'];
      
      prompts.forEach(promptFile => {
        const content = fs.readFileSync(path.join(PROMPTS_DIR, promptFile), 'utf-8');
        expect(content).toMatch(/^---\n/);
        expect(content).toContain('name:');
        expect(content).toContain('description:');
        expect(content).toContain('tools:');
      });
    });

    test('agent prompts should have required sections (combined with _base.md)', () => {
      // Read the base protocol that's injected at runtime
      const baseContent = fs.readFileSync(path.join(PROMPTS_DIR, '_base.md'), 'utf-8');
      
      // Base protocol should contain shared sections
      expect(baseContent).toContain('## Path Resolution');
      expect(baseContent).toContain('## Completion Signal');
      expect(baseContent).toContain('## Workspace Constraints');
      
      // Design uses "## Session Flow" (two-phase merged agent)
      const designContent = fs.readFileSync(path.join(PROMPTS_DIR, 'design.md'), 'utf-8');
      expect(designContent).toContain('## Session Flow');
      
      // Develop uses "## Workflow" (standard executor pattern)
      const developContent = fs.readFileSync(path.join(PROMPTS_DIR, 'develop.md'), 'utf-8');
      expect(developContent).toContain('## Workflow');
    });

    test('old prompts should no longer exist', () => {
      expect(fs.existsSync(path.join(PROMPTS_DIR, 'research_discussion.md'))).toBe(false);
      expect(fs.existsSync(path.join(PROMPTS_DIR, 'planning_discussion.md'))).toBe(false);
      expect(fs.existsSync(path.join(PROMPTS_DIR, 'executor.md'))).toBe(false);
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
      expect(config.agent.rrce_orchestrator.model).toBeUndefined();
    });
  });
});

describe('Token Usage Regression Tests', () => {
  /**
   * These tests would ideally track actual token usage across API calls.
   * For now, they serve as placeholders for integration testing.
   */
  
  test.skip('design phase should use <25K tokens total (research + planning)', async () => {
    // TODO: Implement integration test with actual API calls
    // Simulate design with clarification rounds
    // Track total token usage via API response
    // Assert < 25K tokens
  });

  test.skip('full workflow should use <70K tokens (design → develop)', async () => {
    // TODO: Implement full workflow integration test
    // Run complete RRCE workflow
    // Sum token usage from all API responses
    // Assert < 70K tokens total
  });

  test.skip('session reuse should show cache hits on turn 2+', async () => {
    // TODO: Mock Anthropic API response
    // Verify cache_creation_input_tokens on turn 1
    // Verify cache_read_input_tokens on turn 2+
  });
});
