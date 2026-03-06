/**
 * Watch Command Tests (M3)
 *
 * Tests the nimbus watch command which watches files and triggers agent runs.
 * Validates glob matching, option parsing, and command export.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Import and verify exports
// ---------------------------------------------------------------------------

describe('watchCommand exports', () => {
  it('watchCommand is exported from commands/watch.ts', async () => {
    const { watchCommand } = await import('../commands/watch');
    expect(typeof watchCommand).toBe('function');
  });

  it('WatchOptions interface supports required fields', () => {
    // Type-level check via source inspection
    const src = readFileSync(join(process.cwd(), 'src/commands/watch.ts'), 'utf-8');
    expect(src).toContain('glob: string');
    expect(src).toContain('run?:');
    expect(src).toContain('debounce?:');
    expect(src).toContain('autoApprove?:');
    expect(src).toContain('maxRuns?:');
  });
});

// ---------------------------------------------------------------------------
// Glob matching logic (inline reproduction)
// ---------------------------------------------------------------------------

function matchGlob(filename: string, pattern: string): boolean {
  const f = filename.replace(/\\/g, '/');
  const p = pattern.replace(/\\/g, '/');

  const regexStr = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__GLOBSTAR__/g, '.*');

  const re = new RegExp(`^${regexStr}$`);
  const { basename } = require('node:path');
  const base = basename(f);
  return re.test(f) || (!/\//.test(p) && re.test(base));
}

describe('matchGlob (M3 — watch command glob matching)', () => {
  it('matches *.tf against main.tf', () => {
    expect(matchGlob('main.tf', '*.tf')).toBe(true);
  });

  it('matches *.tf against variables.tf', () => {
    expect(matchGlob('variables.tf', '*.tf')).toBe(true);
  });

  it('does not match *.tf against main.ts', () => {
    expect(matchGlob('main.ts', '*.tf')).toBe(false);
  });

  it('matches *.yaml against deploy.yaml', () => {
    expect(matchGlob('deploy.yaml', '*.yaml')).toBe(true);
  });

  it('matches *.yaml against deploy.yml', () => {
    expect(matchGlob('deploy.yml', '*.yaml')).toBe(false);
  });

  it('matches *.yml against deploy.yml', () => {
    expect(matchGlob('deploy.yml', '*.yml')).toBe(true);
  });

  it('matches src/** against src/index.ts', () => {
    expect(matchGlob('src/index.ts', 'src/**')).toBe(true);
  });

  it('matches src/** against src/utils/helper.ts', () => {
    expect(matchGlob('src/utils/helper.ts', 'src/**')).toBe(true);
  });

  it('does not match src/** against lib/index.ts', () => {
    expect(matchGlob('lib/index.ts', 'src/**')).toBe(false);
  });

  it('matches Dockerfile exactly', () => {
    expect(matchGlob('Dockerfile', 'Dockerfile')).toBe(true);
  });

  it('matches nested *.tf in subdir', () => {
    expect(matchGlob('modules/vpc/main.tf', '*.tf')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLI wiring — watch is registered in cli.ts
// ---------------------------------------------------------------------------

describe('watch command wired in CLI (M3)', () => {
  it('cli.ts contains nimbus watch handler', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    expect(src).toContain("command === 'watch'");
  });

  it('cli.ts imports watchCommand from commands/watch', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    expect(src).toContain("import('./commands/watch')");
  });

  it('cli.ts parses --run flag for watch', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    expect(src).toContain("watchOptions.run = args[++i]");
  });

  it('cli.ts parses --debounce flag for watch', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    expect(src).toContain("watchOptions.debounce");
  });

  it('cli.ts parses --auto-approve flag for watch', () => {
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    expect(src).toContain("watchOptions.autoApprove = true");
  });
});
