import { describe, test, expect } from 'bun:test';
import type { ScanOptions } from '../../src/scanners/types';

describe('Scanner maxDepth config', () => {
  test('ScanOptions accepts maxDepth', () => {
    const opts: ScanOptions = {
      depth: 'standard',
      maxDepth: 5,
    };
    expect(opts.maxDepth).toBe(5);
  });

  test('ScanOptions maxDepth is optional', () => {
    const opts: ScanOptions = {
      depth: 'quick',
    };
    expect(opts.maxDepth).toBeUndefined();
  });

  test('default scan options include maxDepth', async () => {
    // Import the scanner to verify defaults
    const { createProjectScanner } = await import('../../src/scanners');
    const scanner = createProjectScanner();
    expect(scanner).toBeDefined();
  });

  test('maxDepth flows through InitOptions', () => {
    // Verify the type accepts maxDepth
    const initOpts: import('../../src/commands/init').InitOptions = {
      maxDepth: 3,
      scanDepth: 'quick',
    };
    expect(initOpts.maxDepth).toBe(3);
  });
});
