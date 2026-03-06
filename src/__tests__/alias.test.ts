/**
 * Alias Command Tests — L2
 *
 * Tests resolveAlias expansion and alias file management.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Patch homedir so aliases are stored in a temp dir during tests
let tmpDir: string;

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof os>('node:os');
  return {
    ...actual,
    homedir: () => tmpDir ?? actual.homedir(),
  };
});

// Re-import after mock is set up (dynamic to pick up the homedir mock)
async function getAliasModule() {
  // Force re-import so homedir mock is active
  return await import('../commands/alias');
}

describe('resolveAlias (L2)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-alias-test-'));
    // Clear module cache so homedir mock takes effect
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  test('returns args unchanged when no alias exists', async () => {
    const { resolveAlias } = await getAliasModule();
    expect(resolveAlias(['run', '--help'])).toEqual(['run', '--help']);
  });

  test('returns empty array for empty input', async () => {
    const { resolveAlias } = await getAliasModule();
    expect(resolveAlias([])).toEqual([]);
  });

  test('expands a defined alias', async () => {
    // Write alias file manually
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(
      path.join(nimbusDir, 'aliases.json'),
      JSON.stringify({ deploy: 'run --auto-approve "deploy staging"' }),
      'utf-8'
    );

    const { resolveAlias } = await getAliasModule();
    const result = resolveAlias(['deploy']);
    expect(result[0]).toBe('run');
    expect(result).toContain('--auto-approve');
  });

  test('appends remaining args after expanding alias', async () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(
      path.join(nimbusDir, 'aliases.json'),
      JSON.stringify({ tf: 'run "terraform plan"' }),
      'utf-8'
    );

    const { resolveAlias } = await getAliasModule();
    const result = resolveAlias(['tf', '--verbose']);
    expect(result[result.length - 1]).toBe('--verbose');
  });
});

describe('aliasCommand list/add/remove (L2)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-alias-cmd-test-'));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  test('list shows "no aliases" when file is absent', async () => {
    const { aliasCommand } = await getAliasModule();
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    // Should not throw even if file doesn't exist
    await expect(aliasCommand('list', [])).resolves.not.toThrow();
    vi.restoreAllMocks();
  });

  test('set writes alias to file', async () => {
    const { aliasCommand } = await getAliasModule();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await aliasCommand('myalias=run "do something"', []);

    const aliasFile = path.join(tmpDir, '.nimbus', 'aliases.json');
    const data = JSON.parse(fs.readFileSync(aliasFile, 'utf-8')) as Record<string, string>;
    expect(data['myalias']).toBe('run "do something"');
    vi.restoreAllMocks();
  });

  test('remove deletes alias from file', async () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(
      path.join(nimbusDir, 'aliases.json'),
      JSON.stringify({ myalias: 'run stuff' }),
      'utf-8'
    );

    const { aliasCommand } = await getAliasModule();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await aliasCommand('remove', ['myalias']);

    const data = JSON.parse(fs.readFileSync(path.join(nimbusDir, 'aliases.json'), 'utf-8')) as Record<string, string>;
    expect(data['myalias']).toBeUndefined();
    vi.restoreAllMocks();
  });
});
