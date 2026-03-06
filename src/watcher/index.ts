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
  /** Circular ring buffer for file-change events (avoids O(n) shift on cap). */
  private readonly changesBuffer: FileChangeEvent[];
  private changesHead = 0; // index of the next write slot
  private changesSize = 0; // number of valid entries currently stored
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
    this.changesBuffer = new Array(this.maxChanges);
  }

  /** Push a change event into the ring buffer (O(1)). */
  private pushChange(event: FileChangeEvent): void {
    this.changesBuffer[this.changesHead] = event;
    this.changesHead = (this.changesHead + 1) % this.maxChanges;
    if (this.changesSize < this.maxChanges) {
      this.changesSize++;
    }
  }

  /** Return all stored change events in chronological order. */
  private getOrderedChanges(): FileChangeEvent[] {
    if (this.changesSize === 0) return [];
    const start = this.changesSize < this.maxChanges
      ? 0
      : this.changesHead; // oldest slot when buffer is full
    const result: FileChangeEvent[] = new Array(this.changesSize);
    for (let i = 0; i < this.changesSize; i++) {
      result[i] = this.changesBuffer[(start + i) % this.maxChanges];
    }
    return result;
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

        this.pushChange(event);

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
                this.pushChange(event);
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
    return this.getOrderedChanges().filter(c => c.timestamp > timestamp);
  }

  /**
   * Get a summary of recent changes for the agent context.
   * When `devopsOnly` is true, filters to DevOps-relevant files only:
   * .tf, .yaml, .yml, Dockerfile, docker-compose.*, Jenkinsfile, .github/workflows/*.
   */
  getSummary(since?: number, devopsOnly = false): string {
    const relevant = since ? this.getChangesSince(since) : this.getOrderedChanges();
    if (relevant.length === 0) {
      return '';
    }

    const filtered = devopsOnly
      ? relevant.filter(c => {
          const f = c.path.toLowerCase();
          const base = path.basename(f);
          return (
            f.endsWith('.tf') ||
            f.endsWith('.tfvars') ||
            f.endsWith('.yaml') ||
            f.endsWith('.yml') ||
            base === 'dockerfile' ||
            base.startsWith('dockerfile.') ||
            base.startsWith('docker-compose') ||
            base === 'jenkinsfile' ||
            f.includes('.github/workflows')
          );
        })
      : relevant;

    if (filtered.length === 0) {
      return '';
    }

    const uniquePaths = [...new Set(filtered.map(c => c.path))];
    const lines = uniquePaths.slice(-20).map(p => {
      const rel = path.relative(this.rootDir, p);
      // Categorize for DevOps context
      let category = '';
      const lower = rel.toLowerCase();
      if (lower.endsWith('.tf') || lower.endsWith('.tfvars')) category = ' [terraform]';
      else if (lower.endsWith('.yaml') || lower.endsWith('.yml')) category = ' [yaml/k8s]';
      else if (lower.includes('dockerfile')) category = ' [docker]';
      return `  - ${rel}${category}`;
    });

    return `Files changed externally:\n${lines.join('\n')}`;
  }

  /**
   * Clear the change history.
   */
  clearChanges(): void {
    this.changesHead = 0;
    this.changesSize = 0;
  }

  get isWatching(): boolean {
    return this.watcher !== null;
  }
}
