/**
 * Dependency Graph Parser
 * Parses import statements to build a graph of file relationships.
 * Supports TypeScript, JavaScript, Python, Go, Rust, and more.
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import { getLanguageFromExtension } from './context-extractor';

export interface DependencyEdge {
  source: string;      // Absolute path of the importing file
  target: string;      // Resolved absolute path of the imported file (or module name if unresolved)
  importType: 'static' | 'dynamic' | 're-export';
  importPath: string;  // Original import path as written in code
  isResolved: boolean; // Whether the target was resolved to a file
}

export interface DependencyGraph {
  edges: DependencyEdge[];
  files: Set<string>;
  lastUpdated: number;
}

export interface FileRelationship {
  file: string;
  relationship: 'imports' | 'imported-by' | 'exports-to';
  importPath: string;
}

// Common patterns for different languages
const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    // ES6 imports: import x from 'y', import { x } from 'y', import * as x from 'y'
    /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g,
    // Dynamic imports: import('x')
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // Re-exports: export { x } from 'y', export * from 'y'
    /export\s+(?:\*|{[^}]*})\s+from\s+['"]([^'"]+)['"]/g,
    // require(): require('x')
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  javascript: [
    /import\s+(?:(?:[\w*{}\s,]+)\s+from\s+)?['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+(?:\*|{[^}]*})\s+from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  python: [
    // from x import y, from x.y import z
    /from\s+([\w.]+)\s+import/g,
    // import x, import x.y
    /^import\s+([\w.]+)/gm,
  ],
  go: [
    // import "x", import alias "x"
    /import\s+(?:\w+\s+)?["']([^"']+)["']/g,
    // import ( "x" )
    /^\s*["']([^"']+)["']\s*$/gm,
  ],
  rust: [
    // use x::y, use x::y::*
    /use\s+([\w:]+)/g,
    // mod x
    /mod\s+(\w+)/g,
    // extern crate x
    /extern\s+crate\s+(\w+)/g,
  ],
  java: [
    // import x.y.z
    /import\s+([\w.]+)/g,
  ],
};

/**
 * Parse a file and extract its imports/dependencies
 */
export function parseImports(filePath: string, content: string): DependencyEdge[] {
  const ext = path.extname(filePath).toLowerCase();
  const language = getLanguageFromExtension(ext);
  const edges: DependencyEdge[] = [];
  
  const patterns = IMPORT_PATTERNS[language] || IMPORT_PATTERNS.javascript || [];
  
  for (const pattern of patterns!) {
    // Reset regex state
    pattern.lastIndex = 0;
    
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];
      if (!importPath) continue;
      
      // Skip node built-ins and common packages for now
      // We focus on local imports for relationship discovery
      const isRelative = importPath.startsWith('.') || importPath.startsWith('/');
      
      // Determine import type
      let importType: 'static' | 'dynamic' | 're-export' = 'static';
      if (pattern.source.includes('import\\s*\\(')) {
        importType = 'dynamic';
      } else if (pattern.source.includes('export')) {
        importType = 're-export';
      }
      
      // Try to resolve the import to a file
      const resolved = resolveImport(filePath, importPath, language);
      
      edges.push({
        source: filePath,
        target: resolved.path,
        importType,
        importPath,
        isResolved: resolved.isResolved,
      });
    }
  }
  
  return edges;
}

/**
 * Resolve an import path to an absolute file path
 */
function resolveImport(
  fromFile: string,
  importPath: string,
  language: string
): { path: string; isResolved: boolean } {
  const fromDir = path.dirname(fromFile);
  
  // Handle relative imports
  if (importPath.startsWith('.')) {
    const candidates = generateCandidates(path.resolve(fromDir, importPath), language);
    
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return { path: candidate, isResolved: true };
      }
    }
    
    // Return unresolved but with full path attempt
    return { path: path.resolve(fromDir, importPath), isResolved: false };
  }
  
  // Handle absolute imports (e.g., from baseUrl or aliases)
  if (importPath.startsWith('/')) {
    const candidates = generateCandidates(importPath, language);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return { path: candidate, isResolved: true };
      }
    }
    return { path: importPath, isResolved: false };
  }
  
  // Package/module imports - return as-is (unresolved)
  // In the future, we could resolve node_modules, Python packages, etc.
  return { path: importPath, isResolved: false };
}

/**
 * Generate candidate file paths for an import
 */
function generateCandidates(basePath: string, language: string): string[] {
  const candidates: string[] = [];
  
  // If already has extension, try as-is first
  if (path.extname(basePath)) {
    candidates.push(basePath);
  }
  
  // Try common extensions based on language
  switch (language) {
    case 'typescript':
      candidates.push(
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}/index.ts`,
        `${basePath}/index.tsx`,
        `${basePath}.js`,
        `${basePath}.jsx`,
        `${basePath}/index.js`,
        `${basePath}/index.jsx`
      );
      break;
    case 'javascript':
      candidates.push(
        `${basePath}.js`,
        `${basePath}.jsx`,
        `${basePath}/index.js`,
        `${basePath}/index.jsx`,
        `${basePath}.mjs`,
        `${basePath}.cjs`
      );
      break;
    case 'python':
      candidates.push(
        `${basePath}.py`,
        `${basePath}/__init__.py`
      );
      break;
    case 'go':
      candidates.push(`${basePath}.go`);
      break;
    case 'rust':
      candidates.push(
        `${basePath}.rs`,
        `${basePath}/mod.rs`
      );
      break;
    case 'java':
      candidates.push(`${basePath}.java`);
      break;
    default:
      candidates.push(basePath);
  }
  
  return candidates;
}

/**
 * Build a dependency graph from a list of files
 */
export function buildDependencyGraph(files: Array<{ path: string; content: string }>): DependencyGraph {
  const graph: DependencyGraph = {
    edges: [],
    files: new Set(),
    lastUpdated: Date.now(),
  };
  
  for (const file of files) {
    graph.files.add(file.path);
    const edges = parseImports(file.path, file.content);
    graph.edges.push(...edges);
  }
  
  return graph;
}

/**
 * Find files related to a given file based on import relationships
 */
export function findRelatedFiles(
  filePath: string,
  graph: DependencyGraph,
  options: {
    includeImports?: boolean;    // Files this file imports
    includeImportedBy?: boolean; // Files that import this file
    depth?: number;              // How many levels to traverse
  } = {}
): FileRelationship[] {
  const {
    includeImports = true,
    includeImportedBy = true,
    depth = 1
  } = options;
  
  const results: FileRelationship[] = [];
  const visited = new Set<string>();
  
  function traverse(file: string, currentDepth: number) {
    if (currentDepth > depth || visited.has(file)) return;
    visited.add(file);
    
    // Files this file imports
    if (includeImports) {
      const imports = graph.edges.filter(e => e.source === file && e.isResolved);
      for (const edge of imports) {
        if (!visited.has(edge.target)) {
          results.push({
            file: edge.target,
            relationship: 'imports',
            importPath: edge.importPath,
          });
          if (currentDepth < depth) {
            traverse(edge.target, currentDepth + 1);
          }
        }
      }
    }
    
    // Files that import this file
    if (includeImportedBy) {
      const importedBy = graph.edges.filter(e => e.target === file && e.isResolved);
      for (const edge of importedBy) {
        if (!visited.has(edge.source)) {
          results.push({
            file: edge.source,
            relationship: 'imported-by',
            importPath: edge.importPath,
          });
          if (currentDepth < depth) {
            traverse(edge.source, currentDepth + 1);
          }
        }
      }
    }
  }
  
  traverse(filePath, 1);
  
  return results;
}

// Cache for dependency graphs per project root
const GRAPH_CACHE_TTL_MS = 60_000; // 60 seconds
const graphCache = new Map<string, { graph: DependencyGraph; cachedAt: number }>();

/**
 * Clear the dependency graph cache
 */
export function clearDependencyGraphCache(): void {
  graphCache.clear();
}

/**
 * Scan a project directory and build a dependency graph.
 * Results are cached per projectRoot with a 60-second TTL.
 */
export async function scanProjectDependencies(
  projectRoot: string,
  options: {
    extensions?: string[];
    skipDirs?: string[];
  } = {}
): Promise<DependencyGraph> {
  // Check cache
  const now = Date.now();
  const cached = graphCache.get(projectRoot);
  if (cached && (now - cached.cachedAt) < GRAPH_CACHE_TTL_MS) {
    logger.debug(`[DependencyGraph] Using cached graph for ${projectRoot}`);
    return cached.graph;
  }

  const {
    extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java'],
    skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'venv', '.venv', 'target', 'vendor']
  } = options;

  const files: Array<{ path: string; content: string }> = [];

  function scanDir(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!skipDirs.includes(entry.name) && !entry.name.startsWith('.')) {
            scanDir(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              files.push({ path: fullPath, content });
            } catch {
              // Skip unreadable files
            }
          }
        }
      }
    } catch (err) {
      logger.error(`[DependencyGraph] Error scanning directory ${dir}`, err);
    }
  }

  logger.info(`[DependencyGraph] Scanning project: ${projectRoot}`);
  scanDir(projectRoot);
  logger.info(`[DependencyGraph] Found ${files.length} files to analyze`);

  const graph = buildDependencyGraph(files);
  logger.info(`[DependencyGraph] Built graph with ${graph.edges.length} edges`);

  // Store in cache
  graphCache.set(projectRoot, { graph, cachedAt: now });

  return graph;
}
