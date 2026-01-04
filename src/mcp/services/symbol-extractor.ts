/**
 * Symbol Extraction Service
 * Extracts functions, classes, types, and variables from TypeScript/JavaScript files
 * Uses regex patterns for fast extraction without full AST parsing
 */

export type SymbolType = 'function' | 'class' | 'type' | 'interface' | 'variable' | 'const' | 'enum';

export interface ExtractedSymbol {
  name: string;
  type: SymbolType;
  line: number;
  signature: string;
  exported: boolean;
  endLine?: number;
}

export interface SymbolExtractionResult {
  filePath: string;
  language: string;
  symbols: ExtractedSymbol[];
  exports: string[];
  imports: string[];
}

/**
 * Extract symbols from TypeScript/JavaScript file content
 */
export function extractSymbols(content: string, filePath: string): SymbolExtractionResult {
  const lines = content.split('\n');
  const symbols: ExtractedSymbol[] = [];
  const exports: string[] = [];
  const imports: string[] = [];
  
  const language = getLanguageFromPath(filePath);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNum = i + 1;
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || !trimmed) {
      continue;
    }
    
    // Extract imports
    const importMatch = line.match(/^import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/);
    if (importMatch) {
      imports.push(importMatch[3] ?? '');
      continue;
    }
    
    // Extract re-exports
    const reExportMatch = line.match(/^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (reExportMatch) {
      const items = (reExportMatch[1] ?? '').split(',').map(s => s.trim().split(' as ')[0]?.trim() ?? '');
      exports.push(...items.filter(Boolean));
      continue;
    }
    
    // Check if line starts with export
    const isExported = trimmed.startsWith('export ');
    const cleanLine = isExported ? trimmed.replace(/^export\s+(default\s+)?/, '') : trimmed;
    
    // Extract functions
    const funcMatch = cleanLine.match(/^(?:async\s+)?function\s+(\w+)\s*(\([^)]*\))/);
    if (funcMatch && funcMatch[1]) {
      const name = funcMatch[1];
      const params = funcMatch[2] ?? '()';
      symbols.push({
        name,
        type: 'function',
        line: lineNum,
        signature: `function ${name}${params}`,
        exported: isExported
      });
      if (isExported) exports.push(name);
      continue;
    }
    
    // Extract arrow functions assigned to const/let/var
    const arrowMatch = cleanLine.match(/^(const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/);
    if (arrowMatch && arrowMatch[2]) {
      const name = arrowMatch[2];
      symbols.push({
        name,
        type: 'function',
        line: lineNum,
        signature: `const ${name} = (...)`,
        exported: isExported
      });
      if (isExported) exports.push(name);
      continue;
    }
    
    // Extract classes
    const classMatch = cleanLine.match(/^(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/);
    if (classMatch && classMatch[1]) {
      const name = classMatch[1];
      const extendsClass = classMatch[2];
      let signature = `class ${name}`;
      if (extendsClass) signature += ` extends ${extendsClass}`;
      symbols.push({
        name,
        type: 'class',
        line: lineNum,
        signature,
        exported: isExported
      });
      if (isExported) exports.push(name);
      continue;
    }
    
    // Extract interfaces
    const interfaceMatch = cleanLine.match(/^interface\s+(\w+)(?:<[^>]+>)?(?:\s+extends\s+([^{]+))?/);
    if (interfaceMatch && interfaceMatch[1]) {
      const name = interfaceMatch[1];
      symbols.push({
        name,
        type: 'interface',
        line: lineNum,
        signature: `interface ${name}`,
        exported: isExported
      });
      if (isExported) exports.push(name);
      continue;
    }
    
    // Extract type aliases
    const typeMatch = cleanLine.match(/^type\s+(\w+)(?:<[^>]+>)?\s*=/);
    if (typeMatch && typeMatch[1]) {
      const name = typeMatch[1];
      symbols.push({
        name,
        type: 'type',
        line: lineNum,
        signature: `type ${name}`,
        exported: isExported
      });
      if (isExported) exports.push(name);
      continue;
    }
    
    // Extract enums
    const enumMatch = cleanLine.match(/^(?:const\s+)?enum\s+(\w+)/);
    if (enumMatch && enumMatch[1]) {
      const name = enumMatch[1];
      symbols.push({
        name,
        type: 'enum',
        line: lineNum,
        signature: `enum ${name}`,
        exported: isExported
      });
      if (isExported) exports.push(name);
      continue;
    }
    
    // Extract const/let/var declarations (non-function)
    const varMatch = cleanLine.match(/^(const|let|var)\s+(\w+)\s*(?::\s*([^=]+))?\s*=/);
    if (varMatch && varMatch[2]) {
      // Skip if already matched as arrow function
      if (line.includes('=>')) continue;
      
      const name = varMatch[2];
      const varType = varMatch[1] as 'const' | 'variable';
      symbols.push({
        name,
        type: varType === 'const' ? 'const' : 'variable',
        line: lineNum,
        signature: `${varMatch[1]} ${name}`,
        exported: isExported
      });
      if (isExported) exports.push(name);
      continue;
    }
    
    // Extract default export
    const defaultExportMatch = trimmed.match(/^export\s+default\s+(?:class|function)?\s*(\w+)?/);
    if (defaultExportMatch && defaultExportMatch[1]) {
      exports.push(defaultExportMatch[1]);
    }
  }
  
  return {
    filePath,
    language,
    symbols,
    exports: Array.from(new Set(exports)),
    imports: Array.from(new Set(imports))
  };
}

/**
 * Calculate fuzzy match score between query and symbol name
 * Returns 0-1 where 1 is exact match
 */
export function fuzzyMatchScore(query: string, symbolName: string): number {
  const q = query.toLowerCase();
  const s = symbolName.toLowerCase();
  
  // Exact match
  if (q === s) return 1.0;
  
  // Starts with query
  if (s.startsWith(q)) return 0.9;
  
  // Contains query
  if (s.includes(q)) return 0.7;
  
  // Query starts with symbol (partial match)
  if (q.startsWith(s)) return 0.6;
  
  // Levenshtein-based similarity for close matches
  const distance = levenshteinDistance(q, s);
  const maxLen = Math.max(q.length, s.length);
  const similarity = 1 - (distance / maxLen);
  
  return Math.max(0, similarity * 0.5); // Scale down for non-substring matches
}

/**
 * Simple Levenshtein distance implementation
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1,     // insertion
          matrix[i - 1]![j]! + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length]![a.length]!;
}

/**
 * Get language from file path
 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.toLowerCase().split('.').pop() ?? '';
  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'mjs': 'javascript',
    'cjs': 'javascript',
    'py': 'python',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'kt': 'kotlin',
    'rb': 'ruby',
    'php': 'php',
    'swift': 'swift',
    'c': 'c',
    'cpp': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp'
  };
  return langMap[ext] ?? 'unknown';
}

/**
 * Search symbols across multiple extraction results
 */
export function searchSymbols(
  symbolResults: SymbolExtractionResult[],
  query: string,
  options: {
    type?: SymbolType | 'any';
    fuzzy?: boolean;
    limit?: number;
    minScore?: number;
  } = {}
): Array<ExtractedSymbol & { file: string; score: number }> {
  const { type = 'any', fuzzy = true, limit = 10, minScore = 0.3 } = options;
  
  const matches: Array<ExtractedSymbol & { file: string; score: number }> = [];
  
  for (const result of symbolResults) {
    for (const symbol of result.symbols) {
      // Filter by type if specified
      if (type !== 'any' && symbol.type !== type) continue;
      
      // Calculate match score
      const score = fuzzy
        ? fuzzyMatchScore(query, symbol.name)
        : (symbol.name.toLowerCase().includes(query.toLowerCase()) ? 1 : 0);
      
      if (score >= minScore) {
        matches.push({
          ...symbol,
          file: result.filePath,
          score
        });
      }
    }
  }
  
  // Sort by score descending, then by name length (prefer shorter matches)
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.length - b.name.length;
  });
  
  return matches.slice(0, limit);
}
