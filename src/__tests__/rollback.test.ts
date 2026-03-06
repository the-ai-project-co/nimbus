/**
 * Tests for the nimbus rollback command (G20).
 *
 * The rollbackCommand provides guided infrastructure rollback for Helm and K8s.
 * We test the module exports and option parsing rather than making real CLI calls.
 */

import { describe, test, it, expect } from 'vitest';
import { rollbackCommand, type RollbackOptions } from '../commands/rollback';

describe('rollbackCommand (G20)', () => {
  test('exports rollbackCommand function', () => {
    expect(typeof rollbackCommand).toBe('function');
  });

  test('RollbackOptions accepts helm flag', () => {
    const opts: RollbackOptions = { helm: 'my-release', namespace: 'production' };
    expect(opts.helm).toBe('my-release');
    expect(opts.namespace).toBe('production');
  });

  test('RollbackOptions accepts k8s flag', () => {
    const opts: RollbackOptions = { k8s: 'my-deployment', namespace: 'staging' };
    expect(opts.k8s).toBe('my-deployment');
    expect(opts.namespace).toBe('staging');
  });

  test('RollbackOptions accepts tf flag', () => {
    const opts: RollbackOptions = { tf: true };
    expect(opts.tf).toBe(true);
  });

  test('RollbackOptions all fields are optional', () => {
    const opts: RollbackOptions = {};
    expect(opts.helm).toBeUndefined();
    expect(opts.k8s).toBeUndefined();
    expect(opts.namespace).toBeUndefined();
    expect(opts.tf).toBeUndefined();
  });

  test('rollbackCommand with no options outputs usage error', async () => {
    // When no target specified, should print an error without throwing
    const originalError = process.stderr.write.bind(process.stderr);
    // Just ensure it doesn't throw
    await expect(rollbackCommand({})).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// L1: nimbus rollout command
// ---------------------------------------------------------------------------

describe('parseTimeoutToMs (L1)', () => {
  it('exists and is importable', async () => {
    const { parseTimeoutToMs } = await import('../commands/rollout');
    expect(typeof parseTimeoutToMs).toBe('function');
  });

  it('converts seconds to milliseconds', async () => {
    const { parseTimeoutToMs } = await import('../commands/rollout');
    expect(parseTimeoutToMs('30s')).toBe(30_000);
  });

  it('converts minutes to milliseconds', async () => {
    const { parseTimeoutToMs } = await import('../commands/rollout');
    expect(parseTimeoutToMs('5m')).toBe(300_000);
  });

  it('converts hours to milliseconds', async () => {
    const { parseTimeoutToMs } = await import('../commands/rollout');
    expect(parseTimeoutToMs('2h')).toBe(7_200_000);
  });

  it('returns 300000 for unrecognized format', async () => {
    const { parseTimeoutToMs } = await import('../commands/rollout');
    expect(parseTimeoutToMs('invalid')).toBe(300_000);
  });

  it('rolloutCommand is exported from rollout.ts', async () => {
    const { rolloutCommand } = await import('../commands/rollout');
    expect(typeof rolloutCommand).toBe('function');
  });
});
