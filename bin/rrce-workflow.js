#!/usr/bin/env node
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register tsx for TypeScript support
register('tsx/esm', pathToFileURL('./'));

// Import and run the main module
import('../src/index.ts');
