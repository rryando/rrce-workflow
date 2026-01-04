import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('New MCP Tools', () => {
  let testDir: string;
  
  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrce-new-tools-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('searchCode with new params', () => {
    it('should accept max_tokens and min_score options', async () => {
      const { searchCode } = await import('../../mcp/resources');
      
      // searchCode signature: (query, projectFilter?, limit?, options?)
      const result = await searchCode('test query', 'non-existent-project', 5, {
        max_tokens: 2000,
        min_score: 0.5
      });
      
      // Should return empty results for non-existent project, but not throw
      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });
  });

  describe('searchKnowledge with new params', () => {
    it('should accept max_tokens and min_score options', async () => {
      const { searchKnowledge } = await import('../../mcp/resources');
      
      // searchKnowledge signature: (query, projectFilter?, options?)
      const result = await searchKnowledge('test query', 'non-existent-project', {
        max_tokens: 2000,
        min_score: 0.5
      });
      
      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should include index metadata in response', async () => {
      const { searchKnowledge } = await import('../../mcp/resources');
      
      const result = await searchKnowledge('test', 'non-existent-project');
      
      // Response should include index_age_seconds and last_indexed_at
      expect(result).toHaveProperty('index_age_seconds');
      expect(result).toHaveProperty('last_indexed_at');
    });
  });

  describe('searchSymbols tool', () => {
    it('should handle non-existent project gracefully', async () => {
      const { searchSymbols } = await import('../../mcp/resources');
      
      const result = await searchSymbols('myFunction', 'non-existent-project');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('getFileSummary tool', () => {
    it('should handle non-existent project gracefully', async () => {
      const { getFileSummary } = await import('../../mcp/resources');
      
      const result = await getFileSummary('src/index.ts', 'non-existent-project');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });
  });

  describe('getContextBundle tool', () => {
    it('should return structured context bundle', async () => {
      const { getContextBundle } = await import('../../mcp/resources');
      
      const result = await getContextBundle('test query', 'non-existent-project');
      
      expect(result).toBeDefined();
      expect(result).toHaveProperty('project_context');
      expect(result).toHaveProperty('knowledge_results');
      expect(result).toHaveProperty('code_results');
      expect(result).toHaveProperty('token_count');
      expect(result).toHaveProperty('truncated');
    });

    it('should respect max_tokens option', async () => {
      const { getContextBundle } = await import('../../mcp/resources');
      
      const result = await getContextBundle('test', 'non-existent-project', {
        max_tokens: 1000
      });
      
      expect(result).toBeDefined();
      expect(result.token_count).toBeLessThanOrEqual(1000);
    });
  });

  describe('prefetchTaskContext tool', () => {
    it('should handle non-existent task gracefully', async () => {
      const { prefetchTaskContext } = await import('../../mcp/resources');
      
      const result = await prefetchTaskContext('non-existent-project', 'fake-task');
      
      expect(result).toBeDefined();
      expect(result.success).toBe(false);
      expect(result.task).toBeNull();
      expect(result.message).toBeDefined();
    });
  });

  describe('searchTasks tool', () => {
    it('should return empty array for non-existent project', async () => {
      const { searchTasks } = await import('../../mcp/resources');
      
      const result = searchTasks('non-existent-project');
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should accept filter options', async () => {
      const { searchTasks } = await import('../../mcp/resources');
      
      // Should not throw when passing filter options
      const result = searchTasks('non-existent-project', {
        keyword: 'test',
        status: 'in_progress',
        agent: 'research',
        since: '2026-01-01',
        limit: 10
      });
      
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('validatePhase tool', () => {
    it('should handle non-existent task', async () => {
      const { validatePhase } = await import('../../mcp/resources');
      
      const result = validatePhase('non-existent-project', 'fake-task', 'research');
      
      expect(result).toBeDefined();
      expect(result.valid).toBe(false);
      expect(result.status).toBe('not_found');
      expect(result.missing_items).toContain('Task does not exist');
      expect(result.suggestions).toBeDefined();
    });

    it('should return proper structure for all phases', async () => {
      const { validatePhase } = await import('../../mcp/resources');
      
      const phases = ['research', 'planning', 'execution', 'documentation'] as const;
      
      for (const phase of phases) {
        const result = validatePhase('non-existent-project', 'fake-task', phase);
        
        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('phase');
        expect(result).toHaveProperty('status');
        expect(result).toHaveProperty('missing_items');
        expect(result).toHaveProperty('suggestions');
        expect(result.phase).toBe(phase);
      }
    });
  });
});

describe('Symbol Extractor Service', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rrce-symbol-test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should extract function symbols from TypeScript', async () => {
    const { extractSymbols } = await import('../../mcp/services/symbol-extractor');
    
    const tsCode = `
      export function myFunction() {}
      async function asyncFunc() {}
      const arrowFunc = () => {};
    `;
    
    const result = extractSymbols(tsCode, 'test.ts');
    const functions = result.symbols.filter((s: { type: string }) => s.type === 'function');
    
    expect(functions.length).toBeGreaterThanOrEqual(2);
    expect(functions.some((f: { name: string }) => f.name === 'myFunction')).toBe(true);
    expect(functions.some((f: { name: string }) => f.name === 'asyncFunc')).toBe(true);
  });

  it('should extract class symbols from TypeScript', async () => {
    const { extractSymbols } = await import('../../mcp/services/symbol-extractor');
    
    const tsCode = `
      export class MyClass {
        myMethod() {}
      }
      class AnotherClass extends BaseClass {}
    `;
    
    const result = extractSymbols(tsCode, 'test.ts');
    const classes = result.symbols.filter((s: { type: string }) => s.type === 'class');
    
    expect(classes.length).toBeGreaterThanOrEqual(2);
    expect(classes.some((c: { name: string }) => c.name === 'MyClass')).toBe(true);
    expect(classes.some((c: { name: string }) => c.name === 'AnotherClass')).toBe(true);
  });

  it('should extract interface symbols from TypeScript', async () => {
    const { extractSymbols } = await import('../../mcp/services/symbol-extractor');
    
    const tsCode = `
      export interface MyInterface {
        prop: string;
      }
      interface AnotherInterface {}
    `;
    
    const result = extractSymbols(tsCode, 'test.ts');
    const interfaces = result.symbols.filter((s: { type: string }) => s.type === 'interface');
    
    expect(interfaces.length).toBeGreaterThanOrEqual(2);
    expect(interfaces.some((i: { name: string }) => i.name === 'MyInterface')).toBe(true);
  });

  it('should support fuzzy matching with scoring', async () => {
    const { fuzzyMatchScore } = await import('../../mcp/services/symbol-extractor');
    
    // Exact match should score high
    expect(fuzzyMatchScore('myFunction', 'myFunction')).toBeGreaterThan(0.8);
    
    // Case insensitive should still score high
    expect(fuzzyMatchScore('myFunction', 'myfunction')).toBeGreaterThan(0.5);
    
    // Partial/contains should score lower
    expect(fuzzyMatchScore('handleUserLogin', 'user')).toBeGreaterThan(0);
    
    // No match should score very low (may have minimal score due to algorithm)
    expect(fuzzyMatchScore('myFunction', 'xyz')).toBeLessThan(0.1);
  });
});
