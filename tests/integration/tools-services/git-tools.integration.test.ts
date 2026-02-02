/**
 * Integration tests for Git Tools Service
 *
 * These tests verify end-to-end git operations through the HTTP API
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { startServer } from '../../../services/git-tools-service/src/server';
import { waitForService, createTestClient, getTestPorts, createTempDir, removeTempDir } from '../../utils/test-helpers';
import { $ } from 'bun';
import { join } from 'node:path';

describe('Git Tools Service Integration Tests', () => {
  let server: any;
  let client: ReturnType<typeof createTestClient>;
  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;
  let tempDir: string;
  let repoDir: string;

  beforeAll(async () => {
    server = await startServer(ports.http);
    const ready = await waitForService(BASE_URL);
    if (!ready) {
      throw new Error('Git Tools Service failed to start');
    }
    client = createTestClient(BASE_URL);
  });

  afterAll(() => {
    server?.stop?.();
  });

  beforeEach(async () => {
    tempDir = await createTempDir('git-integration-');
    repoDir = join(tempDir, 'repo');
    await $`mkdir -p ${repoDir}`;
    await $`cd ${repoDir} && git init`;
    await $`cd ${repoDir} && git config user.email "test@integration.test"`;
    await $`cd ${repoDir} && git config user.name "Integration Test"`;
  });

  afterEach(async () => {
    if (tempDir) {
      await removeTempDir(tempDir);
    }
  });

  describe('Repository Status', () => {
    test('returns clean status for empty repo', async () => {
      const { status, data } = await client.get(`/api/git/status?path=${encodeURIComponent(repoDir)}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.isClean).toBe(true);
    });

    test('detects untracked files', async () => {
      await Bun.write(join(repoDir, 'new-file.txt'), 'content');

      const { status, data } = await client.get(`/api/git/status?path=${encodeURIComponent(repoDir)}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.isClean).toBe(false);
      expect(data.data.not_added).toContain('new-file.txt');
    });

    test('detects staged files', async () => {
      await Bun.write(join(repoDir, 'staged.txt'), 'content');
      await $`cd ${repoDir} && git add staged.txt`;

      const { status, data } = await client.get(`/api/git/status?path=${encodeURIComponent(repoDir)}`);

      expect(status).toBe(200);
      expect(data.data.staged).toContain('staged.txt');
    });
  });

  describe('Git Add and Commit Workflow', () => {
    test('adds files to staging', async () => {
      await Bun.write(join(repoDir, 'file.txt'), 'content');

      const { status, data } = await client.post('/api/git/add', {
        path: repoDir,
        files: 'file.txt',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify file is staged
      const statusResult = await client.get(`/api/git/status?path=${encodeURIComponent(repoDir)}`);
      expect(statusResult.data.data.staged).toContain('file.txt');
    });

    test('creates commit with message', async () => {
      await Bun.write(join(repoDir, 'commit-test.txt'), 'content');
      await $`cd ${repoDir} && git add commit-test.txt`;

      const { status, data } = await client.post('/api/git/commit', {
        path: repoDir,
        message: 'Test commit message',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.hash).toBeDefined();
      expect(data.data.hash.length).toBeGreaterThan(0);
    });

    test('full add-commit workflow', async () => {
      // Create multiple files
      await Bun.write(join(repoDir, 'file1.txt'), 'content1');
      await Bun.write(join(repoDir, 'file2.txt'), 'content2');

      // Add all files
      const addResult = await client.post('/api/git/add', {
        path: repoDir,
        files: '.',
      });
      expect(addResult.status).toBe(200);

      // Commit
      const commitResult = await client.post('/api/git/commit', {
        path: repoDir,
        message: 'Add multiple files',
      });
      expect(commitResult.status).toBe(200);

      // Verify clean status
      const statusResult = await client.get(`/api/git/status?path=${encodeURIComponent(repoDir)}`);
      expect(statusResult.data.data.isClean).toBe(true);
    });
  });

  describe('Branch Operations', () => {
    beforeEach(async () => {
      // Create initial commit for branch operations
      await Bun.write(join(repoDir, 'initial.txt'), 'initial');
      await $`cd ${repoDir} && git add . && git commit -m "Initial commit"`;
    });

    test('lists branches', async () => {
      const { status, data } = await client.get(`/api/git/branches?path=${encodeURIComponent(repoDir)}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.current).toBeDefined();
      expect(Array.isArray(data.data.branches)).toBe(true);
    });

    test('creates new branch', async () => {
      const { status, data } = await client.post('/api/git/branch', {
        path: repoDir,
        name: 'feature-branch',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify branch was created
      const branchResult = await client.get(`/api/git/branches?path=${encodeURIComponent(repoDir)}`);
      expect(branchResult.data.data.branches).toContain('feature-branch');
    });

    test('checks out branch', async () => {
      // Create branch first
      await client.post('/api/git/branch', { path: repoDir, name: 'new-branch' });

      // Checkout
      const { status, data } = await client.post('/api/git/checkout', {
        path: repoDir,
        target: 'new-branch',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify current branch
      const currentResult = await client.get(`/api/git/current-branch?path=${encodeURIComponent(repoDir)}`);
      expect(currentResult.data.data.branch).toBe('new-branch');
    });
  });

  describe('Diff and Log', () => {
    beforeEach(async () => {
      await Bun.write(join(repoDir, 'tracked.txt'), 'original content');
      await $`cd ${repoDir} && git add . && git commit -m "Initial"`;
    });

    test('shows diff for modified file', async () => {
      await Bun.write(join(repoDir, 'tracked.txt'), 'modified content');

      const { status, data } = await client.get(`/api/git/diff?path=${encodeURIComponent(repoDir)}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.diff).toContain('modified');
    });

    test('returns commit log', async () => {
      // Add more commits
      await Bun.write(join(repoDir, 'file2.txt'), 'content');
      await $`cd ${repoDir} && git add . && git commit -m "Second commit"`;

      const { status, data } = await client.get(`/api/git/log?path=${encodeURIComponent(repoDir)}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.total).toBeGreaterThanOrEqual(2);
      expect(data.data.all.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Repository Initialization', () => {
    test('initializes new repository', async () => {
      const newRepoDir = join(tempDir, 'new-repo');
      await $`mkdir -p ${newRepoDir}`;

      const { status, data } = await client.post('/api/git/init', {
        path: newRepoDir,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify .git directory exists
      const gitDir = await Bun.file(join(newRepoDir, '.git')).exists();
      // .git is a directory, not a file, so we check differently
      const { exitCode } = await $`test -d ${newRepoDir}/.git`.nothrow();
      expect(exitCode).toBe(0);
    });
  });
});
