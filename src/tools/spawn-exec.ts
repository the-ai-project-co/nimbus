/**
 * Streaming subprocess wrapper.
 *
 * Replaces `promisify(exec)` for long-running DevOps commands (terraform,
 * kubectl, helm, bash). Unlike `execAsync`, this streams stdout/stderr chunks
 * in real-time via the `onChunk` callback so the TUI can show live output
 * instead of a frozen spinner for multi-minute operations.
 */

import { spawn } from 'node:child_process';

// ---------------------------------------------------------------------------
// Secret redaction
// ---------------------------------------------------------------------------

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/g,
  /(?:password|secret|token|key)\s*[:=]\s*\S+/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
];

function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((t, p) => t.replace(p, '[REDACTED]'), text);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface SpawnOptions {
  /** Working directory for the subprocess. */
  cwd?: string;
  /** Environment variables (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /**
   * Called for each chunk of output (stdout + stderr interleaved).
   * Chunks are flushed at most every 100ms to avoid excessive React renders.
   */
  onChunk?: (chunk: string) => void;
  /** Milliseconds before the subprocess is killed. Default: no timeout. */
  timeout?: number;
  /** AbortSignal for cancellation (e.g. Ctrl+C from TUI). */
  signal?: AbortSignal;
  /** Human-readable label for timeout error messages (e.g. 'terraform'). M2 */
  label?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Spawn a shell command and stream its output in real-time.
 *
 * - stdout and stderr are both captured and forwarded to `onChunk`.
 * - The returned promise resolves with the full stdout, stderr, and exit code.
 * - If `timeout` is set, the process is killed after that many milliseconds
 *   and the promise rejects with a timeout error.
 *
 * @example
 * ```ts
 * const result = await spawnExec('terraform apply -auto-approve', {
 *   cwd: '/infra/aws',
 *   onChunk: (chunk) => process.stdout.write(chunk),
 * });
 * ```
 */
export async function spawnExec(
  command: string,
  options: SpawnOptions = {}
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('sh', ['-c', command], {
      cwd: options.cwd,
      env: options.env ?? process.env,
    });

    let stdout = '';
    let stderr = '';

    // Buffer chunks and flush every 100ms to avoid excessive re-renders
    let buffer = '';
    const flushInterval = setInterval(() => {
      if (buffer && options.onChunk) {
        options.onChunk(buffer);
        buffer = '';
      }
    }, 100);

    proc.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      buffer += redactSecrets(text);
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      // C5: Prefix each stderr line with dim-red ANSI so ToolCallDisplay renders them distinctly
      const tagged = text.split('\n').map(l => l ? `\x1b[2;31m${l}\x1b[0m` : l).join('\n');
      buffer += tagged;
    });

    proc.on('close', (code) => {
      clearInterval(flushInterval);
      // Flush any remaining buffered content
      if (buffer && options.onChunk) {
        options.onChunk(buffer);
        buffer = '';
      }
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });

    proc.on('error', (err) => {
      clearInterval(flushInterval);
      reject(err);
    });

    // GAP-9: AbortSignal support — kill process and reject on abort
    if (options.signal) {
      const abortHandler = () => {
        try { proc.kill('SIGTERM'); } catch { /* ignore */ }
        clearInterval(flushInterval);
        reject(new Error('Operation cancelled by user (Ctrl+C)'));
      };
      options.signal.addEventListener('abort', abortHandler, { once: true });
      proc.on('close', () => {
        try { options.signal?.removeEventListener('abort', abortHandler); } catch { /* ignore */ }
      });
    }

    if (options.timeout) {
      setTimeout(() => {
        proc.kill();
        clearInterval(flushInterval);
        const toolLabel = options.label ?? command.split(' ')[0];
        const seconds = Math.round(options.timeout! / 1000);
        reject(new Error(`[${toolLabel}] timed out after ${seconds}s. Override via NIMBUS.md "## Tool Timeouts".`));
      }, options.timeout);
    }
  });
}
