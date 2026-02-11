/**
 * Knowledge indexing utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { configService } from '../config';
import { findProjectConfig } from '../config-utils';
import { RAGService } from '../services/rag';
import { indexingJobs, type IndexJobState } from '../services/indexing-jobs';
import { extractContext, getLanguageFromExtension } from '../services/context-extractor';
import { getExposedProjects } from './projects';
import { getScanContext } from './utils';
import { INDEXABLE_EXTENSIONS, CODE_EXTENSIONS } from './constants';

import { DriftService } from '../../lib/drift-service';

/**
 * Trigger knowledge indexing for a project (scans entire codebase)
 */
export async function indexKnowledge(projectName: string, force: boolean = false, clean: boolean = false): Promise<{
  state: IndexJobState;
  status: 'started' | 'already_running' | 'failed';
  success: boolean;
  message: string;
  filesIndexed: number;
  filesSkipped: number;
  progress: {
    itemsDone: number;
    itemsTotal?: number;
    currentItem?: string;
    startedAt?: number;
    completedAt?: number;
    lastError?: string;
  };
}> {
  const config = configService.load();
  const projects = getExposedProjects();
  const project = projects.find(p => p.name === projectName || (p.path && p.path === projectName));

  if (!project) {
    return {
      state: 'failed',
      status: 'failed',
      success: false,
      message: `Project '${projectName}' not found`,
      filesIndexed: 0,
      filesSkipped: 0,
      progress: { itemsDone: 0 }
    };
  }

  // Find config with fallback for global projects
  const projConfig = findProjectConfig(config, { name: project.name, path: project.sourcePath || project.path }) 
    || (project.source === 'global' ? { semanticSearch: { enabled: true, model: 'Xenova/all-MiniLM-L6-v2' } } : undefined);
  
  // Check if RAG is actually enabled (either in config or detected)
  const isEnabled = projConfig?.semanticSearch?.enabled || (project as any).semanticSearchEnabled;

  if (!isEnabled) {
    return {
      state: 'failed',
      status: 'failed',
      success: false,
      message: 'Semantic Search is not enabled for this project',
      filesIndexed: 0,
      filesSkipped: 0,
      progress: { itemsDone: 0 }
    };
  }

  // Use project root for scanning
  const scanRoot = project.sourcePath || project.path || project.dataPath;

  if (!fs.existsSync(scanRoot)) {
    return {
      state: 'failed',
      status: 'failed',
      success: false,
      message: 'Project root not found',
      filesIndexed: 0,
      filesSkipped: 0,
      progress: { itemsDone: 0 }
    };
  }

  const runIndexing = async (signal: AbortSignal): Promise<void> => {
    const { shouldSkipEntryDir, shouldSkipEntryFile } = getScanContext(project, scanRoot);
    
    const knowledgeDir = project.knowledgePath || path.join(scanRoot, '.rrce-workflow', 'knowledge');
    const indexPath = path.join(knowledgeDir, 'embeddings.json');
    const codeIndexPath = path.join(knowledgeDir, 'code-embeddings.json');

    // Full wipe if clean=true
    if (clean) {
      logger.info(`[RAG] Cleaning knowledge index for ${project.name}`);
      if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
      if (fs.existsSync(codeIndexPath)) fs.unlinkSync(codeIndexPath);
    }
    
    const model = projConfig?.semanticSearch?.model || 'Xenova/all-MiniLM-L6-v2';
    const rag = new RAGService(indexPath, model);
    const codeRag = new RAGService(codeIndexPath, model);
    
    let indexed = 0;
    let codeIndexed = 0;
    let skipped = 0;
    let itemsTotal = 0;
    let itemsDone = 0;

    const preCount = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (shouldSkipEntryDir(fullPath)) continue;
          preCount(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!INDEXABLE_EXTENSIONS.includes(ext)) continue;
          if (shouldSkipEntryFile(fullPath)) continue;
          itemsTotal++;
        }
      }
    };

    preCount(scanRoot);
    indexingJobs.update(project.name, { itemsTotal });

    const cleanupIgnoredFiles = async (): Promise<void> => {
      const indexedFiles = [...rag.getIndexedFiles(), ...codeRag.getIndexedFiles()];
      const unique = Array.from(new Set(indexedFiles));
      
      // Also detect deleted files via DriftService if in workspace
      const deletedFiles = project.dataPath ? DriftService.detectDeletedFiles(project.dataPath) : [];
      if (deletedFiles.length > 0) {
        logger.info(`[RAG] ${project.name}: Detected ${deletedFiles.length} deleted files from manifest`);
      }

      for (const filePath of unique) {
        if (!path.isAbsolute(filePath)) continue;

        const relFilePath = filePath.split(path.sep).join('/');
        const relScanRoot = scanRoot.split(path.sep).join('/');
        const isInScanRoot = relFilePath === relScanRoot || relFilePath.startsWith(`${relScanRoot}/`);
        if (!isInScanRoot) continue;

        // Remove if ignored OR if explicitly deleted from manifest
        const isDeleted = deletedFiles.some(df => filePath.endsWith(df));
        
        if (shouldSkipEntryFile(filePath) || isDeleted || !fs.existsSync(filePath)) {
          await rag.removeFile(filePath);
          await codeRag.removeFile(filePath);
        }
      }
    };

    await cleanupIgnoredFiles();

    // Recursive file scanner
    const scanDir = async (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (shouldSkipEntryDir(fullPath)) continue;
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (!INDEXABLE_EXTENSIONS.includes(ext)) continue;
          if (shouldSkipEntryFile(fullPath)) continue;
          
          try {
            indexingJobs.update(project.name, { currentItem: fullPath, itemsDone });
            const stat = fs.statSync(fullPath);
            const mtime = force ? undefined : stat.mtimeMs; 
            const content = fs.readFileSync(fullPath, 'utf-8');
            
            // Index in knowledge index (all files)
            const wasIndexed = await rag.indexFile(fullPath, content, mtime);
            if (wasIndexed) {
              indexed++;
            } else {
              skipped++;
            }
            
            // For code files, also index with line numbers + context in code index
            if (CODE_EXTENSIONS.includes(ext)) {
              if (!mtime || codeRag.needsReindex(fullPath, mtime)) {
                const language = getLanguageFromExtension(ext);
                const chunks = codeRag.chunkContentWithLines(content);
                codeRag.clearFileChunks(fullPath);
                
                for (const chunk of chunks) {
                  const context = extractContext(content, chunk.lineStart, language);
                  await codeRag.indexCodeChunk(fullPath, chunk, context, language, mtime);
                }
                
                codeRag.updateFileMetadata(fullPath, chunks.length, mtime ?? Date.now(), language);
                codeIndexed++;
              }
            }
          } catch (err) {
            logger.error(`[indexKnowledge] Failed to index ${fullPath}`, err);
          } finally {
            itemsDone++;
            indexingJobs.update(project.name, { itemsDone });
            if (itemsDone % 10 === 0) {
              if (signal.aborted) return;
              await new Promise<void>(resolve => setImmediate(resolve));
            }
          }
        }
      }
    };

    await scanDir(scanRoot);
    rag.markFullIndex();
    codeRag.markFullIndex();

    const stats = rag.getStats();
    const codeStats = codeRag.getStats();
    const message = `Indexed ${indexed} files (${codeIndexed} code files), skipped ${skipped} unchanged. Knowledge: ${stats.totalChunks} chunks. Code: ${codeStats.totalChunks} chunks.`;
    logger.info(`[RAG] ${project.name}: ${message}`);
    indexingJobs.update(project.name, { currentItem: undefined });
  };

  const startResult = indexingJobs.startOrStatus(project.name, runIndexing);
  const p = startResult.progress;

  return {
    state: startResult.state,
    status: startResult.status,
    success: startResult.status === 'started' || startResult.status === 'already_running',
    message:
      startResult.status === 'started'
        ? `Indexing started in background for '${project.name}'.`
        : `Indexing already running for '${project.name}'.`,
    filesIndexed: 0,
    filesSkipped: 0,
    progress: {
      itemsDone: p.itemsDone,
      itemsTotal: p.itemsTotal,
      currentItem: p.currentItem,
      startedAt: p.startedAt,
      completedAt: p.completedAt,
      lastError: p.lastError,
    },
  };
}
