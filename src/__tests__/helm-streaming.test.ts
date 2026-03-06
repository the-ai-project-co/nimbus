/**
 * Helm Streaming Tests — G10
 *
 * Verifies that:
 *   1. devops.ts defines the HELM_STREAMING_ACTIONS set with the correct members
 *   2. spawnExec is imported (not execAsync) for streaming actions
 *   3. The helmTool.execute() calls spawnExec for upgrade/install actions
 *
 * The functional test mocks both spawnExec and the execAsync (helm repo update)
 * by mocking 'node:child_process' at the top level.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEVOPS_SRC = readFileSync(join(__dirname, '..', 'tools', 'schemas', 'devops.ts'), 'utf-8');

// ---------------------------------------------------------------------------
// Top-level mocks — must be hoisted by vitest before imports
// ---------------------------------------------------------------------------

// Mock spawnExec so streaming helm actions don't attempt real shell calls
vi.mock('../tools/spawn-exec', () => ({
  spawnExec: vi.fn().mockResolvedValue({ stdout: 'Release deployed successfully', stderr: '', exitCode: 0 }),
}));

// Mock node:child_process exec so execAsync('helm repo update') doesn't fail
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    exec: vi.fn((cmd: string, opts: unknown, cb?: (err: null, result: { stdout: string; stderr: string }) => void) => {
      // Handle promisify(exec) — callback style
      const callback = typeof opts === 'function' ? opts : cb;
      if (typeof callback === 'function') {
        (callback as (err: null, result: { stdout: string; stderr: string }) => void)(null, { stdout: '', stderr: '' });
      }
      return { on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } };
    }),
  };
});

// ---------------------------------------------------------------------------
// Source-level assertions (G10)
// ---------------------------------------------------------------------------

describe('HELM_STREAMING_ACTIONS constant in devops.ts (G10)', () => {
  it('devops.ts defines HELM_STREAMING_ACTIONS', () => {
    expect(DEVOPS_SRC).toContain('HELM_STREAMING_ACTIONS');
  });

  it('HELM_STREAMING_ACTIONS includes install', () => {
    const setDefMatch = DEVOPS_SRC.match(/HELM_STREAMING_ACTIONS\s*=\s*new Set\(\[([^\]]+)\]\)/);
    expect(setDefMatch).not.toBeNull();
    expect(setDefMatch![1]).toContain('install');
  });

  it('HELM_STREAMING_ACTIONS includes upgrade', () => {
    const setDefMatch = DEVOPS_SRC.match(/HELM_STREAMING_ACTIONS\s*=\s*new Set\(\[([^\]]+)\]\)/);
    expect(setDefMatch).not.toBeNull();
    expect(setDefMatch![1]).toContain('upgrade');
  });

  it('HELM_STREAMING_ACTIONS includes rollback', () => {
    const setDefMatch = DEVOPS_SRC.match(/HELM_STREAMING_ACTIONS\s*=\s*new Set\(\[([^\]]+)\]\)/);
    expect(setDefMatch).not.toBeNull();
    expect(setDefMatch![1]).toContain('rollback');
  });

  it('HELM_STREAMING_ACTIONS includes uninstall', () => {
    const setDefMatch = DEVOPS_SRC.match(/HELM_STREAMING_ACTIONS\s*=\s*new Set\(\[([^\]]+)\]\)/);
    expect(setDefMatch).not.toBeNull();
    expect(setDefMatch![1]).toContain('uninstall');
  });
});

describe('spawnExec is imported in devops.ts (G10)', () => {
  it('devops.ts imports spawnExec from spawn-exec', () => {
    expect(DEVOPS_SRC).toContain("import { spawnExec } from '../spawn-exec'");
  });

  it('devops.ts uses spawnExec for helm streaming actions (not only execAsync)', () => {
    expect(DEVOPS_SRC).toContain('await spawnExec(command');
  });

  it('helm streaming block checks HELM_STREAMING_ACTIONS.has(input.action)', () => {
    expect(DEVOPS_SRC).toContain('HELM_STREAMING_ACTIONS.has(input.action)');
  });
});

// ---------------------------------------------------------------------------
// Functional test: spawnExec mock for streaming action
// ---------------------------------------------------------------------------

describe('helmTool routes to spawnExec for streaming actions (G10)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls spawnExec for upgrade action and returns success', async () => {
    const { spawnExec } = await import('../tools/spawn-exec');
    const { helmTool } = await import('../tools/schemas/devops');

    const result = await helmTool.execute(
      { action: 'upgrade', release: 'myapp', chart: 'stable/nginx', namespace: 'default' },
      undefined,
    );

    expect(spawnExec).toHaveBeenCalled();
    expect(result.isError).toBe(false);
    expect(result.output).toContain('deployed successfully');
  });

  it('calls spawnExec for install action and returns success', async () => {
    const { spawnExec } = await import('../tools/spawn-exec');
    const { helmTool } = await import('../tools/schemas/devops');

    const result = await helmTool.execute(
      { action: 'install', release: 'myapp', chart: 'bitnami/nginx' },
      undefined,
    );

    expect(spawnExec).toHaveBeenCalled();
    expect(result.isError).toBe(false);
  });
});
