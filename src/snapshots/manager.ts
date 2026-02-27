/**
 * Snapshot Manager
 *
 * Captures and restores file state using git tree objects (for git projects)
 * or filesystem copies (for non-git projects). Supports undo/redo operations
 * for file-modifying tool calls during a Nimbus CLI session.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

const execAsync = promisify(exec);

/** Default maximum number of snapshots to retain. */
const DEFAULT_MAX_SNAPSHOTS = 100;

/** Default maximum age for snapshots: 7 days in milliseconds. */
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * Directories and patterns to skip when copying files in non-git mode.
 * These are typically large, generated, or internal directories that
 * should not be included in snapshot copies.
 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.nimbus',
  '.next',
  '.cache',
  '__pycache__',
]);

/**
 * Shell command patterns that indicate file-modifying operations.
 * Used by `shouldSnapshot` to detect bash commands that alter the filesystem.
 */
const FILE_MODIFYING_PATTERNS = [
  /\brm\b/,
  /\bmv\b/,
  /\bcp\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bsed\b/,
  /\bawk\b/,
  /\bmkdir\b/,
  /\brmdir\b/,
  /\btouch\b/,
  /\btruncate\b/,
  /\bln\b/,
  /\bunlink\b/,
  />/, // redirect operators: >, >>, 2>, etc.
];

/**
 * Tool names that always trigger a snapshot because they directly
 * modify files on disk.
 */
const SNAPSHOT_TOOL_NAMES = new Set(['edit_file', 'multi_edit', 'write_file']);

/**
 * Represents a single point-in-time snapshot of the working tree state.
 */
export interface Snapshot {
  /** Unique snapshot identifier (UUID v4). */
  id: string;
  /** Session ID that created this snapshot. */
  sessionId: string;
  /** Message ID associated with this snapshot. */
  messageId: string;
  /** Tool call ID that triggered this snapshot. */
  toolCallId: string;
  /** Git tree hash from `git write-tree`, or empty string for non-git projects. */
  treeHash: string;
  /** Timestamp when the snapshot was captured. */
  timestamp: Date;
  /** Human-readable description (e.g., "edit_file: src/server.ts"). */
  description: string;
  /** Whether this snapshot was captured from a git project. */
  isGitProject: boolean;
}

/**
 * Configuration options for the SnapshotManager.
 */
export interface SnapshotManagerOptions {
  /** Absolute path to the project directory to manage snapshots for. */
  projectDir: string;
  /** Maximum number of snapshots to retain. Defaults to 100. */
  maxSnapshots?: number;
  /** Maximum age for snapshots in milliseconds. Defaults to 7 days. */
  maxAge?: number;
}

/**
 * Result of a restore, undo, or redo operation.
 */
interface SnapshotOperationResult {
  /** Whether the operation succeeded. */
  success: boolean;
  /** Human-readable description of what was restored, or an error message. */
  description: string;
}

/**
 * Manages snapshots of the working tree for undo/redo support.
 *
 * For git-based projects, snapshots are captured as git tree objects using
 * `git write-tree`, which records the full index state without creating a commit.
 * Restoring reads the tree back into the index and checks out all files.
 *
 * For non-git projects, snapshots are stored as full directory copies under
 * `.nimbus/snapshots/{id}/`, skipping large generated directories like
 * `node_modules` and `dist`.
 */
export class SnapshotManager {
  private readonly projectDir: string;
  private readonly maxSnapshots: number;
  private readonly maxAge: number;
  private readonly isGitProject: boolean;
  private readonly snapshotDir: string;
  private snapshots: Snapshot[] = [];
  private undoneSnapshots: Snapshot[] = [];
  private nextId: number = 1;

  constructor(options: SnapshotManagerOptions) {
    this.projectDir = options.projectDir;
    this.maxSnapshots = options.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS;
    this.maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
    this.snapshotDir = path.join(options.projectDir, '.nimbus', 'snapshots');

    // Detect if the project directory is a git repository
    this.isGitProject = fs.existsSync(path.join(options.projectDir, '.git'));

    // For non-git projects, ensure the snapshot directory exists
    if (!this.isGitProject) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
  }

  /**
   * Capture a snapshot of the current working tree state.
   *
   * For git projects:
   *   1. Creates a temporary git index and stages all changes into it
   *   2. Captures a tree hash with `git write-tree` (no commit is created)
   *   3. Removes the temporary index; the user's real staging area is untouched
   *
   * For non-git projects:
   *   1. Creates a numbered snapshot directory under `.nimbus/snapshots/{id}/`
   *   2. Recursively copies all tracked files, skipping `node_modules`,
   *      `.git`, `dist`, `coverage`, and `.nimbus/snapshots`
   *
   * @param params - Metadata describing the tool call that triggered this snapshot.
   * @returns The newly created Snapshot record.
   */
  async captureSnapshot(params: {
    sessionId: string;
    messageId: string;
    toolCallId: string;
    description: string;
  }): Promise<Snapshot> {
    const snapshotId = crypto.randomUUID();
    let treeHash = '';

    if (this.isGitProject) {
      treeHash = await this.captureGitSnapshot();
    } else {
      await this.captureFilesystemSnapshot(snapshotId);
    }

    const snapshot: Snapshot = {
      id: snapshotId,
      sessionId: params.sessionId,
      messageId: params.messageId,
      toolCallId: params.toolCallId,
      treeHash,
      timestamp: new Date(),
      description: params.description,
      isGitProject: this.isGitProject,
    };

    this.snapshots.push(snapshot);
    this.nextId++;

    // Clear the redo stack whenever a new snapshot is captured,
    // since the timeline has diverged
    this.undoneSnapshots = [];

    return snapshot;
  }

  /**
   * Restore the working tree to the state recorded in a specific snapshot.
   *
   * For git projects:
   *   Uses `git read-tree` and `git checkout-index -a -f` to replace the
   *   working tree contents with the snapshot's tree hash.
   *
   * For non-git projects:
   *   Copies files back from the snapshot directory, replacing current contents.
   *
   * @param snapshotId - The ID of the snapshot to restore.
   * @returns An object indicating whether the restore succeeded and a description.
   */
  async restoreSnapshot(snapshotId: string): Promise<{ restored: boolean; description: string }> {
    const snapshot = this.snapshots.find(s => s.id === snapshotId);
    if (!snapshot) {
      return { restored: false, description: `Snapshot ${snapshotId} not found` };
    }

    try {
      if (snapshot.isGitProject) {
        await this.restoreGitSnapshot(snapshot.treeHash);
      } else {
        await this.restoreFilesystemSnapshot(snapshot.id);
      }

      return { restored: true, description: `Restored snapshot: ${snapshot.description}` };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { restored: false, description: `Failed to restore snapshot: ${message}` };
    }
  }

  /**
   * Undo the last file-modifying tool call by restoring the previous snapshot.
   *
   * Before restoring, the current working tree state is captured so that
   * `redo()` can reverse the undo operation if needed.
   *
   * @returns An object indicating whether the undo succeeded and a description.
   */
  async undo(): Promise<SnapshotOperationResult> {
    if (this.snapshots.length < 2) {
      return { success: false, description: 'Nothing to undo' };
    }

    try {
      // Pop the most recent snapshot (this is the state we are undoing)
      const current = this.snapshots.pop()!;

      // Push it onto the redo stack so we can redo later
      this.undoneSnapshots.push(current);

      // The snapshot we want to restore is now the last one in the stack
      const target = this.snapshots[this.snapshots.length - 1];

      if (target.isGitProject) {
        await this.restoreGitSnapshot(target.treeHash);
      } else {
        await this.restoreFilesystemSnapshot(target.id);
      }

      return { success: true, description: `Undone: ${current.description}` };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, description: `Undo failed: ${message}` };
    }
  }

  /**
   * Redo a previously undone snapshot.
   *
   * Pops the most recently undone snapshot from the redo stack and restores
   * it, pushing it back onto the main snapshot stack.
   *
   * @returns An object indicating whether the redo succeeded and a description.
   */
  async redo(): Promise<SnapshotOperationResult> {
    if (this.undoneSnapshots.length === 0) {
      return { success: false, description: 'Nothing to redo' };
    }

    try {
      const snapshot = this.undoneSnapshots.pop()!;

      if (snapshot.isGitProject) {
        await this.restoreGitSnapshot(snapshot.treeHash);
      } else {
        await this.restoreFilesystemSnapshot(snapshot.id);
      }

      // Push back onto main stack
      this.snapshots.push(snapshot);

      return { success: true, description: `Redone: ${snapshot.description}` };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, description: `Redo failed: ${message}` };
    }
  }

  /**
   * Get snapshot history, optionally filtered to a specific session.
   *
   * @param sessionId - If provided, only return snapshots from this session.
   * @returns An array of Snapshot records, ordered oldest to newest.
   */
  getHistory(sessionId?: string): Snapshot[] {
    if (sessionId) {
      return this.snapshots.filter(s => s.sessionId === sessionId);
    }
    return [...this.snapshots];
  }

  /**
   * Get the total number of snapshots currently stored.
   */
  get count(): number {
    return this.snapshots.length;
  }

  /**
   * Clean up old snapshots that exceed `maxAge` or `maxSnapshots`.
   *
   * Snapshots older than `maxAge` are removed first, then the oldest
   * snapshots are trimmed until the total count is at or below `maxSnapshots`.
   * For non-git projects, the corresponding snapshot directories are also
   * deleted from disk.
   *
   * @returns The number of snapshots that were removed.
   */
  async cleanup(): Promise<number> {
    const now = Date.now();
    const originalCount = this.snapshots.length;

    // Remove snapshots older than maxAge
    const expired = this.snapshots.filter(s => now - s.timestamp.getTime() > this.maxAge);

    this.snapshots = this.snapshots.filter(s => now - s.timestamp.getTime() <= this.maxAge);

    // Trim to maxSnapshots (keep most recent)
    let trimmed: Snapshot[] = [];
    if (this.snapshots.length > this.maxSnapshots) {
      const excess = this.snapshots.length - this.maxSnapshots;
      trimmed = this.snapshots.splice(0, excess);
    }

    // Clean up filesystem snapshot directories for non-git projects
    const removed = [...expired, ...trimmed];
    if (!this.isGitProject) {
      for (const snapshot of removed) {
        const snapshotPath = path.join(this.snapshotDir, snapshot.id);
        try {
          if (fs.existsSync(snapshotPath)) {
            fs.rmSync(snapshotPath, { recursive: true, force: true });
          }
        } catch {
          // Best-effort cleanup; do not throw on individual directory failures
        }
      }
    }

    // Also clean stale entries from the redo stack
    this.undoneSnapshots = this.undoneSnapshots.filter(
      s => now - s.timestamp.getTime() <= this.maxAge
    );

    return originalCount - this.snapshots.length;
  }

  /**
   * Determine whether a tool call should trigger a snapshot capture.
   *
   * Returns `true` for tools that directly modify files:
   * - `edit_file`, `multi_edit`, `write_file` always return true.
   * - `bash` returns true if the command string contains patterns
   *   indicative of file modification (rm, mv, cp, sed, redirect operators, etc.).
   *
   * @param toolName - The name of the tool being invoked.
   * @param input - Optional input parameters for the tool call.
   * @returns Whether a snapshot should be taken before this tool executes.
   */
  static shouldSnapshot(toolName: string, input?: Record<string, unknown>): boolean {
    // These tools always modify files
    if (SNAPSHOT_TOOL_NAMES.has(toolName)) {
      return true;
    }

    // For bash commands, inspect the command string for file-modifying patterns
    if (toolName === 'bash' && input) {
      const command = typeof input.command === 'string' ? input.command : '';
      if (!command) {
        return false;
      }

      return FILE_MODIFYING_PATTERNS.some(pattern => pattern.test(command));
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Capture a git tree hash using a temporary index file.
   *
   * Uses `GIT_INDEX_FILE` to operate on an isolated temporary index so that
   * the user's real staging area (`.git/index`) is never modified.
   *
   * @returns The git tree hash string.
   * @throws If the git commands fail.
   */
  private async captureGitSnapshot(): Promise<string> {
    // Use a temporary index to avoid corrupting the user's staging area.
    // GIT_INDEX_FILE tells git to use an alternate index, so `git add -A`
    // and `git write-tree` operate on the temp file, leaving the real
    // index (.git/index) untouched.
    const tmpIndex = path.join(this.projectDir, '.git', `index.nimbus-snapshot-${Date.now()}`);
    const env = { ...process.env, GIT_INDEX_FILE: tmpIndex };
    try {
      await execAsync('git add -A', { cwd: this.projectDir, env });
      const { stdout } = await execAsync('git write-tree', { cwd: this.projectDir, env });
      return stdout.trim();
    } finally {
      // Clean up the temporary index file
      try {
        fs.unlinkSync(tmpIndex);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Restore the working tree from a git tree hash.
   *
   * @param treeHash - The git tree hash to restore.
   * @throws If the git commands fail.
   */
  private async restoreGitSnapshot(treeHash: string): Promise<void> {
    await execAsync(`git read-tree ${treeHash}`, { cwd: this.projectDir });
    await execAsync('git checkout-index -a -f', { cwd: this.projectDir });
  }

  /**
   * Copy the current project files into a numbered snapshot directory.
   * Skips directories listed in SKIP_DIRS.
   *
   * @param snapshotId - The snapshot ID used to name the directory.
   */
  private async captureFilesystemSnapshot(snapshotId: string): Promise<void> {
    const destDir = path.join(this.snapshotDir, snapshotId);
    fs.mkdirSync(destDir, { recursive: true });

    this.copyDirectoryRecursive(this.projectDir, destDir);
  }

  /**
   * Restore project files from a snapshot directory by copying them back.
   * Cleans the project directory first (except for SKIP_DIRS and .nimbus)
   * to ensure deleted files are also restored correctly.
   *
   * @param snapshotId - The snapshot ID whose directory to restore from.
   * @throws If the snapshot directory does not exist.
   */
  private async restoreFilesystemSnapshot(snapshotId: string): Promise<void> {
    const srcDir = path.join(this.snapshotDir, snapshotId);
    if (!fs.existsSync(srcDir)) {
      throw new Error(`Snapshot directory not found: ${srcDir}`);
    }

    // Remove current project files (excluding skipped directories)
    this.cleanProjectDirectory();

    // Copy snapshot files back into the project directory
    this.copyDirectoryRecursive(srcDir, this.projectDir);
  }

  /**
   * Recursively copy a directory, skipping entries in SKIP_DIRS.
   * Uses `fs.cpSync` for individual files and recurses into subdirectories.
   *
   * @param src - Source directory path.
   * @param dest - Destination directory path.
   */
  private copyDirectoryRecursive(src: string, dest: string): void {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDirectoryRecursive(srcPath, destPath);
      } else {
        fs.cpSync(srcPath, destPath);
      }
    }
  }

  /**
   * Remove all files and non-skipped directories from the project directory.
   * This is used before restoring a non-git snapshot to ensure a clean state.
   */
  private cleanProjectDirectory(): void {
    const entries = fs.readdirSync(this.projectDir, { withFileTypes: true });

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(this.projectDir, entry.name);

      try {
        if (entry.isDirectory()) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      } catch {
        // Best-effort cleanup; continue on individual file failures
      }
    }
  }
}
