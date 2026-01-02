
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
  mtime?: number; // File modification time for smart indexing
  metadata?: Record<string, any>;
}

/**
 * Extended chunk interface for code files with line number tracking
 */
export interface CodeChunk extends RAGChunk {
  lineStart: number;
  lineEnd: number;
  context?: string;  // e.g., "class RAGService", "function search()"
  language?: string; // e.g., "typescript", "python"
}

/**
 * Represents a chunk with its line range (before embedding)
 */
export interface ChunkWithLines {
  content: string;
  lineStart: number;
  lineEnd: number;
}

export interface RAGIndex {
  version: string;
  baseModel: string;
  chunks: RAGChunk[];
  lastFullIndex?: number; // Timestamp of last full index
  fileMetadata?: Record<string, { mtime: number; chunkCount: number }>; // Per-file tracking
  metadata?: {
    lastSaveAt?: number;
  };
}

/**
 * Code-specific index with extended chunk metadata
 */
export interface CodeRAGIndex {
  version: string;
  baseModel: string;
  chunks: CodeChunk[];
  lastFullIndex?: number;
  fileMetadata?: Record<string, { mtime: number; chunkCount: number; language?: string }>;
  metadata?: {
    lastSaveAt?: number;
  };
}

const INDEX_VERSION = '1.0.0';
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';

export class RAGService {
  // Static cache for the pipeline to prevent reloading model for every instance
  private static pipelineInstance: any = null;
  private static activeModelName: string | null = null;
  private static loadPromise: Promise<any> | null = null;

  private modelName: string;
  private indexPath: string;
  private index: RAGIndex | null = null;

  constructor(indexPath: string, modelName: string = DEFAULT_MODEL) {
    this.indexPath = indexPath;
    this.modelName = modelName;
  }

  /**
   * Lazy load the model (Singleton pattern)
   */
  private async getPipeline() {
    // If we're already loading/loaded with the same model, reuse it
    if (RAGService.activeModelName === this.modelName && RAGService.pipelineInstance) {
        return RAGService.pipelineInstance;
    }

    // If a load is in progress for this model, wait for it
    if (RAGService.activeModelName === this.modelName && RAGService.loadPromise) {
        return RAGService.loadPromise;
    }

    logger.info(`[RAG] Initializing model ${this.modelName}...`);
    
    RAGService.activeModelName = this.modelName;
    
    RAGService.loadPromise = (async () => {
        try {
            // Dynamic import to prevent startup hang and reduce initial memory
            const { pipeline } = await import('@xenova/transformers');
            
            // NOTE: We could add env.cacheDir configuration here if needed
            
            const pipe = await pipeline('feature-extraction', this.modelName);
            RAGService.pipelineInstance = pipe;
            logger.info(`[RAG] Model ${this.modelName} initialized successfully.`);
            return pipe;
        } catch (error) {
            logger.error(`[RAG] Failed to initialize model ${this.modelName}`, error);
            RAGService.pipelineInstance = null;
            RAGService.activeModelName = null;
            RAGService.loadPromise = null;
            throw error;
        }
    })();

    return RAGService.loadPromise;
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
        logger.info(`[RAG] Loaded index from ${this.indexPath} with ${this.index?.chunks.length} chunks.`);
      } catch (error) {
        logger.error(`[RAG] Failed to load index from ${this.indexPath}`, error);
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
      logger.info(`[RAG] Created new empty index at ${this.indexPath}`);
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
      logger.info(`[RAG] Saved index to ${this.indexPath} with ${this.index.chunks.length} chunks.`);
    } catch (error) {
      logger.error(`[RAG] Failed to save index to ${this.indexPath}`, error);
    }
  }

  /**
   * Save index to a temp file and atomically replace
   */
  private saveIndexAtomic(): void {
    if (!this.index) return;

    const dir = path.dirname(this.indexPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const tmpPath = `${this.indexPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.index, null, 2));
    fs.renameSync(tmpPath, this.indexPath);
  }

  /**
   * Save index only if enough time passed since last save
   */
  private maybeSaveIndex(force: boolean = false): void {
    if (!this.index) return;

    const now = Date.now();
    const intervalMs = 1000;
    const last = this.index.metadata?.lastSaveAt as number | undefined;

    if (force || last === undefined || now - last >= intervalMs) {
      this.index.metadata = { ...(this.index.metadata ?? {}), lastSaveAt: now };
      this.saveIndexAtomic();
      logger.info(`[RAG] Saved index (atomic) to ${this.indexPath} with ${this.index.chunks.length} chunks.`);
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
      logger.error('[RAG] Error generating embedding', error);
      throw error;
    }
  }

  /**
   * Index a file (smart: skips if mtime unchanged)
   * @param filePath Absolute path to the file
   * @param content File content
   * @param mtime Optional modification time (if not provided, always re-indexes)
   * @returns true if file was indexed, false if skipped
   */
  async indexFile(filePath: string, content: string, mtime?: number): Promise<boolean> {
    this.loadIndex();
    if (!this.index) throw new Error('Index not initialized');

    // Initialize fileMetadata if missing
    if (!this.index.fileMetadata) {
      this.index.fileMetadata = {};
    }

    // Smart check: skip if mtime matches
    if (mtime !== undefined && this.index.fileMetadata[filePath]) {
      const existingMeta = this.index.fileMetadata[filePath];
      if (existingMeta.mtime === mtime) {
        logger.debug(`[RAG] Skipping unchanged file ${filePath}`);
        return false;
      }
    }

    logger.info(`[RAG] Indexing file ${filePath}`);

    // Clear existing chunks for this file
    this.index.chunks = this.index.chunks.filter(c => c.filePath !== filePath);

    // Chunk content
    const chunks = this.chunkContent(content);

    for (const chunkText of chunks) {
      const embedding = await this.generateEmbedding(chunkText);
      this.index.chunks.push({
        id: `${filePath}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        filePath,
        content: chunkText,
        embedding,
        mtime
      });
    }

    // Update file metadata
    this.index.fileMetadata[filePath] = {
      mtime: mtime ?? Date.now(),
      chunkCount: chunks.length
    };

    // Avoid saving on every file to reduce I/O churn
    this.maybeSaveIndex();
    return true;
  }

  /**
   * Index a code file with line numbers and context
   * Used for code-specific indexing with rich metadata
   * @param filePath Absolute path to the file
   * @param chunk Chunk with line information
   * @param context Optional function/class context
   * @param language Language identifier
   * @param mtime Optional modification time
   */
  async indexCodeChunk(
    filePath: string,
    chunk: ChunkWithLines,
    context: string | undefined,
    language: string,
    mtime?: number
  ): Promise<void> {
    this.loadIndex();
    if (!this.index) throw new Error('Index not initialized');

    const embedding = await this.generateEmbedding(chunk.content);
    
    // Create CodeChunk with extended metadata
    const codeChunk: CodeChunk = {
      id: `${filePath}-${chunk.lineStart}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      filePath,
      content: chunk.content,
      embedding,
      mtime,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      context,
      language
    };

    this.index.chunks.push(codeChunk as RAGChunk);
    
    // Don't save on every chunk - caller should call markFullIndex when done
  }

  /**
   * Clear all chunks for a file (used before re-indexing code files)
   */
  clearFileChunks(filePath: string): void {
    this.loadIndex();
    if (!this.index) return;
    
    this.index.chunks = this.index.chunks.filter(c => c.filePath !== filePath);
    
    // Also clear from fileMetadata
    if (this.index.fileMetadata) {
      delete this.index.fileMetadata[filePath];
    }
  }

  /**
   * Update file metadata after indexing all chunks
   */
  updateFileMetadata(filePath: string, chunkCount: number, mtime: number, language?: string): void {
    this.loadIndex();
    if (!this.index) return;
    
    if (!this.index.fileMetadata) {
      this.index.fileMetadata = {};
    }
    
    this.index.fileMetadata[filePath] = {
      mtime,
      chunkCount,
      language
    } as any;
  }

  /**
   * Check if file needs re-indexing based on mtime
   */
  needsReindex(filePath: string, mtime: number): boolean {
    this.loadIndex();
    if (!this.index?.fileMetadata?.[filePath]) return true;
    return this.index.fileMetadata[filePath].mtime !== mtime;
  }

  /**
   * Remove a file from index
   */
  async removeFile(filePath: string): Promise<void> {
    this.loadIndex();
    if (!this.index) return;
    
    const initialCount = this.index.chunks.length;
    this.index.chunks = this.index.chunks.filter(c => c.filePath !== filePath);
    
    // Also remove from fileMetadata
    if (this.index.fileMetadata) {
      delete this.index.fileMetadata[filePath];
    }
    
    if (this.index.chunks.length !== initialCount) {
      logger.info(`[RAG] Removed file ${filePath} from index (${initialCount - this.index.chunks.length} chunks removed)`);
      this.maybeSaveIndex(true);
    }
  }

  /**
   * Get current indexed file paths
   */
  getIndexedFiles(): string[] {
    this.loadIndex();
    if (!this.index || !this.index.fileMetadata) return [];
    return Object.keys(this.index.fileMetadata);
  }

  /**
   * Get index statistics
   */
  getStats(): { totalChunks: number; totalFiles: number; lastFullIndex?: number } {
    this.loadIndex();
    if (!this.index) return { totalChunks: 0, totalFiles: 0 };
    
    const fileCount = this.index.fileMetadata ? Object.keys(this.index.fileMetadata).length : 0;
    return {
      totalChunks: this.index.chunks.length,
      totalFiles: fileCount,
      lastFullIndex: this.index.lastFullIndex
    };
  }

  /**
   * Mark the last full index timestamp
   */
  markFullIndex(): void {
    this.loadIndex();
    if (!this.index) return;
    this.index.lastFullIndex = Date.now();
    this.maybeSaveIndex(true);
  }

  /**
   * Search the index
   */
  async search(query: string, limit: number = 5): Promise<(RAGChunk & { score: number })[]> {
    this.loadIndex();
    if (!this.index || this.index.chunks.length === 0) {
        logger.warn('[RAG] Search called on empty index');
        return [];
    }

    logger.info(`[RAG] Searching for "${query}" (limit: ${limit})`);
    
    const queryEmbedding = await this.generateEmbedding(query);
    
    const results = this.index.chunks.map(chunk => {
      const score = this.cosineSimilarity(queryEmbedding, chunk.embedding);
      return { ...chunk, score };
    });

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    const topResults = results.slice(0, limit);
    logger.info(`[RAG] Search returned ${topResults.length} matches. Top score: ${topResults[0]?.score.toFixed(4)}`);
    
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
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        dotProduct += av * bv;
        normA += av * av;
        normB += bv * bv;
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

  /**
   * Content chunker with line number tracking for code files
   */
  chunkContentWithLines(content: string, maxChunkSize: number = 1000, overlap: number = 100): ChunkWithLines[] {
    const chunks: ChunkWithLines[] = [];
    const lines = content.split('\n');
    
    let currentChunk = '';
    let chunkStartLine = 1;
    let currentLine = 1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const potentialChunk = currentChunk + (currentChunk ? '\n' : '') + line;
      
      if (potentialChunk.length > maxChunkSize && currentChunk.length > 0) {
        // Save current chunk
        if (currentChunk.trim().length > 50) {
          chunks.push({
            content: currentChunk.trim(),
            lineStart: chunkStartLine,
            lineEnd: currentLine - 1
          });
        }
        
        // Start new chunk with overlap
        // Find how many lines to include for overlap
        const overlapLines: string[] = [];
        let overlapSize = 0;
        for (let j = i - 1; j >= 0 && overlapSize < overlap; j--) {
          const prevLine = lines[j] ?? '';
          overlapLines.unshift(prevLine);
          overlapSize += prevLine.length + 1;
        }
        
        currentChunk = overlapLines.join('\n') + (overlapLines.length > 0 ? '\n' : '') + line;
        chunkStartLine = currentLine - overlapLines.length;
      } else {
        currentChunk = potentialChunk;
      }
      
      currentLine++;
    }
    
    // Don't forget the last chunk
    if (currentChunk.trim().length > 50) {
      chunks.push({
        content: currentChunk.trim(),
        lineStart: chunkStartLine,
        lineEnd: lines.length
      });
    }
    
    return chunks;
  }
}
