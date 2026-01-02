/**
 * Context Extractor - Best-effort extraction of function/class context from code
 * 
 * Extracts the enclosing function, class, or method name for a given line range.
 * Uses regex patterns for common languages; returns undefined for unsupported languages.
 */

import { logger } from '../logger';

/**
 * Supported language identifiers
 */
export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java' | 'unknown';

/**
 * Map file extensions to language identifiers
 */
export function getLanguageFromExtension(ext: string): SupportedLanguage {
  const extLower = ext.toLowerCase().replace(/^\./, '');
  
  switch (extLower) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'py':
    case 'pyw':
      return 'python';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'java':
    case 'kt':
    case 'kts':
      return 'java';
    default:
      return 'unknown';
  }
}

/**
 * Context match result
 */
export interface ContextMatch {
  type: 'class' | 'function' | 'method' | 'const' | 'interface' | 'type';
  name: string;
  line: number;
}

/**
 * Extract context for a given line range in content
 * 
 * @param content Full file content
 * @param lineStart Start line (1-based)
 * @param language Language identifier
 * @returns Context string (e.g., "class RAGService", "function search()") or undefined
 */
export function extractContext(
  content: string,
  lineStart: number,
  language: SupportedLanguage
): string | undefined {
  if (language === 'unknown') {
    return undefined;
  }

  try {
    const lines = content.split('\n');
    
    // Search backwards from lineStart to find enclosing context
    const context = findEnclosingContext(lines, lineStart - 1, language);
    
    if (context) {
      return formatContext(context);
    }
    
    return undefined;
  } catch (error) {
    logger.debug(`[ContextExtractor] Failed to extract context: ${error}`);
    return undefined;
  }
}

/**
 * Search backwards to find the enclosing function/class/method
 */
function findEnclosingContext(
  lines: string[],
  targetLineIndex: number,
  language: SupportedLanguage
): ContextMatch | undefined {
  const patterns = getPatterns(language);
  
  // Track nesting level to find the correct enclosing context
  let braceDepth = 0;
  let indentLevel = -1;
  
  // For Python, track indentation
  if (language === 'python') {
    const targetLine = lines[targetLineIndex] ?? '';
    indentLevel = getIndentLevel(targetLine);
  }
  
  // Search backwards from target line
  for (let i = targetLineIndex; i >= 0; i--) {
    const line = lines[i] ?? '';
    
    // Track braces for C-style languages
    if (language !== 'python') {
      braceDepth += countChar(line, '}') - countChar(line, '{');
    }
    
    // Check each pattern
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const name = match[1] ?? match[2] ?? 'unknown';
        
        // For Python, check indentation
        if (language === 'python') {
          const lineIndent = getIndentLevel(line);
          if (lineIndent < indentLevel || indentLevel === -1) {
            return { type: pattern.type, name, line: i + 1 };
          }
        } else {
          // For C-style, we're inside if braceDepth >= 0
          if (braceDepth >= 0) {
            return { type: pattern.type, name, line: i + 1 };
          }
        }
      }
    }
  }
  
  return undefined;
}

/**
 * Get regex patterns for a language
 */
function getPatterns(language: SupportedLanguage): Array<{ regex: RegExp; type: ContextMatch['type'] }> {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return [
        // class ClassName
        { regex: /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/, type: 'class' },
        // interface InterfaceName
        { regex: /^\s*(?:export\s+)?interface\s+(\w+)/, type: 'interface' },
        // type TypeName
        { regex: /^\s*(?:export\s+)?type\s+(\w+)/, type: 'type' },
        // function functionName or async function
        { regex: /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/, type: 'function' },
        // const/let/var name = (async) function or arrow
        { regex: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|\w+\s*=>)/, type: 'const' },
        // method inside class: async? methodName(
        { regex: /^\s*(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{?/, type: 'method' },
      ];
    
    case 'python':
      return [
        // class ClassName
        { regex: /^(\s*)class\s+(\w+)/, type: 'class' },
        // def function_name or async def
        { regex: /^(\s*)(?:async\s+)?def\s+(\w+)/, type: 'function' },
      ];
    
    case 'go':
      return [
        // func functionName or func (receiver) methodName
        { regex: /^func\s+(?:\([^)]+\)\s+)?(\w+)/, type: 'function' },
        // type TypeName struct/interface
        { regex: /^type\s+(\w+)\s+(?:struct|interface)/, type: 'type' },
      ];
    
    case 'rust':
      return [
        // fn function_name
        { regex: /^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/, type: 'function' },
        // impl TypeName
        { regex: /^\s*impl(?:<[^>]+>)?\s+(\w+)/, type: 'class' },
        // struct StructName
        { regex: /^\s*(?:pub\s+)?struct\s+(\w+)/, type: 'type' },
      ];
    
    case 'java':
      return [
        // class ClassName
        { regex: /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+(\w+)/, type: 'class' },
        // interface InterfaceName
        { regex: /^\s*(?:public|private|protected)?\s*interface\s+(\w+)/, type: 'interface' },
        // method: returnType methodName(
        { regex: /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/, type: 'method' },
      ];
    
    default:
      return [];
  }
}

/**
 * Format context match to string
 */
function formatContext(match: ContextMatch): string {
  switch (match.type) {
    case 'class':
      return `class ${match.name}`;
    case 'interface':
      return `interface ${match.name}`;
    case 'type':
      return `type ${match.name}`;
    case 'function':
      return `function ${match.name}()`;
    case 'method':
      return `${match.name}()`;
    case 'const':
      return `const ${match.name}`;
    default:
      return match.name;
  }
}

/**
 * Count occurrences of a character in a string
 */
function countChar(str: string, char: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) count++;
  }
  return count;
}

/**
 * Get indentation level (number of leading spaces/tabs)
 */
function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  if (!match) return 0;
  
  // Count spaces; tabs count as 4 spaces
  let level = 0;
  for (const char of match[1] ?? '') {
    level += char === '\t' ? 4 : 1;
  }
  return level;
}

/**
 * Extract all contexts from a file (for indexing)
 */
export function extractAllContexts(
  content: string,
  language: SupportedLanguage
): Map<number, ContextMatch> {
  const contexts = new Map<number, ContextMatch>();
  
  if (language === 'unknown') {
    return contexts;
  }
  
  const lines = content.split('\n');
  const patterns = getPatterns(language);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const name = match[1] ?? match[2] ?? 'unknown';
        contexts.set(i + 1, { type: pattern.type, name, line: i + 1 });
        break; // Only one context per line
      }
    }
  }
  
  return contexts;
}
