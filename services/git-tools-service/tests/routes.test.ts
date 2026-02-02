import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { startServer } from '../src/server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

describe('Git Tools Service Routes', () => {
  let server: any;
  const PORT = 3104; // Different port to avoid conflicts
  let tempDir: string;
  let repoDir: string;

  beforeAll(async () => {
    server = await startServer(PORT);
  });

  afterAll(() => {
    server?.stop();
  });

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'git-test-'));
    repoDir = join(tempDir, 'repo');

    // Initialize a git repo for testing
    await $`mkdir -p ${repoDir}`;
    await $`cd ${repoDir} && git init`;
    await $`cd ${repoDir} && git config user.email "test@test.com"`;
    await $`cd ${repoDir} && git config user.name "Test User"`;
  });

  afterEach(async () => {
    // Cleanup temp directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('health endpoint returns healthy status', async () => {
    const response = await fetch(`http://localhost:${PORT}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('git-tools-service');
  });

  test('GET /api/git/status returns repository status', async () => {
    const response = await fetch(
      `http://localhost:${PORT}/api/git/status?path=${encodeURIComponent(repoDir)}`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    expect(data.data.isClean).toBe(true);
  });

  test('POST /api/git/init initializes a new repository', async () => {
    const newRepoDir = join(tempDir, 'new-repo');
    await $`mkdir -p ${newRepoDir}`;

    const response = await fetch(`http://localhost:${PORT}/api/git/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: newRepoDir }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('POST /api/git/add stages files', async () => {
    // Create a file to stage
    await Bun.write(join(repoDir, 'test.txt'), 'Hello World');

    const response = await fetch(`http://localhost:${PORT}/api/git/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: repoDir, files: 'test.txt' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('POST /api/git/commit creates a commit', async () => {
    // Create and stage a file
    await Bun.write(join(repoDir, 'test.txt'), 'Hello World');
    await $`cd ${repoDir} && git add test.txt`;

    const response = await fetch(`http://localhost:${PORT}/api/git/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: repoDir, message: 'Initial commit' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.commit).toBeDefined();
  });

  test('POST /api/git/commit returns error without message', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/git/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: repoDir }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('message');
  });

  test('GET /api/git/branches lists branches', async () => {
    // Create initial commit first
    await Bun.write(join(repoDir, 'test.txt'), 'Hello World');
    await $`cd ${repoDir} && git add test.txt && git commit -m "Initial commit"`;

    const response = await fetch(
      `http://localhost:${PORT}/api/git/branches?path=${encodeURIComponent(repoDir)}`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.all).toBeDefined();
    expect(Array.isArray(data.data.all)).toBe(true);
  });

  test('POST /api/git/branch creates a new branch', async () => {
    // Create initial commit first
    await Bun.write(join(repoDir, 'test.txt'), 'Hello World');
    await $`cd ${repoDir} && git add test.txt && git commit -m "Initial commit"`;

    const response = await fetch(`http://localhost:${PORT}/api/git/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: repoDir, name: 'feature-branch' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('POST /api/git/branch returns error without name', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/git/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: repoDir }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('name');
  });

  test('GET /api/git/diff returns diff', async () => {
    // Create initial commit
    await Bun.write(join(repoDir, 'test.txt'), 'Hello World');
    await $`cd ${repoDir} && git add test.txt && git commit -m "Initial commit"`;

    // Modify file
    await Bun.write(join(repoDir, 'test.txt'), 'Hello World Modified');

    const response = await fetch(
      `http://localhost:${PORT}/api/git/diff?path=${encodeURIComponent(repoDir)}`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.diff).toContain('Modified');
  });

  test('GET /api/git/log returns commit log', async () => {
    // Create commits
    await Bun.write(join(repoDir, 'test.txt'), 'Hello World');
    await $`cd ${repoDir} && git add test.txt && git commit -m "First commit"`;
    await Bun.write(join(repoDir, 'test2.txt'), 'Another file');
    await $`cd ${repoDir} && git add test2.txt && git commit -m "Second commit"`;

    const response = await fetch(
      `http://localhost:${PORT}/api/git/log?path=${encodeURIComponent(repoDir)}`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.total).toBeGreaterThanOrEqual(2);
    expect(data.data.all.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /api/git/current-branch returns current branch name', async () => {
    // Create initial commit first
    await Bun.write(join(repoDir, 'test.txt'), 'Hello World');
    await $`cd ${repoDir} && git add test.txt && git commit -m "Initial commit"`;

    const response = await fetch(
      `http://localhost:${PORT}/api/git/current-branch?path=${encodeURIComponent(repoDir)}`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.branch).toBeDefined();
  });

  test('GET /api/git/is-clean returns clean status', async () => {
    const response = await fetch(
      `http://localhost:${PORT}/api/git/is-clean?path=${encodeURIComponent(repoDir)}`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.data.isClean).toBe('boolean');
  });

  test('returns 404 for unknown routes', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/git/unknown`);
    expect(response.status).toBe(404);
  });
});
