/**
 * Semantic search utilities for knowledge and code
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { configService, getProjectPermissions } from '../config';
import { findProjectConfig } from '../config-utils';
import { projectService } from '../../lib/detection-service';
import { RAGService } from '../services/rag';
import type { CodeChunk } from '../services/rag';
import { indexingJobs } from '../services/indexing-jobs';
import { scanProjectDependencies, findRelatedFiles as findRelatedInGraph } from '../services/dependency-graph';
import { extractSymbols, searchSymbols as searchSymbolsInResults, type SymbolType, type SymbolExtractionResult } from '../services/symbol-extractor';
import { getExposedProjects, getCodeIndexPath } from './projects';
import { estimateTokens } from './utils';
import { CODE_EXTENSIONS, SKIP_DIRS } from './constants';
import { getSearchAdvisory, getIndexFreshness, applyTokenBudget } from './search-utils';

/**
 * Search code files using semantic search on the code-specific index
 */
export async function searchCode(query: string, projectFilter?: string, limit: number = 10, options?: {
  max_tokens?: number;
  min_score?: number;
}): Promise<{
  results: Array<{
    project: string;
    file: string;
    snippet: string;
    lineStart: number;
    lineEnd: number;
    context?: string;
    language?: string;
    score: number;
  }>;
  token_count: number;
  truncated: boolean;
  index_age_seconds?: number;
  last_indexed_at?: string;
  indexingInProgress?: boolean;
  advisoryMessage?: string;
}> {
  const config = configService.load();
  const projects = getExposedProjects();
  const results: Array<{
    project: string;
    file: string;
    snippet: string;
    lineStart: number;
    lineEnd: number;
    context?: string;
    language?: string;
    score: number;
  }> = [];

  for (const project of projects) {
    // Skip if project filter specified and doesn't match
    if (projectFilter && project.name !== projectFilter) continue;

    const permissions = getProjectPermissions(config, project.name, project.sourcePath || project.path);
    if (!permissions.knowledge || !project.knowledgePath) continue;

    const { indexingInProgress, advisoryMessage } = getSearchAdvisory(project.name);

    // Check for RAG configuration
    const projConfig = findProjectConfig(config, { name: project.name, path: project.sourcePath || project.path });
    const useRAG = projConfig?.semanticSearch?.enabled;

    if (!useRAG) {
      logger.debug(`[searchCode] Semantic search not enabled for project '${project.name}'`);
      continue;
    }

    try {
      const codeIndexPath = getCodeIndexPath(project);
      
      if (!fs.existsSync(codeIndexPath)) {
        logger.debug(`[searchCode] Code index not found for project '${project.name}'`);
        continue;
      }

      const rag = new RAGService(codeIndexPath, projConfig?.semanticSearch?.model);
      const ragResults = await rag.search(query, limit);

      for (const r of ragResults) {
        const codeChunk = r as CodeChunk & { score: number };
        
        results.push({
          project: project.name,
          file: path.relative(project.sourcePath || project.path || '', codeChunk.filePath),
          snippet: codeChunk.content,
          lineStart: codeChunk.lineStart ?? 1,
          lineEnd: codeChunk.lineEnd ?? 1,
          context: codeChunk.context,
          language: codeChunk.language,
          score: codeChunk.score
        });
      }
    } catch (e) {
      logger.error(`[searchCode] Search failed for project '${project.name}'`, e);
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  
  // Apply min_score filter
  let filteredResults = results;
  if (options?.min_score !== undefined && options.min_score > 0) {
    filteredResults = results.filter(r => r.score >= options.min_score!);
  }
  
  // Apply limit
  const limitedResults = filteredResults.slice(0, limit);
  
  // Apply token budget
  const { budgetedResults, truncated, tokenCount } = applyTokenBudget(
    limitedResults, 
    options?.max_tokens, 
    r => r.snippet + (r.context || '')
  );

  // Get index freshness info
  let indexAgeSeconds: number | undefined;
  let lastIndexedAt: string | undefined;
  let indexingInProgressGlobal: boolean | undefined;
  let advisoryMessageGlobal: string | undefined;

  if (projectFilter) {
    const { indexingInProgress, advisoryMessage } = getSearchAdvisory(projectFilter);
    const freshness = getIndexFreshness(projectFilter);
    indexingInProgressGlobal = indexingInProgress;
    advisoryMessageGlobal = advisoryMessage;
    indexAgeSeconds = freshness.indexAgeSeconds;
    lastIndexedAt = freshness.lastIndexedAt;
  }

  return {
    results: budgetedResults,
    token_count: tokenCount,
    truncated,
    index_age_seconds: indexAgeSeconds,
    last_indexed_at: lastIndexedAt,
    indexingInProgress: indexingInProgressGlobal,
    advisoryMessage: advisoryMessageGlobal
  };
}

/**
 * Search across all exposed project knowledge bases
 */
export async function searchKnowledge(query: string, projectFilter?: string, options?: {
  max_tokens?: number;
  min_score?: number;
}): Promise<{
  results: Array<{
    project: string;
    file: string;
    matches: string[];
    score?: number;
  }>;
  token_count: number;
  truncated: boolean;
  index_age_seconds?: number;
  last_indexed_at?: string;
  indexingInProgress?: boolean;
  advisoryMessage?: string;
}> {
  const config = configService.load();
  const projects = getExposedProjects();
  const results: Array<{ project: string; file: string; matches: string[]; score?: number }> = [];
  
  const queryLower = query.toLowerCase();

  for (const project of projects) {
    if (projectFilter && project.name !== projectFilter) continue;
    
    const permissions = getProjectPermissions(config, project.name, project.sourcePath || project.path);
    if (!permissions.knowledge || !project.knowledgePath) continue;

    const { indexingInProgress, advisoryMessage } = getSearchAdvisory(project.name);

    const projConfig = findProjectConfig(config, { name: project.name, path: project.sourcePath || project.path });
    const useRAG = projConfig?.semanticSearch?.enabled;

    if (useRAG) {
      try {
        const indexPath = path.join(project.knowledgePath, 'embeddings.json');
        const rag = new RAGService(indexPath, projConfig?.semanticSearch?.model);
        const ragResults = await rag.search(query, 5);

        for (const r of ragResults) {
          results.push({
            project: project.name,
            file: path.relative(project.knowledgePath, r.filePath),
            matches: [r.content],
            score: r.score
          });
        }
        continue;
      } catch (e) {
        logger.error(`[RAG] Semantic search failed for project '${project.name}', falling back to text search`, e);
      }
    }
    
    try {
      const files = fs.readdirSync(project.knowledgePath);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        
        const filePath = path.join(project.knowledgePath, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const matches: string[] = [];
        
        for (const line of lines) {
          if (line.toLowerCase().includes(queryLower)) {
            matches.push(line.trim());
          }
        }
        
        if (matches.length > 0) {
          results.push({
            project: project.name,
            file,
            matches: matches.slice(0, 5)
          });
        }
      }
    } catch (err) {
      logger.error(`[searchKnowledge] Failed to read knowledge directory ${project.knowledgePath}`, err);
    }
  }

  // Apply min_score filter
  let filteredResults = results;
  if (options?.min_score !== undefined && options.min_score > 0) {
    filteredResults = results.filter(r => (r.score ?? 1) >= options.min_score!);
  }

  // Sort by score descending
  filteredResults.sort((a, b) => (b.score ?? 1) - (a.score ?? 1));

  // Apply token budget
  const { budgetedResults, truncated, tokenCount } = applyTokenBudget(
    filteredResults, 
    options?.max_tokens, 
    r => r.matches.join('\n')
  );

  // Get index freshness info
  let indexAgeSeconds: number | undefined;
  let lastIndexedAt: string | undefined;
  let indexingInProgressGlobal: boolean | undefined;
  let advisoryMessageGlobal: string | undefined;

  if (projectFilter) {
    const { indexingInProgress, advisoryMessage } = getSearchAdvisory(projectFilter);
    const freshness = getIndexFreshness(projectFilter);
    indexingInProgressGlobal = indexingInProgress;
    advisoryMessageGlobal = advisoryMessage;
    indexAgeSeconds = freshness.indexAgeSeconds;
    lastIndexedAt = freshness.lastIndexedAt;
  }

  return {
    results: budgetedResults,
    token_count: tokenCount,
    truncated,
    index_age_seconds: indexAgeSeconds,
    last_indexed_at: lastIndexedAt,
    indexingInProgress: indexingInProgressGlobal,
    advisoryMessage: advisoryMessageGlobal
  };
}

/**
 * Find files related to a given file through import relationships
 */
export async function findRelatedFiles(
  filePath: string,
  projectName: string,
  options: {
    includeImports?: boolean;
    includeImportedBy?: boolean;
    depth?: number;
  } = {}
): Promise<{
  success: boolean;
  file: string;
  project: string;
  relationships: Array<{
    file: string;
    relationship: 'imports' | 'imported-by' | 'exports-to';
    importPath: string;
  }>;
  message?: string;
}> {
  const config = configService.load();
  const projects = getExposedProjects();
  const project = projects.find(p => p.name === projectName);

  if (!project) {
    return {
      success: false,
      file: filePath,
      project: projectName,
      relationships: [],
      message: `Project '${projectName}' not found`
    };
  }

  const projectRoot = project.sourcePath || project.path || '';
  
  // Resolve file path - if relative, make it absolute
  let absoluteFilePath = filePath;
  if (!path.isAbsolute(filePath)) {
    absoluteFilePath = path.resolve(projectRoot, filePath);
  }

  if (!fs.existsSync(absoluteFilePath)) {
    return {
      success: false,
      file: filePath,
      project: projectName,
      relationships: [],
      message: `File '${filePath}' not found`
    };
  }

  try {
    // Build dependency graph for the project
    const graph = await scanProjectDependencies(projectRoot);
    
    // Find related files
    const related = findRelatedInGraph(absoluteFilePath, graph, {
      includeImports: options.includeImports ?? true,
      includeImportedBy: options.includeImportedBy ?? true,
      depth: options.depth ?? 1
    });

    // Convert absolute paths to project-relative paths
    const relationships = related.map(r => ({
      file: path.relative(projectRoot, r.file),
      relationship: r.relationship,
      importPath: r.importPath
    }));

    return {
      success: true,
      file: path.relative(projectRoot, absoluteFilePath),
      project: projectName,
      relationships
    };
  } catch (e) {
    logger.error(`[findRelatedFiles] Error analyzing ${filePath}`, e);
    return {
      success: false,
      file: filePath,
      project: projectName,
      relationships: [],
      message: `Error analyzing file relationships: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

/**
 * Search for symbols (functions, classes, types, variables) by name
 */
export async function searchSymbols(
  name: string,
  projectName: string,
  options: {
    type?: SymbolType | 'any';
    fuzzy?: boolean;
    limit?: number;
  } = {}
): Promise<{
  success: boolean;
  project: string;
  results: Array<{
    name: string;
    type: string;
    file: string;
    line: number;
    signature: string;
    exported: boolean;
    score: number;
  }>;
  message?: string;
}> {
  const config = configService.load();
  const projects = getExposedProjects();
  const project = projects.find(p => p.name === projectName);

  if (!project) {
    return {
      success: false,
      project: projectName,
      results: [],
      message: `Project '${projectName}' not found`
    };
  }

  const projectRoot = project.sourcePath || project.path || '';
  
  if (!fs.existsSync(projectRoot)) {
    return {
      success: false,
      project: projectName,
      results: [],
      message: `Project root not found: ${projectRoot}`
    };
  }

  try {
    // Collect all code files
    const codeFiles: string[] = [];
    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (SKIP_DIRS.includes(entry.name)) continue;
          scanDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (CODE_EXTENSIONS.includes(ext)) {
            codeFiles.push(fullPath);
          }
        }
      }
    };
    scanDir(projectRoot);

    // Extract symbols from each file
    const symbolResults: SymbolExtractionResult[] = [];
    for (const file of codeFiles.slice(0, 500)) { // Limit to 500 files for performance
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const result = extractSymbols(content, file);
        symbolResults.push(result);
      } catch (e) {
        // Skip files that can't be read
      }
    }

    // Search across all extracted symbols
    const matches = searchSymbolsInResults(symbolResults, name, {
      type: options.type,
      fuzzy: options.fuzzy ?? true,
      limit: options.limit ?? 10,
      minScore: 0.3
    });

    // Convert to relative paths
    const results = matches.map(m => ({
      name: m.name,
      type: m.type,
      file: path.relative(projectRoot, m.file),
      line: m.line,
      signature: m.signature,
      exported: m.exported,
      score: m.score
    }));

    return {
      success: true,
      project: projectName,
      results
    };
  } catch (e) {
    logger.error(`[searchSymbols] Error searching symbols in ${projectName}`, e);
    return {
      success: false,
      project: projectName,
      results: [],
      message: `Error searching symbols: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

/**
 * Get a summary of a file without reading its full content
 */
export async function getFileSummary(
  filePath: string,
  projectName: string
): Promise<{
  success: boolean;
  summary?: {
    path: string;
    language: string;
    lines: number;
    size_bytes: number;
    last_modified: string;
    exports: string[];
    imports: string[];
    symbols: Array<{ name: string; type: string; line: number }>;
  };
  message?: string;
}> {
  const config = configService.load();
  const projects = getExposedProjects();
  const project = projects.find(p => p.name === projectName);

  if (!project) {
    return {
      success: false,
      message: `Project '${projectName}' not found`
    };
  }

  const projectRoot = project.sourcePath || project.path || '';
  
  // Resolve file path
  let absolutePath = filePath;
  if (!path.isAbsolute(filePath)) {
    absolutePath = path.resolve(projectRoot, filePath);
  }

  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      message: `File not found: ${filePath}`
    };
  }

  try {
    const stat = fs.statSync(absolutePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const lines = content.split('\n');
    
    // Extract symbols
    const symbolResult = extractSymbols(content, absolutePath);
    
    return {
      success: true,
      summary: {
        path: path.relative(projectRoot, absolutePath),
        language: symbolResult.language,
        lines: lines.length,
        size_bytes: stat.size,
        last_modified: stat.mtime.toISOString(),
        exports: symbolResult.exports,
        imports: symbolResult.imports,
        symbols: symbolResult.symbols.map(s => ({
          name: s.name,
          type: s.type,
          line: s.line
        }))
      }
    };
  } catch (e) {
    logger.error(`[getFileSummary] Error reading ${filePath}`, e);
    return {
      success: false,
      message: `Error reading file: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}
