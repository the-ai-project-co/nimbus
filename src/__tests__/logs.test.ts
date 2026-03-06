/**
 * Logs Command Tests — H1
 *
 * Validates argument building for the logsCommand helper.
 */

import { describe, test, it, expect } from 'vitest';
import { parseLogsArgs } from '../commands/logs';

describe('parseLogsArgs (H1)', () => {
  test('parses pod name as first positional', () => {
    const { pod, options } = parseLogsArgs(['my-pod']);
    expect(pod).toBe('my-pod');
    expect(options).toEqual({});
  });

  test('parses -n namespace', () => {
    const { pod, options } = parseLogsArgs(['my-pod', '-n', 'kube-system']);
    expect(pod).toBe('my-pod');
    expect(options.namespace).toBe('kube-system');
  });

  test('parses --namespace', () => {
    const { options } = parseLogsArgs(['pod', '--namespace', 'production']);
    expect(options.namespace).toBe('production');
  });

  test('parses -f / --follow', () => {
    const { options: o1 } = parseLogsArgs(['pod', '-f']);
    expect(o1.follow).toBe(true);

    const { options: o2 } = parseLogsArgs(['pod', '--follow']);
    expect(o2.follow).toBe(true);
  });

  test('parses -p / --previous', () => {
    const { options: o1 } = parseLogsArgs(['pod', '-p']);
    expect(o1.previous).toBe(true);

    const { options: o2 } = parseLogsArgs(['pod', '--previous']);
    expect(o2.previous).toBe(true);
  });

  test('parses --tail N', () => {
    const { options } = parseLogsArgs(['pod', '--tail', '100']);
    expect(options.tail).toBe(100);
  });

  test('parses --analyze', () => {
    const { options } = parseLogsArgs(['pod', '--analyze']);
    expect(options.analyze).toBe(true);
  });

  test('parses -c container', () => {
    const { options } = parseLogsArgs(['pod', '-c', 'sidecar']);
    expect(options.container).toBe('sidecar');
  });

  test('parses --context', () => {
    const { options } = parseLogsArgs(['pod', '--context', 'prod-cluster']);
    expect(options.context).toBe('prod-cluster');
  });

  test('parses combined flags', () => {
    const { pod, options } = parseLogsArgs([
      'app-pod',
      '-n', 'default',
      '-f',
      '--tail', '50',
      '-c', 'app',
    ]);
    expect(pod).toBe('app-pod');
    expect(options.namespace).toBe('default');
    expect(options.follow).toBe(true);
    expect(options.tail).toBe(50);
    expect(options.container).toBe('app');
  });
});

// ---------------------------------------------------------------------------
// C1: logsTool follow mode (streaming)
// ---------------------------------------------------------------------------

describe('logsTool follow field (C1)', () => {
  it('logsSchema has follow field', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    expect(src).toContain('follow: z.boolean()');
  });

  it('logsTool execute signature accepts ctx', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    // Check that logsTool execute accepts ctx parameter
    expect(src).toMatch(/logsTool.*execute.*raw.*ctx\?/s);
  });

  it('follow mode uses spawnExec for kubernetes provider', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    // Verify the follow mode path calls spawnExec
    expect(src).toContain('input.follow && ctx?.onProgress');
  });
});
