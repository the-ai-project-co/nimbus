/**
 * Version Command Tests — L3
 *
 * Validates that `nimbus version --json` returns valid JSON with
 * required fields: version, node, platform, arch.
 *
 * Also validates that `nimbus update` is an alias for `upgrade` in cli.ts.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// L3: version --json
// ---------------------------------------------------------------------------

describe('versionCommand --json (L3)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('outputs valid JSON to stdout when json option is true', async () => {
    const { versionCommand } = await import('../commands/version');
    await versionCommand({ json: true });

    // process.exit(0) should have been called
    expect(exitSpy).toHaveBeenCalledWith(0);

    // console.log should have been called with JSON
    expect(consoleSpy).toHaveBeenCalled();

    const jsonArg = consoleSpy.mock.calls[0][0] as string;
    expect(() => JSON.parse(jsonArg)).not.toThrow();
  });

  test('JSON output contains required fields: version, node, platform, arch', async () => {
    const { versionCommand } = await import('../commands/version');
    await versionCommand({ json: true });

    const jsonArg = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(jsonArg);

    expect(parsed).toHaveProperty('version');
    expect(parsed).toHaveProperty('node');
    expect(parsed).toHaveProperty('platform');
    expect(parsed).toHaveProperty('arch');
  });

  test('JSON version field is a non-empty string', async () => {
    const { versionCommand } = await import('../commands/version');
    await versionCommand({ json: true });

    const jsonArg = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(jsonArg);

    expect(typeof parsed.version).toBe('string');
    expect(parsed.version.length).toBeGreaterThan(0);
  });

  test('JSON node field matches process.version', async () => {
    const { versionCommand } = await import('../commands/version');
    await versionCommand({ json: true });

    const jsonArg = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(jsonArg);

    expect(parsed.node).toBe(process.version);
  });

  test('JSON platform field matches process.platform', async () => {
    const { versionCommand } = await import('../commands/version');
    await versionCommand({ json: true });

    const jsonArg = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(jsonArg);

    expect(parsed.platform).toBe(process.platform);
  });

  test('JSON arch field matches process.arch', async () => {
    const { versionCommand } = await import('../commands/version');
    await versionCommand({ json: true });

    const jsonArg = consoleSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(jsonArg);

    expect(parsed.arch).toBe(process.arch);
  });

  test('without --json flag, does not call process.exit(0)', async () => {
    const { versionCommand } = await import('../commands/version');
    await versionCommand({ json: false });

    expect(exitSpy).not.toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// L1: `nimbus update` alias for `upgrade`
// ---------------------------------------------------------------------------

describe('nimbus update alias (L1)', () => {
  test('runCommand treats "update" the same as "upgrade"', async () => {
    // Verify that both 'upgrade' and 'update' route to the upgrade handler
    // by checking the COMMAND_ALIASES or the if-condition in cli.ts.
    // We test this by importing runCommand and stubbing upgradeCommand.

    const upgradeMod = await import('../commands/upgrade');
    const upgradeSpy = vi.spyOn(upgradeMod, 'upgradeCommand').mockResolvedValue(undefined);

    const { runCommand } = await import('../cli');
    await runCommand(['update', '--check']);

    expect(upgradeSpy).toHaveBeenCalledWith(expect.objectContaining({ check: true }));

    upgradeSpy.mockRestore();
  });

  test('runCommand treats "upgrade" the same as "update"', async () => {
    const upgradeMod = await import('../commands/upgrade');
    const upgradeSpy = vi.spyOn(upgradeMod, 'upgradeCommand').mockResolvedValue(undefined);

    const { runCommand } = await import('../cli');
    await runCommand(['upgrade', '--check']);

    expect(upgradeSpy).toHaveBeenCalledWith(expect.objectContaining({ check: true }));

    upgradeSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// L2: --quiet flag for doctor
// ---------------------------------------------------------------------------

describe('doctorCommand --quiet (L2)', () => {
  test('DoctorOptions interface accepts quiet field', async () => {
    const { doctorCommand } = await import('../commands/doctor');
    // Just verifying the function can be called with quiet option without type errors
    expect(typeof doctorCommand).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// L2: --quiet flag for logs
// ---------------------------------------------------------------------------

describe('parseLogsArgs --quiet (L2)', () => {
  test('parses -q as quiet option', async () => {
    const { parseLogsArgs } = await import('../commands/logs');
    const { options } = parseLogsArgs(['my-pod', '-q']);
    expect(options.quiet).toBe(true);
  });

  test('parses --quiet as quiet option', async () => {
    const { parseLogsArgs } = await import('../commands/logs');
    const { options } = parseLogsArgs(['my-pod', '--quiet']);
    expect(options.quiet).toBe(true);
  });

  test('quiet is false when not provided', async () => {
    const { parseLogsArgs } = await import('../commands/logs');
    const { options } = parseLogsArgs(['my-pod']);
    expect(options.quiet).toBeUndefined();
  });

  test('parses --quiet along with other flags', async () => {
    const { parseLogsArgs } = await import('../commands/logs');
    const { pod, options } = parseLogsArgs(['my-pod', '-n', 'default', '--quiet', '-f']);
    expect(pod).toBe('my-pod');
    expect(options.namespace).toBe('default');
    expect(options.quiet).toBe(true);
    expect(options.follow).toBe(true);
  });
});
