/**
 * SQLite Compat Layer Tests — G1
 *
 * Validates that the sqlite compat module:
 * - Has proper fallback entries in package.json optionalDependencies
 * - Contains sql.js fallback code
 * - Contains the in-memory warning text
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

describe('package.json SQLite compat configuration (G1)', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8')) as {
    scripts?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  it('has better-sqlite3 in optionalDependencies', () => {
    expect(pkg.optionalDependencies).toBeDefined();
    expect(Object.keys(pkg.optionalDependencies!)).toContain('better-sqlite3');
  });

  it('has sql.js in optionalDependencies', () => {
    expect(pkg.optionalDependencies).toBeDefined();
    expect(Object.keys(pkg.optionalDependencies!)).toContain('sql.js');
  });

  it('has a prepack script defined', () => {
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts!['prepack']).toBeDefined();
    expect(typeof pkg.scripts!['prepack']).toBe('string');
  });
});

describe('src/compat/sqlite.ts fallback implementation (G1)', () => {
  const sqliteSrc = readFileSync(join(ROOT, 'src', 'compat', 'sqlite.ts'), 'utf-8');

  it('contains the sql.js fallback require call', () => {
    expect(sqliteSrc).toContain('sql.js');
  });

  it('contains the sql.js persistence implementation', () => {
    // sql.js fallback now persists to disk via node:fs (file-backed, not in-memory)
    expect(sqliteSrc).toContain('persist');
  });

  it('contains the better-sqlite3 require call', () => {
    expect(sqliteSrc).toContain('better-sqlite3');
  });

  it('defines a SqlJsDatabase class for the fallback path', () => {
    expect(sqliteSrc).toContain('SqlJsDatabase');
  });

  it('exports exec, prepare, and close methods in SqlJsDatabase', () => {
    expect(sqliteSrc).toContain('exec(sql');
    expect(sqliteSrc).toContain('prepare(sql');
    expect(sqliteSrc).toContain('close()');
  });

  it('contains install hint for better-sqlite3', () => {
    expect(sqliteSrc).toContain('npm install better-sqlite3');
  });
});
