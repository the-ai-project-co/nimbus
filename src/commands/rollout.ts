/**
 * nimbus rollout — Watch Kubernetes Deployment Rollouts
 *
 * Streams real-time rollout status for a Kubernetes deployment.
 * Wraps `kubectl rollout status deployment/<name> --watch`.
 *
 * L1: New command for DevOps parity.
 *
 * Usage:
 *   nimbus rollout <deployment>
 *   nimbus rollout <deployment> --namespace <ns>
 *   nimbus rollout <deployment> --timeout 10m
 */

import { spawnExec } from '../tools/spawn-exec';

/** Options for the rollout command. */
export interface RolloutOptions {
  /** Deployment name to watch. */
  deployment: string;
  /** Kubernetes namespace. */
  namespace?: string;
  /** Timeout for the rollout (default: 5m). */
  timeout?: string;
}

/**
 * Run the nimbus rollout command.
 * Streams kubectl rollout status with live output.
 */
export async function rolloutCommand(options: RolloutOptions): Promise<void> {
  const { deployment, namespace, timeout = '5m' } = options;

  const nsFlag = namespace ? `-n ${namespace}` : '';
  const timeoutFlag = `--timeout=${timeout}`;
  const command = `kubectl rollout status deployment/${deployment} ${nsFlag} ${timeoutFlag} --watch`.trim().replace(/\s+/g, ' ');

  console.log(`Watching rollout: deployment/${deployment}${namespace ? ` (namespace: ${namespace})` : ''}`);
  console.log(`Timeout: ${timeout}\n`);

  const ac = new AbortController();

  // Allow Ctrl+C to gracefully abort the rollout watch
  process.on('SIGINT', () => {
    console.log('\nRollout watch interrupted.');
    ac.abort();
  });

  try {
    const result = await spawnExec(command, {
      onChunk: (chunk: string) => {
        process.stdout.write(chunk);
      },
      timeout: parseTimeoutToMs(timeout),
    });

    const combined = [result.stdout, result.stderr].filter(Boolean).join('\n');
    if (result.exitCode !== 0) {
      console.error(`\nRollout failed (exit code ${result.exitCode}):`);
      if (combined) console.error(combined);
      process.exitCode = 1;
    } else {
      console.log('\nRollout complete.');
    }
  } catch (err) {
    if ((err as Error).message?.includes('aborted')) {
      // Already printed abort message
    } else {
      console.error(`Rollout watch error: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  }
}

/**
 * Parse a kubectl-style timeout string (e.g. "5m", "30s", "2h") to milliseconds.
 */
export function parseTimeoutToMs(timeout: string): number {
  const match = timeout.match(/^(\d+)(s|m|h)$/);
  if (!match) return 300_000; // default 5 min
  const value = parseInt(match[1]);
  switch (match[2]) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 3600 * 1000;
    default: return 300_000;
  }
}
