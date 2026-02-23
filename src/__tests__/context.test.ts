/**
 * Context Manager Tests (@file Reference System)
 *
 * Validates @file mention extraction, path resolution, token budgeting,
 * context injection formatting, and fuzzy file search.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  resolveReferences,
  buildContextInjection,
  fuzzyFileSearch,
  type FileReference,
} from '../agent/context';

// ---------------------------------------------------------------------------
// Temp directory setup
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-context-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ===========================================================================
// extractMentions (tested through resolveReferences)
// ===========================================================================

describe('extractMentions (via resolveReferences)', () => {
  test('finds @path patterns in messages', async () => {
    // Create a file so it can be resolved
    const filePath = path.join(tmpDir, 'server.ts');
    fs.writeFileSync(filePath, 'export const app = {};', 'utf-8');

    const result = await resolveReferences('@server.ts fix the bug', { cwd: tmpDir });
    expect(result.references).toHaveLength(1);
    expect(result.references[0].resolvedPath).toBe(filePath);
  });

  test('skips @agent mentions (explore, infra, etc.)', async () => {
    const result = await resolveReferences('@explore find TODOs', { cwd: tmpDir });
    expect(result.references).toHaveLength(0);
    expect(result.processedMessage).toBe('@explore find TODOs');
  });

  test('skips @security mentions', async () => {
    const result = await resolveReferences('@security scan the code', { cwd: tmpDir });
    expect(result.references).toHaveLength(0);
  });

  test('skips @cost mentions', async () => {
    const result = await resolveReferences('@cost estimate spending', { cwd: tmpDir });
    expect(result.references).toHaveLength(0);
  });

  test('returns unmodified message when no mentions', async () => {
    const result = await resolveReferences('just a normal message', { cwd: tmpDir });
    expect(result.processedMessage).toBe('just a normal message');
    expect(result.references).toHaveLength(0);
    expect(result.totalTokens).toBe(0);
    expect(result.truncated).toBe(false);
  });
});

// ===========================================================================
// resolveReferences
// ===========================================================================

describe('resolveReferences', () => {
  test('resolves a real file path', async () => {
    const filePath = path.join(tmpDir, 'config.yaml');
    const content = 'port: 3000\nhost: localhost';
    fs.writeFileSync(filePath, content, 'utf-8');

    const result = await resolveReferences('@config.yaml check the port', { cwd: tmpDir });
    expect(result.references).toHaveLength(1);
    expect(result.references[0].content).toBe(content);
    expect(result.references[0].isDirectory).toBe(false);
  });

  test('handles non-existent files gracefully', async () => {
    const result = await resolveReferences('@nonexistent.txt do something', { cwd: tmpDir });
    // Non-existent file is simply skipped
    expect(result.references).toHaveLength(0);
  });

  test('respects token budget', async () => {
    // Create a large file (200KB ~ 50K tokens at 4 chars/token)
    const largeContent = 'x'.repeat(250_000);
    const filePath = path.join(tmpDir, 'big.txt');
    fs.writeFileSync(filePath, largeContent, 'utf-8');

    const result = await resolveReferences('@big.txt analyze this', {
      cwd: tmpDir,
      maxTokens: 1000, // very small budget
    });

    // Should be truncated
    expect(result.truncated).toBe(true);
    if (result.references.length > 0) {
      expect(result.references[0].content.length).toBeLessThan(largeContent.length);
    }
  });

  test('processes directory references', async () => {
    const subDir = path.join(tmpDir, 'src');
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, 'index.ts'), 'export {};', 'utf-8');
    fs.writeFileSync(path.join(subDir, 'utils.ts'), 'export {};', 'utf-8');

    const result = await resolveReferences('@src/ list contents', { cwd: tmpDir });
    if (result.references.length > 0) {
      expect(result.references[0].isDirectory).toBe(true);
      expect(result.references[0].content).toContain('index.ts');
      expect(result.references[0].content).toContain('utils.ts');
    }
  });

  test('replaces @mention with [File: ...] in processedMessage', async () => {
    const filePath = path.join(tmpDir, 'app.ts');
    fs.writeFileSync(filePath, 'const app = 1;', 'utf-8');

    const result = await resolveReferences('@app.ts fix it', { cwd: tmpDir });
    expect(result.processedMessage).toContain('[File: app.ts]');
    expect(result.processedMessage).not.toContain('@app.ts');
  });
});

// ===========================================================================
// buildContextInjection
// ===========================================================================

describe('buildContextInjection', () => {
  test('formats references as markdown', () => {
    const refs: FileReference[] = [
      {
        mention: '@server.ts',
        resolvedPath: '/project/src/server.ts',
        isDirectory: false,
        content: 'const server = http.createServer();',
        tokenCount: 10,
      },
    ];

    const injection = buildContextInjection(refs);
    expect(injection).toContain('# Referenced Files');
    expect(injection).toContain('### File: /project/src/server.ts');
    expect(injection).toContain('const server = http.createServer();');
    expect(injection).toContain('```');
  });

  test('returns empty string for empty references array', () => {
    expect(buildContextInjection([])).toBe('');
  });

  test('formats directory references with directory header', () => {
    const refs: FileReference[] = [
      {
        mention: '@src/',
        resolvedPath: '/project/src',
        isDirectory: true,
        content: 'Directory listing...',
        tokenCount: 5,
      },
    ];

    const injection = buildContextInjection(refs);
    expect(injection).toContain('### Directory: /project/src');
  });

  test('formats multiple references', () => {
    const refs: FileReference[] = [
      {
        mention: '@a.ts',
        resolvedPath: '/project/a.ts',
        isDirectory: false,
        content: 'file a',
        tokenCount: 2,
      },
      {
        mention: '@b.ts',
        resolvedPath: '/project/b.ts',
        isDirectory: false,
        content: 'file b',
        tokenCount: 2,
      },
    ];

    const injection = buildContextInjection(refs);
    expect(injection).toContain('### File: /project/a.ts');
    expect(injection).toContain('### File: /project/b.ts');
    expect(injection).toContain('file a');
    expect(injection).toContain('file b');
  });
});

// ===========================================================================
// fuzzyFileSearch
// ===========================================================================

describe('fuzzyFileSearch', () => {
  test('finds files by partial name', async () => {
    fs.writeFileSync(path.join(tmpDir, 'server.ts'), '', 'utf-8');
    fs.writeFileSync(path.join(tmpDir, 'config.yaml'), '', 'utf-8');

    const results = await fuzzyFileSearch('server', tmpDir);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.endsWith('server.ts'))).toBe(true);
  });

  test('finds exact matches first', async () => {
    const exactPath = path.join(tmpDir, 'exact.ts');
    fs.writeFileSync(exactPath, '', 'utf-8');

    const results = await fuzzyFileSearch('exact.ts', tmpDir);
    expect(results).toHaveLength(1);
    expect(results[0]).toBe(exactPath);
  });

  test('returns empty array when no matches', async () => {
    const results = await fuzzyFileSearch('does-not-exist-xyz', tmpDir);
    expect(results).toHaveLength(0);
  });

  test('returns at most 10 results', async () => {
    // Create 15 similarly named files
    for (let i = 0; i < 15; i++) {
      fs.writeFileSync(path.join(tmpDir, `match-${i}.ts`), '', 'utf-8');
    }

    const results = await fuzzyFileSearch('match', tmpDir);
    expect(results.length).toBeLessThanOrEqual(10);
  });
});
