#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Get the directory of this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to tsx in node_modules
const tsxPath = join(__dirname, '..', 'node_modules', '.bin', 'tsx');

// Path to the main TypeScript file
const mainPath = join(__dirname, '..', 'src', 'index.ts');

// Get command line arguments (skip node and script path)
const args = process.argv.slice(2);

// Spawn tsx with the main file and pass through all arguments
const child = spawn(tsxPath, [mainPath, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
});

// Exit with the same code as the child process
child.on('exit', (code) => {
  process.exit(code ?? 0);
});

// Forward signals
child.on('error', (err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
