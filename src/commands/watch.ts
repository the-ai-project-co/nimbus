/**
 * nimbus watch — Watch files and trigger agent runs on change (M3)
 *
 * Usage:
 *   nimbus watch "*.tf" --run "validate the terraform changes"
 *   nimbus watch "src/**" --run "run tests" --debounce 2000
 */

import { basename } from 'node:path';
import { FSWatcher, watch as fsWatch } from 'node:fs';

export interface WatchOptions {
  /** Glob pattern to watch (e.g. "*.tf") */
  glob: string;
  /** Agent prompt to run on change */
  run?: string;
  /** Debounce delay in ms (default 500) */
  debounce?: number;
  /** Auto-approve agent runs */
  autoApprove?: boolean;
  /** Maximum number of runs before stopping (0 = unlimited) */
  maxRuns?: number;
}

/**
 * Simple glob pattern matching without external dependencies.
 * Supports: *.ext, *.*, prefix/**, prefix/name.ext
 */
function matchGlob(filename: string, pattern: string): boolean {
  // Normalize separators
  const f = filename.replace(/\\/g, '/');
  const p = pattern.replace(/\\/g, '/');

  // Convert glob pattern to regex
  const regexStr = p
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape regex special chars (but not * and ?)
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/__GLOBSTAR__/g, '.*');

  const re = new RegExp(`^${regexStr}$`);
  // Also match against basename for simple patterns like "*.tf"
  const base = basename(f);
  return re.test(f) || (!/\//.test(p) && re.test(base));
}

/**
 * Start watching files matching the glob pattern.
 * On change, triggers an agent run with the configured prompt.
 */
export async function watchCommand(options: WatchOptions): Promise<void> {
  const { glob, run, debounce = 500, autoApprove = false, maxRuns = 0 } = options;

  if (!glob) {
    console.error('Usage: nimbus watch <glob> --run "prompt"');
    process.exit(1);
  }

  if (!run) {
    console.error('Error: --run "prompt" is required for watch command');
    process.exit(1);
  }

  const cwd = process.cwd();
  console.log(`Watching ${glob} in ${cwd}...`);
  console.log(`On change, will run: "${run}"`);
  console.log('Press Ctrl+C to stop.\n');

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let runCount = 0;
  let isRunning = false;

  async function triggerRun(changedFile: string): Promise<void> {
    if (isRunning) {
      return; // Skip concurrent runs
    }
    if (maxRuns > 0 && runCount >= maxRuns) {
      console.log(`\nMaximum runs (${maxRuns}) reached. Stopping watcher.`);
      process.exit(0);
    }

    runCount++;
    isRunning = true;
    const prompt = `${run}\n\nChanged file: ${changedFile}`;

    try {
      console.log(`\n[${new Date().toLocaleTimeString()}] Change detected: ${changedFile}`);
      console.log(`Running: nimbus run "${run}"\n`);

      const { initApp } = await import('../app');
      const { executeRun } = await import('../cli/run');
      const { router } = await initApp();
      await executeRun(router, {
        prompt,
        format: 'text',
        autoApprove,
        stdin: false,
        stdinJson: false,
        mode: 'build',
        maxTurns: 10,
        rawToolOutput: false,
        schema: false,
        dryRun: false,
        exitOnError: false,
      });
    } catch (error) {
      console.error(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      isRunning = false;
    }
  }

  function onChange(filename: string | null): void {
    if (!filename) return;

    // Check if the file matches the glob pattern
    if (!matchGlob(filename, glob)) return;

    // Debounce rapid successive changes
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      triggerRun(filename).catch(err => {
        console.error('Watch trigger error:', err);
      });
    }, debounce);
  }

  let watcher: FSWatcher;
  try {
    watcher = fsWatch(cwd, { recursive: true }, (_eventType, filename) => {
      onChange(filename);
    });
  } catch (error) {
    console.error(`Failed to start watcher: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    console.log('\nWatcher stopped.');
    watcher.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    watcher.close();
    process.exit(0);
  });

  // Keep process alive
  await new Promise<void>(() => { /* intentionally never resolves */ });
}
