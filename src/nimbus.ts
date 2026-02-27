#!/usr/bin/env bun
/**
 * Nimbus CLI — Main Entry Point
 *
 * Single-process embedded architecture. All modules (LLM, tools, state,
 * enterprise, engine, generator) run in-process — no HTTP services needed.
 *
 * Usage:
 *   bun src/nimbus.ts --version
 *   bun src/nimbus.ts --help
 *   bun src/nimbus.ts chat
 *   bun src/nimbus.ts ask "what is terraform"
 *   bun src/nimbus.ts generate terraform --provider aws
 *   bun src/nimbus.ts tf plan
 */

import { VERSION } from './version';

/**
 * Non-blocking update check. Fires a single HTTPS HEAD request to npm
 * and prints a one-liner to stderr if a newer version exists. The check
 * uses a 3-second timeout so it never slows startup.
 */
function checkForUpdates(): void {
  // Only check for interactive TTY sessions, not in CI
  if (!process.stderr.isTTY || process.env.CI || process.env.NIMBUS_NO_UPDATE_CHECK) {
    return;
  }

  // Fire-and-forget — deferred to let the TUI render first
  (async () => {
    try {
      // Small delay so the check doesn't compete with startup I/O
      await new Promise(r => setTimeout(r, 500));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);

      const res = await fetch('https://registry.npmjs.org/@astron/nimbus/latest', {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as { version?: string };
      const latest = data.version;
      if (!latest || latest === VERSION) {
        return;
      }

      // Simple semver comparison: split on dots, compare numerically
      const current = VERSION.split('.').map(Number);
      const remote = latest.split('.').map(Number);
      let isNewer = false;
      for (let i = 0; i < 3; i++) {
        if ((remote[i] ?? 0) > (current[i] ?? 0)) {
          isNewer = true;
          break;
        }
        if ((remote[i] ?? 0) < (current[i] ?? 0)) {
          break;
        }
      }

      if (isNewer) {
        process.stderr.write(
          `\x1b[33m  Update available: ${VERSION} → ${latest}. Run: nimbus upgrade\x1b[0m\n`
        );
      }
    } catch {
      // Network errors are silently ignored
    }
  })();
}

// ---------------------------------------------------------------------------
// Global error handlers (Gap 6: prevent silent crashes from unhandled promises)
// ---------------------------------------------------------------------------

process.on('unhandledRejection', reason => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  process.stderr.write(`\x1b[31mUnhandled promise rejection: ${msg}\x1b[0m\n`);
  // Don't exit — let the TUI continue running. The user can see the error
  // and decide whether to continue or quit.
});

process.on('uncaughtException', error => {
  process.stderr.write(`\x1b[31mUncaught exception: ${error.message}\x1b[0m\n`);
  if (error.stack) {
    process.stderr.write(`\x1b[2m${error.stack}\x1b[0m\n`);
  }
  // For uncaught exceptions, set exit code but let cleanup run
  process.exitCode = 1;
});

async function main() {
  const args = process.argv.slice(2);

  // Handle --version and -v before anything else (no init needed)
  if (args[0] === '--version' || args[0] === '-v') {
    console.log(`nimbus ${VERSION}`);
    process.exit(0);
  }

  // Show help when explicitly requested — handles both `nimbus --help`
  // and subcommand-level help like `nimbus chat --help` or `nimbus tf -h`.
  if (args.includes('--help') || args.includes('-h')) {
    const otherArgs = args.filter(a => a !== '--help' && a !== '-h');
    args.length = 0;
    args.push('help', ...otherArgs);
  }

  // Kick off a non-blocking update check (fire-and-forget)
  checkForUpdates();

  // Default no-args: launch chat (or onboarding if first run)
  if (args.length === 0) {
    const { needsOnboarding } = await import('./commands/onboarding');
    if (needsOnboarding()) {
      args[0] = 'onboarding';
    } else {
      args[0] = 'chat';
    }
  }

  // Initialize the application (SQLite, LLM router, etc.)
  const { initApp, shutdownApp } = await import('./app');

  // Register shutdown hooks for clean exit.
  // Use process.exitCode instead of process.exit() to avoid racing
  // with finally blocks and async cleanup in the TUI.
  let cleaningUp = false;
  const cleanup = async () => {
    if (cleaningUp) {
      return;
    } // Prevent double-cleanup on rapid Ctrl+C
    cleaningUp = true;
    await shutdownApp();
    process.exitCode = 0;
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    // Commands that don't need full initialization
    const noInitCommands = new Set([
      'help',
      'version',
      'doctor',
      'onboarding',
      'upgrade',
      'update',
    ]);

    if (!noInitCommands.has(args[0])) {
      // Show brief startup indicator for interactive commands
      if (args[0] === 'chat' && process.stderr.isTTY) {
        process.stderr.write('\x1b[2mStarting Nimbus...\x1b[0m');
      }
      await initApp();
      if (args[0] === 'chat' && process.stderr.isTTY) {
        process.stderr.write('\r\x1b[K');
      }
    }

    // Import and run CLI command router
    const { runCommand } = await import('./cli');
    await runCommand(args);

    // After onboarding, clear auth cache, initialize app, and launch chat
    if (args[0] === 'onboarding') {
      // Clear the auth-bridge cache so the router picks up freshly-saved credentials
      try {
        const { clearAuthCache } = await import('./llm/auth-bridge');
        clearAuthCache();
      } catch {
        /* non-critical */
      }
      await initApp();
      await runCommand(['chat']);
    }
  } catch (error: any) {
    const msg = error.message || String(error);
    if (msg.includes('bun:sqlite') || msg.includes('bun:')) {
      console.error(
        'Error: Nimbus requires the Bun runtime (for bun:sqlite and other built-in APIs).'
      );
      console.error('');
      console.error('If you have Bun installed, run:');
      console.error('  bun src/nimbus.ts');
      console.error('');
      console.error('To install Bun:');
      console.error('  curl -fsSL https://bun.sh/install | bash');
      console.error('');
      console.error('Or install the pre-built binary (no Bun required):');
      console.error('  brew install the-ai-project-co/tap/nimbus');
      console.error('  # or download from GitHub Releases');
    } else if (error.code === 'MODULE_NOT_FOUND') {
      console.error(`Error: Missing module — ${msg}`);
      console.error('Run "bun install" to install dependencies.');
    } else {
      console.error(`Error: ${msg}`);
    }
    process.exit(1);
  } finally {
    await shutdownApp();
  }
}

main();
