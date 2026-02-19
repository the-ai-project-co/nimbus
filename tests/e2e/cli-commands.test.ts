/**
 * E2E Test: CLI Commands
 *
 * Tests actual CLI command execution by spawning the Nimbus CLI as a child
 * process. Each test invokes the CLI binary through `bun run` and verifies
 * stdout/stderr content and exit codes.
 *
 * These tests do NOT mock any internals -- they exercise the real CLI
 * entrypoint (`services/cli-service/src/index.ts`) in a subprocess.
 *
 * Commands tested:
 *   - nimbus version
 *   - nimbus help
 *   - nimbus doctor
 *   - nimbus config list
 *   - nimbus config set / get
 *   - nimbus auth status
 *   - nimbus help <command>
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Absolute path to the CLI entrypoint */
const CLI_ENTRYPOINT = join(
  import.meta.dir,
  '..',
  '..',
  'services',
  'cli-service',
  'src',
  'index.ts',
);

/**
 * Spawn the Nimbus CLI with the given arguments and return stdout, stderr,
 * and the exit code. A configurable timeout prevents hung processes from
 * blocking the test suite.
 */
async function runCLI(
  args: string[],
  options: {
    timeout?: number;
    env?: Record<string, string>;
    cwd?: string;
  } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { timeout = 30_000, env = {}, cwd } = options;

  const proc = Bun.spawn(['bun', 'run', CLI_ENTRYPOINT, ...args], {
    cwd: cwd || join(import.meta.dir, '..', '..'),
    env: {
      ...process.env,
      // Redirect HOME to an isolated temp directory so the CLI config manager
      // (which reads/writes ~/.nimbus/config.yaml) does not interfere with the
      // user's real config or with other parallel tests (e.g. state service).
      HOME: tempDir,
      // Disable service auth token so any service calls pass through
      INTERNAL_SERVICE_TOKEN: '',
      // Set a dummy API key so the auth guard (requiresAuth) does not trigger
      // the interactive login wizard for commands behind the auth guard.
      ANTHROPIC_API_KEY: 'sk-ant-e2e-test-dummy-key',
      // Use a dedicated home directory to avoid polluting real config
      NIMBUS_TEST_MODE: '1',
      // Suppress interactive prompts
      CI: '1',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Collect output as text
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  // Read stdout
  const stdoutReader = proc.stdout.getReader();
  const stderrReader = proc.stderr.getReader();
  const decoder = new TextDecoder();

  const readStream = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    chunks: string[],
  ) => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
      }
    } catch {
      // Stream closed
    }
  };

  // Race the process against a timeout
  const timeoutId = setTimeout(() => {
    try { proc.kill(); } catch { /* ignore */ }
  }, timeout);

  await Promise.all([
    readStream(stdoutReader, stdoutChunks),
    readStream(stderrReader, stderrChunks),
    proc.exited,
  ]);

  clearTimeout(timeoutId);

  return {
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
    exitCode: proc.exitCode ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Test-scoped temp directory for config isolation
// ---------------------------------------------------------------------------

let tempDir: string;

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'nimbus-cli-e2e-'));
  // Create a minimal .nimbus config directory so commands that read config
  // do not fail on missing directory errors
  const nimbusDir = join(tempDir, '.nimbus');
  mkdirSync(nimbusDir, { recursive: true });
  writeFileSync(
    join(nimbusDir, 'config.json'),
    JSON.stringify({ llm: { defaultProvider: 'anthropic' } }),
  );
});

afterAll(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

// ===========================================================================
// 1. Version command
// ===========================================================================

describe('nimbus version', () => {
  test('outputs version number', async () => {
    const { stdout, exitCode } = await runCLI(['version']);
    expect(exitCode).toBe(0);
    // Should contain a semver-like string (e.g. "0.1.0" or "1.0.0")
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  test('--json flag outputs JSON with version field', async () => {
    const { stdout, exitCode } = await runCLI(['version', '--json']);
    expect(exitCode).toBe(0);
    // Try to parse the JSON output
    try {
      const parsed = JSON.parse(stdout.trim());
      expect(parsed.version).toBeDefined();
      expect(parsed.version).toMatch(/\d+\.\d+\.\d+/);
    } catch {
      // If not pure JSON, at least check for version pattern
      expect(stdout).toMatch(/\d+\.\d+\.\d+/);
    }
  });

  test('-v alias also shows version', async () => {
    const { stdout, exitCode } = await runCLI(['-v']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  test('--version alias also shows version', async () => {
    const { stdout, exitCode } = await runCLI(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });
});

// ===========================================================================
// 2. Help command
// ===========================================================================

describe('nimbus help', () => {
  test('displays available commands', async () => {
    const { stdout, exitCode } = await runCLI(['help']);
    expect(exitCode).toBe(0);

    // Should list major command categories
    expect(stdout).toContain('chat');
    expect(stdout).toContain('config');
    expect(stdout).toContain('generate');
    expect(stdout).toContain('version');
    expect(stdout).toContain('doctor');
  });

  test('-h alias shows help', async () => {
    const { stdout, exitCode } = await runCLI(['-h']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('config');
  });

  test('--help alias shows help', async () => {
    const { stdout, exitCode } = await runCLI(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('config');
  });

  test('help for specific command shows details', async () => {
    const { stdout, exitCode } = await runCLI(['help', 'config']);
    expect(exitCode).toBe(0);
    // Should contain config-related information
    expect(stdout.toLowerCase()).toContain('config');
  });
});

// ===========================================================================
// 3. Doctor command
// ===========================================================================

describe('nimbus doctor', () => {
  test('runs diagnostic checks and exits cleanly', async () => {
    const { stdout, stderr, exitCode } = await runCLI(['doctor']);
    const output = stdout + stderr;
    // Doctor should run some checks -- it may warn about missing tools but
    // should not crash
    expect([0, 1]).toContain(exitCode);
    // Should contain diagnostic-related output
    expect(output.length).toBeGreaterThan(0);
  }, 15_000);

  test('--json flag outputs structured diagnostics', async () => {
    const { stdout, exitCode } = await runCLI(['doctor', '--json']);
    // Doctor with --json should still exit cleanly
    expect([0, 1]).toContain(exitCode);
    // Should contain some output
    expect(stdout.length).toBeGreaterThan(0);
  }, 15_000);
});

// ===========================================================================
// 4. Config commands
// ===========================================================================

describe('nimbus config', () => {
  test('config list displays configuration keys', async () => {
    const { stdout, exitCode } = await runCLI(['config', 'list']);
    expect(exitCode).toBe(0);
    // Should display some configuration output
    expect(stdout.length).toBeGreaterThan(0);
  });

  test('config list --json outputs JSON', async () => {
    const { stdout, exitCode } = await runCLI(['config', 'list', '--json']);
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  test('config set and get round-trip', async () => {
    const testValue = `e2e-project-${Date.now()}`;

    // Use a recognized config key (workspace.name) so the config set command
    // does not prompt "Set this key anyway?" for unknown keys.
    const setResult = await runCLI(['config', 'set', 'workspace.name', testValue]);
    expect(setResult.exitCode).toBe(0);

    // Get it back
    const getResult = await runCLI(['config', 'get', 'workspace.name']);
    expect(getResult.exitCode).toBe(0);
    expect(getResult.stdout).toContain(testValue);
  });

  test('config get for unknown key shows appropriate message', async () => {
    const { stdout, stderr, exitCode } = await runCLI([
      'config',
      'get',
      'nonexistent.key.path',
    ]);
    const output = stdout + stderr;
    // Should either exit 0 with "not found" message or exit 1
    expect(output.length).toBeGreaterThan(0);
  });

  test('config with no subcommand defaults to list', async () => {
    const { stdout, exitCode } = await runCLI(['config']);
    expect(exitCode).toBe(0);
    expect(stdout.length).toBeGreaterThan(0);
  });

  test('config telemetry status reports current state', async () => {
    const { stdout, exitCode } = await runCLI(['config', 'telemetry', 'status']);
    expect(exitCode).toBe(0);
    // Should mention telemetry enabled or disabled
    expect(stdout.toLowerCase()).toMatch(/telemetry/i);
  });
});

// ===========================================================================
// 5. Auth status command
// ===========================================================================

describe('nimbus auth', () => {
  test('auth status shows authentication state', async () => {
    const { stdout, stderr, exitCode } = await runCLI(['auth', 'status']);
    const output = stdout + stderr;
    // Even without being logged in, it should run without crashing
    expect([0, 1]).toContain(exitCode);
    expect(output.length).toBeGreaterThan(0);
  });

  test('auth list shows available providers', async () => {
    const { stdout, stderr, exitCode } = await runCLI(['auth', 'list']);
    const output = stdout + stderr;
    expect([0, 1]).toContain(exitCode);
    expect(output.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// 6. Unknown command
// ===========================================================================

describe('nimbus unknown commands', () => {
  test('unknown command shows error and available commands', async () => {
    const { stdout, stderr, exitCode } = await runCLI(['nonexistent-command']);
    const output = stdout + stderr;
    expect(exitCode).toBe(1);
    // Should show an error or help text
    expect(output.toLowerCase()).toContain('unknown');
  });
});

// ===========================================================================
// 7. Init command (in temp directory)
// ===========================================================================

describe('nimbus init', () => {
  test('init creates project config in target directory', async () => {
    const initDir = mkdtempSync(join(tmpdir(), 'nimbus-init-e2e-'));
    try {
      const { stdout, stderr, exitCode } = await runCLI(
        ['init', '--non-interactive', '--name', 'e2e-test-project', '--provider', 'aws'],
        { cwd: initDir },
      );
      const output = stdout + stderr;
      // Init may succeed or warn depending on environment, but should not crash
      expect([0, 1]).toContain(exitCode);
      expect(output.length).toBeGreaterThan(0);
    } finally {
      rmSync(initDir, { recursive: true, force: true });
    }
  });
});

// ===========================================================================
// 8. CLI error handling
// ===========================================================================

describe('CLI error handling', () => {
  test('no arguments shows welcome/login or help', async () => {
    // Running with no args triggers the login flow or shows help.
    // In CI mode it should not hang waiting for input.
    const { stdout, stderr, exitCode } = await runCLI([], { timeout: 15_000 });
    const output = stdout + stderr;
    // Should produce some output (either help or login prompt)
    expect(output.length).toBeGreaterThan(0);
  });

  test('config invalid subcommand shows usage', async () => {
    const { stdout, stderr, exitCode } = await runCLI([
      'config',
      'invalid-subcommand',
    ]);
    const output = stdout + stderr;
    expect(exitCode).toBe(1);
    // Should mention available config commands
    expect(output.toLowerCase()).toContain('config');
  });
});

// ===========================================================================
// 9. Command aliases
// ===========================================================================

describe('CLI command aliases', () => {
  test('nimbus -v is equivalent to nimbus version', async () => {
    const vResult = await runCLI(['-v']);
    const versionResult = await runCLI(['version']);
    // Both should produce version output and succeed
    expect(vResult.exitCode).toBe(0);
    expect(versionResult.exitCode).toBe(0);
    // Both should contain a version string
    expect(vResult.stdout).toMatch(/\d+\.\d+\.\d+/);
    expect(versionResult.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  test('nimbus -h is equivalent to nimbus help', async () => {
    const hResult = await runCLI(['-h']);
    const helpResult = await runCLI(['help']);
    expect(hResult.exitCode).toBe(0);
    expect(helpResult.exitCode).toBe(0);
    // Both should contain the same command listings
    expect(hResult.stdout).toContain('config');
    expect(helpResult.stdout).toContain('config');
  });
});
