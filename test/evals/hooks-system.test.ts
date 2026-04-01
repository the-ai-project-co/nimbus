/**
 * E2E Hooks System Tests
 *
 * Validates the end-to-end behavior of the Nimbus hook engine, including
 * PreToolUse / PostToolUse / PermissionRequest lifecycle events, exit code
 * semantics (0 = allow, 2 = block, other = error), timeout handling,
 * sequential execution of multiple hooks, glob/regex matching, YAML config
 * loading, and the convenience functions (runPreToolHooks, runPostToolHooks,
 * runPermissionHooks).
 *
 * Hook scripts are real shell scripts created in a temp directory.
 * The YAML config loader reads real files so that the integration between
 * config parsing and the engine is fully exercised.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  HookEngine,
  runPreToolHooks,
  runPostToolHooks,
  runPermissionHooks,
  type HookContext,
  type HookResult,
} from '../../src/hooks/engine';

import {
  loadHooksConfig,
  DEFAULT_HOOK_TIMEOUT,
  type HooksConfig,
  type HookEvent,
  type HookDefinition,
  validateHookDefinition,
} from '../../src/hooks/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-e2e-hooks-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Create a unique sub-directory for each test to avoid collisions. */
function makeTmpProject(): string {
  const dir = fs.mkdtempSync(path.join(tmpDir, 'proj-'));
  fs.mkdirSync(path.join(dir, '.nimbus'), { recursive: true });
  return dir;
}

/** Write a hooks.yaml config file into a project directory. */
function writeHooksYaml(projectDir: string, content: string): void {
  fs.writeFileSync(path.join(projectDir, '.nimbus', 'hooks.yaml'), content, 'utf-8');
}

/** Write an executable shell script and return its absolute path. */
function writeScript(dir: string, name: string, body: string): string {
  const scriptPath = path.join(dir, name);
  fs.writeFileSync(scriptPath, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return scriptPath;
}

/** Build a minimal HookContext for testing. */
function makeContext(overrides: Partial<HookContext> = {}): HookContext {
  return {
    tool: 'edit_file',
    input: { path: 'main.tf' },
    sessionId: 'test-session-001',
    agent: 'build',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ===========================================================================
// 1. PreToolUse hook runs before tool execution
// ===========================================================================

describe('Hooks System — PreToolUse lifecycle', () => {
  test('PreToolUse hook executes and returns allowed result', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'pre.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const results = await engine.executeHooks('PreToolUse', makeContext());

    expect(results).toHaveLength(1);
    expect(results[0].allowed).toBe(true);
    expect(results[0].exitCode).toBe(0);
  });
});

// ===========================================================================
// 2. PostToolUse hook runs after tool execution
// ===========================================================================

describe('Hooks System — PostToolUse lifecycle', () => {
  test('PostToolUse hook executes with result context', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'post.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PostToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const ctx = makeContext({
      result: { output: 'file edited', isError: false },
    });
    const results = await engine.executeHooks('PostToolUse', ctx);

    expect(results).toHaveLength(1);
    expect(results[0].allowed).toBe(true);
  });
});

// ===========================================================================
// 3. Hook receives correct context (tool name, input)
// ===========================================================================

describe('Hooks System — context passing', () => {
  test('hook script receives JSON context on stdin with tool and input', async () => {
    const projectDir = makeTmpProject();
    const outFile = path.join(projectDir, 'stdin-capture.json');
    // Script reads stdin, writes it to a file, and exits 0
    const script = writeScript(projectDir, 'capture.sh', `cat > "${outFile}"\nexit 0`);
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "terraform"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const ctx = makeContext({ tool: 'terraform', input: { action: 'plan', workspace: 'dev' } });
    await engine.executeHooks('PreToolUse', ctx);

    const captured = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    expect(captured.tool).toBe('terraform');
    expect(captured.input).toEqual({ action: 'plan', workspace: 'dev' });
    expect(captured.sessionId).toBe('test-session-001');
    expect(captured.agent).toBe('build');
    expect(typeof captured.timestamp).toBe('string');
  });
});

// ===========================================================================
// 4. Exit code 0 allows execution
// ===========================================================================

describe('Hooks System — exit code 0 allows', () => {
  test('exit code 0 produces allowed: true', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'allow.sh', 'echo "all good" >&2\nexit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: ".*"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const result = (await engine.executeHooks('PreToolUse', makeContext()))[0];

    expect(result.allowed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe('all good');
  });
});

// ===========================================================================
// 5. Exit code 2 blocks execution
// ===========================================================================

describe('Hooks System — exit code 2 blocks', () => {
  test('exit code 2 produces allowed: false with reason from stderr', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'block.sh', 'echo "not permitted" >&2\nexit 2');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const result = (await engine.executeHooks('PreToolUse', makeContext()))[0];

    expect(result.allowed).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.message).toBe('not permitted');
  });

  test('exit code 2 uses stdout as fallback message when stderr is empty', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'block-stdout.sh', 'echo "blocked via stdout"\nexit 2');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const result = (await engine.executeHooks('PreToolUse', makeContext()))[0];

    expect(result.allowed).toBe(false);
    expect(result.message).toBe('blocked via stdout');
  });
});

// ===========================================================================
// 6. Other exit codes treated as error (allowed but with warning)
// ===========================================================================

describe('Hooks System — non-zero non-2 exit codes', () => {
  test('exit code 1 produces allowed: true with error message', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'error.sh', 'echo "something broke" >&2\nexit 1');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const result = (await engine.executeHooks('PreToolUse', makeContext()))[0];

    expect(result.allowed).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.message).toBe('something broke');
  });

  test('exit code 3 is also treated as error (allowed)', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'error3.sh', 'exit 3');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const result = (await engine.executeHooks('PreToolUse', makeContext()))[0];

    expect(result.allowed).toBe(true);
    expect(result.exitCode).toBe(3);
  });
});

// ===========================================================================
// 7. Hook timeout kills process
// ===========================================================================

describe('Hooks System — timeout', () => {
  test('hook that exceeds timeout is killed and returns allowed with timeout message', async () => {
    const projectDir = makeTmpProject();
    // Script sleeps for 60 seconds but will be killed after 500ms
    const script = writeScript(projectDir, 'slow.sh', 'sleep 60');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
      timeout: 500
`);

    const engine = new HookEngine(projectDir);
    const start = Date.now();
    const result = (await engine.executeHooks('PreToolUse', makeContext()))[0];
    const elapsed = Date.now() - start;

    expect(result.allowed).toBe(true);
    expect(result.message).toContain('timed out');
    expect(result.message).toContain('500ms');
    // Should complete well before the 60s sleep
    expect(elapsed).toBeLessThan(10_000);
  }, 15_000);
});

// ===========================================================================
// 8. Multiple hooks run in sequence
// ===========================================================================

describe('Hooks System — multiple hooks in sequence', () => {
  test('all matching hooks execute in definition order', async () => {
    const projectDir = makeTmpProject();
    const logFile = path.join(projectDir, 'order.log');

    const script1 = writeScript(projectDir, 'hook1.sh', `echo "first" >> "${logFile}"\nexit 0`);
    const script2 = writeScript(projectDir, 'hook2.sh', `echo "second" >> "${logFile}"\nexit 0`);
    const script3 = writeScript(projectDir, 'hook3.sh', `echo "third" >> "${logFile}"\nexit 0`);

    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script1}"
    - match: "edit_file"
      command: "${script2}"
    - match: "edit_file"
      command: "${script3}"
`);

    const engine = new HookEngine(projectDir);
    const results = await engine.executeHooks('PreToolUse', makeContext());

    expect(results).toHaveLength(3);
    expect(results.every(r => r.allowed)).toBe(true);

    const log = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(log).toEqual(['first', 'second', 'third']);
  });

  test('blocking hook does not prevent subsequent hooks from executing', async () => {
    const projectDir = makeTmpProject();
    const logFile = path.join(projectDir, 'all-run.log');

    const blockScript = writeScript(projectDir, 'block.sh', `echo "blocker" >> "${logFile}"\nexit 2`);
    const passScript = writeScript(projectDir, 'pass.sh', `echo "pass" >> "${logFile}"\nexit 0`);

    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${blockScript}"
    - match: "edit_file"
      command: "${passScript}"
`);

    const engine = new HookEngine(projectDir);
    const results = await engine.executeHooks('PreToolUse', makeContext());

    expect(results).toHaveLength(2);
    expect(results[0].allowed).toBe(false);
    expect(results[1].allowed).toBe(true);

    // Both hooks executed despite the first one blocking
    const log = fs.readFileSync(logFile, 'utf-8').trim().split('\n');
    expect(log).toEqual(['blocker', 'pass']);
  });
});

// ===========================================================================
// 9. Glob/regex patterns match correct tools
// ===========================================================================

describe('Hooks System — regex pattern matching', () => {
  test('regex pattern matches only intended tools', () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'noop.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file|write_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);

    expect(engine.hasHooks('PreToolUse', 'edit_file')).toBe(true);
    expect(engine.hasHooks('PreToolUse', 'write_file')).toBe(true);
    expect(engine.hasHooks('PreToolUse', 'read_file')).toBe(false);
    expect(engine.hasHooks('PreToolUse', 'bash')).toBe(false);
  });

  test('wildcard .* matches all tools', () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'noop.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: ".*"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);

    expect(engine.hasHooks('PreToolUse', 'edit_file')).toBe(true);
    expect(engine.hasHooks('PreToolUse', 'terraform')).toBe(true);
    expect(engine.hasHooks('PreToolUse', 'anything_at_all')).toBe(true);
  });

  test('partial regex matches tool names containing the pattern', () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'noop.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);

    // "file" appears as a substring
    expect(engine.hasHooks('PreToolUse', 'edit_file')).toBe(true);
    expect(engine.hasHooks('PreToolUse', 'write_file')).toBe(true);
    expect(engine.hasHooks('PreToolUse', 'read_file')).toBe(true);
    // "file" does not appear
    expect(engine.hasHooks('PreToolUse', 'bash')).toBe(false);
    expect(engine.hasHooks('PreToolUse', 'terraform')).toBe(false);
  });

  test('anchored regex only matches exact tool names', () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'noop.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "^edit_file$"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);

    expect(engine.hasHooks('PreToolUse', 'edit_file')).toBe(true);
    expect(engine.hasHooks('PreToolUse', 'multi_edit_file')).toBe(false);
  });
});

// ===========================================================================
// 10. Hook config loads from YAML
// ===========================================================================

describe('Hooks System — YAML config loading', () => {
  test('loadHooksConfig parses valid YAML with all three event types', () => {
    const projectDir = makeTmpProject();
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "pre-edit.sh"
      timeout: 5000
  PostToolUse:
    - match: "write_file"
      command: "post-write.sh"
  PermissionRequest:
    - match: ".*"
      command: "audit.sh"
`);

    const config = loadHooksConfig(projectDir);

    expect(config).not.toBeNull();
    expect(config!.hooks.PreToolUse).toHaveLength(1);
    expect(config!.hooks.PreToolUse[0].match).toBe('edit_file');
    expect(config!.hooks.PreToolUse[0].command).toBe('pre-edit.sh');
    expect(config!.hooks.PreToolUse[0].timeout).toBe(5000);
    expect(config!.hooks.PostToolUse).toHaveLength(1);
    expect(config!.hooks.PermissionRequest).toHaveLength(1);
  });

  test('loadHooksConfig returns null when no hooks.yaml exists', () => {
    const projectDir = makeTmpProject();
    const config = loadHooksConfig(projectDir);
    expect(config).toBeNull();
  });

  test('loadHooksConfig throws on invalid YAML with unknown event', () => {
    const projectDir = makeTmpProject();
    writeHooksYaml(projectDir, `
hooks:
  UnknownEvent:
    - match: ".*"
      command: "noop.sh"
`);

    expect(() => loadHooksConfig(projectDir)).toThrow('unknown hook event');
  });

  test('loadHooksConfig throws on missing match field', () => {
    const projectDir = makeTmpProject();
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - command: "noop.sh"
`);

    expect(() => loadHooksConfig(projectDir)).toThrow('match');
  });
});

// ===========================================================================
// 11. HookResult includes duration
// ===========================================================================

describe('Hooks System — duration tracking', () => {
  test('HookResult duration field is a non-negative number', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'quick.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const result = (await engine.executeHooks('PreToolUse', makeContext()))[0];

    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  test('duration reflects actual execution time', async () => {
    const projectDir = makeTmpProject();
    // Script sleeps for ~200ms
    const script = writeScript(projectDir, 'timed.sh', 'sleep 0.2\nexit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const result = (await engine.executeHooks('PreToolUse', makeContext()))[0];

    // Should be at least 100ms (allowing some tolerance)
    expect(result.duration).toBeGreaterThanOrEqual(100);
  });
});

// ===========================================================================
// 12. JSON context passed via stdin
// ===========================================================================

describe('Hooks System — JSON stdin context', () => {
  test('full HookContext is valid JSON on stdin', async () => {
    const projectDir = makeTmpProject();
    const outFile = path.join(projectDir, 'full-context.json');
    const script = writeScript(projectDir, 'dump.sh', `cat > "${outFile}"\nexit 0`);
    writeHooksYaml(projectDir, `
hooks:
  PostToolUse:
    - match: "bash"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const ctx = makeContext({
      tool: 'bash',
      input: { command: 'ls -la' },
      result: { output: 'total 0', isError: false },
    });
    await engine.executeHooks('PostToolUse', ctx);

    const captured = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    expect(captured.tool).toBe('bash');
    expect(captured.input.command).toBe('ls -la');
    expect(captured.result).toEqual({ output: 'total 0', isError: false });
    expect(captured.sessionId).toBe('test-session-001');
    expect(captured.agent).toBe('build');
  });
});

// ===========================================================================
// 13. Blocked hook returns reason
// ===========================================================================

describe('Hooks System — blocked reason via convenience function', () => {
  test('runPreToolHooks returns blocking message from first blocking hook', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(
      projectDir,
      'policy.sh',
      'echo "Policy violation: no production edits in plan mode" >&2\nexit 2'
    );
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const decision = await runPreToolHooks(engine, makeContext());

    expect(decision.allowed).toBe(false);
    expect(decision.message).toBe('Policy violation: no production edits in plan mode');
  });

  test('runPreToolHooks returns allowed when all hooks pass', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'ok.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const decision = await runPreToolHooks(engine, makeContext());

    expect(decision.allowed).toBe(true);
    expect(decision.message).toBeUndefined();
  });

  test('blocked hook returns default reason when no output', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'silent-block.sh', 'exit 2');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const result = (await engine.executeHooks('PreToolUse', makeContext()))[0];

    expect(result.allowed).toBe(false);
    expect(result.message).toBe('Blocked by hook');
  });
});

// ===========================================================================
// 14. Missing hook script handled gracefully
// ===========================================================================

describe('Hooks System — missing script', () => {
  test('non-existent command is handled gracefully and returns allowed', async () => {
    const projectDir = makeTmpProject();
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "/nonexistent/path/hook.sh"
`);

    const engine = new HookEngine(projectDir);
    const results = await engine.executeHooks('PreToolUse', makeContext());

    expect(results).toHaveLength(1);
    // Missing scripts should not block the tool call
    expect(results[0].allowed).toBe(true);
    expect(results[0].exitCode).not.toBe(0);
  });
});

// ===========================================================================
// 15. PermissionRequest hook type works
// ===========================================================================

describe('Hooks System — PermissionRequest event', () => {
  test('PermissionRequest hooks execute via runPermissionHooks', async () => {
    const projectDir = makeTmpProject();
    const logFile = path.join(projectDir, 'perm-audit.log');
    const script = writeScript(
      projectDir,
      'audit-perm.sh',
      `cat > "${logFile}"\nexit 0`
    );
    writeHooksYaml(projectDir, `
hooks:
  PermissionRequest:
    - match: "terraform"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const ctx = makeContext({ tool: 'terraform', input: { action: 'apply' } });

    // runPermissionHooks is fire-and-forget (returns void)
    await runPermissionHooks(engine, ctx);

    const captured = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
    expect(captured.tool).toBe('terraform');
    expect(captured.input.action).toBe('apply');
  });

  test('PermissionRequest hooks do not match other event types', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'noop.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PermissionRequest:
    - match: ".*"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);

    // PermissionRequest hooks should not fire for PreToolUse
    expect(engine.hasHooks('PreToolUse', 'edit_file')).toBe(false);
    expect(engine.hasHooks('PostToolUse', 'edit_file')).toBe(false);
    expect(engine.hasHooks('PermissionRequest', 'edit_file')).toBe(true);
  });
});

// ===========================================================================
// Additional edge cases
// ===========================================================================

describe('Hooks System — edge cases', () => {
  test('engine with no config returns empty results', async () => {
    const engine = new HookEngine();
    const results = await engine.executeHooks('PreToolUse', makeContext());
    expect(results).toEqual([]);
  });

  test('engine with no matching hooks returns empty results', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'noop.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "^terraform$"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    const results = await engine.executeHooks('PreToolUse', makeContext({ tool: 'bash' }));
    expect(results).toEqual([]);
  });

  test('validateHookDefinition catches invalid regex', () => {
    const errors = validateHookDefinition({
      match: '[invalid',
      command: 'test.sh',
    });
    expect(errors.some(e => e.includes('not a valid regex'))).toBe(true);
  });

  test('validateHookDefinition catches empty command', () => {
    const errors = validateHookDefinition({
      match: '.*',
      command: '',
    });
    expect(errors.some(e => e.includes('command'))).toBe(true);
  });

  test('validateHookDefinition catches negative timeout', () => {
    const errors = validateHookDefinition({
      match: '.*',
      command: 'test.sh',
      timeout: -1,
    });
    expect(errors.some(e => e.includes('timeout'))).toBe(true);
  });

  test('DEFAULT_HOOK_TIMEOUT is 30 seconds', () => {
    expect(DEFAULT_HOOK_TIMEOUT).toBe(30_000);
  });

  test('environment variables are set for hook process', async () => {
    const projectDir = makeTmpProject();
    const outFile = path.join(projectDir, 'env-capture.txt');
    const script = writeScript(
      projectDir,
      'env-check.sh',
      `echo "$NIMBUS_HOOK_EVENT|$NIMBUS_HOOK_AGENT|$NIMBUS_HOOK_SESSION" > "${outFile}"\nexit 0`
    );
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "terraform"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    await engine.executeHooks('PreToolUse', makeContext({ tool: 'terraform' }));

    const envLine = fs.readFileSync(outFile, 'utf-8').trim();
    const [hookEvent, hookAgent, hookSession] = envLine.split('|');
    expect(hookEvent).toBe('terraform');
    expect(hookAgent).toBe('build');
    expect(hookSession).toBe('test-session-001');
  });

  test('runPostToolHooks completes without error', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'post-noop.sh', 'exit 0');
    writeHooksYaml(projectDir, `
hooks:
  PostToolUse:
    - match: ".*"
      command: "${script}"
`);

    const engine = new HookEngine(projectDir);
    // Should not throw
    await expect(
      runPostToolHooks(engine, makeContext({ result: { output: 'ok', isError: false } }))
    ).resolves.toBeUndefined();
  });

  test('loadConfig can be called to reload configuration', async () => {
    const projectDir = makeTmpProject();
    const script = writeScript(projectDir, 'noop.sh', 'exit 0');

    // Start with no config
    const engine = new HookEngine();
    expect(engine.hasHooks('PreToolUse', 'edit_file')).toBe(false);

    // Write config and load
    writeHooksYaml(projectDir, `
hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${script}"
`);
    engine.loadConfig(projectDir);

    expect(engine.hasHooks('PreToolUse', 'edit_file')).toBe(true);
  });
});
