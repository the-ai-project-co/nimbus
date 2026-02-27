/**
 * Filesystem Watcher
 *
 * Watches the project directory for file changes and emits events
 * that the agent loop can respond to (e.g., re-reading modified files).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';

export interface FileChangeEvent {
  type: 'change' | 'rename';
  path: string;
  timestamp: number;
}

export class FileWatcher extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;
  private changes: FileChangeEvent[] = [];
  private readonly maxChanges = 100;
  private readonly ignorePatterns = [
    'node_modules',
    '.git',
    'dist',
    'coverage',
    '.nimbus',
    '__pycache__',
    '.terraform',
  ];

  constructor(private readonly rootDir: string) {
    super();
  }

  /**
   * Start watching the project directory.
   */
  start(): void {
    if (this.watcher) {
      return;
    }

    try {
      this.watcher = fs.watch(this.rootDir, { recursive: true }, (eventType, filename) => {
        if (!filename) {
          return;
        }

        // Skip ignored paths
        const parts = filename.split(path.sep);
        if (parts.some(p => this.ignorePatterns.includes(p))) {
          return;
        }

        // Skip hidden files
        if (parts.some(p => p.startsWith('.') && p !== '.env')) {
          return;
        }

        const event: FileChangeEvent = {
          type: eventType as 'change' | 'rename',
          path: path.join(this.rootDir, filename),
          timestamp: Date.now(),
        };

        this.changes.push(event);
        if (this.changes.length > this.maxChanges) {
          this.changes.shift();
        }

        this.emit('change', event);
      });

      // recursive:true is only supported on macOS and Windows.
      // On Linux, fs.watch silently ignores the flag and only watches the root dir.
      if (process.platform === 'linux') {
        // Watch key subdirectories individually as a workaround
        const subdirs = ['src', 'lib', 'app', 'packages', 'services', 'test', 'tests', 'scripts'];
        for (const sub of subdirs) {
          const subPath = path.join(this.rootDir, sub);
          try {
            if (fs.existsSync(subPath) && fs.statSync(subPath).isDirectory()) {
              fs.watch(subPath, { recursive: false }, (eventType, filename) => {
                if (!filename) {
                  return;
                }
                const fullPath = path.join(subPath, filename);
                const relParts = path.relative(this.rootDir, fullPath).split(path.sep);
                if (relParts.some(p => this.ignorePatterns.includes(p))) {
                  return;
                }
                if (relParts.some(p => p.startsWith('.') && p !== '.env')) {
                  return;
                }
                const event: FileChangeEvent = {
                  type: eventType as 'change' | 'rename',
                  path: fullPath,
                  timestamp: Date.now(),
                };
                this.changes.push(event);
                if (this.changes.length > this.maxChanges) {
                  this.changes.shift();
                }
                this.emit('change', event);
              });
            }
          } catch {
            /* non-critical */
          }
        }
      }
    } catch {
      // Watching is non-critical -- some systems don't support recursive watch
    }
  }

  /**
   * Stop watching.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  /**
   * Get recent changes since a timestamp.
   */
  getChangesSince(timestamp: number): FileChangeEvent[] {
    return this.changes.filter(c => c.timestamp > timestamp);
  }

  /**
   * Get a summary of recent changes for the agent context.
   */
  getSummary(since?: number): string {
    const relevant = since ? this.getChangesSince(since) : this.changes;
    if (relevant.length === 0) {
      return '';
    }

    const uniquePaths = [...new Set(relevant.map(c => c.path))];
    const lines = uniquePaths.slice(-20).map(p => {
      const rel = path.relative(this.rootDir, p);
      return `  - ${rel}`;
    });

    return `Files changed externally:\n${lines.join('\n')}`;
  }

  /**
   * Clear the change history.
   */
  clearChanges(): void {
    this.changes = [];
  }

  get isWatching(): boolean {
    return this.watcher !== null;
  }
}
