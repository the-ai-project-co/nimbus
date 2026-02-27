/**
 * Hooks System Tests
 *
 * Validates the hooks configuration loader, hook definition validation,
 * the HookEngine class (matching, execution), and the convenience
 * functions (runPreToolHooks, runPostToolHooks, runPermissionHooks).
 *
 * Tests that require actual script execution use temporary directories
 * with real hook scripts and hooks.yaml configuration files.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  loadHooksConfig,
  validateHookDefinition,
  DEFAULT_HOOK_TIMEOUT,
  type HookDefinition,
} from '../hooks/config';
import {
  HookEngine,
  runPreToolHooks,
  runPostToolHooks,
  runPermissionHooks,
  type HookContext,
} from '../hooks/engine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary directory for test isolation. */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-hooks-test-'));
}

/** Remove a temporary directory and all its contents. */
function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

/** Create a .nimbus/hooks.yaml file in the given project directory. */
function writeHooksYaml(projectDir: string, content: string): void {
  const nimbusDir = path.join(projectDir, '.nimbus');
  fs.mkdirSync(nimbusDir, { recursive: true });
  fs.writeFileSync(path.join(nimbusDir, 'hooks.yaml'), content, 'utf-8');
}

/** Write an executable script file. */
function writeScript(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

/** Build a minimal HookContext for testing. */
function makeContext(toolName: string): HookContext {
  return {
    tool: toolName,
    input: {},
    sessionId: 'test-session',
    agent: 'build',
    timestamp: new Date().toISOString(),
  };
}

// ===========================================================================
// loadHooksConfig
// ===========================================================================

describe('loadHooksConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns null when no file exists', () => {
    const config = loadHooksConfig(tmpDir);
    expect(config).toBeNull();
  });

  test('loads valid hooks.yaml', () => {
    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file|write_file"
      command: ".nimbus/hooks/pre-edit.sh"
      timeout: 5000
  PostToolUse:
    - match: ".*"
      command: ".nimbus/hooks/post-all.sh"
`
    );

    const config = loadHooksConfig(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.hooks.PreToolUse).toHaveLength(1);
    expect(config!.hooks.PreToolUse[0].match).toBe('edit_file|write_file');
    expect(config!.hooks.PreToolUse[0].command).toBe('.nimbus/hooks/pre-edit.sh');
    expect(config!.hooks.PreToolUse[0].timeout).toBe(5000);
    expect(config!.hooks.PostToolUse).toHaveLength(1);
    expect(config!.hooks.PostToolUse[0].match).toBe('.*');
    // PermissionRequest should default to empty array
    expect(config!.hooks.PermissionRequest).toHaveLength(0);
  });

  test('throws for invalid hook event name', () => {
    writeHooksYaml(
      tmpDir,
      `hooks:
  InvalidEvent:
    - match: ".*"
      command: "echo hi"
`
    );

    expect(() => loadHooksConfig(tmpDir)).toThrow(/unknown hook event/);
  });

  test('throws for missing top-level hooks key', () => {
    writeHooksYaml(
      tmpDir,
      `something_else:
  PreToolUse:
    - match: ".*"
      command: "echo hi"
`
    );

    expect(() => loadHooksConfig(tmpDir)).toThrow(/missing top-level "hooks" key/);
  });
});

// ===========================================================================
// validateHookDefinition
// ===========================================================================

describe('validateHookDefinition', () => {
  test('passes for valid hook', () => {
    const hook: HookDefinition = {
      match: 'edit_file|write_file',
      command: '.nimbus/hooks/pre-edit.sh',
      timeout: 5000,
    };
    const errors = validateHookDefinition(hook);
    expect(errors).toHaveLength(0);
  });

  test('passes for valid hook without timeout', () => {
    const hook: HookDefinition = {
      match: '.*',
      command: 'echo hello',
    };
    const errors = validateHookDefinition(hook);
    expect(errors).toHaveLength(0);
  });

  test('catches invalid regex in match', () => {
    const hook: HookDefinition = {
      match: '[invalid(regex',
      command: 'echo hello',
    };
    const errors = validateHookDefinition(hook);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('not a valid regex'))).toBe(true);
  });

  test('catches empty command', () => {
    const hook: HookDefinition = {
      match: '.*',
      command: '',
    };
    const errors = validateHookDefinition(hook);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('command'))).toBe(true);
  });

  test('catches empty match', () => {
    const hook = {
      match: '',
      command: 'echo hello',
    } as HookDefinition;
    const errors = validateHookDefinition(hook);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('match'))).toBe(true);
  });

  test('catches negative timeout', () => {
    const hook: HookDefinition = {
      match: '.*',
      command: 'echo hello',
      timeout: -1,
    };
    const errors = validateHookDefinition(hook);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('timeout'))).toBe(true);
  });

  test('catches zero timeout', () => {
    const hook: HookDefinition = {
      match: '.*',
      command: 'echo hello',
      timeout: 0,
    };
    const errors = validateHookDefinition(hook);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('timeout'))).toBe(true);
  });
});

// ===========================================================================
// HookEngine — matching
// ===========================================================================

describe('HookEngine.hasHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns true for matching tools', () => {
    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file|write_file"
      command: "echo pre"
`
    );

    const engine = new HookEngine(tmpDir);
    expect(engine.hasHooks('PreToolUse', 'edit_file')).toBe(true);
    expect(engine.hasHooks('PreToolUse', 'write_file')).toBe(true);
  });

  test('returns false for non-matching tools', () => {
    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file|write_file"
      command: "echo pre"
`
    );

    const engine = new HookEngine(tmpDir);
    expect(engine.hasHooks('PreToolUse', 'read_file')).toBe(false);
    expect(engine.hasHooks('PreToolUse', 'glob')).toBe(false);
  });

  test('returns false when no config is loaded', () => {
    const engine = new HookEngine();
    expect(engine.hasHooks('PreToolUse', 'edit_file')).toBe(false);
  });

  test('returns false for event types without hooks', () => {
    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file"
      command: "echo pre"
`
    );

    const engine = new HookEngine(tmpDir);
    expect(engine.hasHooks('PostToolUse', 'edit_file')).toBe(false);
    expect(engine.hasHooks('PermissionRequest', 'edit_file')).toBe(false);
  });
});

describe('HookEngine.getMatchingHooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('returns correct hooks for matching tool', () => {
    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file"
      command: "echo first"
    - match: "edit_file|write_file"
      command: "echo second"
    - match: "bash"
      command: "echo bash-only"
`
    );

    const engine = new HookEngine(tmpDir);
    const matches = engine.getMatchingHooks('PreToolUse', 'edit_file');
    expect(matches).toHaveLength(2);
    expect(matches[0].command).toBe('echo first');
    expect(matches[1].command).toBe('echo second');
  });

  test('returns empty array for no matches', () => {
    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file"
      command: "echo first"
`
    );

    const engine = new HookEngine(tmpDir);
    const matches = engine.getMatchingHooks('PreToolUse', 'read_file');
    expect(matches).toHaveLength(0);
  });

  test('returns empty array when no config loaded', () => {
    const engine = new HookEngine();
    const matches = engine.getMatchingHooks('PreToolUse', 'edit_file');
    expect(matches).toHaveLength(0);
  });

  test('wildcard pattern matches all tools', () => {
    writeHooksYaml(
      tmpDir,
      `hooks:
  PostToolUse:
    - match: ".*"
      command: "echo all"
`
    );

    const engine = new HookEngine(tmpDir);
    expect(engine.getMatchingHooks('PostToolUse', 'edit_file')).toHaveLength(1);
    expect(engine.getMatchingHooks('PostToolUse', 'read_file')).toHaveLength(1);
    expect(engine.getMatchingHooks('PostToolUse', 'terraform')).toHaveLength(1);
  });
});

// ===========================================================================
// Convenience functions — no-op behavior
// ===========================================================================

describe('runPreToolHooks (no hooks match)', () => {
  test('returns allowed: true when no hooks match', async () => {
    const engine = new HookEngine(); // no config loaded
    const ctx = makeContext('edit_file');
    const result = await runPreToolHooks(engine, ctx);
    expect(result.allowed).toBe(true);
  });
});

describe('runPostToolHooks (no hooks match)', () => {
  test('completes without error when no hooks match', async () => {
    const engine = new HookEngine();
    const ctx = makeContext('edit_file');
    // Should not throw
    await runPostToolHooks(engine, ctx);
  });
});

describe('runPermissionHooks (no hooks match)', () => {
  test('completes without error when no hooks match', async () => {
    const engine = new HookEngine();
    const ctx = makeContext('terraform');
    // Should not throw
    await runPermissionHooks(engine, ctx);
  });
});

// ===========================================================================
// HookEngine — execution with real scripts
// ===========================================================================

describe('HookEngine execution with real scripts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test('PreToolUse hook with exit 0 allows the tool', async () => {
    const scriptPath = path.join(tmpDir, '.nimbus', 'hooks', 'allow.sh');
    writeScript(scriptPath, '#!/bin/sh\nexit 0\n');

    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${scriptPath}"
      timeout: 10000
`
    );

    const engine = new HookEngine(tmpDir);
    const ctx = makeContext('edit_file');
    const result = await runPreToolHooks(engine, ctx);
    expect(result.allowed).toBe(true);
  });

  test('PreToolUse hook with exit 2 blocks the tool', async () => {
    const scriptPath = path.join(tmpDir, '.nimbus', 'hooks', 'block.sh');
    writeScript(scriptPath, '#!/bin/sh\necho "Blocked by policy" >&2\nexit 2\n');

    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${scriptPath}"
      timeout: 10000
`
    );

    const engine = new HookEngine(tmpDir);
    const ctx = makeContext('edit_file');
    const result = await runPreToolHooks(engine, ctx);
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('Blocked by policy');
  });

  test('executeHooks returns results for each matching hook', async () => {
    const allowPath = path.join(tmpDir, '.nimbus', 'hooks', 'allow.sh');
    writeScript(allowPath, '#!/bin/sh\nexit 0\n');

    const logPath = path.join(tmpDir, '.nimbus', 'hooks', 'log.sh');
    writeScript(logPath, '#!/bin/sh\necho "logged" >&2\nexit 0\n');

    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${allowPath}"
      timeout: 10000
    - match: ".*"
      command: "${logPath}"
      timeout: 10000
`
    );

    const engine = new HookEngine(tmpDir);
    const ctx = makeContext('edit_file');
    const results = await engine.executeHooks('PreToolUse', ctx);
    expect(results).toHaveLength(2);
    expect(results[0].allowed).toBe(true);
    expect(results[0].exitCode).toBe(0);
    expect(results[1].allowed).toBe(true);
    expect(results[1].exitCode).toBe(0);
  });

  test('hook with non-zero non-2 exit code still allows but reports error', async () => {
    const scriptPath = path.join(tmpDir, '.nimbus', 'hooks', 'error.sh');
    writeScript(scriptPath, '#!/bin/sh\necho "something failed" >&2\nexit 1\n');

    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "bash"
      command: "${scriptPath}"
      timeout: 10000
`
    );

    const engine = new HookEngine(tmpDir);
    const ctx = makeContext('bash');
    const results = await engine.executeHooks('PreToolUse', ctx);
    expect(results).toHaveLength(1);
    expect(results[0].allowed).toBe(true);
    expect(results[0].exitCode).toBe(1);
    expect(results[0].message).toContain('something failed');
  });

  test('PostToolUse hooks execute successfully', async () => {
    const scriptPath = path.join(tmpDir, '.nimbus', 'hooks', 'post.sh');
    writeScript(scriptPath, '#!/bin/sh\necho "post-hook ran"\nexit 0\n');

    writeHooksYaml(
      tmpDir,
      `hooks:
  PostToolUse:
    - match: "edit_file"
      command: "${scriptPath}"
      timeout: 10000
`
    );

    const engine = new HookEngine(tmpDir);
    const ctx: HookContext = {
      ...makeContext('edit_file'),
      result: { output: 'file edited', isError: false },
    };
    // Should complete without throwing
    await runPostToolHooks(engine, ctx);
  });

  test('hook receives context on stdin', async () => {
    // This script writes stdin to a file so we can verify it
    const outputFile = path.join(tmpDir, 'stdin-capture.json');
    const scriptPath = path.join(tmpDir, '.nimbus', 'hooks', 'capture.sh');
    writeScript(scriptPath, `#!/bin/sh\ncat > "${outputFile}"\nexit 0\n`);

    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "terraform"
      command: "${scriptPath}"
      timeout: 10000
`
    );

    const engine = new HookEngine(tmpDir);
    const ctx = makeContext('terraform');
    ctx.input = { action: 'plan', workdir: '/tmp/tf' };
    await engine.executeHooks('PreToolUse', ctx);

    // Verify the script received the JSON context
    const captured = fs.readFileSync(outputFile, 'utf-8');
    const parsed = JSON.parse(captured);
    expect(parsed.tool).toBe('terraform');
    expect(parsed.sessionId).toBe('test-session');
    expect(parsed.input.action).toBe('plan');
  });

  test('hook duration is tracked', async () => {
    const scriptPath = path.join(tmpDir, '.nimbus', 'hooks', 'fast.sh');
    writeScript(scriptPath, '#!/bin/sh\nexit 0\n');

    writeHooksYaml(
      tmpDir,
      `hooks:
  PreToolUse:
    - match: "edit_file"
      command: "${scriptPath}"
      timeout: 10000
`
    );

    const engine = new HookEngine(tmpDir);
    const ctx = makeContext('edit_file');
    const results = await engine.executeHooks('PreToolUse', ctx);
    expect(results).toHaveLength(1);
    expect(typeof results[0].duration).toBe('number');
    expect(results[0].duration).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================================================
// DEFAULT_HOOK_TIMEOUT
// ===========================================================================

describe('DEFAULT_HOOK_TIMEOUT', () => {
  test('is 30 seconds', () => {
    expect(DEFAULT_HOOK_TIMEOUT).toBe(30_000);
  });
});
