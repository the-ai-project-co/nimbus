/**
 * Hook Execution Engine
 *
 * Executes user-defined hooks before and after tool invocations.
 * Hook scripts receive JSON context on stdin and communicate results
 * via exit codes:
 *
 *   - Exit 0  = allow (proceed with the tool call)
 *   - Exit 2  = block (prevent the tool call; stderr/stdout used as message)
 *   - Other   = error (proceed but log a warning)
 *
 * Hooks are killed after their configured timeout (default 30 seconds).
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  loadHooksConfig,
  DEFAULT_HOOK_TIMEOUT,
} from './config';
import type { HooksConfig, HookEvent, HookDefinition } from './config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context passed to hook scripts as JSON via stdin.
 *
 * For `PostToolUse` hooks the `result` field is populated with the
 * tool's output and error status.
 */
export interface HookContext {
  /** Name of the tool being invoked (e.g. "edit_file", "terraform") */
  tool: string;
  /** Input parameters supplied to the tool */
  input: Record<string, unknown>;
  /** Current session identifier */
  sessionId: string;
  /** Agent mode that triggered the call */
  agent: string;
  /** ISO 8601 timestamp of the event */
  timestamp: string;
  /** Tool output -- only present for PostToolUse events */
  result?: { output: string; isError: boolean };
}

/**
 * Outcome of a single hook execution.
 */
export interface HookResult {
  /** Whether the tool call should proceed (`true`) or be blocked (`false`) */
  allowed: boolean;
  /** Human-readable message from the hook (stderr, or stdout when blocked) */
  message?: string;
  /** Process exit code (0 = allow, 2 = block, other = error) */
  exitCode: number;
  /** Wall-clock duration of the hook execution in milliseconds */
  duration: number;
}

// ---------------------------------------------------------------------------
// HookEngine
// ---------------------------------------------------------------------------

/**
 * Core engine that loads hook configuration and executes matching hooks.
 *
 * @example
 * ```ts
 * const engine = new HookEngine('/path/to/project');
 *
 * const results = await engine.executeHooks('PreToolUse', {
 *   tool: 'edit_file',
 *   input: { path: 'main.tf' },
 *   sessionId: 'abc-123',
 *   agent: 'build',
 *   timestamp: new Date().toISOString(),
 * });
 *
 * if (results.some(r => !r.allowed)) {
 *   console.log('Tool call blocked by hook');
 * }
 * ```
 */
export class HookEngine {
  private config: HooksConfig | null = null;

  /**
   * Create a new HookEngine, optionally loading config immediately.
   *
   * @param projectDir - If provided, loads `.nimbus/hooks.yaml` from this directory
   */
  constructor(projectDir?: string) {
    if (projectDir) {
      this.loadConfig(projectDir);
    }
  }

  /**
   * Load (or reload) hooks configuration from disk.
   *
   * @param projectDir - Absolute path to the project root
   */
  loadConfig(projectDir: string): void {
    this.config = loadHooksConfig(projectDir);
  }

  /**
   * Check whether any hooks are registered for the given event and tool name.
   *
   * @param event    - Hook lifecycle event
   * @param toolName - Name of the tool being invoked
   * @returns `true` if at least one hook matches
   */
  hasHooks(event: HookEvent, toolName: string): boolean {
    return this.getMatchingHooks(event, toolName).length > 0;
  }

  /**
   * Return all hook definitions whose `match` pattern matches the tool name.
   *
   * @param event    - Hook lifecycle event
   * @param toolName - Name of the tool being invoked
   * @returns Array of matching hook definitions (may be empty)
   */
  getMatchingHooks(event: HookEvent, toolName: string): HookDefinition[] {
    if (!this.config) {
      return [];
    }

    const hooks = this.config.hooks[event];
    if (!hooks || hooks.length === 0) {
      return [];
    }

    return hooks.filter((hook) => {
      try {
        const regex = new RegExp(hook.match);
        return regex.test(toolName);
      } catch {
        // Invalid regex -- skip silently (was validated at load time,
        // but be defensive)
        return false;
      }
    });
  }

  /**
   * Execute all hooks matching the given event and tool name.
   *
   * Hooks are executed sequentially in definition order. For `PreToolUse`
   * events, if **any** hook returns exit code 2 the tool call is blocked
   * (but remaining hooks still execute for auditing purposes).
   *
   * @param event   - Hook lifecycle event
   * @param context - Context object passed to each hook via stdin
   * @returns Array of results, one per matching hook
   */
  async executeHooks(
    event: HookEvent,
    context: HookContext,
  ): Promise<HookResult[]> {
    const hooks = this.getMatchingHooks(event, context.tool);
    if (hooks.length === 0) {
      return [];
    }

    const results: HookResult[] = [];
    for (const hook of hooks) {
      const result = await this.executeHook(hook, context);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute a single hook definition.
   *
   * The hook command is spawned as a child process using `spawn` with
   * `shell: true` and `detached: true` so that the entire process group
   * can be killed on timeout. The JSON-serialised `HookContext` is
   * written to the process's stdin.
   *
   * Exit code semantics:
   *   - 0:     allowed (proceed)
   *   - 2:     blocked (do not proceed; message taken from stderr then stdout)
   *   - other: treated as an error; tool call is still allowed but a
   *            warning should be logged by the caller
   *
   * @param hook    - Hook definition to execute
   * @param context - Context to pass via stdin
   * @returns Execution result
   */
  private async executeHook(
    hook: HookDefinition,
    context: HookContext,
  ): Promise<HookResult> {
    const timeout = hook.timeout ?? DEFAULT_HOOK_TIMEOUT;
    const startTime = Date.now();

    return new Promise<HookResult>((resolve) => {
      let child: ChildProcess;
      let timedOut = false;
      let resolved = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      /**
       * Resolve exactly once, clearing the timeout timer.
       */
      const resolveOnce = (result: HookResult): void => {
        if (resolved) return;
        resolved = true;
        if (timer) {
          clearTimeout(timer);
        }
        resolve(result);
      };

      try {
        child = spawn(hook.command, {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: true, // Creates a process group for clean cleanup
          env: {
            ...process.env,
            NIMBUS_HOOK_EVENT: context.tool,
            NIMBUS_HOOK_AGENT: context.agent,
            NIMBUS_HOOK_SESSION: context.sessionId,
          },
        });
      } catch (spawnError: unknown) {
        const duration = Date.now() - startTime;
        resolveOnce({
          allowed: true,
          message: `Failed to spawn hook command "${hook.command}": ${
            spawnError instanceof Error ? spawnError.message : String(spawnError)
          }`,
          exitCode: 1,
          duration,
        });
        return;
      }

      // Write context JSON to stdin
      try {
        if (child.stdin) {
          child.stdin.write(JSON.stringify(context));
          child.stdin.end();
        }
      } catch {
        // stdin may already be closed -- ignore
      }

      // Collect stdout and stderr
      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer | string) => {
        stdout += String(data);
      });

      child.stderr?.on('data', (data: Buffer | string) => {
        stderr += String(data);
      });

      // Timeout handler -- kill the entire process group
      timer = setTimeout(() => {
        timedOut = true;
        try {
          // Negative PID kills the entire process group
          if (child.pid) {
            process.kill(-child.pid, 'SIGKILL');
          }
        } catch {
          // Process group may already have exited
          try {
            child.kill('SIGKILL');
          } catch {
            // Already dead
          }
        }
      }, timeout);

      child.on('close', (code: number | null) => {
        const duration = Date.now() - startTime;
        const exitCode = code ?? 1;

        if (timedOut) {
          resolveOnce({
            allowed: true,
            message: `Hook "${hook.command}" timed out after ${timeout}ms`,
            exitCode: 1,
            duration,
          });
          return;
        }

        if (exitCode === 0) {
          // Allowed
          resolveOnce({
            allowed: true,
            message: stderr.trim() || stdout.trim() || undefined,
            exitCode: 0,
            duration,
          });
        } else if (exitCode === 2) {
          // Blocked
          const message =
            stderr.trim() || stdout.trim() || 'Blocked by hook';
          resolveOnce({
            allowed: false,
            message,
            exitCode: 2,
            duration,
          });
        } else {
          // Error -- allow but surface the message
          const message =
            stderr.trim() ||
            stdout.trim() ||
            `Hook "${hook.command}" exited with code ${exitCode}`;
          resolveOnce({
            allowed: true,
            message,
            exitCode,
            duration,
          });
        }
      });

      child.on('error', (err: Error) => {
        const duration = Date.now() - startTime;
        resolveOnce({
          allowed: true,
          message: `Hook "${hook.command}" error: ${err.message}`,
          exitCode: 1,
          duration,
        });
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Run all `PreToolUse` hooks and return an aggregate allow/block decision.
 *
 * If **any** hook returns `allowed: false` (exit code 2), the overall result
 * is blocked and the first blocking message is returned.
 *
 * @param engine  - Configured HookEngine instance
 * @param context - Hook context for the current tool invocation
 * @returns Object indicating whether the tool call should proceed
 */
export async function runPreToolHooks(
  engine: HookEngine,
  context: HookContext,
): Promise<{ allowed: boolean; message?: string }> {
  const results = await engine.executeHooks('PreToolUse', context);

  for (const result of results) {
    if (!result.allowed) {
      return { allowed: false, message: result.message };
    }
  }

  return { allowed: true };
}

/**
 * Run all `PostToolUse` hooks. Results are intentionally discarded since
 * post-tool hooks are informational/side-effect-only (e.g. auto-formatting,
 * logging).
 *
 * @param engine  - Configured HookEngine instance
 * @param context - Hook context including `result` from the tool execution
 */
export async function runPostToolHooks(
  engine: HookEngine,
  context: HookContext,
): Promise<void> {
  await engine.executeHooks('PostToolUse', context);
}

/**
 * Run all `PermissionRequest` hooks. These are fire-and-forget audit hooks
 * that are invoked when a permission escalation is requested.
 *
 * @param engine  - Configured HookEngine instance
 * @param context - Hook context for the permission request
 */
export async function runPermissionHooks(
  engine: HookEngine,
  context: HookContext,
): Promise<void> {
  await engine.executeHooks('PermissionRequest', context);
}
