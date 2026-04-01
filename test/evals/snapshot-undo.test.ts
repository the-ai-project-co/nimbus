/**
 * E2E Snapshot & Undo/Redo Tests
 *
 * Validates the SnapshotManager's ability to capture, restore, undo, and redo
 * file state. Tests exercise both the git-based path (via `git write-tree`)
 * and the filesystem-copy fallback (for non-git directories).
 *
 * Git commands are mocked via `vi.mock('node:child_process')` at the module
 * level (required for ESM compatibility). Filesystem operations use real temp
 * directories for non-git tests so that snapshot copying is fully exercised.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Mock node:child_process at module level for ESM compatibility.
// The actual module is imported and spread so only `exec` is replaced.
// ---------------------------------------------------------------------------

let execMockImpl: Function | null = null;

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    exec: vi.fn((...args: unknown[]) => {
      if (execMockImpl) {
        return execMockImpl(...args);
      }
      // Default fallback: call through to real exec (for non-git tests this is never hit)
      return (actual.exec as Function)(...args);
    }),
  };
});

import * as child_process from 'node:child_process';
import { SnapshotManager, type Snapshot } from '../../src/snapshots/manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpRoot: string;

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-e2e-snap-'));
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  execMockImpl = null;
  vi.mocked(child_process.exec).mockClear();
});

afterEach(() => {
  execMockImpl = null;
});

/** Create a fresh temp project directory for each test. */
function makeTmpProject(opts: { git?: boolean } = {}): string {
  const dir = fs.mkdtempSync(path.join(tmpRoot, 'proj-'));
  if (opts.git) {
    // Create .git directory so SnapshotManager detects it as a git project
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  }
  return dir;
}

/** Write a file inside a project directory. */
function writeFile(projectDir: string, relPath: string, content: string): void {
  const full = path.join(projectDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

/** Shorthand metadata for captureSnapshot calls. */
function snapParams(desc: string, sessionId = 'sess-1', messageId = 'msg-1', toolCallId = 'tc-1') {
  return { sessionId, messageId, toolCallId, description: desc };
}

/** Counter used to produce distinct mock tree hashes. */
let hashCounter = 0;

/**
 * Install a mock implementation for child_process.exec that returns fake
 * tree hashes for `git write-tree` and succeeds for other git commands.
 */
function installGitMock(): void {
  hashCounter = 0;
  execMockImpl = (cmd: string, opts: unknown, cb?: Function) => {
    const callback = typeof opts === 'function' ? opts : cb;
    if (typeof callback === 'function') {
      if (typeof cmd === 'string' && cmd.includes('write-tree')) {
        hashCounter++;
        callback(null, { stdout: `fakehash${hashCounter}\n`, stderr: '' });
      } else {
        callback(null, { stdout: '', stderr: '' });
      }
    }
    return { pid: 12345 } as child_process.ChildProcess;
  };
}

// ===========================================================================
// 1. Snapshot captures current file state
// ===========================================================================

describe('SnapshotManager — capture', () => {
  test('captureSnapshot returns a Snapshot with correct metadata', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });
    const snap = await mgr.captureSnapshot(snapParams('edit_file: main.tf'));

    expect(snap.id).toBeDefined();
    expect(typeof snap.id).toBe('string');
    expect(snap.id.length).toBeGreaterThan(0);
    expect(snap.sessionId).toBe('sess-1');
    expect(snap.messageId).toBe('msg-1');
    expect(snap.toolCallId).toBe('tc-1');
    expect(snap.description).toBe('edit_file: main.tf');
    expect(snap.timestamp).toBeInstanceOf(Date);
    expect(snap.isGitProject).toBe(true);
  });
});

// ===========================================================================
// 2. Snapshot uses git write-tree in git repo
// ===========================================================================

describe('SnapshotManager — git write-tree', () => {
  test('git project captures treeHash from git write-tree', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });
    const snap = await mgr.captureSnapshot(snapParams('write_file: index.ts'));

    expect(snap.treeHash).toBe('fakehash1');
    expect(snap.isGitProject).toBe(true);

    // Verify git add -A was called
    const execCalls = vi.mocked(child_process.exec).mock.calls;
    const addCall = execCalls.find(c => String(c[0]).includes('git add -A'));
    expect(addCall).toBeDefined();

    // Verify git write-tree was called
    const writeTreeCall = execCalls.find(c => String(c[0]).includes('git write-tree'));
    expect(writeTreeCall).toBeDefined();
  });
});

// ===========================================================================
// 3. Falls back to filesystem copy without git
// ===========================================================================

describe('SnapshotManager — filesystem fallback', () => {
  test('non-git project copies files and has empty treeHash', async () => {
    const projectDir = makeTmpProject({ git: false });
    writeFile(projectDir, 'app.js', 'console.log("hello");');

    const mgr = new SnapshotManager({ projectDir });
    const snap = await mgr.captureSnapshot(snapParams('edit_file: app.js'));

    expect(snap.treeHash).toBe('');
    expect(snap.isGitProject).toBe(false);

    // Snapshot directory should have been created
    const snapshotDir = path.join(projectDir, '.nimbus', 'snapshots', snap.id);
    expect(fs.existsSync(snapshotDir)).toBe(true);

    // The file should have been copied into the snapshot
    const copiedFile = path.join(snapshotDir, 'app.js');
    expect(fs.existsSync(copiedFile)).toBe(true);
    expect(fs.readFileSync(copiedFile, 'utf-8')).toBe('console.log("hello");');
  });
});

// ===========================================================================
// 4. Restore reverts files to snapshot state
// ===========================================================================

describe('SnapshotManager — restore', () => {
  test('restoreSnapshot reverts files to snapshot state (non-git)', async () => {
    const projectDir = makeTmpProject({ git: false });
    writeFile(projectDir, 'data.txt', 'original');

    const mgr = new SnapshotManager({ projectDir });
    const snap = await mgr.captureSnapshot(snapParams('before edit'));

    // Modify the file after snapshot
    writeFile(projectDir, 'data.txt', 'modified');
    expect(fs.readFileSync(path.join(projectDir, 'data.txt'), 'utf-8')).toBe('modified');

    // Restore
    const result = await mgr.restoreSnapshot(snap.id);

    expect(result.restored).toBe(true);
    expect(result.description).toContain('Restored snapshot');
    expect(result.description).toContain('before edit');

    // File should be reverted
    expect(fs.readFileSync(path.join(projectDir, 'data.txt'), 'utf-8')).toBe('original');
  });

  test('restoreSnapshot for git project calls git read-tree and checkout-index', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });
    const snap = await mgr.captureSnapshot(snapParams('edit_file: server.ts'));

    // Clear call history to isolate the restore calls
    vi.mocked(child_process.exec).mockClear();

    const result = await mgr.restoreSnapshot(snap.id);

    expect(result.restored).toBe(true);

    const execCalls = vi.mocked(child_process.exec).mock.calls;
    const readTreeCall = execCalls.find(c => String(c[0]).includes('git read-tree'));
    expect(readTreeCall).toBeDefined();
    expect(String(readTreeCall![0])).toContain(snap.treeHash);

    const checkoutCall = execCalls.find(c => String(c[0]).includes('git checkout-index'));
    expect(checkoutCall).toBeDefined();
  });
});

// ===========================================================================
// 5. Undo reverts last change
// ===========================================================================

describe('SnapshotManager — undo', () => {
  test('undo restores to the previous snapshot (non-git)', async () => {
    const projectDir = makeTmpProject({ git: false });
    writeFile(projectDir, 'file.txt', 'version-1');

    const mgr = new SnapshotManager({ projectDir });

    // Capture initial state
    await mgr.captureSnapshot(snapParams('initial state'));

    // Modify and capture again
    writeFile(projectDir, 'file.txt', 'version-2');
    await mgr.captureSnapshot(snapParams('edit_file: changed'));

    expect(mgr.count).toBe(2);

    // Undo
    const result = await mgr.undo();

    expect(result.success).toBe(true);
    expect(result.description).toContain('Undone');
    expect(result.description).toContain('edit_file: changed');
    expect(mgr.count).toBe(1);

    // File should revert to version-1
    expect(fs.readFileSync(path.join(projectDir, 'file.txt'), 'utf-8')).toBe('version-1');
  });

  test('undo with fewer than 2 snapshots returns failure', async () => {
    const projectDir = makeTmpProject({ git: false });

    const mgr = new SnapshotManager({ projectDir });

    // No snapshots at all
    let result = await mgr.undo();
    expect(result.success).toBe(false);
    expect(result.description).toBe('Nothing to undo');

    // Only one snapshot — still cannot undo
    writeFile(projectDir, 'f.txt', 'x');
    await mgr.captureSnapshot(snapParams('only one'));
    result = await mgr.undo();
    expect(result.success).toBe(false);
    expect(result.description).toBe('Nothing to undo');
  });

  test('undo with git project (mocked)', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });

    await mgr.captureSnapshot(snapParams('base'));
    await mgr.captureSnapshot(snapParams('change'));

    expect(mgr.count).toBe(2);

    const result = await mgr.undo();

    expect(result.success).toBe(true);
    expect(result.description).toContain('Undone');
    expect(result.description).toContain('change');
    expect(mgr.count).toBe(1);
  });
});

// ===========================================================================
// 6. Redo re-applies undone change
// ===========================================================================

describe('SnapshotManager — redo', () => {
  test('redo restores a previously undone snapshot (non-git)', async () => {
    const projectDir = makeTmpProject({ git: false });
    writeFile(projectDir, 'file.txt', 'v1');

    const mgr = new SnapshotManager({ projectDir });

    await mgr.captureSnapshot(snapParams('initial'));

    writeFile(projectDir, 'file.txt', 'v2');
    await mgr.captureSnapshot(snapParams('edit_file: updated'));

    // Undo
    await mgr.undo();
    expect(mgr.count).toBe(1);
    expect(fs.readFileSync(path.join(projectDir, 'file.txt'), 'utf-8')).toBe('v1');

    // Redo
    const result = await mgr.redo();
    expect(result.success).toBe(true);
    expect(result.description).toContain('Redone');
    expect(result.description).toContain('edit_file: updated');
    expect(mgr.count).toBe(2);

    // File should be back to v2
    expect(fs.readFileSync(path.join(projectDir, 'file.txt'), 'utf-8')).toBe('v2');
  });

  test('redo with empty redo stack returns failure', async () => {
    const projectDir = makeTmpProject({ git: false });
    const mgr = new SnapshotManager({ projectDir });
    const result = await mgr.redo();

    expect(result.success).toBe(false);
    expect(result.description).toBe('Nothing to redo');
  });
});

// ===========================================================================
// 7. New capture clears redo stack
// ===========================================================================

describe('SnapshotManager — redo stack clearing', () => {
  test('capturing a new snapshot after undo clears the redo stack', async () => {
    const projectDir = makeTmpProject({ git: false });
    writeFile(projectDir, 'file.txt', 'v1');

    const mgr = new SnapshotManager({ projectDir });

    await mgr.captureSnapshot(snapParams('step-1'));

    writeFile(projectDir, 'file.txt', 'v2');
    await mgr.captureSnapshot(snapParams('step-2'));

    // Undo step-2 -> redo stack has one entry
    await mgr.undo();
    expect(mgr.count).toBe(1);

    // Capture a new (divergent) snapshot — this should clear the redo stack
    writeFile(projectDir, 'file.txt', 'v3-divergent');
    await mgr.captureSnapshot(snapParams('step-3-divergent'));
    expect(mgr.count).toBe(2);

    // Redo should now fail since the redo stack was cleared
    const result = await mgr.redo();
    expect(result.success).toBe(false);
    expect(result.description).toBe('Nothing to redo');
  });
});

// ===========================================================================
// 8. Retention respects max count (100)
// ===========================================================================

describe('SnapshotManager — max count retention', () => {
  test('cleanup trims snapshots beyond maxSnapshots keeping most recent', async () => {
    const projectDir = makeTmpProject({ git: false });

    // Use a small maxSnapshots for testing
    const mgr = new SnapshotManager({ projectDir, maxSnapshots: 3 });

    // Create 5 snapshots
    for (let i = 0; i < 5; i++) {
      writeFile(projectDir, `step-${i}.txt`, `content-${i}`);
      await mgr.captureSnapshot(snapParams(`step-${i}`));
    }

    expect(mgr.count).toBe(5);

    const removed = await mgr.cleanup();

    // Should have trimmed 2 oldest snapshots (5 - 3 = 2)
    expect(removed).toBe(2);
    expect(mgr.count).toBe(3);

    // The remaining snapshots should be the 3 most recent
    const history = mgr.getHistory();
    expect(history[0].description).toBe('step-2');
    expect(history[1].description).toBe('step-3');
    expect(history[2].description).toBe('step-4');
  });

  test('cleanup removes snapshot directories for non-git projects', async () => {
    const projectDir = makeTmpProject({ git: false });
    const mgr = new SnapshotManager({ projectDir, maxSnapshots: 1 });

    writeFile(projectDir, 'a.txt', 'a');
    const snap1 = await mgr.captureSnapshot(snapParams('will-be-removed'));
    writeFile(projectDir, 'b.txt', 'b');
    await mgr.captureSnapshot(snapParams('will-stay'));

    const snap1Dir = path.join(projectDir, '.nimbus', 'snapshots', snap1.id);
    expect(fs.existsSync(snap1Dir)).toBe(true);

    await mgr.cleanup();

    // The oldest snapshot directory should have been removed
    expect(fs.existsSync(snap1Dir)).toBe(false);
    expect(mgr.count).toBe(1);
  });
});

// ===========================================================================
// 9. Retention respects max age (7 days)
// ===========================================================================

describe('SnapshotManager — max age retention', () => {
  test('cleanup removes snapshots older than maxAge', async () => {
    const projectDir = makeTmpProject({ git: false });

    // Use a very short maxAge for testing: 100ms
    const mgr = new SnapshotManager({ projectDir, maxAge: 100 });

    writeFile(projectDir, 'old.txt', 'old');
    await mgr.captureSnapshot(snapParams('old-snap'));

    // Manually backdate the snapshot timestamp.
    // getHistory() returns references to the same Snapshot objects stored
    // internally, so mutation affects the manager's state.
    const history = mgr.getHistory();
    (history[0] as { timestamp: Date }).timestamp = new Date(Date.now() - 200);

    // Add a fresh snapshot
    writeFile(projectDir, 'fresh.txt', 'fresh');
    await mgr.captureSnapshot(snapParams('fresh-snap'));

    expect(mgr.count).toBe(2);

    const removed = await mgr.cleanup();

    expect(removed).toBe(1);
    expect(mgr.count).toBe(1);
    expect(mgr.getHistory()[0].description).toBe('fresh-snap');
  });
});

// ===========================================================================
// 10. Skip list excludes node_modules, .git, dist
// ===========================================================================

describe('SnapshotManager — skip list', () => {
  test('filesystem copy skips node_modules, .git, dist directories', async () => {
    const projectDir = makeTmpProject({ git: false });

    // Create directories that should be skipped
    fs.mkdirSync(path.join(projectDir, 'node_modules', 'pkg'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'node_modules', 'pkg', 'index.js'), 'module');
    fs.mkdirSync(path.join(projectDir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'dist', 'bundle.js'), 'bundled');
    fs.mkdirSync(path.join(projectDir, 'coverage'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'coverage', 'report.html'), '<html>');

    // Create a file that should be captured
    writeFile(projectDir, 'src/index.ts', 'const x = 1;');

    const mgr = new SnapshotManager({ projectDir });
    const snap = await mgr.captureSnapshot(snapParams('skip-test'));

    const snapshotDir = path.join(projectDir, '.nimbus', 'snapshots', snap.id);

    // Source files should be copied
    expect(fs.existsSync(path.join(snapshotDir, 'src', 'index.ts'))).toBe(true);

    // Skipped directories should NOT be copied
    expect(fs.existsSync(path.join(snapshotDir, 'node_modules'))).toBe(false);
    expect(fs.existsSync(path.join(snapshotDir, 'dist'))).toBe(false);
    expect(fs.existsSync(path.join(snapshotDir, 'coverage'))).toBe(false);
  });
});

// ===========================================================================
// 11. File-modifying tool patterns detected for auto-snapshot
// ===========================================================================

describe('SnapshotManager — shouldSnapshot', () => {
  test('file-modifying tool names always trigger snapshot', () => {
    expect(SnapshotManager.shouldSnapshot('edit_file')).toBe(true);
    expect(SnapshotManager.shouldSnapshot('multi_edit')).toBe(true);
    expect(SnapshotManager.shouldSnapshot('write_file')).toBe(true);
  });

  test('bash commands with file-modifying patterns trigger snapshot', () => {
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'rm -rf build/' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'mv old.ts new.ts' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'cp src/a.ts src/b.ts' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'chmod 755 deploy.sh' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'chown user file' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'sed -i "s/old/new/" file.txt' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'awk "{print}" file > out' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'mkdir -p src/new' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'rmdir empty/' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'touch newfile.txt' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'truncate -s 0 log.txt' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'ln -s target link' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'unlink broken-link' })).toBe(true);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'echo "data" > output.txt' })).toBe(true);
  });

  test('bash commands without file-modifying patterns do not trigger snapshot', () => {
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'ls -la' })).toBe(false);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'cat README.md' })).toBe(false);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'git status' })).toBe(false);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'pwd' })).toBe(false);
    expect(SnapshotManager.shouldSnapshot('bash', { command: 'whoami' })).toBe(false);
  });

  test('bash with empty or missing command does not trigger snapshot', () => {
    expect(SnapshotManager.shouldSnapshot('bash', { command: '' })).toBe(false);
    expect(SnapshotManager.shouldSnapshot('bash', {})).toBe(false);
  });

  test('non-file-modifying tools do not trigger snapshot', () => {
    expect(SnapshotManager.shouldSnapshot('terraform', { action: 'plan' })).toBe(false);
    expect(SnapshotManager.shouldSnapshot('kubectl', { action: 'get pods' })).toBe(false);
    expect(SnapshotManager.shouldSnapshot('list_dir')).toBe(false);
    expect(SnapshotManager.shouldSnapshot('read_file')).toBe(false);
    expect(SnapshotManager.shouldSnapshot('glob')).toBe(false);
    expect(SnapshotManager.shouldSnapshot('grep')).toBe(false);
  });
});

// ===========================================================================
// 12. Metadata includes sessionId, messageId, toolCallId
// ===========================================================================

describe('SnapshotManager — metadata', () => {
  test('snapshot preserves sessionId, messageId, and toolCallId', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });
    const snap = await mgr.captureSnapshot({
      sessionId: 'session-abc',
      messageId: 'msg-xyz',
      toolCallId: 'tc-456',
      description: 'test metadata',
    });

    expect(snap.sessionId).toBe('session-abc');
    expect(snap.messageId).toBe('msg-xyz');
    expect(snap.toolCallId).toBe('tc-456');
  });

  test('getHistory filters by sessionId', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });

    await mgr.captureSnapshot(snapParams('snap-A', 'session-1'));
    await mgr.captureSnapshot(snapParams('snap-B', 'session-2'));
    await mgr.captureSnapshot(snapParams('snap-C', 'session-1'));

    const session1 = mgr.getHistory('session-1');
    expect(session1).toHaveLength(2);
    expect(session1[0].description).toBe('snap-A');
    expect(session1[1].description).toBe('snap-C');

    const session2 = mgr.getHistory('session-2');
    expect(session2).toHaveLength(1);
    expect(session2[0].description).toBe('snap-B');

    const all = mgr.getHistory();
    expect(all).toHaveLength(3);
  });
});

// ===========================================================================
// 13. RestoreSnapshot returns false for unknown id
// ===========================================================================

describe('SnapshotManager — unknown snapshot', () => {
  test('restoreSnapshot returns restored: false for non-existent id', async () => {
    const projectDir = makeTmpProject({ git: false });
    const mgr = new SnapshotManager({ projectDir });

    const result = await mgr.restoreSnapshot('does-not-exist');

    expect(result.restored).toBe(false);
    expect(result.description).toContain('not found');
  });

  test('restoreSnapshot returns restored: false for empty string id', async () => {
    const projectDir = makeTmpProject({ git: false });
    const mgr = new SnapshotManager({ projectDir });

    const result = await mgr.restoreSnapshot('');

    expect(result.restored).toBe(false);
    expect(result.description).toContain('not found');
  });
});

// ===========================================================================
// 14. Multiple sequential snapshots maintain order
// ===========================================================================

describe('SnapshotManager — ordering', () => {
  test('snapshots are stored in chronological order', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });

    const snap1 = await mgr.captureSnapshot(snapParams('first'));
    const snap2 = await mgr.captureSnapshot(snapParams('second'));
    const snap3 = await mgr.captureSnapshot(snapParams('third'));

    const history = mgr.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].id).toBe(snap1.id);
    expect(history[1].id).toBe(snap2.id);
    expect(history[2].id).toBe(snap3.id);
    expect(history[0].description).toBe('first');
    expect(history[1].description).toBe('second');
    expect(history[2].description).toBe('third');

    // Timestamps should be non-decreasing
    for (let i = 1; i < history.length; i++) {
      expect(history[i].timestamp.getTime()).toBeGreaterThanOrEqual(
        history[i - 1].timestamp.getTime()
      );
    }
  });

  test('count property reflects number of snapshots', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });
    expect(mgr.count).toBe(0);

    await mgr.captureSnapshot(snapParams('a'));
    expect(mgr.count).toBe(1);

    await mgr.captureSnapshot(snapParams('b'));
    expect(mgr.count).toBe(2);

    await mgr.captureSnapshot(snapParams('c'));
    expect(mgr.count).toBe(3);
  });
});

// ===========================================================================
// 15. Snapshot works in temp directories
// ===========================================================================

describe('SnapshotManager — temp directory operation', () => {
  test('non-git project in temp directory creates snapshot structure', async () => {
    const projectDir = makeTmpProject({ git: false });
    writeFile(projectDir, 'hello.txt', 'world');

    const mgr = new SnapshotManager({ projectDir });

    // Snapshot directory should exist
    expect(fs.existsSync(path.join(projectDir, '.nimbus', 'snapshots'))).toBe(true);

    const snap = await mgr.captureSnapshot(snapParams('temp-snap'));

    const snapshotSubdir = path.join(projectDir, '.nimbus', 'snapshots', snap.id);
    expect(fs.existsSync(snapshotSubdir)).toBe(true);
    expect(fs.existsSync(path.join(snapshotSubdir, 'hello.txt'))).toBe(true);
  });

  test('git project uses GIT_INDEX_FILE environment variable', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });
    await mgr.captureSnapshot(snapParams('git-temp-snap'));

    // Verify exec was called with env containing GIT_INDEX_FILE
    const execCalls = vi.mocked(child_process.exec).mock.calls;
    const addCall = execCalls.find(c => String(c[0]).includes('git add -A'));
    expect(addCall).toBeDefined();

    // The options (second argument) should have env with GIT_INDEX_FILE
    if (addCall && typeof addCall[1] === 'object' && addCall[1] !== null) {
      const opts = addCall[1] as { env?: Record<string, string> };
      expect(opts.env?.GIT_INDEX_FILE).toBeDefined();
      expect(opts.env?.GIT_INDEX_FILE).toContain('index.nimbus-snapshot');
    }
  });
});

// ===========================================================================
// Additional edge cases
// ===========================================================================

describe('SnapshotManager — edge cases', () => {
  test('undo followed by redo followed by undo returns to original', async () => {
    const projectDir = makeTmpProject({ git: false });
    writeFile(projectDir, 'file.txt', 'base');

    const mgr = new SnapshotManager({ projectDir });

    await mgr.captureSnapshot(snapParams('base'));

    writeFile(projectDir, 'file.txt', 'changed');
    await mgr.captureSnapshot(snapParams('change'));

    // Undo -> back to base
    const undo1 = await mgr.undo();
    expect(undo1.success).toBe(true);
    expect(mgr.count).toBe(1);
    expect(fs.readFileSync(path.join(projectDir, 'file.txt'), 'utf-8')).toBe('base');

    // Redo -> forward to change
    const redo1 = await mgr.redo();
    expect(redo1.success).toBe(true);
    expect(mgr.count).toBe(2);
    expect(fs.readFileSync(path.join(projectDir, 'file.txt'), 'utf-8')).toBe('changed');

    // Undo again -> back to base
    const undo2 = await mgr.undo();
    expect(undo2.success).toBe(true);
    expect(mgr.count).toBe(1);
    expect(fs.readFileSync(path.join(projectDir, 'file.txt'), 'utf-8')).toBe('base');
  });

  test('restoreSnapshot catches and reports errors gracefully', async () => {
    const projectDir = makeTmpProject({ git: true });

    // Mock: write-tree succeeds, but read-tree fails
    execMockImpl = (cmd: string, opts: unknown, cb?: Function) => {
      const callback = typeof opts === 'function' ? opts : cb;
      if (typeof callback === 'function') {
        if (typeof cmd === 'string' && cmd.includes('write-tree')) {
          callback(null, { stdout: 'error-hash\n', stderr: '' });
        } else if (typeof cmd === 'string' && cmd.includes('read-tree')) {
          callback(new Error('git read-tree failed: corrupted tree'));
        } else if (typeof cmd === 'string' && cmd.includes('git add')) {
          callback(null, { stdout: '', stderr: '' });
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      }
      return { pid: 99 } as child_process.ChildProcess;
    };

    const mgr = new SnapshotManager({ projectDir });
    const snap = await mgr.captureSnapshot(snapParams('will-fail-restore'));

    const result = await mgr.restoreSnapshot(snap.id);

    expect(result.restored).toBe(false);
    expect(result.description).toContain('Failed to restore');
  });

  test('cleanup removes stale entries from the redo stack by maxAge', async () => {
    const projectDir = makeTmpProject({ git: false });
    const mgr = new SnapshotManager({ projectDir, maxAge: 50 });

    writeFile(projectDir, 'a.txt', 'a');
    await mgr.captureSnapshot(snapParams('snap-a'));
    writeFile(projectDir, 'b.txt', 'b');
    await mgr.captureSnapshot(snapParams('snap-b'));

    // Backdate BOTH snapshots while they are on the main stack.
    // This ensures snap-b's timestamp is old even after it moves to redo.
    const allSnaps = mgr.getHistory();
    for (const s of allSnaps) {
      (s as { timestamp: Date }).timestamp = new Date(Date.now() - 100);
    }

    // Undo: moves snap-b (already backdated) to the redo stack
    await mgr.undo();

    // Now snap-a is on main stack (backdated), snap-b is on redo stack (backdated)
    // Cleanup should expire snap-a from main stack and snap-b from redo stack
    await mgr.cleanup();

    expect(mgr.count).toBe(0);

    // Redo should fail because the redo stack entry was also cleaned
    const redoResult = await mgr.redo();
    expect(redoResult.success).toBe(false);
    expect(redoResult.description).toBe('Nothing to redo');
  });

  test('each snapshot has a unique UUID', async () => {
    const projectDir = makeTmpProject({ git: true });
    installGitMock();

    const mgr = new SnapshotManager({ projectDir });

    const snap1 = await mgr.captureSnapshot(snapParams('a'));
    const snap2 = await mgr.captureSnapshot(snapParams('b'));
    const snap3 = await mgr.captureSnapshot(snapParams('c'));

    const ids = new Set([snap1.id, snap2.id, snap3.id]);
    expect(ids.size).toBe(3);
  });
});
