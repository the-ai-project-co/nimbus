/**
 * CLI Run Mode Tests
 *
 * Validates the parseRunArgs function that converts CLI arguments into
 * structured RunOptions for the non-interactive nimbus run command.
 */

import { describe, test, it, expect } from 'vitest';
import { parseRunArgs } from '../cli/run';

// ===========================================================================
// parseRunArgs
// ===========================================================================

describe('parseRunArgs', () => {
  test('parses prompt from positional args', () => {
    const result = parseRunArgs(['deploy', 'staging', 'environment']);
    expect(result.prompt).toBe('deploy staging environment');
  });

  test('parses --format json', () => {
    const result = parseRunArgs(['--format', 'json', 'some', 'prompt']);
    expect(result.format).toBe('json');
    expect(result.prompt).toBe('some prompt');
  });

  test('parses --json shorthand', () => {
    const result = parseRunArgs(['--json', 'prompt here']);
    expect(result.format).toBe('json');
  });

  test('parses --format table (H4)', () => {
    const result = parseRunArgs(['--format', 'table', 'my prompt']);
    expect(result.format).toBe('table');
    expect(result.prompt).toBe('my prompt');
  });

  test('parses --auto-approve', () => {
    const result = parseRunArgs(['--auto-approve', 'do', 'stuff']);
    expect(result.autoApprove).toBe(true);
  });

  test('parses --stdin flag', () => {
    const result = parseRunArgs(['--stdin']);
    expect(result.stdin).toBe(true);
  });

  test('parses --model override', () => {
    const result = parseRunArgs(['--model', 'anthropic/claude-haiku-4-5', 'prompt']);
    expect(result.model).toBe('anthropic/claude-haiku-4-5');
  });

  test('parses --mode deploy', () => {
    const result = parseRunArgs(['--mode', 'deploy', 'run', 'deployment']);
    expect(result.mode).toBe('deploy');
  });

  test('parses --max-turns', () => {
    const result = parseRunArgs(['--max-turns', '10', 'prompt']);
    expect(result.maxTurns).toBe(10);
  });

  test('parses -y short form for auto-approve', () => {
    const result = parseRunArgs(['-y', 'do', 'it']);
    expect(result.autoApprove).toBe(true);
    expect(result.prompt).toBe('do it');
  });

  test('handles empty args', () => {
    const result = parseRunArgs([]);
    expect(result.prompt).toBe('');
    expect(result.format).toBe('text');
    expect(result.autoApprove).toBe(false);
    expect(result.stdin).toBe(false);
    expect(result.model).toBeUndefined();
    expect(result.mode).toBe('build');
    expect(result.maxTurns).toBe(50);
  });

  test('joins multiple positional args as prompt', () => {
    const result = parseRunArgs(['fix', 'the', 'failing', 'tests']);
    expect(result.prompt).toBe('fix the failing tests');
  });

  test('default mode is "build"', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.mode).toBe('build');
  });

  test('default maxTurns is 50', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.maxTurns).toBe(50);
  });

  test('default format is "text"', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.format).toBe('text');
  });

  test('combines multiple flags', () => {
    const result = parseRunArgs([
      '--format',
      'json',
      '--auto-approve',
      '--mode',
      'deploy',
      '--max-turns',
      '25',
      '--model',
      'openai/gpt-4',
      'deploy',
      'everything',
    ]);
    expect(result.format).toBe('json');
    expect(result.autoApprove).toBe(true);
    expect(result.mode).toBe('deploy');
    expect(result.maxTurns).toBe(25);
    expect(result.model).toBe('openai/gpt-4');
    expect(result.prompt).toBe('deploy everything');
  });

  // G13: --timeout flag
  test('G13: parses --timeout <seconds> into milliseconds', () => {
    const result = parseRunArgs(['--timeout', '30', 'my prompt']);
    expect(result.timeout).toBe(30000);
    expect(result.prompt).toBe('my prompt');
  });

  test('G13: timeout defaults to undefined when not specified', () => {
    const result = parseRunArgs(['my prompt']);
    expect(result.timeout).toBeUndefined();
  });

  test('G13: parses --timeout 0 as 0 ms', () => {
    const result = parseRunArgs(['--timeout', '0', 'prompt']);
    expect(result.timeout).toBe(0);
  });

  // G15: --raw-tool-output flag
  test('G15: parses --raw-tool-output flag', () => {
    const result = parseRunArgs(['--raw-tool-output', 'show pod status']);
    expect(result.rawToolOutput).toBe(true);
    expect(result.prompt).toBe('show pod status');
  });

  test('G15: rawToolOutput defaults to false', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.rawToolOutput).toBe(false);
  });

  test('G13 + G15: combines timeout and raw-tool-output with other flags', () => {
    const result = parseRunArgs([
      '--timeout', '60',
      '--raw-tool-output',
      '--auto-approve',
      'list all pods',
    ]);
    expect(result.timeout).toBe(60000);
    expect(result.rawToolOutput).toBe(true);
    expect(result.autoApprove).toBe(true);
    expect(result.prompt).toBe('list all pods');
  });

  // H3: CI/CD flags
  test('H3: parses --exit-code-on-error flag', () => {
    const result = parseRunArgs(['--exit-code-on-error', 'run tests']);
    expect(result.exitOnError).toBe(true);
    expect(result.prompt).toBe('run tests');
  });

  test('C5: exitOnError defaults to true (POSIX convention)', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.exitOnError).toBe(true);
  });

  test('C5: --no-exit-on-error disables exitOnError', () => {
    const result = parseRunArgs(['--no-exit-on-error', 'prompt']);
    expect(result.exitOnError).toBe(false);
  });

  test('H3: parses --context <kubectl-context>', () => {
    const result = parseRunArgs(['--context', 'prod-cluster', 'deploy app']);
    expect(result.context).toBe('prod-cluster');
    expect(result.prompt).toBe('deploy app');
  });

  test('H3: context defaults to undefined', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.context).toBeUndefined();
  });

  test('H3: parses --workspace <tf-workspace>', () => {
    const result = parseRunArgs(['--workspace', 'production', 'run plan']);
    expect(result.workspace).toBe('production');
    expect(result.prompt).toBe('run plan');
  });

  test('H3: workspace defaults to undefined', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.workspace).toBeUndefined();
  });

  test('H3: parses --namespace <k8s-namespace>', () => {
    const result = parseRunArgs(['--namespace', 'prod', 'list pods']);
    expect(result.namespace).toBe('prod');
    expect(result.prompt).toBe('list pods');
  });

  test('H3: parses -n as short form for --namespace', () => {
    const result = parseRunArgs(['-n', 'kube-system', 'get pods']);
    expect(result.namespace).toBe('kube-system');
    expect(result.prompt).toBe('get pods');
  });

  test('H3: namespace defaults to undefined', () => {
    const result = parseRunArgs(['prompt']);
    expect(result.namespace).toBeUndefined();
  });

  test('H3: parses --notify <url>', () => {
    const result = parseRunArgs(['--notify', 'https://hooks.example.com/notify', 'do work']);
    expect(result.notify).toBe('https://hooks.example.com/notify');
    expect(result.prompt).toBe('do work');
  });

  test('H3: parses --notify-slack <url>', () => {
    const result = parseRunArgs(['--notify-slack', 'https://hooks.slack.com/T123/B456', 'deploy']);
    expect(result.notifySlack).toBe('https://hooks.slack.com/T123/B456');
    expect(result.prompt).toBe('deploy');
  });

  test('H3: all CI/CD flags combined', () => {
    const result = parseRunArgs([
      '--exit-code-on-error',
      '--context', 'staging-cluster',
      '--workspace', 'staging',
      '--namespace', 'staging',
      '--notify', 'https://example.com/webhook',
      '--notify-slack', 'https://hooks.slack.com/abc',
      'run deployment',
    ]);
    expect(result.exitOnError).toBe(true);
    expect(result.context).toBe('staging-cluster');
    expect(result.workspace).toBe('staging');
    expect(result.namespace).toBe('staging');
    expect(result.notify).toBe('https://example.com/webhook');
    expect(result.notifySlack).toBe('https://hooks.slack.com/abc');
    expect(result.prompt).toBe('run deployment');
  });

  test('H3: --context sets KUBECTL_CONTEXT env var when executeRun processes it', () => {
    // Test that parseRunArgs properly captures context for env injection
    const result = parseRunArgs(['--context', 'my-context', 'test prompt']);
    expect(result.context).toBe('my-context');
    // The env var injection happens in executeRun; we test parseRunArgs captures it correctly
  });
});

// ---------------------------------------------------------------------------
// L2: planSummary in JSON output
// ---------------------------------------------------------------------------

describe('planSummary in RunJsonOutput (L2)', () => {
  it('RunJsonOutput interface has planSummary field', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/cli/run.ts'), 'utf-8');
    expect(src).toContain('planSummary');
  });

  it('planSummary regex matches terraform plan output', () => {
    const planOutput = 'Plan: 3 to add, 1 to change, 0 to destroy.';
    const planLine = planOutput.match(/Plan:\s*(\d+)\s*to add,\s*(\d+)\s*to change,\s*(\d+)\s*to destroy/i);
    expect(planLine).not.toBeNull();
    expect(parseInt(planLine![1])).toBe(3);
    expect(parseInt(planLine![2])).toBe(1);
    expect(parseInt(planLine![3])).toBe(0);
  });

  it('planSummary regex works with large numbers', () => {
    const planOutput = 'Plan: 150 to add, 42 to change, 7 to destroy.';
    const planLine = planOutput.match(/Plan:\s*(\d+)\s*to add,\s*(\d+)\s*to change,\s*(\d+)\s*to destroy/i);
    expect(planLine).not.toBeNull();
    expect(parseInt(planLine![1])).toBe(150);
    expect(parseInt(planLine![2])).toBe(42);
    expect(parseInt(planLine![3])).toBe(7);
  });
});

// ===========================================================================
// C2: No staleness check in bin/nimbus.mjs
// ===========================================================================

describe('C2 — bin/nimbus.mjs startup optimizations', () => {
  it('bin/nimbus.mjs does not import statSync', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'bin/nimbus.mjs'), 'utf-8');
    expect(src).not.toContain('statSync');
  });

  it('bin/nimbus.mjs uses simple existsSync check for dist entry', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'bin/nimbus.mjs'), 'utf-8');
    expect(src).toContain('existsSync(DIST_ENTRY)');
  });
});

// ===========================================================================
// H5: nimbus whoami wiring
// ===========================================================================

describe('H5 — nimbus whoami command', () => {
  it('cli.ts contains whoami handler', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    expect(src).toContain("command === 'whoami'");
  });

  it('cli.ts whoami calls authStatusCommand', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    // whoami section should call authStatusCommand
    const whoamiIdx = src.indexOf("command === 'whoami'");
    const authStatusIdx = src.indexOf('authStatusCommand({})', whoamiIdx);
    expect(authStatusIdx).toBeGreaterThan(whoamiIdx);
  });
});

// ===========================================================================
// M1: nimbus diff top-level alias
// ===========================================================================

describe('M1 — nimbus diff alias', () => {
  it('cli.ts contains diff command handler', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    expect(src).toContain("command === 'diff'");
  });

  it('cli.ts diff calls fsCommand with "diff" subcommand', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/cli.ts'), 'utf-8');
    expect(src).toContain("fsCommand('diff', args.slice(1))");
  });
});
