import { describe, it, expect } from 'vitest';

describe('Vitest Setup', () => {
  it('should run a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should work with async tests', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });

  it('should support ESM imports', async () => {
    // Verify ESM dynamic imports work
    const fs = await import('fs');
    expect(typeof fs.existsSync).toBe('function');
  });
});
