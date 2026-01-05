/**
 * Constants for file indexing and scanning
 */

/**
 * File extensions that should be indexed for semantic search
 */
export const INDEXABLE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.go',
  '.rs',
  '.java', '.kt', '.kts',
  '.c', '.cpp', '.h', '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.md', '.mdx',
  '.json', '.yaml', '.yml', '.toml',
  '.sh', '.bash', '.zsh',
  '.sql',
  '.html', '.css', '.scss', '.sass', '.less'
];

/**
 * File extensions that are specifically code files (not config/docs)
 */
export const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.go',
  '.rs',
  '.java', '.kt', '.kts',
  '.c', '.cpp', '.h', '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.sh', '.bash', '.zsh',
  '.sql'
];

/**
 * Directories to skip during scanning
 */
export const SKIP_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  'venv',
  '.venv',
  'target',
  'vendor'
];
