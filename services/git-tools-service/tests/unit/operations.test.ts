import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, spyOn } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { GitOperations } from '../../src/git/operations';

const TEST_DIR = '/tmp/git-ops-unit-test';

describe('GitOperations', () => {
  let gitOps: GitOperations;

  /**
   * Collected spies so we can restore them after each test.
   * We spy on the internal simple-git instance (`this.git`) rather than
   * using `mock.module('simple-git')`, which would permanently contaminate
   * the module cache across test files in Bun's runner.
   */
  const spies: ReturnType<typeof spyOn>[] = [];

  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  beforeEach(() => {
    gitOps = new GitOperations(TEST_DIR);

    // Access the internal simple-git instance
    const git = (gitOps as any).git;

    spies.push(
      spyOn(git, 'clone').mockResolvedValue({ success: true }),
      spyOn(git, 'status').mockResolvedValue({
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
      }),
      spyOn(git, 'add').mockResolvedValue({ files: ['.'] }),
      spyOn(git, 'commit').mockResolvedValue({
        commit: 'abc123',
        summary: { changes: 1, insertions: 2, deletions: 0 },
      }),
      spyOn(git, 'push').mockResolvedValue({ pushed: [{ hash: { local: 'abc123' } }] }),
      spyOn(git, 'pull').mockResolvedValue({
        summary: { changes: 1, insertions: 2, deletions: 0 },
      }),
      spyOn(git, 'branch').mockResolvedValue({ all: ['main', 'develop'], current: 'main' }),
      spyOn(git, 'branchLocal').mockResolvedValue({ all: ['main', 'develop'], current: 'main' }),
      spyOn(git, 'checkout').mockResolvedValue({ branch: 'main' }),
      spyOn(git, 'checkoutBranch').mockResolvedValue(undefined),
      spyOn(git, 'checkoutLocalBranch').mockResolvedValue(undefined),
      spyOn(git, 'diff').mockResolvedValue(''),
      spyOn(git, 'diffSummary').mockResolvedValue({ files: [], insertions: 0, deletions: 0 }),
      spyOn(git, 'log').mockResolvedValue({
        total: 10,
        latest: { hash: 'abc123', date: '2024-01-01', message: 'test', author_name: 'Test', author_email: 'test@test.com' },
        all: [],
      }),
      spyOn(git, 'merge').mockResolvedValue({ result: 'Merged successfully' }),
      spyOn(git, 'stash').mockResolvedValue('Saved working directory'),
      spyOn(git, 'fetch').mockResolvedValue({ fetched: [] }),
      spyOn(git, 'reset').mockResolvedValue(undefined),
      spyOn(git, 'init').mockResolvedValue(undefined),
      spyOn(git, 'getRemotes').mockResolvedValue([
        { name: 'origin', refs: { fetch: 'https://github.com/test/repo.git', push: 'https://github.com/test/repo.git' } },
      ]),
      spyOn(git, 'revparse').mockResolvedValue('main'),
      spyOn(git, 'checkIsRepo').mockResolvedValue(true),
      spyOn(git, 'tag').mockResolvedValue(undefined),
      spyOn(git, 'tags').mockResolvedValue({ all: ['v1.0.0', 'v1.1.0'] }),
      spyOn(git, 'pushTags').mockResolvedValue(undefined),
      spyOn(git, 'show').mockResolvedValue('tag v1.0.0\nTagger: Test <test@test.com>'),
      spyOn(git, 'raw').mockResolvedValue(''),
      spyOn(git, 'rebase').mockResolvedValue(''),
    );
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies.length = 0;
  });

  describe('clone', () => {
    /**
     * The clone() method internally calls `simpleGit().clone(...)` on a
     * fresh instance (not this.git), so we spy on the prototype method
     * itself to avoid hitting the network in tests.
     */
    let cloneSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      cloneSpy = spyOn(GitOperations.prototype, 'clone').mockResolvedValue({
        success: true,
        path: '/tmp/test-repo',
      });
      spies.push(cloneSpy);
    });

    test('should clone a repository', async () => {
      const result = await gitOps.clone({
        url: 'https://github.com/test/repo.git',
        path: '/tmp/test-repo',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.path).toBe('/tmp/test-repo');
      expect(cloneSpy).toHaveBeenCalled();
    });

    test('should clone with branch option', async () => {
      const result = await gitOps.clone({
        url: 'https://github.com/test/repo.git',
        path: '/tmp/test-repo',
        branch: 'develop',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should clone with depth option', async () => {
      const result = await gitOps.clone({
        url: 'https://github.com/test/repo.git',
        path: '/tmp/test-repo',
        depth: 1,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('status', () => {
    test('should return repository status', async () => {
      const git = (gitOps as any).git;
      const status = await gitOps.status();

      expect(status).toBeDefined();
      expect(status.current).toBe('main');
      expect(status.isClean()).toBe(true);
      expect(git.status).toHaveBeenCalled();
    });
  });

  describe('add', () => {
    test('should stage files', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.add('.');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.add).toHaveBeenCalled();
    });

    test('should stage specific files', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.add(['file1.ts', 'file2.ts']);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.add).toHaveBeenCalledWith(['file1.ts', 'file2.ts']);
    });
  });

  describe('commit', () => {
    test('should commit with message', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.commit({
        message: 'test commit',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.hash).toBe('abc123');
      expect(git.commit).toHaveBeenCalled();
    });

    test('should commit with amend option', async () => {
      const result = await gitOps.commit({
        message: 'amended commit',
        amend: true,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('push', () => {
    test('should push to remote', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.push();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.push).toHaveBeenCalled();
    });

    test('should push with force option', async () => {
      const result = await gitOps.push({ force: true });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should push to specific remote and branch', async () => {
      const result = await gitOps.push({
        remote: 'origin',
        branch: 'main',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('pull', () => {
    test('should pull from remote', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.pull();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.pull).toHaveBeenCalled();
    });

    test('should pull with rebase option', async () => {
      const result = await gitOps.pull({ rebase: true });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });
  });

  describe('createBranch', () => {
    test('should create a new branch', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.createBranch({
        name: 'feature/test',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.branch).toBe('feature/test');
      expect(git.branch).toHaveBeenCalled();
    });

    test('should create and checkout branch', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.createBranch({
        name: 'feature/test',
        checkout: true,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.checkoutLocalBranch).toHaveBeenCalledWith('feature/test');
    });

    test('should create and checkout branch from start point', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.createBranch({
        name: 'feature/test',
        checkout: true,
        startPoint: 'develop',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.checkoutBranch).toHaveBeenCalledWith('feature/test', 'develop');
    });
  });

  describe('listBranches', () => {
    test('should list local branches', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.listBranches();

      expect(result).toBeDefined();
      expect(result.current).toBe('main');
      expect(result.branches).toEqual(['main', 'develop']);
      expect(git.branch).toHaveBeenCalled();
    });

    test('should list all branches including remote', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.listBranches(true);

      expect(result).toBeDefined();
      expect(git.branch).toHaveBeenCalledWith(['-a']);
    });
  });

  describe('checkout', () => {
    test('should checkout a branch', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.checkout('develop');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.checkout).toHaveBeenCalledWith('develop');
    });

    test('should create and checkout new branch', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.checkout('new-branch', true);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.checkoutLocalBranch).toHaveBeenCalledWith('new-branch');
    });
  });

  describe('diff', () => {
    test('should get diff', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.diff();

      expect(result).toBeDefined();
      expect(git.diff).toHaveBeenCalled();
    });

    test('should get cached diff', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.diff({ cached: true });

      expect(result).toBeDefined();
      expect(git.diff).toHaveBeenCalledWith(['--cached']);
    });

    test('should get diff between commits', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.diff({ from: 'HEAD~1', to: 'HEAD' });

      expect(result).toBeDefined();
      expect(git.diff).toHaveBeenCalledWith(['HEAD~1', 'HEAD']);
    });
  });

  describe('log', () => {
    test('should get commit log', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.log();

      expect(result).toBeDefined();
      expect(result.total).toBe(10);
      expect(git.log).toHaveBeenCalled();
    });

    test('should get log with max count', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.log({ maxCount: 5 });

      expect(result).toBeDefined();
      expect(git.log).toHaveBeenCalledWith({ maxCount: 5 });
    });
  });

  describe('merge', () => {
    test('should merge branch', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.merge({
        branch: 'develop',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.merge).toHaveBeenCalled();
    });

    test('should merge with no-ff option', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.merge({
        branch: 'develop',
        noFf: true,
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.merge).toHaveBeenCalledWith(['--no-ff', 'develop']);
    });
  });

  describe('stash', () => {
    test('should push to stash', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.stash({
        command: 'push',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.stash).toHaveBeenCalledWith(['push']);
    });

    test('should pop from stash', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.stash({
        command: 'pop',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.stash).toHaveBeenCalledWith(['pop']);
    });

    test('should list stash entries', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.stash({
        command: 'list',
      });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.stash).toHaveBeenCalledWith(['list']);
    });
  });

  describe('fetch', () => {
    test('should fetch from remote', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.fetch();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.fetch).toHaveBeenCalledWith('origin');
    });

    test('should fetch with prune', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.fetch('origin', true);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.fetch).toHaveBeenCalledWith('origin', ['--prune']);
    });
  });

  describe('reset', () => {
    test('should reset to commit', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.reset('HEAD~1');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.reset).toHaveBeenCalledWith(['--mixed', 'HEAD~1']);
    });

    test('should hard reset', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.reset('HEAD~1', 'hard');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.reset).toHaveBeenCalledWith(['--hard', 'HEAD~1']);
    });
  });

  describe('init', () => {
    test('should initialize repository', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.init();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.init).toHaveBeenCalledWith(false);
    });

    test('should initialize bare repository', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.init(true);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.init).toHaveBeenCalledWith(true);
    });
  });

  describe('getRemoteUrl', () => {
    test('should get remote URL', async () => {
      const git = (gitOps as any).git;
      const url = await gitOps.getRemoteUrl();

      expect(url).toBe('https://github.com/test/repo.git');
      expect(git.getRemotes).toHaveBeenCalledWith(true);
    });

    test('should return null for non-existent remote', async () => {
      const git = (gitOps as any).git;
      git.getRemotes.mockResolvedValue([]);

      const url = await gitOps.getRemoteUrl('upstream');

      expect(url).toBeNull();
    });
  });

  describe('currentBranch', () => {
    test('should get current branch', async () => {
      const git = (gitOps as any).git;
      const branch = await gitOps.currentBranch();

      expect(branch).toBe('main');
      expect(git.revparse).toHaveBeenCalledWith(['--abbrev-ref', 'HEAD']);
    });
  });

  describe('isClean', () => {
    test('should check if repository is clean', async () => {
      const isClean = await gitOps.isClean();

      expect(typeof isClean).toBe('boolean');
      expect(isClean).toBe(true);
    });

    test('should return false when repo has changes', async () => {
      const git = (gitOps as any).git;
      git.status.mockResolvedValue({
        current: 'main',
        tracking: 'origin/main',
        isClean: () => false,
        staged: ['file.ts'],
        modified: [],
        not_added: [],
        conflicted: [],
        deleted: [],
        renamed: [],
        ahead: 0,
        behind: 0,
      });

      const isClean = await gitOps.isClean();

      expect(isClean).toBe(false);
    });
  });

  describe('cherryPick', () => {
    test('should cherry-pick a commit', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.cherryPick('abc123');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.raw).toHaveBeenCalledWith(['cherry-pick', 'abc123']);
    });

    test('should cherry-pick with noCommit option', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.cherryPick('abc123', { noCommit: true });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.raw).toHaveBeenCalledWith(['cherry-pick', '--no-commit', 'abc123']);
    });
  });

  describe('cherryPickAbort', () => {
    test('should abort cherry-pick', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.cherryPickAbort();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.raw).toHaveBeenCalledWith(['cherry-pick', '--abort']);
    });
  });

  describe('cherryPickContinue', () => {
    test('should continue cherry-pick', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.cherryPickContinue();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.raw).toHaveBeenCalledWith(['cherry-pick', '--continue']);
    });
  });

  describe('rebase', () => {
    test('should rebase onto target', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.rebase('main');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.rebase).toHaveBeenCalledWith(['main']);
    });
  });

  describe('rebaseAbort', () => {
    test('should abort rebase', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.rebaseAbort();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.rebase).toHaveBeenCalledWith(['--abort']);
    });
  });

  describe('rebaseContinue', () => {
    test('should continue rebase', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.rebaseContinue();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.rebase).toHaveBeenCalledWith(['--continue']);
    });
  });

  describe('rebaseSkip', () => {
    test('should skip commit during rebase', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.rebaseSkip();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.rebase).toHaveBeenCalledWith(['--skip']);
    });
  });

  describe('tag', () => {
    test('should create a tag', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.tag('v1.0.0');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.tag).toBe('v1.0.0');
      expect(git.tag).toHaveBeenCalledWith(['v1.0.0']);
    });

    test('should create annotated tag with message', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.tag('v1.0.0', { message: 'Release 1.0.0' });

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.tag).toHaveBeenCalledWith(['-a', '-m', 'Release 1.0.0', 'v1.0.0']);
    });
  });

  describe('deleteTag', () => {
    test('should delete a local tag', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.deleteTag('v1.0.0');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.tag).toHaveBeenCalledWith(['-d', 'v1.0.0']);
    });

    test('should delete tag from remote', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.deleteTag('v1.0.0', 'origin');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.tag).toHaveBeenCalledWith(['-d', 'v1.0.0']);
      expect(git.push).toHaveBeenCalledWith('origin', ':refs/tags/v1.0.0');
    });
  });

  describe('listTags', () => {
    test('should list tags', async () => {
      const git = (gitOps as any).git;
      const tags = await gitOps.listTags();

      expect(tags).toEqual(['v1.0.0', 'v1.1.0']);
      expect(git.tags).toHaveBeenCalledWith([]);
    });

    test('should list tags with pattern', async () => {
      const git = (gitOps as any).git;
      const tags = await gitOps.listTags('v1.*');

      expect(tags).toBeDefined();
      expect(git.tags).toHaveBeenCalledWith(['-l', 'v1.*']);
    });
  });

  describe('pushTags', () => {
    test('should push all tags', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.pushTags();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.pushTags).toHaveBeenCalledWith('origin');
    });

    test('should push specific tag', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.pushTags('origin', 'v1.0.0');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(git.push).toHaveBeenCalledWith('origin', 'refs/tags/v1.0.0');
    });
  });

  describe('showTag', () => {
    test('should show tag information', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.showTag('v1.0.0');

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.info).toBeDefined();
      expect(git.show).toHaveBeenCalledWith(['--no-patch', 'v1.0.0']);
    });
  });

  describe('getConflicts', () => {
    test('should return empty array when no conflicts', async () => {
      const conflicts = await gitOps.getConflicts();

      expect(conflicts).toEqual([]);
    });

    test('should return conflicted files', async () => {
      const git = (gitOps as any).git;
      git.status.mockResolvedValue({
        current: 'main',
        tracking: 'origin/main',
        isClean: () => false,
        staged: [],
        modified: [],
        not_added: [],
        conflicted: ['file1.ts', 'file2.ts'],
        deleted: [],
        renamed: [],
        ahead: 0,
        behind: 0,
      });

      const conflicts = await gitOps.getConflicts();

      expect(conflicts).toEqual(['file1.ts', 'file2.ts']);
    });
  });

  describe('hasConflicts', () => {
    test('should return false when no conflicts', async () => {
      const has = await gitOps.hasConflicts();
      expect(has).toBe(false);
    });
  });

  describe('isRepo', () => {
    test('should check if path is a git repo', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.isRepo();

      expect(result).toBe(true);
      expect(git.checkIsRepo).toHaveBeenCalled();
    });
  });

  describe('showCommit', () => {
    test('should show a commit', async () => {
      const git = (gitOps as any).git;
      const result = await gitOps.showCommit('abc123');

      expect(result).toBeDefined();
      expect(git.show).toHaveBeenCalledWith(['abc123']);
    });
  });

  describe('getShortHash', () => {
    test('should get short hash', async () => {
      const git = (gitOps as any).git;
      const hash = await gitOps.getShortHash();

      expect(hash).toBe('main');
      expect(git.revparse).toHaveBeenCalledWith(['--short', 'HEAD']);
    });
  });

  describe('getFullHash', () => {
    test('should get full hash', async () => {
      const git = (gitOps as any).git;
      const hash = await gitOps.getFullHash();

      expect(hash).toBe('main');
      expect(git.revparse).toHaveBeenCalledWith(['HEAD']);
    });
  });

  describe('getCommitCount', () => {
    test('should get commit count', async () => {
      const git = (gitOps as any).git;
      git.raw.mockResolvedValue('5');
      const count = await gitOps.getCommitCount('abc123');

      expect(count).toBe(5);
      expect(git.raw).toHaveBeenCalledWith(['rev-list', '--count', 'abc123..HEAD']);
    });
  });

  describe('blame', () => {
    test('should get blame for a file', async () => {
      const git = (gitOps as any).git;
      git.raw.mockResolvedValue('abc123 (Author 2024-01-01 1) line content');
      const result = await gitOps.blame('file.ts');

      expect(result).toBeDefined();
      expect(git.raw).toHaveBeenCalledWith(['blame', 'file.ts']);
    });

    test('should get blame for line range', async () => {
      const git = (gitOps as any).git;
      git.raw.mockResolvedValue('abc123 (Author 2024-01-01 1) line content');
      const result = await gitOps.blame('file.ts', { startLine: 10, endLine: 20 });

      expect(result).toBeDefined();
      expect(git.raw).toHaveBeenCalledWith(['blame', '-L10,20', 'file.ts']);
    });
  });
});
