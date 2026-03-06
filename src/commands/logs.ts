/**
 * Logs Command — H1
 *
 * Shorthand for streaming Kubernetes pod logs directly.
 *
 * Usage:
 *   nimbus logs <pod> [-n namespace] [-f] [--previous] [--tail N] [--analyze]
 */

import { execFileSync, spawn } from 'node:child_process';
import { ui } from '../wizard/ui';

export interface LogsOptions {
  namespace?: string;
  follow?: boolean;
  previous?: boolean;
  tail?: number;
  analyze?: boolean;
  container?: string;
  context?: string;
  quiet?: boolean;
}

/**
 * Build the kubectl logs argument array.
 */
function buildArgs(pod: string, options: LogsOptions): string[] {
  const args = ['logs', pod];
  if (options.namespace) args.push('-n', options.namespace);
  if (options.follow) args.push('--follow');
  if (options.previous) args.push('--previous');
  if (options.tail !== undefined) args.push('--tail', String(options.tail));
  if (options.container) args.push('-c', options.container);
  if (options.context) args.push('--context', options.context);
  return args;
}

/**
 * Stream or fetch Kubernetes pod logs.
 */
export async function logsCommand(pod: string, options: LogsOptions = {}): Promise<void> {
  if (!pod) {
    ui.error('Usage: nimbus logs <pod> [-n namespace] [-f] [--tail N]');
    process.exit(1);
  }

  const args = buildArgs(pod, options);

  // --analyze: capture output and pass to agent for analysis
  if (options.analyze) {
    if (!options.quiet) {
      ui.startSpinner({ message: `Fetching logs for ${pod}...` });
    }
    try {
      const output = execFileSync('kubectl', args, {
        encoding: 'utf-8',
        timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      if (!options.quiet) {
        ui.stopSpinnerSuccess('Logs fetched');
      }

      // Lazy-import agent loop to avoid circular deps at startup
      const { runAgentLoop } = await import('../agent/loop');
      const { getAppContext } = await import('../app');
      const { defaultToolRegistry } = await import('../tools/schemas/types');
      const { standardTools } = await import('../tools/schemas/standard');
      const ctx = getAppContext();
      if (!ctx) {
        ui.error('App not initialized. Run `nimbus login` first.');
        process.exit(1);
      }

      // Ensure tools are registered for the agent loop
      if (defaultToolRegistry.size === 0) {
        for (const tool of standardTools) {
          try { defaultToolRegistry.register(tool); } catch { /* skip duplicates */ }
        }
      }

      if (!options.quiet) {
        ui.info('Analyzing logs...');
      }
      await runAgentLoop(
        `Analyze these Kubernetes logs for pod "${pod}". Identify errors, anomalies, and crash patterns:\n\n${output}`,
        [],
        {
          router: ctx.router,
          toolRegistry: defaultToolRegistry,
          mode: 'plan',
          maxTurns: 5,
          onText: text => { process.stdout.write(text); },
        }
      );
      console.log('');
    } catch (error: any) {
      if (!options.quiet) {
        ui.stopSpinnerFail('Failed to fetch logs');
      }
      ui.error(error.message);
      process.exit(1);
    }
    return;
  }

  // --follow: stream via spawn
  if (options.follow) {
    const child = spawn('kubectl', args, {
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    await new Promise<void>((resolve, reject) => {
      child.on('close', code => {
        if (code !== 0) reject(new Error(`kubectl logs exited with code ${code}`));
        else resolve();
      });
      child.on('error', reject);
    });
    return;
  }

  // Non-follow: capture and print
  try {
    const output = execFileSync('kubectl', args, {
      encoding: 'utf-8',
      timeout: 60_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    process.stdout.write(output);
  } catch (error: any) {
    ui.error(`kubectl logs failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Parse `nimbus logs <pod> [options]` arguments.
 */
export function parseLogsArgs(args: string[]): { pod: string; options: LogsOptions } {
  let pod = '';
  const options: LogsOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-n' || arg === '--namespace') {
      options.namespace = args[++i];
    } else if (arg === '-f' || arg === '--follow') {
      options.follow = true;
    } else if (arg === '-p' || arg === '--previous') {
      options.previous = true;
    } else if (arg === '--tail') {
      options.tail = parseInt(args[++i] ?? '100', 10);
    } else if (arg === '--analyze') {
      options.analyze = true;
    } else if (arg === '-c' || arg === '--container') {
      options.container = args[++i];
    } else if (arg === '--context') {
      options.context = args[++i];
    } else if (arg === '-q' || arg === '--quiet') {
      options.quiet = true;
    } else if (!arg.startsWith('-') && !pod) {
      pod = arg;
    }
  }

  return { pod, options };
}
