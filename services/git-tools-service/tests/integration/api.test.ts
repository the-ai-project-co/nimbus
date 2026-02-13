import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../src/server';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Git Tools Service API Integration', () => {
  let server: any;
  const PORT = 14004;
  const TEST_DIR = '/tmp/git-integration-test';

  beforeAll(async () => {
    // Start server
    server = await startServer(PORT);

    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Stop server
    server?.stop();

    // Cleanup test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe('Health Check Integration', () => {
    test('should respond to health check', async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('git-tools-service');
      expect(data.version).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Git Init Integration', () => {
    test('should initialize a git repository', async () => {
      const repoPath = path.join(TEST_DIR, 'init-test');
      await fs.mkdir(repoPath, { recursive: true });

      const response = await fetch(`http://localhost:${PORT}/api/git/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify .git directory exists
      const gitDir = path.join(repoPath, '.git');
      const exists = await fs.access(gitDir).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe('Git Status Integration', () => {
    test('should get status of a git repository', async () => {
      const repoPath = path.join(TEST_DIR, 'status-test');
      await fs.mkdir(repoPath, { recursive: true });

      // First init the repo
      await fetch(`http://localhost:${PORT}/api/git/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath }),
      });

      // Then get status
      const response = await fetch(`http://localhost:${PORT}/api/git/status?path=${encodeURIComponent(repoPath)}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.isClean).toBeDefined();
    });
  });

  describe('Git Add Integration', () => {
    test('should add files to staging', async () => {
      const repoPath = path.join(TEST_DIR, 'add-test');
      await fs.mkdir(repoPath, { recursive: true });

      // Init repo
      await fetch(`http://localhost:${PORT}/api/git/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath }),
      });

      // Create a file
      await fs.writeFile(path.join(repoPath, 'test.txt'), 'test content');

      // Add the file
      const response = await fetch(`http://localhost:${PORT}/api/git/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath, files: '.' }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Git Commit Integration', () => {
    test('should commit staged changes', async () => {
      const repoPath = path.join(TEST_DIR, 'commit-test');
      await fs.mkdir(repoPath, { recursive: true });

      // Init repo
      await fetch(`http://localhost:${PORT}/api/git/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath }),
      });

      // Create and add a file
      await fs.writeFile(path.join(repoPath, 'test.txt'), 'test content');

      await fetch(`http://localhost:${PORT}/api/git/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath, files: '.' }),
      });

      // Commit
      const response = await fetch(`http://localhost:${PORT}/api/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: repoPath,
          message: 'Test commit',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Git Branch Integration', () => {
    test('should create a branch', async () => {
      const repoPath = path.join(TEST_DIR, 'branch-test');
      await fs.mkdir(repoPath, { recursive: true });

      // Init repo with initial commit
      await fetch(`http://localhost:${PORT}/api/git/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath }),
      });

      await fs.writeFile(path.join(repoPath, 'test.txt'), 'content');

      await fetch(`http://localhost:${PORT}/api/git/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath, files: '.' }),
      });

      await fetch(`http://localhost:${PORT}/api/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath, message: 'Initial commit' }),
      });

      // Create branch
      const response = await fetch(`http://localhost:${PORT}/api/git/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: repoPath,
          name: 'feature-branch',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Git Log Integration', () => {
    test('should get commit log', async () => {
      const repoPath = path.join(TEST_DIR, 'log-test');
      await fs.mkdir(repoPath, { recursive: true });

      // Init and commit
      await fetch(`http://localhost:${PORT}/api/git/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath }),
      });

      await fs.writeFile(path.join(repoPath, 'test.txt'), 'content');

      await fetch(`http://localhost:${PORT}/api/git/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath, files: '.' }),
      });

      await fetch(`http://localhost:${PORT}/api/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath, message: 'Test commit for log' }),
      });

      // Get log
      const response = await fetch(`http://localhost:${PORT}/api/git/log?path=${encodeURIComponent(repoPath)}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.total).toBeGreaterThan(0);
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle missing required fields', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test('should handle non-existent repository', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/status?path=/nonexistent/path`);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
