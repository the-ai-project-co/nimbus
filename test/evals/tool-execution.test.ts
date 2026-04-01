/**
 * E2E Tool Execution Tests
 *
 * Validates end-to-end execution of standard and devops tools, the tool
 * registry, schema validation, and the spawnExec streaming helper.
 *
 * Tests use real Zod schemas from the tool definitions and exercise actual
 * execute() functions where safe (filesystem, bash). External CLI tools
 * (terraform, kubectl, helm, cloud CLIs) are mocked at the child_process
 * layer so tests remain deterministic without requiring installed binaries.
 */

import { describe, test, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Module-level mock for node:child_process — vi.spyOn does not work on ESM
// namespace exports, so we mock the entire module and configure per-test.
// vi.hoisted ensures the variable is available when the hoisted vi.mock runs.
// ---------------------------------------------------------------------------

const { mockExecFn } = vi.hoisted(() => ({
  mockExecFn: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const realExec = actual.exec;
  const { promisify } = await import('node:util');
  const realExecAsync = promisify(realExec);

  // Create a proxy exec that delegates to mockExecFn when it has a custom
  // implementation, otherwise falls through to the real exec. This ensures
  // tests that don't set a mock still get real exec behavior.
  const proxyExec = Object.assign(
    function (...args: unknown[]) {
      if (mockExecFn.getMockImplementation()) {
        return mockExecFn(...args);
      }
      return (realExec as Function)(...args);
    },
    realExec,
  );

  // Copy the util.promisify.custom symbol so that promisify(proxyExec)
  // returns a function that respects the mock/real delegation.
  const customSym = Symbol.for('nodejs.util.promisify.custom');
  (proxyExec as any)[customSym] = async (...args: unknown[]) => {
    if (mockExecFn.getMockImplementation()) {
      // Wrap the mock in promisify-style: the mock calls cb(err, result)
      return new Promise((resolve, reject) => {
        mockExecFn(...args, (err: unknown, result: unknown) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    }
    return realExecAsync(...(args as [string]));
  };

  return {
    ...actual,
    exec: proxyExec,
  };
});

import {
  readFileTool,
  editFileTool,
  multiEditTool,
  writeFileTool,
  bashTool,
  globTool,
  grepTool,
  listDirTool,
  webfetchTool,
  standardTools,
} from '../../src/tools/schemas/standard';

import {
  terraformTool,
  kubectlTool,
  helmTool,
  cloudDiscoverTool,
  costEstimateTool,
  driftDetectTool,
  deployPreviewTool,
  devopsTools,
} from '../../src/tools/schemas/devops';

import {
  ToolRegistry,
  type ToolDefinition,
  type ToolResult,
  type ToolCategory,
  type PermissionTier,
  type ToolExecuteContext,
} from '../../src/tools/schemas/types';

import { spawnExec } from '../../src/tools/spawn-exec';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nimbus-e2e-tools-'));
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Write a temp file and return its absolute path. */
async function writeTmp(name: string, content: string): Promise<string> {
  const filePath = path.join(tmpDir, name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

// ===========================================================================
// Standard Tool Execution
// ===========================================================================

describe('Standard Tools — read_file', () => {
  test('1. reads existing file and returns content', async () => {
    const filePath = await writeTmp('read-test.txt', 'hello nimbus');
    const result = await readFileTool.execute({ path: filePath });
    expect(result.isError).toBe(false);
    expect(result.output).toBe('hello nimbus');
  });

  test('2. returns error for non-existent file', async () => {
    const result = await readFileTool.execute({
      path: path.join(tmpDir, 'does-not-exist.txt'),
    });
    expect(result.isError).toBe(true);
    expect(result.error).toMatch(/Failed to read file/);
  });

  test('read_file respects offset and limit parameters', async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n');
    const filePath = await writeTmp('lines.txt', lines);
    const result = await readFileTool.execute({ path: filePath, offset: 3, limit: 2 });
    expect(result.isError).toBe(false);
    expect(result.output).toBe('line 3\nline 4');
  });
});

describe('Standard Tools — write_file', () => {
  test('3. creates file with content', async () => {
    const filePath = path.join(tmpDir, 'write-subdir', 'new-file.txt');
    const result = await writeFileTool.execute({
      path: filePath,
      content: 'created by test',
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Successfully wrote');
    const actual = await fs.readFile(filePath, 'utf-8');
    expect(actual).toBe('created by test');
  });
});

describe('Standard Tools — edit_file', () => {
  test('4. applies replacement correctly', async () => {
    const filePath = await writeTmp('edit-test.txt', 'foo bar baz');
    const result = await editFileTool.execute({
      path: filePath,
      old_string: 'bar',
      new_string: 'qux',
    });
    expect(result.isError).toBe(false);
    const updated = await fs.readFile(filePath, 'utf-8');
    expect(updated).toBe('foo qux baz');
  });

  test('edit_file returns error when old_string not found', async () => {
    const filePath = await writeTmp('edit-miss.txt', 'foo bar');
    const result = await editFileTool.execute({
      path: filePath,
      old_string: 'MISSING',
      new_string: 'X',
    });
    expect(result.isError).toBe(true);
    expect(result.error).toMatch(/old_string not found/);
  });
});

describe('Standard Tools — multi_edit', () => {
  test('5. applies multiple edits atomically', async () => {
    const filePath = await writeTmp('multi-edit.txt', 'aaa bbb ccc');
    const result = await multiEditTool.execute({
      path: filePath,
      edits: [
        { old_string: 'aaa', new_string: 'AAA' },
        { old_string: 'ccc', new_string: 'CCC' },
      ],
    });
    expect(result.isError).toBe(false);
    const updated = await fs.readFile(filePath, 'utf-8');
    expect(updated).toBe('AAA bbb CCC');
  });

  test('multi_edit aborts if any old_string not found', async () => {
    const filePath = await writeTmp('multi-edit-fail.txt', 'aaa bbb');
    const result = await multiEditTool.execute({
      path: filePath,
      edits: [
        { old_string: 'aaa', new_string: 'AAA' },
        { old_string: 'MISSING', new_string: 'X' },
      ],
    });
    expect(result.isError).toBe(true);
    // Original file should be unchanged because abort happened before write
    const unchanged = await fs.readFile(filePath, 'utf-8');
    expect(unchanged).toBe('aaa bbb');
  });
});

describe('Standard Tools — bash', () => {
  test('6. executes command and returns stdout', async () => {
    const result = await bashTool.execute({ command: 'echo "nimbus test"' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('nimbus test');
  });

  test('7. returns stderr on failure', async () => {
    const result = await bashTool.execute({
      command: 'ls /nonexistent_path_e2e_test 2>&1',
    });
    // The command will fail but the error is captured
    expect(result.isError || result.output.includes('No such file')).toBe(true);
  });

  test('8. respects timeout via AbortSignal', async () => {
    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    const result = await bashTool.execute({
      command: 'sleep 60',
      timeout: 500,
      _signal: controller.signal,
    } as unknown);

    expect(result.isError).toBe(true);
  });
});

describe('Standard Tools — glob', () => {
  test('9. finds files matching pattern', async () => {
    await writeTmp('glob-dir/a.ts', '');
    await writeTmp('glob-dir/b.ts', '');
    await writeTmp('glob-dir/c.txt', '');

    const result = await globTool.execute({
      pattern: '*.ts',
      path: path.join(tmpDir, 'glob-dir'),
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('a.ts');
    expect(result.output).toContain('b.ts');
    expect(result.output).not.toContain('c.txt');
  });
});

describe('Standard Tools — grep', () => {
  test('10. searches file contents', async () => {
    await writeTmp('grep-dir/target.ts', 'const x = 42;\nconst y = "hello";\n');

    const result = await grepTool.execute({
      pattern: 'const x',
      path: path.join(tmpDir, 'grep-dir'),
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('const x = 42');
  });
});

describe('Standard Tools — list_dir', () => {
  test('11. returns directory listing', async () => {
    await writeTmp('list-dir/file1.txt', '');
    await fs.mkdir(path.join(tmpDir, 'list-dir', 'subdir'), { recursive: true });

    const result = await listDirTool.execute({
      path: path.join(tmpDir, 'list-dir'),
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('[FILE] file1.txt');
    expect(result.output).toContain('[DIR]  subdir/');
  });
});

describe('Standard Tools — webfetch', () => {
  test('12. fetches and parses web content (mock HTTP)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<html><body>Hello Nimbus</body></html>',
    }) as unknown as typeof fetch;

    try {
      const result = await webfetchTool.execute({
        url: 'https://example.com/test',
      });
      expect(result.isError).toBe(false);
      expect(result.output).toContain('Hello Nimbus');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('webfetch returns error on HTTP failure', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }) as unknown as typeof fetch;

    try {
      const result = await webfetchTool.execute({
        url: 'https://example.com/missing',
      });
      expect(result.isError).toBe(true);
      expect(result.error).toMatch(/404/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ===========================================================================
// DevOps Tool Execution
// ===========================================================================

describe('DevOps Tools — terraform', () => {
  test('13. terraform validates configuration', async () => {
    // Create a minimal terraform directory
    const tfDir = path.join(tmpDir, 'tf-validate');
    await fs.mkdir(tfDir, { recursive: true });
    await fs.writeFile(path.join(tfDir, 'main.tf'), 'terraform {}', 'utf-8');

    // terraform validate goes through spawnExec, not exec/execAsync
    const spawnMod = await import('../../src/tools/spawn-exec');
    vi.spyOn(spawnMod, 'spawnExec').mockResolvedValue({
      stdout: 'Success! The configuration is valid.\n',
      stderr: '',
      exitCode: 0,
    });

    const result = await terraformTool.execute({
      action: 'validate',
      workdir: tfDir,
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('valid');
  });

  test('14. terraform generates plan output', async () => {
    const tfDir = path.join(tmpDir, 'tf-plan');
    await fs.mkdir(tfDir, { recursive: true });

    // Mock spawnExec for the plan command
    const spawnMod = await import('../../src/tools/spawn-exec');
    const spawnSpy = vi.spyOn(spawnMod, 'spawnExec').mockResolvedValue({
      stdout: 'Plan: 2 to add, 0 to change, 0 to destroy.\n',
      stderr: '',
      exitCode: 0,
    });

    try {
      const result = await terraformTool.execute({
        action: 'plan',
        workdir: tfDir,
      });
      expect(result.isError).toBe(false);
      expect(result.output).toContain('Plan:');
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test('15. terraform detects workspace from infraContext', async () => {
    const tfDir = path.join(tmpDir, 'tf-ctx');
    await fs.mkdir(tfDir, { recursive: true });

    const spawnMod = await import('../../src/tools/spawn-exec');
    const spawnSpy = vi.spyOn(spawnMod, 'spawnExec').mockResolvedValue({
      stdout: 'No changes. Infrastructure is up-to-date.\n',
      stderr: '',
      exitCode: 0,
    });

    try {
      const ctx: ToolExecuteContext = {
        infraContext: {
          terraformWorkspace: 'staging',
        },
      };
      const result = await terraformTool.execute(
        { action: 'plan', workdir: tfDir },
        ctx,
      );
      expect(result.isError).toBe(false);
    } finally {
      spawnSpy.mockRestore();
    }
  });
});

describe('DevOps Tools — kubectl', () => {
  test('16. kubectl gets resources', async () => {
    mockExecFn.mockImplementation((_cmd: string, _opts: unknown, cb?: Function) => {
      if (typeof _opts === 'function') { cb = _opts; }
      if (cb) cb(null, { stdout: 'NAME   READY   STATUS\nnginx  1/1     Running\n', stderr: '' });
      return { stdout: null, stderr: null, on: vi.fn(), kill: vi.fn() } as any;
    });

    const result = await kubectlTool.execute({
      action: 'get',
      resource: 'pods',
      namespace: 'default',
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('nginx');
  });

  test('17. kubectl applies manifest', async () => {
    const spawnMod = await import('../../src/tools/spawn-exec');
    const spawnSpy = vi.spyOn(spawnMod, 'spawnExec').mockResolvedValue({
      stdout: 'deployment.apps/nginx configured\n',
      stderr: '',
      exitCode: 0,
    });

    try {
      const ctx: ToolExecuteContext = {
        onProgress: vi.fn(),
      };
      const result = await kubectlTool.execute(
        { action: 'apply', args: '-f manifest.yaml', namespace: 'default' },
        ctx,
      );
      expect(result.isError).toBe(false);
      expect(result.output).toContain('configured');
    } finally {
      spawnSpy.mockRestore();
    }
  });

  test('18. kubectl uses context from infraContext', async () => {
    let capturedCmd = '';
    mockExecFn.mockImplementation((cmd: string, _opts: unknown, cb?: Function) => {
      capturedCmd = cmd;
      if (typeof _opts === 'function') { cb = _opts; }
      if (cb) cb(null, { stdout: 'resources listed\n', stderr: '' });
      return { stdout: null, stderr: null, on: vi.fn(), kill: vi.fn() } as any;
    });

    const ctx: ToolExecuteContext = {
      infraContext: {
        kubectlContext: 'prod-cluster',
      },
    };
    await kubectlTool.execute(
      { action: 'get', resource: 'services' },
      ctx,
    );
    expect(capturedCmd).toContain('--context=prod-cluster');
  });
});

describe('DevOps Tools — helm', () => {
  test('19. helm lists releases', async () => {
    const releases = JSON.stringify([
      { name: 'nginx', namespace: 'default', revision: '3', status: 'deployed', chart: 'nginx-1.0.0', app_version: '1.25', updated: '2025-01-01' },
    ]);

    mockExecFn.mockImplementation((cmd: string, _opts: unknown, cb?: Function) => {
      if (typeof _opts === 'function') { cb = _opts; }
      if (cb) cb(null, { stdout: releases, stderr: '' });
      return { stdout: null, stderr: null, on: vi.fn(), kill: vi.fn() } as any;
    });

    const result = await helmTool.execute({ action: 'list' });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('nginx');
  });

  test('20. helm installs chart', async () => {
    const spawnMod = await import('../../src/tools/spawn-exec');
    const spawnSpy = vi.spyOn(spawnMod, 'spawnExec').mockResolvedValue({
      stdout: 'NAME: my-release\nLAST DEPLOYED: 2025-01-01\nSTATUS: deployed\n',
      stderr: '',
      exitCode: 0,
    });

    // Also mock execAsync for the helm repo update that may run
    mockExecFn.mockImplementation((_cmd: string, _opts: unknown, cb?: Function) => {
      if (typeof _opts === 'function') { cb = _opts; }
      if (cb) cb(null, { stdout: '', stderr: '' });
      return { stdout: null, stderr: null, on: vi.fn(), kill: vi.fn() } as any;
    });

    const result = await helmTool.execute({
      action: 'install',
      release: 'my-release',
      chart: 'bitnami/nginx',
      namespace: 'default',
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('deployed');
  });
});

describe('DevOps Tools — cloud_discover', () => {
  test('21. enumerates resources (mock CLI)', async () => {
    const awsOutput = JSON.stringify({
      Reservations: [
        {
          Instances: [
            {
              InstanceId: 'i-abc123',
              InstanceType: 't3.medium',
              Tags: [{ Key: 'Name', Value: 'web-server' }],
              Placement: { AvailabilityZone: 'us-east-1a' },
            },
          ],
        },
      ],
    });

    mockExecFn.mockImplementation((_cmd: string, _opts: unknown, cb?: Function) => {
      if (typeof _opts === 'function') { cb = _opts; }
      if (cb) cb(null, { stdout: awsOutput, stderr: '' });
      return { stdout: null, stderr: null, on: vi.fn(), kill: vi.fn() } as any;
    });

    const result = await cloudDiscoverTool.execute({
      provider: 'aws',
      resource_type: 'ec2 describe-instances',
      region: 'us-east-1',
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('web-server');
  });
});

describe('DevOps Tools — cost_estimate', () => {
  test('22. returns cost data', async () => {
    const infracostOutput = JSON.stringify({
      totalMonthlyCost: '125.50',
      projects: [{ name: 'my-project' }],
    });

    mockExecFn.mockImplementation((cmd: string, _opts: unknown, cb?: Function) => {
      if (typeof _opts === 'function') { cb = _opts; }
      if (cmd.includes('infracost')) {
        if (cb) cb(null, { stdout: infracostOutput, stderr: '' });
      } else {
        // For terraform show
        if (cb) cb(null, { stdout: '{}', stderr: '' });
      }
      return { stdout: null, stderr: null, on: vi.fn(), kill: vi.fn() } as any;
    });

    const result = await costEstimateTool.execute({
      workdir: tmpDir,
      action: 'compare',
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('125.50');
  });
});

describe('DevOps Tools — deploy_preview', () => {
  test('23. generates dry-run changes', async () => {
    mockExecFn.mockImplementation((_cmd: string, _opts: unknown, cb?: Function) => {
      if (typeof _opts === 'function') { cb = _opts; }
      if (cb) cb(null, {
        stdout: 'Plan: 1 to add, 0 to change, 0 to destroy.',
        stderr: '',
      });
      return { stdout: null, stderr: null, on: vi.fn(), kill: vi.fn() } as any;
    });

    const result = await deployPreviewTool.execute({
      action: 'terraform apply',
      workdir: tmpDir,
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('Deploy Preview (Dry Run)');
    expect(result.output).toContain('1 to add');
  });

  test('deploy_preview rejects unsupported action', async () => {
    const result = await deployPreviewTool.execute({
      action: 'pulumi up',
      workdir: tmpDir,
    });
    expect(result.isError).toBe(true);
    expect(result.error).toContain('Unsupported action');
  });
});

describe('DevOps Tools — drift_detect', () => {
  test('24. identifies configuration drift', async () => {
    // Exit code 2 from terraform plan -detailed-exitcode means drift
    mockExecFn.mockImplementation((_cmd: string, _opts: unknown, cb?: Function) => {
      if (typeof _opts === 'function') { cb = _opts; }
      const error = Object.assign(new Error('exit code 2'), {
        code: 2,
        stdout: 'Plan: 1 to add, 0 to change, 1 to destroy.\n',
        stderr: '',
      });
      if (cb) cb(error, { stdout: '', stderr: '' });
      return { stdout: null, stderr: null, on: vi.fn(), kill: vi.fn() } as any;
    });

    const result = await driftDetectTool.execute({
      workdir: tmpDir,
      provider: 'terraform',
    });
    expect(result.isError).toBe(false);
    expect(result.output).toContain('DRIFT DETECTED');
  });
});

// ===========================================================================
// Tool Registry
// ===========================================================================

describe('Tool Registry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  function makeTool(name: string, category: ToolCategory = 'standard', tier: PermissionTier = 'auto_allow'): ToolDefinition {
    return {
      name,
      description: `Test tool: ${name}`,
      inputSchema: z.object({ arg: z.string() }),
      execute: async () => ({ output: 'ok', isError: false }),
      permissionTier: tier,
      category,
    };
  }

  test('25. returns all registered tools', () => {
    registry.register(makeTool('tool_a'));
    registry.register(makeTool('tool_b'));
    registry.register(makeTool('tool_c'));

    const all = registry.getAll();
    expect(all).toHaveLength(3);
    expect(registry.size).toBe(3);
    expect(registry.getNames()).toEqual(['tool_a', 'tool_b', 'tool_c']);
  });

  test('26. filters by category (standard, devops, mcp)', () => {
    registry.register(makeTool('std_1', 'standard'));
    registry.register(makeTool('std_2', 'standard'));
    registry.register(makeTool('devops_1', 'devops'));
    registry.register(makeTool('mcp_1', 'mcp'));

    expect(registry.getByCategory('standard')).toHaveLength(2);
    expect(registry.getByCategory('devops')).toHaveLength(1);
    expect(registry.getByCategory('mcp')).toHaveLength(1);
  });

  test('27. resolves tool by name', () => {
    const tool = makeTool('find_me');
    registry.register(tool);

    expect(registry.get('find_me')).toBe(tool);
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  test('registry throws on duplicate registration', () => {
    registry.register(makeTool('dup'));
    expect(() => registry.register(makeTool('dup'))).toThrow(/already registered/);
  });

  test('registry unregister and clear work', () => {
    registry.register(makeTool('r1'));
    registry.register(makeTool('r2'));
    expect(registry.size).toBe(2);

    expect(registry.unregister('r1')).toBe(true);
    expect(registry.size).toBe(1);
    expect(registry.unregister('nonexistent')).toBe(false);

    registry.clear();
    expect(registry.size).toBe(0);
  });

  test('registry filters by permission tier', () => {
    registry.register(makeTool('auto_1', 'standard', 'auto_allow'));
    registry.register(makeTool('ask_1', 'standard', 'ask_once'));
    registry.register(makeTool('always_1', 'devops', 'always_ask'));

    expect(registry.getByPermissionTier('auto_allow')).toHaveLength(1);
    expect(registry.getByPermissionTier('ask_once')).toHaveLength(1);
    expect(registry.getByPermissionTier('always_ask')).toHaveLength(1);
    expect(registry.getByPermissionTier('blocked')).toHaveLength(0);
  });
});

// ===========================================================================
// Tool Schema Validation (Zod)
// ===========================================================================

describe('Tool Schema Validation', () => {
  test('28. tool schemas validate input correctly', () => {
    // read_file requires a path string
    const readSchema = readFileTool.inputSchema;
    const parsed = readSchema.parse({ path: '/some/file.txt' });
    expect(parsed).toBeDefined();

    // terraform requires action and workdir
    const tfSchema = terraformTool.inputSchema;
    const tfParsed = tfSchema.parse({ action: 'plan', workdir: '/infra' });
    expect(tfParsed).toBeDefined();
  });

  test('29. tool schemas reject invalid input with helpful errors', () => {
    // read_file with missing path
    expect(() => readFileTool.inputSchema.parse({})).toThrow();

    // terraform with invalid action
    expect(() =>
      terraformTool.inputSchema.parse({ action: 'invalid_action', workdir: '/x' })
    ).toThrow();

    // kubectl with missing action
    expect(() => kubectlTool.inputSchema.parse({ resource: 'pods' })).toThrow();

    // bash with wrong type for command
    expect(() => bashTool.inputSchema.parse({ command: 123 })).toThrow();
  });

  test('all standard tools have valid schema definitions', () => {
    for (const tool of standardTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.execute).toBeTypeOf('function');
      expect(['auto_allow', 'ask_once', 'always_ask', 'blocked']).toContain(tool.permissionTier);
      expect(tool.category).toBe('standard');
    }
  });

  test('all devops tools have valid schema definitions', () => {
    for (const tool of devopsTools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.execute).toBeTypeOf('function');
      expect(['auto_allow', 'ask_once', 'always_ask', 'blocked']).toContain(tool.permissionTier);
      expect(tool.category).toBe('devops');
    }
  });
});

// ===========================================================================
// spawnExec Streaming Helper
// ===========================================================================

describe('spawnExec', () => {
  test('30. streams output chunks via onProgress callback', async () => {
    const chunks: string[] = [];
    const result = await spawnExec('echo "line1" && echo "line2"', {
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('line1');
    expect(result.stdout).toContain('line2');
    // onChunk should have been called at least once
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const allChunks = chunks.join('');
    expect(allChunks).toContain('line1');
  });

  test('31. respects AbortSignal for cancellation', async () => {
    const controller = new AbortController();

    // Start a long-running process and abort it quickly
    const promise = spawnExec('sleep 30', { signal: controller.signal });

    // Give the process a moment to start, then abort
    setTimeout(() => controller.abort(), 50);

    await expect(promise).rejects.toThrow(/cancelled/i);
  });

  test('spawnExec respects timeout', async () => {
    await expect(
      spawnExec('sleep 30', { timeout: 200, label: 'test-cmd' })
    ).rejects.toThrow(/timed out/);
  });

  test('spawnExec captures stderr', async () => {
    const result = await spawnExec('echo "err msg" >&2; exit 0');
    expect(result.stderr).toContain('err msg');
  });

  test('spawnExec redacts secrets from onChunk output', async () => {
    const chunks: string[] = [];
    await spawnExec('echo "key: AKIAIOSFODNN7EXAMPLE"', {
      onChunk: (chunk) => chunks.push(chunk),
    });
    const allChunks = chunks.join('');
    expect(allChunks).toContain('[REDACTED]');
    expect(allChunks).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });
});
