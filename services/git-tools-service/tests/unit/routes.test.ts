import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, spyOn } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { startServer } from '../../src/server';
import { GitOperations } from '../../src/git/operations';

const ROUTES_TEST_DIR = '/tmp/git-routes-unit-test';

describe('Git Tools Service Routes', () => {
  let server: any;
  const PORT = 13004;

  /** Collected spies so we can restore them after each test */
  const spies: ReturnType<typeof spyOn>[] = [];

  /**
   * Helper: install prototype-level spies on GitOperations so every
   * `new GitOperations()` created inside the route handlers uses mocked
   * methods rather than real git operations.
   */
  function installGitSpies(): void {
    spies.push(
      spyOn(GitOperations.prototype, 'clone').mockResolvedValue({ success: true, path: '/tmp/test' }),
      spyOn(GitOperations.prototype, 'status').mockResolvedValue({
        current: 'main',
        tracking: 'origin/main',
        isClean: () => true,
        staged: [],
        modified: [],
        not_added: [],
        conflicted: [],
        deleted: [],
        renamed: [],
        ahead: 0,
        behind: 0,
      } as any),
      spyOn(GitOperations.prototype, 'add').mockResolvedValue({ success: true, files: ['.'] }),
      spyOn(GitOperations.prototype, 'commit').mockResolvedValue({ success: true, hash: 'abc123', summary: '1 changes, 0 insertions, 0 deletions' }),
      spyOn(GitOperations.prototype, 'push').mockResolvedValue({ success: true, remote: 'origin', branch: 'current' }),
      spyOn(GitOperations.prototype, 'pull').mockResolvedValue({ success: true, summary: '1 changes, 0 insertions, 0 deletions' }),
      spyOn(GitOperations.prototype, 'createBranch').mockResolvedValue({ success: true, branch: 'feature/test' }),
      spyOn(GitOperations.prototype, 'listBranches').mockResolvedValue({ current: 'main', branches: ['main'] }),
      spyOn(GitOperations.prototype, 'checkout').mockResolvedValue({ success: true, target: 'main' }),
      spyOn(GitOperations.prototype, 'diff').mockResolvedValue({ diff: '', files: [] }),
      spyOn(GitOperations.prototype, 'log').mockResolvedValue({ total: 0, all: [], latest: null } as any),
      spyOn(GitOperations.prototype, 'merge').mockResolvedValue({ success: true, result: 'Merged successfully' }),
      spyOn(GitOperations.prototype, 'stash').mockResolvedValue({ success: true, result: 'Stash operation completed' }),
      spyOn(GitOperations.prototype, 'fetch').mockResolvedValue({ success: true }),
      spyOn(GitOperations.prototype, 'reset').mockResolvedValue({ success: true }),
      spyOn(GitOperations.prototype, 'init').mockResolvedValue({ success: true }),
      spyOn(GitOperations.prototype, 'getRemoteUrl').mockResolvedValue('https://github.com/test/repo.git'),
      spyOn(GitOperations.prototype, 'currentBranch').mockResolvedValue('main'),
      spyOn(GitOperations.prototype, 'isClean').mockResolvedValue(true),
      spyOn(GitOperations.prototype, 'cherryPick').mockResolvedValue({ success: true, result: 'Cherry-pick completed successfully' }),
      spyOn(GitOperations.prototype, 'cherryPickAbort').mockResolvedValue({ success: true }),
      spyOn(GitOperations.prototype, 'cherryPickContinue').mockResolvedValue({ success: true, result: 'Cherry-pick continued' }),
      spyOn(GitOperations.prototype, 'rebase').mockResolvedValue({ success: true, result: 'Rebase completed successfully' }),
      spyOn(GitOperations.prototype, 'rebaseAbort').mockResolvedValue({ success: true }),
      spyOn(GitOperations.prototype, 'rebaseContinue').mockResolvedValue({ success: true, result: 'Rebase continued successfully' }),
      spyOn(GitOperations.prototype, 'rebaseSkip').mockResolvedValue({ success: true, result: 'Commit skipped' }),
      spyOn(GitOperations.prototype, 'tag').mockResolvedValue({ success: true, tag: 'v1.0.0' }),
      spyOn(GitOperations.prototype, 'deleteTag').mockResolvedValue({ success: true }),
      spyOn(GitOperations.prototype, 'listTags').mockResolvedValue(['v1.0.0']),
      spyOn(GitOperations.prototype, 'pushTags').mockResolvedValue({ success: true }),
      spyOn(GitOperations.prototype, 'showTag').mockResolvedValue({ success: true, info: 'tag v1.0.0' }),
      spyOn(GitOperations.prototype, 'getConflicts').mockResolvedValue([]),
    );
  }

  beforeAll(async () => {
    mkdirSync(ROUTES_TEST_DIR, { recursive: true });
    server = await startServer(PORT);
  });

  afterAll(() => {
    server?.stop();
    rmSync(ROUTES_TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    installGitSpies();
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies.length = 0;
  });

  describe('Health Check', () => {
    test('GET /health should return healthy status', async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('git-tools-service');
    });
  });

  describe('Clone', () => {
    test('POST /api/git/clone should clone repository', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://github.com/test/repo.git',
          path: '/tmp/test',
        }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/git/clone should fail without required fields', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Status', () => {
    test('GET /api/git/status should return status', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/status`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.current).toBe('main');
    });

    test('GET /api/git/status with path param', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/status?path=${encodeURIComponent(ROUTES_TEST_DIR)}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Add', () => {
    test('POST /api/git/add should stage files', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: '.' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Commit', () => {
    test('POST /api/git/commit should commit changes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test commit' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/git/commit should fail without message', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Push', () => {
    test('POST /api/git/push should push changes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Pull', () => {
    test('POST /api/git/pull should pull changes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Branch Operations', () => {
    test('POST /api/git/branch should create branch', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'feature/test' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/git/branch should fail without name', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('GET /api/git/branches should list branches', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/branches`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Checkout', () => {
    test('POST /api/git/checkout should checkout branch', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'main' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/git/checkout should fail without target', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Diff', () => {
    test('GET /api/git/diff should return diff', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/diff`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Log', () => {
    test('GET /api/git/log should return commit log', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/log`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Merge', () => {
    test('POST /api/git/merge should merge branch', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch: 'develop' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/git/merge should fail without branch', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Stash', () => {
    test('POST /api/git/stash should perform stash operation', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/stash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'push' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/git/stash should fail without command', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/stash`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Fetch', () => {
    test('POST /api/git/fetch should fetch from remote', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Reset', () => {
    test('POST /api/git/reset should reset to commit', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'HEAD~1' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/git/reset should fail without target', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Init', () => {
    test('POST /api/git/init should initialize repository', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Remote', () => {
    test('GET /api/git/remote should get remote URL', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/remote`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Current Branch', () => {
    test('GET /api/git/current-branch should get current branch', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/current-branch`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.branch).toBe('main');
    });
  });

  describe('Is Clean', () => {
    test('GET /api/git/is-clean should check if repo is clean', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/is-clean`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(typeof data.data.isClean).toBe('boolean');
    });
  });

  describe('404 Not Found', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/git/unknown`);
      expect(response.status).toBe(404);
    });
  });
});
