import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
    globals: true,
    testTimeout: 30000, // 30s for RAG tests with model loading
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/mcp/**'],
      exclude: [
        'src/mcp/ui/**', // Exclude TUI components
        'src/commands/**', // Exclude wizard flows
        '**/*.test.ts',
      ],
      reporter: ['text', 'text-summary', 'html'],
    },
  },
});
