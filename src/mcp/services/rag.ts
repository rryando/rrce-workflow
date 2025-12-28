
// import { pipeline, env } from '@xenova/transformers';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';

// Configure cache to be in a consistent location if needed, 
// but default ~/.cache/xenova is usually fine.
// env.cacheDir = ...

export interface RAGChunk {
  id: string;
  filePath: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, any>;
}

export interface RAGIndex {
  version: string;
  baseModel: string;
  chunks: RAGChunk[];
}

const INDEX_VERSION = '1.0.0';
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

export class RAGService {
  private pipe: any = null;
  private modelName: string;
  private indexPath: string;
  private index: RAGIndex | null = null;
  private lastAccess: number = 0;

  constructor(indexPath: string, modelName: string = DEFAULT_MODEL) {
    this.indexPath = indexPath;
    this.modelName = modelName;
  }

  /**
   * Lazy load the model
   */
  private async getPipeline() {
    if (!this.pipe) {
      logger.info(`RAG: Initializing model ${this.modelName}...`);
      try {
        // Dynamic import to prevent startup hang and reduce initial memory
        const { pipeline } = await import('@xenova/transformers');
        this.pipe = await pipeline('feature-extraction', this.modelName);
        logger.info(`RAG: Model ${this.modelName} initialized successfully.`);
      } catch (error) {
        logger.error(`RAG: Failed to initialize model ${this.modelName}`, error);
        throw error;
      }
    }
    this.lastAccess = Date.now();
    return this.pipe;
  }

  /**
   * Load index from disk
   */
  private loadIndex() {
    if (this.index) return;
    
    if (fs.existsSync(this.indexPath)) {
      try {
        const data = fs.readFileSync(this.indexPath, 'utf-8');
        this.index = JSON.parse(data);
        logger.info(`RAG: Loaded index from ${this.indexPath} with ${this.index?.chunks.length} chunks.`);
      } catch (error) {
        logger.error(`RAG: Failed to load index from ${this.indexPath}`, error);
        // Start fresh on error
        this.index = {
          version: INDEX_VERSION,
          baseModel: this.modelName,
          chunks: []
        };
      }
    } else {
      this.index = {
        version: INDEX_VERSION,
        baseModel: this.modelName,
        chunks: []
      };
      logger.info(`RAG: Created new empty index at ${this.indexPath}`);
    }
  }

  /**
   * Save index to disk
   */
  private saveIndex() {
    if (!this.index) return;
    try {
      const dir = path.dirname(this.indexPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.indexPath, JSON.stringify(this.index, null, 2));
      logger.info(`RAG: Saved index to ${this.indexPath} with ${this.index.chunks.length} chunks.`);
    } catch (error) {
      logger.error(`RAG: Failed to save index to ${this.indexPath}`, error);
    }
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const pipe = await this.getPipeline();
    try {
      // Mean pooling
      const output = await pipe(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      logger.error('RAG: Error generating embedding', error);
      throw error;
    }
  }

  /**
   * Index a file
   */
  async indexFile(filePath: string, content: string): Promise<void> {
    this.loadIndex();
    if (!this.index) throw new Error('Index not initialized');

    logger.info(`RAG: Indexing file ${filePath}`);

    // clear existing chunks for this file
    this.index.chunks = this.index.chunks.filter(c => c.filePath !== filePath);

    // Simple chunking strategy: split by paragraphs or max chars
    // For code, maybe split by function boundaries (complex), or just fixed size
    // Start with simple chunking by lines/paragraphs for "Mini RAG"
    const chunks = this.chunkContent(content);

    for (const chunkText of chunks) {
      const embedding = await this.generateEmbedding(chunkText);
      this.index.chunks.push({
        id: `${filePath}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filePath,
        content: chunkText,
        embedding
      });
    }

    this.saveIndex();
  }

  /**
   * Remove a file from index
   */
    async removeFile(filePath: string): Promise<void> {
        this.loadIndex();
        if (!this.index) return;
        
        const initialCount = this.index.chunks.length;
        this.index.chunks = this.index.chunks.filter(c => c.filePath !== filePath);
        
        if (this.index.chunks.length !== initialCount) {
            logger.info(`RAG: Removed file ${filePath} from index (${initialCount - this.index.chunks.length} chunks removed)`);
            this.saveIndex();
        }
    }

  /**
   * Search the index
   */
  async search(query: string, limit: number = 5): Promise<(RAGChunk & { score: number })[]> {
    this.loadIndex();
    if (!this.index || this.index.chunks.length === 0) {
        logger.warn('RAG: Search called on empty index');
        return [];
    }

    logger.info(`RAG: Searching for "${query}" (limit: ${limit})`);
    
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results = this.index.chunks.map(chunk => {
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      return { ...chunk, score };
    });

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const topResults = results.slice(0, limit);
    logger.info(`RAG: Search returned ${topResults.length} matches. Top score: ${topResults[0]?.score.toFixed(4)}`);
    
    return topResults;
  }

  /**
   * Simple cosine similarity
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Basic content chunker
   */
  private chunkContent(content: string, maxChunkSize: number = 1000, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;
    
    while (start < content.length) {
      let end = start + maxChunkSize;
      
      if (end >= content.length) {
        end = content.length;
      } else {
        // Try to break at a newline to avoid splitting words/lines
        const lastNewline = content.lastIndexOf('\n', end);
        if (lastNewline > start + maxChunkSize / 2) {
          end = lastNewline;
        }
      }
      
      const chunk = content.substring(start, end).trim();
      if (chunk.length > 50) { // Filter out tiny chunks
        chunks.push(chunk);
      }
      
      if (end === content.length) break;
      
      start = end - overlap;
    }
    
    return chunks;
  }
}
