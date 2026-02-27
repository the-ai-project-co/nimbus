/**
 * Tests for embedded tool operation classes:
 *   - src/tools/file-ops.ts – FileSystemOperations
 *   - src/tools/git-ops.ts  – GitOperations
 *
 * These tests verify that the classes can be instantiated and that their
 * fundamental read/exists operations work against the real filesystem.
 * Git network operations (clone, push, pull) are NOT exercised here to keep
 * tests fast and hermetic.
 */

import { describe, it, expect } from 'bun:test';
import { join } from 'node:path';
import { FileSystemOperations } from '../tools/file-ops';
import { GitOperations } from '../tools/git-ops';

// The repository root is two levels above this test file: src/__tests__/ -> src/ -> repo-root
const REPO_ROOT = join(import.meta.dir, '..', '..');

// ---------------------------------------------------------------------------
// FileSystemOperations
// ---------------------------------------------------------------------------

describe('FileSystemOperations', () => {
  it('can be instantiated with no arguments (defaults to cwd)', () => {
    const ops = new FileSystemOperations();
    expect(ops).toBeInstanceOf(FileSystemOperations);
  });

  it('can be instantiated with a specific base path', () => {
    const ops = new FileSystemOperations(REPO_ROOT);
    expect(ops).toBeInstanceOf(FileSystemOperations);
  });

  it('readFile reads the package.json at the repo root', async () => {
    const ops = new FileSystemOperations(REPO_ROOT);
    const content = await ops.readFile('package.json');
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
    // Verify it is valid JSON containing expected nimbus fields
    const pkg = JSON.parse(content);
    expect(pkg.name).toBe('@build-astron-co/nimbus');
  });

  it('exists() returns true for a known file', async () => {
    const ops = new FileSystemOperations(REPO_ROOT);
    const result = await ops.exists('package.json');
    expect(result).toBe(true);
  });

  it('exists() returns false for a non-existent path', async () => {
    const ops = new FileSystemOperations(REPO_ROOT);
    const result = await ops.exists('this-file-does-not-exist-abc123.txt');
    expect(result).toBe(false);
  });

  it('stat() returns file statistics for package.json', async () => {
    const ops = new FileSystemOperations(REPO_ROOT);
    const stats = await ops.stat('package.json');

    expect(stats.isFile).toBe(true);
    expect(stats.isDirectory).toBe(false);
    expect(stats.size).toBeGreaterThan(0);
    expect(stats.modifiedAt).toBeInstanceOf(Date);
  });

  it('readDir() lists the src directory', async () => {
    const ops = new FileSystemOperations(REPO_ROOT);
    const entries = await ops.readDir('src');

    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    // src/ contains at least app.ts and version.ts
    const names = entries.map(e => e.name);
    expect(names).toContain('app.ts');
    expect(names).toContain('version.ts');
  });

  it('readFile throws when attempting to read a sensitive file', async () => {
    const ops = new FileSystemOperations(REPO_ROOT);
    // .env files are blocked by the sensitive-file guard
    await expect(ops.readFile('.env')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GitOperations
// ---------------------------------------------------------------------------

describe('GitOperations', () => {
  it('can be instantiated with no arguments (defaults to cwd)', () => {
    const git = new GitOperations();
    expect(git).toBeInstanceOf(GitOperations);
  });

  it('can be instantiated with a specific repo path', () => {
    const git = new GitOperations(REPO_ROOT);
    expect(git).toBeInstanceOf(GitOperations);
  });

  it('isRepo() returns true for the nimbus repository', async () => {
    const git = new GitOperations(REPO_ROOT);
    const result = await git.isRepo();
    expect(result).toBe(true);
  });

  it('currentBranch() returns a non-empty string', async () => {
    const git = new GitOperations(REPO_ROOT);
    const branch = await git.currentBranch();
    expect(typeof branch).toBe('string');
    expect(branch.length).toBeGreaterThan(0);
  });

  it('status() returns a status result with expected shape', async () => {
    const git = new GitOperations(REPO_ROOT);
    const status = await git.status();
    // StatusResult from simple-git has a `current` property and isClean()
    expect(typeof status.isClean).toBe('function');
    expect(typeof status.current).toBe('string');
  });

  it('listBranches() returns current branch and branch list', async () => {
    const git = new GitOperations(REPO_ROOT);
    const { current, branches } = await git.listBranches();
    expect(typeof current).toBe('string');
    expect(Array.isArray(branches)).toBe(true);
    expect(branches.length).toBeGreaterThan(0);
  });

  it('listTags() returns an array', async () => {
    const git = new GitOperations(REPO_ROOT);
    const tags = await git.listTags();
    expect(Array.isArray(tags)).toBe(true);
  });

  it('getShortHash() returns a short commit hash string', async () => {
    const git = new GitOperations(REPO_ROOT);
    const hash = await git.getShortHash('HEAD');
    expect(typeof hash).toBe('string');
    // Short hashes are typically 7–12 hex characters
    expect(/^[0-9a-f]{4,12}$/.test(hash)).toBe(true);
  });
});
