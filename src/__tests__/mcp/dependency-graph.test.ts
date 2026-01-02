/**
 * Unit tests for src/mcp/services/dependency-graph.ts
 * 
 * Tests dependency graph functionality including:
 * - Import parsing for various languages
 * - Graph building
 * - Related file discovery
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  parseImports,
  buildDependencyGraph,
  findRelatedFiles
} from '../../mcp/services/dependency-graph';

describe('dependency-graph', () => {
  let testDir: string;

  beforeAll(() => {
    testDir = path.join(os.tmpdir(), `rrce-dep-graph-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('parseImports (TypeScript)', () => {
    it('should parse ES6 named imports', () => {
      const content = `import { foo, bar } from './utils';`;
      const edges = parseImports('/src/index.ts', content);
      
      expect(edges.length).toBe(1);
      expect(edges[0]?.importPath).toBe('./utils');
      expect(edges[0]?.importType).toBe('static');
    });

    it('should parse ES6 default imports', () => {
      const content = `import MyComponent from '../components/MyComponent';`;
      const edges = parseImports('/src/pages/home.tsx', content);
      
      expect(edges.length).toBe(1);
      expect(edges[0]?.importPath).toBe('../components/MyComponent');
    });

    it('should parse namespace imports', () => {
      const content = `import * as utils from './utils';`;
      const edges = parseImports('/src/index.ts', content);
      
      expect(edges.length).toBe(1);
      expect(edges[0]?.importPath).toBe('./utils');
    });

    it('should parse dynamic imports', () => {
      const content = `const module = await import('./lazy-module');`;
      const edges = parseImports('/src/index.ts', content);
      
      expect(edges.length).toBe(1);
      expect(edges[0]?.importPath).toBe('./lazy-module');
      expect(edges[0]?.importType).toBe('dynamic');
    });

    it('should parse re-exports', () => {
      const content = `export { foo, bar } from './internal';`;
      const edges = parseImports('/src/index.ts', content);
      
      expect(edges.length).toBe(1);
      expect(edges[0]?.importPath).toBe('./internal');
      expect(edges[0]?.importType).toBe('re-export');
    });

    it('should parse require calls', () => {
      const content = `const fs = require('fs');\nconst local = require('./local');`;
      const edges = parseImports('/src/index.js', content);
      
      expect(edges.length).toBe(2);
      expect(edges.some(e => e.importPath === './local')).toBe(true);
      expect(edges.some(e => e.importPath === 'fs')).toBe(true);
    });

    it('should handle multiple imports', () => {
      const content = `
import { a } from './a';
import b from './b';
import * as c from './c';
export * from './d';
`;
      const edges = parseImports('/src/index.ts', content);
      
      expect(edges.length).toBe(4);
    });
  });

  describe('parseImports (Python)', () => {
    it('should parse from imports', () => {
      const content = `from utils import helper`;
      const edges = parseImports('/app/main.py', content);
      
      expect(edges.length).toBe(1);
      expect(edges[0]?.importPath).toBe('utils');
    });

    it('should parse direct imports', () => {
      const content = `import os`;
      const edges = parseImports('/app/main.py', content);
      
      expect(edges.length).toBe(1);
      expect(edges[0]?.importPath).toBe('os');
    });

    it('should parse nested module imports', () => {
      const content = `from package.subpackage import module`;
      const edges = parseImports('/app/main.py', content);
      
      expect(edges.length).toBe(1);
      expect(edges[0]?.importPath).toBe('package.subpackage');
    });
  });

  describe('parseImports (Go)', () => {
    it('should parse single imports', () => {
      const content = `import "fmt"`;
      const edges = parseImports('/main.go', content);
      
      expect(edges.length).toBeGreaterThanOrEqual(1);
      expect(edges.some(e => e.importPath === 'fmt')).toBe(true);
    });

    it('should parse aliased imports', () => {
      const content = `import f "fmt"`;
      const edges = parseImports('/main.go', content);
      
      expect(edges.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('buildDependencyGraph', () => {
    it('should build a graph from multiple files', () => {
      const files = [
        {
          path: '/src/index.ts',
          content: `import { helper } from './utils'; console.log(helper());`
        },
        {
          path: '/src/utils.ts',
          content: `export function helper() { return 'hello'; }`
        }
      ];

      const graph = buildDependencyGraph(files);

      expect(graph.files.size).toBe(2);
      expect(graph.edges.length).toBeGreaterThanOrEqual(1);
      expect(graph.edges.some(e => e.source === '/src/index.ts')).toBe(true);
    });

    it('should handle files with no imports', () => {
      const files = [
        {
          path: '/src/constants.ts',
          content: `export const VERSION = '1.0.0';`
        }
      ];

      const graph = buildDependencyGraph(files);

      expect(graph.files.size).toBe(1);
      expect(graph.edges.length).toBe(0);
    });
  });

  describe('findRelatedFiles', () => {
    it('should find files that are imported', () => {
      const files = [
        {
          path: path.join(testDir, 'index.ts'),
          content: `import { helper } from './utils';`
        },
        {
          path: path.join(testDir, 'utils.ts'),
          content: `export function helper() { return 'hello'; }`
        }
      ];

      // Create the files so resolution works
      for (const file of files) {
        fs.writeFileSync(file.path, file.content);
      }

      const graph = buildDependencyGraph(files);
      const related = findRelatedFiles(path.join(testDir, 'index.ts'), graph, {
        includeImports: true,
        includeImportedBy: false
      });

      expect(related.length).toBeGreaterThanOrEqual(1);
      expect(related.some(r => r.relationship === 'imports')).toBe(true);
    });

    it('should find files that import the target', () => {
      const files = [
        {
          path: path.join(testDir, 'main.ts'),
          content: `import { Config } from './config';`
        },
        {
          path: path.join(testDir, 'config.ts'),
          content: `export interface Config { name: string; }`
        }
      ];

      // Create the files
      for (const file of files) {
        fs.writeFileSync(file.path, file.content);
      }

      const graph = buildDependencyGraph(files);
      const related = findRelatedFiles(path.join(testDir, 'config.ts'), graph, {
        includeImports: false,
        includeImportedBy: true
      });

      expect(related.some(r => r.relationship === 'imported-by')).toBe(true);
    });

    it('should respect depth parameter', () => {
      const files = [
        {
          path: path.join(testDir, 'a.ts'),
          content: `import { b } from './b';`
        },
        {
          path: path.join(testDir, 'b.ts'),
          content: `import { c } from './c'; export const b = 1;`
        },
        {
          path: path.join(testDir, 'c.ts'),
          content: `export const c = 2;`
        }
      ];

      // Create the files
      for (const file of files) {
        fs.writeFileSync(file.path, file.content);
      }

      const graph = buildDependencyGraph(files);
      
      // Depth 1 should only find direct imports
      const relatedDepth1 = findRelatedFiles(path.join(testDir, 'a.ts'), graph, {
        includeImports: true,
        depth: 1
      });
      
      // Depth 2 should find transitive imports
      const relatedDepth2 = findRelatedFiles(path.join(testDir, 'a.ts'), graph, {
        includeImports: true,
        depth: 2
      });

      expect(relatedDepth2.length).toBeGreaterThanOrEqual(relatedDepth1.length);
    });
  });
});
