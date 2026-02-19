import { describe, test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Ink Confirmation and Progress components', () => {
  test('Confirmation module exports a function', async () => {
    const mod = await import('../../src/ui/ink/Confirmation');
    expect(typeof mod.Confirmation).toBe('function');
  });

  test('Progress module exports a function', async () => {
    const mod = await import('../../src/ui/ink/Progress');
    expect(typeof mod.Progress).toBe('function');
  });

  test('Confirmation.tsx source exists and has expected structure', async () => {
    const filePath = path.resolve(__dirname, '../../src/ui/ink/Confirmation.tsx');
    const source = await fs.readFile(filePath, 'utf-8');

    expect(source).toContain('interface ConfirmationProps');
    expect(source).toContain('message');
    expect(source).toContain('onConfirm');
    expect(source).toContain('onCancel');
    expect(source).toContain('defaultValue');
    expect(source).toContain('useInput');
  });

  test('Progress.tsx source exists and has expected structure', async () => {
    const filePath = path.resolve(__dirname, '../../src/ui/ink/Progress.tsx');
    const source = await fs.readFile(filePath, 'utf-8');

    expect(source).toContain('interface ProgressProps');
    expect(source).toContain('value');
    expect(source).toContain('showPercentage');
    expect(source).toContain('label');
    expect(source).toContain('width');
  });

  test('index re-exports Confirmation and Progress', async () => {
    const mod = await import('../../src/ui/ink/index');
    expect(mod.Confirmation).toBeDefined();
    expect(mod.Progress).toBeDefined();
    expect(typeof mod.Confirmation).toBe('function');
    expect(typeof mod.Progress).toBe('function');
  });

  test('Confirmation uses Yes/No toggle pattern', async () => {
    const filePath = path.resolve(__dirname, '../../src/ui/ink/Confirmation.tsx');
    const source = await fs.readFile(filePath, 'utf-8');

    expect(source).toContain('Yes');
    expect(source).toContain('No');
    expect(source).toContain('useState');
  });

  test('Progress renders a progress bar', async () => {
    const filePath = path.resolve(__dirname, '../../src/ui/ink/Progress.tsx');
    const source = await fs.readFile(filePath, 'utf-8');

    // Should use block characters for the bar (escaped in source)
    expect(source).toContain('\\u2588');
    expect(source).toContain('\\u2591');
    expect(source).toContain('percent');
  });
});
