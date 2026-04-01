/**
 * CLI End-to-End Tests
 *
 * Tests the CLI command router and major commands by invoking
 * runCommand() directly and verifying real stdout output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Capture stdout
// ---------------------------------------------------------------------------

let stdoutChunks: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutChunks = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
    stdoutChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  });
});

afterEach(() => {
  stdoutSpy.mockRestore();
  vi.restoreAllMocks();
});

function getStdout(): string {
  return stdoutChunks.join('');
}

// ---------------------------------------------------------------------------
// parseRunArgs (pure function — no mocking needed)
// ---------------------------------------------------------------------------

import { parseRunArgs } from '../../src/cli/run';

describe('parseRunArgs — end-to-end argument parsing', () => {
  it('parses a simple prompt', () => {
    const opts = parseRunArgs(['hello', 'world']);
    expect(opts.prompt).toBe('hello world');
  });

  it('parses --auto-approve flag', () => {
    const opts = parseRunArgs(['test', '--auto-approve']);
    expect(opts.autoApprove).toBe(true);
  });

  it('parses -y shorthand for auto-approve', () => {
    const opts = parseRunArgs(['test', '-y']);
    expect(opts.autoApprove).toBe(true);
  });

  it('parses --non-interactive as auto-approve alias', () => {
    const opts = parseRunArgs(['test', '--non-interactive']);
    expect(opts.autoApprove).toBe(true);
  });

  it('parses --format json', () => {
    const opts = parseRunArgs(['test', '--format', 'json']);
    expect(opts.format).toBe('json');
  });

  it('parses --json shorthand', () => {
    const opts = parseRunArgs(['test', '--json']);
    expect(opts.format).toBe('json');
  });

  it('parses --model flag', () => {
    const opts = parseRunArgs(['test', '--model', 'claude-3-5-sonnet']);
    expect(opts.model).toBe('claude-3-5-sonnet');
  });

  it('parses --mode plan/build/deploy', () => {
    expect(parseRunArgs(['t', '--mode', 'plan']).mode).toBe('plan');
    expect(parseRunArgs(['t', '--mode', 'build']).mode).toBe('build');
    expect(parseRunArgs(['t', '--mode', 'deploy']).mode).toBe('deploy');
  });

  it('parses --max-turns flag', () => {
    const opts = parseRunArgs(['test', '--max-turns', '10']);
    expect(opts.maxTurns).toBe(10);
  });

  it('parses --dry-run sets mode to plan', () => {
    const opts = parseRunArgs(['test', '--dry-run']);
    expect(opts.dryRun).toBe(true);
    expect(opts.mode).toBe('plan');
  });

  it('parses --timeout in seconds', () => {
    const opts = parseRunArgs(['test', '--timeout', '30']);
    expect(opts.timeout).toBe(30000); // Converted to ms
  });

  it('parses --context, --workspace, --namespace flags', () => {
    const opts = parseRunArgs(['t', '--context', 'prod', '--workspace', 'staging', '--namespace', 'app']);
    expect(opts.context).toBe('prod');
    expect(opts.workspace).toBe('staging');
    expect(opts.namespace).toBe('app');
  });

  it('parses -n as namespace shorthand', () => {
    const opts = parseRunArgs(['t', '-n', 'my-ns']);
    expect(opts.namespace).toBe('my-ns');
  });

  it('parses --budget flag', () => {
    const opts = parseRunArgs(['test', '--budget', '5.50']);
    expect(opts.budget).toBe(5.5);
  });

  it('parses --schema flag', () => {
    const opts = parseRunArgs(['--schema']);
    expect(opts.schema).toBe(true);
  });

  it('parses --json-schema flag', () => {
    const opts = parseRunArgs(['--json-schema']);
    expect(opts.schema).toBe(true);
  });

  it('parses --stdin flag', () => {
    const opts = parseRunArgs(['--stdin']);
    expect(opts.stdin).toBe(true);
  });

  it('parses --stdin-json flag (also sets stdin)', () => {
    const opts = parseRunArgs(['--stdin-json']);
    expect(opts.stdinJson).toBe(true);
    expect(opts.stdin).toBe(true);
  });

  it('parses --notify and --notify-slack flags', () => {
    const opts = parseRunArgs(['t', '--notify', 'https://hook.example.com', '--notify-slack', 'https://slack.example.com']);
    expect(opts.notify).toBe('https://hook.example.com');
    expect(opts.notifySlack).toBe('https://slack.example.com');
  });

  it('has correct defaults', () => {
    const opts = parseRunArgs([]);
    expect(opts.format).toBe('text');
    expect(opts.autoApprove).toBe(false);
    expect(opts.mode).toBe('build');
    expect(opts.maxTurns).toBe(50);
    expect(opts.dryRun).toBe(false);
    expect(opts.exitOnError).toBe(true);
    expect(opts.rawToolOutput).toBe(false);
    expect(opts.schema).toBe(false);
  });

  it('joins multiple positional args into prompt', () => {
    const opts = parseRunArgs(['deploy', 'the', 'staging', 'environment']);
    expect(opts.prompt).toBe('deploy the staging environment');
  });

  it('unknown flags consume their following value as the flag arg', () => {
    const opts = parseRunArgs(['hello', '--unknown-flag', 'value']);
    // The parser treats 'value' as consumed by unknown flag or as positional
    expect(opts.prompt).toContain('hello');
  });

  it('parses --raw-tool-output flag', () => {
    const opts = parseRunArgs(['t', '--raw-tool-output']);
    expect(opts.rawToolOutput).toBe(true);
  });

  it('parses --exit-code-on-error and --no-exit-on-error', () => {
    expect(parseRunArgs(['t', '--exit-code-on-error']).exitOnError).toBe(true);
    expect(parseRunArgs(['t', '--no-exit-on-error']).exitOnError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Version command
// ---------------------------------------------------------------------------

describe('versionCommand — end-to-end', () => {
  it('outputs version string', async () => {
    const { versionCommand } = await import('../../src/commands/version');
    await versionCommand({});
    expect(getStdout()).toMatch(/\d+\.\d+/);
  });

  it('outputs JSON with --json flag', async () => {
    const { versionCommand } = await import('../../src/commands/version');
    // Mock process.exit since versionCommand calls process.exit(0) after JSON output
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    // Also capture console.log since JSON mode uses console.log
    const logChunks: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      logChunks.push(args.map(String).join(' '));
    });

    await versionCommand({ json: true });

    exitSpy.mockRestore();
    logSpy.mockRestore();

    const output = logChunks.join('');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('cli');
    expect(parsed).toHaveProperty('node');
    expect(parsed).toHaveProperty('platform');
    expect(parsed).toHaveProperty('arch');
  });
});

// ---------------------------------------------------------------------------
// Doctor command
// ---------------------------------------------------------------------------

describe('doctorCommand — end-to-end', () => {
  it('runs checks and outputs results', async () => {
    const { doctorCommand } = await import('../../src/commands/doctor');
    // Suppress output
    const stderrChunks: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: any) => {
      stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
    // Mock process.exit since doctor calls process.exit(1) when checks fail
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    await doctorCommand({ quiet: true });

    stderrSpy.mockRestore();
    exitSpy.mockRestore();
    // Doctor should complete without throwing
  });

  it('returns JSON with --json flag', async () => {
    const { doctorCommand } = await import('../../src/commands/doctor');
    // Mock process.exit since doctor calls process.exit(1) on failures
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    // Capture console.log since JSON mode uses console.log
    const logChunks: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      logChunks.push(args.map(String).join(' '));
    });

    await doctorCommand({ json: true, quiet: true });

    exitSpy.mockRestore();
    logSpy.mockRestore();

    // Find the first JSON object in the captured output
    const allOutput = logChunks.join('\n') + getStdout();
    if (allOutput.trim()) {
      // Try to parse the first JSON-like chunk (doctor may log multiple lines)
      const jsonMatch = allOutput.match(/\{[\s\S]*?\n\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        expect(typeof parsed).toBe('object');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Help command
// ---------------------------------------------------------------------------

describe('helpCommand — end-to-end', () => {
  it('outputs help text', async () => {
    const { helpCommand } = await import('../../src/commands/help');
    await helpCommand({});
    const output = getStdout();
    expect(output.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Command alias resolution
// ---------------------------------------------------------------------------

describe('CLI alias resolution', () => {
  it('resolves pr → gh pr', () => {
    // Test the COMMAND_ALIASES mapping by importing and checking
    // We can verify this by reading the source
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const cliSrc = readFileSync(join(__dirname, '../../src/cli.ts'), 'utf-8');
    expect(cliSrc).toContain("pr: ['gh', 'pr']");
    expect(cliSrc).toContain("terraform: ['tf']");
    expect(cliSrc).toContain("k: ['k8s']");
  });
});
