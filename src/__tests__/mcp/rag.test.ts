/**
 * Integration tests for src/mcp/services/rag.ts
 * 
 * Tests RAG service functionality including:
 * - Indexing files
 * - Searching
 * - Similarity scoring
 * 
 * Note: These tests are slower due to model loading (~5-10s on first run)
 * The model is cached between tests for efficiency.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('RAGService', () => {
  let testDir: string;
  let indexPath: string;
  let RAGService: typeof import('../../mcp/services/rag').RAGService;

  beforeAll(async () => {
    // Create isolated test directory
    testDir = path.join(os.tmpdir(), `rrce-rag-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    indexPath = path.join(testDir, 'embeddings.json');
    
    // Import RAG service (model will be loaded on first use)
    const module = await import('../../mcp/services/rag');
    RAGService = module.RAGService;
  }, 60000); // 60s timeout for model loading

  afterAll(() => {
    // Cleanup test directory
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('indexFile', () => {
    it('should index a file and create embeddings', async () => {
      const rag = new RAGService(indexPath);
      
      const testContent = 'This is a test document about TypeScript and Node.js development.';
      const testFilePath = path.join(testDir, 'test-doc.md');
      fs.writeFileSync(testFilePath, testContent);
      
      const result = await rag.indexFile(testFilePath, testContent);
      
      expect(result).toBe(true);
      
      // Verify index file was created
      expect(fs.existsSync(indexPath)).toBe(true);
      
      // Verify stats
      const stats = rag.getStats();
      expect(stats.totalChunks).toBeGreaterThan(0);
    }, 30000); // 30s timeout

    it('should skip unchanged files when mtime matches', async () => {
      const rag = new RAGService(indexPath);
      
      const testContent = 'Content that should not be re-indexed.';
      const testFilePath = path.join(testDir, 'unchanged.md');
      const mtime = Date.now();
      
      // First indexing
      const firstResult = await rag.indexFile(testFilePath, testContent, mtime);
      expect(firstResult).toBe(true);
      
      // Second indexing with same mtime - should skip
      const secondResult = await rag.indexFile(testFilePath, testContent, mtime);
      expect(secondResult).toBe(false);
    }, 30000);

    it('should re-index when mtime changes', async () => {
      const rag = new RAGService(indexPath);
      
      const testFilePath = path.join(testDir, 'changing.md');
      
      // First indexing
      await rag.indexFile(testFilePath, 'Original content', 1000);
      
      // Second indexing with different mtime
      const result = await rag.indexFile(testFilePath, 'Updated content', 2000);
      
      expect(result).toBe(true);
    }, 30000);
  });

  describe('search', () => {
    it('should find relevant documents', async () => {
      const searchIndexPath = path.join(testDir, 'search-index.json');
      const rag = new RAGService(searchIndexPath);
      
      // Index some documents
      await rag.indexFile(
        path.join(testDir, 'typescript.md'),
        'TypeScript is a strongly typed programming language that builds on JavaScript.'
      );
      
      await rag.indexFile(
        path.join(testDir, 'python.md'),
        'Python is a programming language known for its simplicity and readability.'
      );
      
      await rag.indexFile(
        path.join(testDir, 'cooking.md'),
        'This recipe explains how to make a delicious chocolate cake with frosting.'
      );
      
      // Search for programming-related content
      const results = await rag.search('JavaScript programming language', 3);
      
      expect(results.length).toBeGreaterThan(0);
      
      // TypeScript doc should be more relevant than cooking
      const typescriptResult = results.find(r => r.filePath.includes('typescript'));
      const cookingResult = results.find(r => r.filePath.includes('cooking'));
      
      if (typescriptResult && cookingResult) {
        expect(typescriptResult.score).toBeGreaterThan(cookingResult.score);
      }
    }, 60000); // 60s for multiple indexing operations

    it('should return empty array for empty index', async () => {
      const emptyIndexPath = path.join(testDir, 'empty-index.json');
      const rag = new RAGService(emptyIndexPath);
      
      const results = await rag.search('anything');
      
      expect(results).toEqual([]);
    }, 30000);

    it('should respect limit parameter', async () => {
      const limitIndexPath = path.join(testDir, 'limit-index.json');
      const rag = new RAGService(limitIndexPath);
      
      // Index multiple documents
      for (let i = 0; i < 10; i++) {
        await rag.indexFile(
          path.join(testDir, `doc${i}.md`),
          `Document number ${i} about various programming topics and software development.`
        );
      }
      
      const results = await rag.search('programming', 3);
      
      expect(results.length).toBeLessThanOrEqual(3);
    }, 120000); // 2 min for 10 indexing operations
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const statsIndexPath = path.join(testDir, 'stats-index.json');
      const rag = new RAGService(statsIndexPath);
      
      // Initially empty
      let stats = rag.getStats();
      expect(stats.totalChunks).toBe(0);
      expect(stats.totalFiles).toBe(0);
      
      // After indexing - content must be >50 chars to not be filtered
      await rag.indexFile(
        path.join(testDir, 'stats-test.md'),
        'This is test content for statistics that is long enough to not be filtered out by the chunker. It needs to be at least 50 characters.'
      );
      
      stats = rag.getStats();
      expect(stats.totalChunks).toBeGreaterThan(0);
      expect(stats.totalFiles).toBe(1);
    }, 30000);
  });

  describe('removeFile', () => {
    it('should remove file from index', async () => {
      const removeIndexPath = path.join(testDir, 'remove-index.json');
      const rag = new RAGService(removeIndexPath);
      
      const filePath = path.join(testDir, 'to-remove.md');
      
      // Index then remove
      await rag.indexFile(filePath, 'Content to be removed.');
      let stats = rag.getStats();
      expect(stats.totalFiles).toBe(1);
      
      await rag.removeFile(filePath);
      
      stats = rag.getStats();
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalChunks).toBe(0);
    }, 30000);
  });

  describe('generateEmbedding', () => {
    it('should generate embedding vector', async () => {
      const rag = new RAGService(indexPath);
      
      const embedding = await rag.generateEmbedding('Test text for embedding');
      
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBeGreaterThan(0);
      // all-MiniLM-L6-v2 produces 384-dimensional vectors
      expect(embedding.length).toBe(384);
    }, 30000);

    it('should produce normalized vectors', async () => {
      const rag = new RAGService(indexPath);
      
      const embedding = await rag.generateEmbedding('Normalized vector test');
      
      // Calculate L2 norm (should be ~1 for normalized vectors)
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1, 1); // Within 0.1 of 1
    }, 30000);
  });
});
