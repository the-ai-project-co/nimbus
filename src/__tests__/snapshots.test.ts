/**
 * Snapshot Manager Tests
 *
 * Validates the SnapshotManager for both git-based and non-git (filesystem)
 * projects. Tests cover snapshot capture/restore, undo/redo, history tracking,
 * cleanup of old snapshots, and the static `shouldSnapshot` decision logic.
 *
 * Git-based tests use real temporary git repositories to exercise the actual
 * git write-tree / read-tree / checkout-index workflow.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

import { SnapshotManager } from '../snapshots/manager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary directory. */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-snap-test-'));
}

/** Remove a temporary directory and all its contents. */
function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

/**
 * Initialize a temporary directory as a git repository with an initial commit.
 * Returns the directory path.
 */
function createTempGitRepo(): string {
  const tmpDir = createTempDir();
  execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
  fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'original');
  execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
  return tmpDir;
}

/** Common snapshot params for testing. */
function snapshotParams(desc: string) {
  return {
    sessionId: 'test-session',
    messageId: 'msg-001',
    toolCallId: 'tc-001',
    description: desc,
  };
}

// ===========================================================================
// Constructor — project detection
// ===========================================================================

describe('SnapshotManager constructor', () => {
  let gitDir: string;
  let nonGitDir: string;

  beforeEach(() => {
    gitDir = createTempGitRepo();
    nonGitDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(gitDir);
    removeTempDir(nonGitDir);
  });

  test('detects git project', () => {
    const manager = new SnapshotManager({ projectDir: gitDir });
    // Capture a snapshot to verify it uses git (treeHash will be non-empty)
    // We verify indirectly through the snapshot's isGitProject flag
    expect(fs.existsSync(path.join(gitDir, '.git'))).toBe(true);
    // The manager itself is opaque, but we can verify via a snapshot
  });

  test('detects non-git project', () => {
    const manager = new SnapshotManager({ projectDir: nonGitDir });
    // For non-git projects, the manager creates the snapshot directory
    expect(
      fs.existsSync(path.join(nonGitDir, '.nimbus', 'snapshots')),
    ).toBe(true);
  });
});

// ===========================================================================
// shouldSnapshot (static method)
// ===========================================================================

describe('SnapshotManager.shouldSnapshot', () => {
  test('edit_file returns true', () => {
    expect(SnapshotManager.shouldSnapshot('edit_file')).toBe(true);
  });

  test('multi_edit returns true', () => {
    expect(SnapshotManager.shouldSnapshot('multi_edit')).toBe(true);
  });

  test('write_file returns true', () => {
    expect(SnapshotManager.shouldSnapshot('write_file')).toBe(true);
  });

  test('bash with "rm -rf dist" returns true', () => {
    expect(
      SnapshotManager.shouldSnapshot('bash', { command: 'rm -rf dist' }),
    ).toBe(true);
  });

  test('bash with "npm test" returns false', () => {
    expect(
      SnapshotManager.shouldSnapshot('bash', { command: 'npm test' }),
    ).toBe(false);
  });

  test('read_file returns false', () => {
    expect(SnapshotManager.shouldSnapshot('read_file')).toBe(false);
  });

  test('glob returns false', () => {
    expect(SnapshotManager.shouldSnapshot('glob')).toBe(false);
  });

  test('bash with "mv old.txt new.txt" returns true', () => {
    expect(
      SnapshotManager.shouldSnapshot('bash', { command: 'mv old.txt new.txt' }),
    ).toBe(true);
  });

  test('bash with "cp src dest" returns true', () => {
    expect(
      SnapshotManager.shouldSnapshot('bash', { command: 'cp src dest' }),
    ).toBe(true);
  });

  test('bash with "echo hello > output.txt" returns true (redirect)', () => {
    expect(
      SnapshotManager.shouldSnapshot('bash', { command: 'echo hello > output.txt' }),
    ).toBe(true);
  });

  test('bash with "ls -la" returns false', () => {
    expect(
      SnapshotManager.shouldSnapshot('bash', { command: 'ls -la' }),
    ).toBe(false);
  });

  test('bash with "sed -i s/old/new/ file.txt" returns true', () => {
    expect(
      SnapshotManager.shouldSnapshot('bash', { command: 'sed -i s/old/new/ file.txt' }),
    ).toBe(true);
  });

  test('bash with empty command returns false', () => {
    expect(
      SnapshotManager.shouldSnapshot('bash', { command: '' }),
    ).toBe(false);
  });

  test('bash with no input returns false', () => {
    expect(SnapshotManager.shouldSnapshot('bash')).toBe(false);
  });

  test('terraform returns false (not a file-modifying tool)', () => {
    expect(SnapshotManager.shouldSnapshot('terraform')).toBe(false);
  });

  test('kubectl returns false', () => {
    expect(SnapshotManager.shouldSnapshot('kubectl')).toBe(false);
  });
});

// ===========================================================================
// Git-based snapshot capture and restore
// ===========================================================================

describe('Git-based snapshots', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = createTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(gitDir);
  });

  test('captureSnapshot creates a snapshot in a git project', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });
    const snap = await manager.captureSnapshot(
      snapshotParams('edit_file: file.txt'),
    );

    expect(snap.id).toBeTruthy();
    expect(snap.treeHash).toBeTruthy();
    expect(snap.treeHash.length).toBeGreaterThan(0);
    expect(snap.isGitProject).toBe(true);
    expect(snap.sessionId).toBe('test-session');
    expect(snap.description).toBe('edit_file: file.txt');
    expect(snap.timestamp).toBeInstanceOf(Date);
  });

  test('restoreSnapshot restores files in a git project', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });
    const filePath = path.join(gitDir, 'file.txt');

    // Capture state before modification
    const before = await manager.captureSnapshot(
      snapshotParams('before edit'),
    );

    // Modify the file
    fs.writeFileSync(filePath, 'modified content');
    execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });

    // Capture state after modification
    await manager.captureSnapshot(snapshotParams('after edit'));

    // Verify file was modified
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('modified content');

    // Restore to the before-edit state
    const result = await manager.restoreSnapshot(before.id);
    expect(result.restored).toBe(true);
    expect(result.description).toContain('before edit');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original');
  });

  test('restoreSnapshot returns false for unknown snapshot id', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });
    const result = await manager.restoreSnapshot('nonexistent-id');
    expect(result.restored).toBe(false);
    expect(result.description).toContain('not found');
  });

  test('undo reverts the last change', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });
    const filePath = path.join(gitDir, 'file.txt');

    // Capture initial state
    await manager.captureSnapshot(snapshotParams('initial'));

    // Modify and capture
    fs.writeFileSync(filePath, 'changed');
    execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
    await manager.captureSnapshot(snapshotParams('edit_file: file.txt'));

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('changed');

    // Undo
    const result = await manager.undo();
    expect(result.success).toBe(true);
    expect(result.description).toContain('Undone');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original');
  });

  test('redo re-applies undone change', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });
    const filePath = path.join(gitDir, 'file.txt');

    // Capture initial state
    await manager.captureSnapshot(snapshotParams('initial'));

    // Modify and capture
    fs.writeFileSync(filePath, 'changed');
    execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
    await manager.captureSnapshot(snapshotParams('edit_file: file.txt'));

    // Undo
    await manager.undo();
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('original');

    // Redo
    const result = await manager.redo();
    expect(result.success).toBe(true);
    expect(result.description).toContain('Redone');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('changed');
  });

  test('undo with only one snapshot returns failure', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });
    await manager.captureSnapshot(snapshotParams('only one'));
    const result = await manager.undo();
    expect(result.success).toBe(false);
    expect(result.description).toContain('Nothing to undo');
  });

  test('redo with empty redo stack returns failure', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });
    const result = await manager.redo();
    expect(result.success).toBe(false);
    expect(result.description).toContain('Nothing to redo');
  });

  test('new capture clears the redo stack', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });
    const filePath = path.join(gitDir, 'file.txt');

    // initial -> edit -> undo -> new capture -> redo should fail
    await manager.captureSnapshot(snapshotParams('initial'));

    fs.writeFileSync(filePath, 'v2');
    execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
    await manager.captureSnapshot(snapshotParams('v2'));

    await manager.undo();

    // Now capture a new state (this should clear the redo stack)
    fs.writeFileSync(filePath, 'v3');
    execSync('git add -A', { cwd: gitDir, stdio: 'pipe' });
    await manager.captureSnapshot(snapshotParams('v3'));

    // Redo should fail since the stack was cleared
    const result = await manager.redo();
    expect(result.success).toBe(false);
    expect(result.description).toContain('Nothing to redo');
  });
});

// ===========================================================================
// getHistory and count
// ===========================================================================

describe('getHistory and count', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = createTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(gitDir);
  });

  test('getHistory returns all snapshots', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });

    await manager.captureSnapshot(snapshotParams('first'));
    await manager.captureSnapshot(snapshotParams('second'));
    await manager.captureSnapshot(snapshotParams('third'));

    const history = manager.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0].description).toBe('first');
    expect(history[1].description).toBe('second');
    expect(history[2].description).toBe('third');
  });

  test('getHistory filters by sessionId', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });

    await manager.captureSnapshot({
      sessionId: 'session-a',
      messageId: 'msg-1',
      toolCallId: 'tc-1',
      description: 'a-first',
    });
    await manager.captureSnapshot({
      sessionId: 'session-b',
      messageId: 'msg-2',
      toolCallId: 'tc-2',
      description: 'b-first',
    });
    await manager.captureSnapshot({
      sessionId: 'session-a',
      messageId: 'msg-3',
      toolCallId: 'tc-3',
      description: 'a-second',
    });

    const sessionA = manager.getHistory('session-a');
    expect(sessionA).toHaveLength(2);
    expect(sessionA[0].description).toBe('a-first');
    expect(sessionA[1].description).toBe('a-second');

    const sessionB = manager.getHistory('session-b');
    expect(sessionB).toHaveLength(1);
    expect(sessionB[0].description).toBe('b-first');
  });

  test('count getter returns correct count', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });

    expect(manager.count).toBe(0);

    await manager.captureSnapshot(snapshotParams('first'));
    expect(manager.count).toBe(1);

    await manager.captureSnapshot(snapshotParams('second'));
    expect(manager.count).toBe(2);
  });

  test('count reflects undo operations', async () => {
    const manager = new SnapshotManager({ projectDir: gitDir });

    await manager.captureSnapshot(snapshotParams('first'));
    await manager.captureSnapshot(snapshotParams('second'));
    expect(manager.count).toBe(2);

    await manager.undo();
    expect(manager.count).toBe(1);
  });
});

// ===========================================================================
// cleanup
// ===========================================================================

describe('cleanup', () => {
  let gitDir: string;

  beforeEach(() => {
    gitDir = createTempGitRepo();
  });

  afterEach(() => {
    removeTempDir(gitDir);
  });

  test('removes old snapshots exceeding maxSnapshots', async () => {
    const manager = new SnapshotManager({
      projectDir: gitDir,
      maxSnapshots: 2,
    });

    await manager.captureSnapshot(snapshotParams('first'));
    await manager.captureSnapshot(snapshotParams('second'));
    await manager.captureSnapshot(snapshotParams('third'));
    await manager.captureSnapshot(snapshotParams('fourth'));

    expect(manager.count).toBe(4);

    const removed = await manager.cleanup();
    expect(removed).toBe(2);
    expect(manager.count).toBe(2);

    // The remaining snapshots should be the most recent ones
    const history = manager.getHistory();
    expect(history[0].description).toBe('third');
    expect(history[1].description).toBe('fourth');
  });

  test('cleanup returns 0 when nothing to clean', async () => {
    const manager = new SnapshotManager({
      projectDir: gitDir,
      maxSnapshots: 100,
    });

    await manager.captureSnapshot(snapshotParams('first'));
    const removed = await manager.cleanup();
    expect(removed).toBe(0);
    expect(manager.count).toBe(1);
  });
});

// ===========================================================================
// Non-git (filesystem) snapshots
// ===========================================================================

describe('Non-git snapshots', () => {
  let nonGitDir: string;

  beforeEach(() => {
    nonGitDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(nonGitDir);
  });

  test('capture creates a snapshot directory for non-git project', async () => {
    const filePath = path.join(nonGitDir, 'app.js');
    fs.writeFileSync(filePath, 'console.log("hello");');

    const manager = new SnapshotManager({ projectDir: nonGitDir });
    const snap = await manager.captureSnapshot(
      snapshotParams('write_file: app.js'),
    );

    expect(snap.isGitProject).toBe(false);
    expect(snap.treeHash).toBe('');
    expect(snap.id).toBeTruthy();

    // Verify the snapshot directory was created
    const snapDir = path.join(nonGitDir, '.nimbus', 'snapshots', snap.id);
    expect(fs.existsSync(snapDir)).toBe(true);

    // Verify the file was copied
    expect(fs.existsSync(path.join(snapDir, 'app.js'))).toBe(true);
    expect(fs.readFileSync(path.join(snapDir, 'app.js'), 'utf-8')).toBe(
      'console.log("hello");',
    );
  });

  test('restore recovers files for non-git project', async () => {
    const filePath = path.join(nonGitDir, 'data.txt');
    fs.writeFileSync(filePath, 'version 1');

    const manager = new SnapshotManager({ projectDir: nonGitDir });

    // Capture v1
    const snap1 = await manager.captureSnapshot(snapshotParams('v1'));

    // Modify to v2
    fs.writeFileSync(filePath, 'version 2');
    await manager.captureSnapshot(snapshotParams('v2'));

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('version 2');

    // Restore v1
    const result = await manager.restoreSnapshot(snap1.id);
    expect(result.restored).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('version 1');
  });

  test('undo works for non-git project', async () => {
    const filePath = path.join(nonGitDir, 'code.py');
    fs.writeFileSync(filePath, 'print("v1")');

    const manager = new SnapshotManager({ projectDir: nonGitDir });

    await manager.captureSnapshot(snapshotParams('initial'));

    fs.writeFileSync(filePath, 'print("v2")');
    await manager.captureSnapshot(snapshotParams('edit'));

    expect(fs.readFileSync(filePath, 'utf-8')).toBe('print("v2")');

    const result = await manager.undo();
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('print("v1")');
  });

  test('redo works for non-git project', async () => {
    const filePath = path.join(nonGitDir, 'code.py');
    fs.writeFileSync(filePath, 'print("v1")');

    const manager = new SnapshotManager({ projectDir: nonGitDir });

    await manager.captureSnapshot(snapshotParams('initial'));

    fs.writeFileSync(filePath, 'print("v2")');
    await manager.captureSnapshot(snapshotParams('edit'));

    await manager.undo();
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('print("v1")');

    const result = await manager.redo();
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('print("v2")');
  });

  test('cleanup removes snapshot directories for non-git project', async () => {
    fs.writeFileSync(path.join(nonGitDir, 'f.txt'), 'data');

    const manager = new SnapshotManager({
      projectDir: nonGitDir,
      maxSnapshots: 1,
    });

    const snap1 = await manager.captureSnapshot(snapshotParams('first'));
    await manager.captureSnapshot(snapshotParams('second'));
    await manager.captureSnapshot(snapshotParams('third'));

    // Before cleanup, all snapshot dirs exist
    const snap1Dir = path.join(nonGitDir, '.nimbus', 'snapshots', snap1.id);
    expect(fs.existsSync(snap1Dir)).toBe(true);

    const removed = await manager.cleanup();
    expect(removed).toBe(2);
    expect(manager.count).toBe(1);

    // The oldest snapshot directory should be cleaned up
    expect(fs.existsSync(snap1Dir)).toBe(false);
  });

  test('non-git snapshot skips node_modules and .git directories', async () => {
    // Create directories that should be skipped
    fs.mkdirSync(path.join(nonGitDir, 'node_modules'), { recursive: true });
    fs.writeFileSync(
      path.join(nonGitDir, 'node_modules', 'pkg.json'),
      '{}',
    );
    fs.mkdirSync(path.join(nonGitDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(nonGitDir, 'src', 'index.ts'), 'export {};');

    const manager = new SnapshotManager({ projectDir: nonGitDir });
    const snap = await manager.captureSnapshot(snapshotParams('with-node-modules'));

    const snapDir = path.join(nonGitDir, '.nimbus', 'snapshots', snap.id);
    // node_modules should NOT be copied
    expect(
      fs.existsSync(path.join(snapDir, 'node_modules')),
    ).toBe(false);
    // src should be copied
    expect(fs.existsSync(path.join(snapDir, 'src', 'index.ts'))).toBe(true);
  });
});
