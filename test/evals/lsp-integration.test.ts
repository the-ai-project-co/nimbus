/**
 * E2E tests for the LSP integration layer.
 *
 * Covers LSPManager lazy loading, idle stop, availability caching,
 * LSPClient JSON-RPC communication, diagnostics, file synchronization,
 * language detection, concurrent servers, crash recovery, and capabilities.
 *
 * External language server processes are mocked at the child_process layer
 * so tests remain deterministic without requiring installed LSP binaries.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { LSPManager, resetLSPManager, type LSPStatus } from '../../src/lsp/manager';
import { LSPClient, type Diagnostic, severityLabel } from '../../src/lsp/client';
import {
  getLanguageForFile,
  LANGUAGE_CONFIGS,
  getLanguagePriority,
  DEVOPS_LANGUAGE_IDS,
  type LanguageConfig,
} from '../../src/lsp/languages';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a JSON-RPC response with Content-Length header. */
function jsonRpcResponse(id: number, result: unknown): string {
  const body = JSON.stringify({ jsonrpc: '2.0', id, result });
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

/** Build a JSON-RPC notification (no id). */
function jsonRpcNotification(method: string, params: unknown): string {
  const body = JSON.stringify({ jsonrpc: '2.0', method, params });
  return `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

/** Small delay to allow async operations to settle. */
const tick = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));

/** Create a fake child process with readable stdout/stderr and writable stdin. */
function createFakeProcess(options?: { autoInitialize?: boolean }): {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: PassThrough;
  proc: any;
  writtenData: string[];
} {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const emitter = new EventEmitter();
  const writtenData: string[] = [];

  // Capture all writes to stdin
  const originalWrite = stdin.write.bind(stdin);
  stdin.write = function (chunk: any, ...args: any[]): boolean {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    writtenData.push(str);

    // Auto-respond to initialize requests
    if (options?.autoInitialize && str.includes('"method":"initialize"')) {
      // Extract the request ID
      const idMatch = str.match(/"id":(\d+)/);
      const id = idMatch ? parseInt(idMatch[1], 10) : 1;
      process.nextTick(() => {
        stdout.write(
          jsonRpcResponse(id, {
            capabilities: {
              textDocumentSync: 1,
              completionProvider: {},
              diagnosticProvider: {},
            },
          })
        );
      });
    }

    // Auto-respond to shutdown requests
    if (options?.autoInitialize && str.includes('"method":"shutdown"')) {
      const idMatch = str.match(/"id":(\d+)/);
      const id = idMatch ? parseInt(idMatch[1], 10) : 99;
      process.nextTick(() => {
        stdout.write(jsonRpcResponse(id, null));
      });
    }

    return originalWrite(chunk, ...args);
  } as any;

  const proc = Object.assign(emitter, {
    stdout,
    stderr,
    stdin,
    pid: 12345,
    killed: false,
    kill: vi.fn(function (this: any) {
      this.killed = true;
      emitter.emit('exit', 0, null);
    }),
    ref: vi.fn(),
    unref: vi.fn(),
    connected: true,
    exitCode: null,
    signalCode: null,
    spawnargs: [],
    spawnfile: '',
    disconnect: vi.fn(),
    send: vi.fn(),
    channel: undefined,
    stdio: [stdin, stdout, stderr, null, null],
    [Symbol.dispose]: vi.fn(),
  });

  return { proc, stdout, stderr, stdin, writtenData };
}

// ---------------------------------------------------------------------------
// Module-level mock for child_process.spawn and child_process.exec
// ---------------------------------------------------------------------------

let _spawnImpl: (...args: unknown[]) => any;
let _execImpl: (...args: unknown[]) => any;

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    spawn: (...args: unknown[]) => _spawnImpl(...args),
    exec: (...args: unknown[]) => _execImpl(...args),
  };
});

// Mock readFile for LSPManager.touchFile which reads files from disk
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn().mockResolvedValue('const x: number = 42;'),
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LSP Integration E2E', () => {
  beforeEach(() => {
    resetLSPManager();

    // Default exec: all LSP binaries are "available"
    _execImpl = vi.fn((_cmd: string, cb: (err: Error | null, result?: any) => void) => {
      cb(null, { stdout: '/usr/bin/some-lsp', stderr: '' });
    });

    // Default spawn: returns an auto-initializing fake process
    _spawnImpl = vi.fn(() => createFakeProcess({ autoInitialize: true }).proc);
  });

  afterEach(() => {
    resetLSPManager();
  });

  // -----------------------------------------------------------------------
  // 1. LSPManager lazy-loads server for TypeScript
  // -----------------------------------------------------------------------
  test('LSPManager lazy-loads server for TypeScript on first touchFile', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    const spawnFn = vi.fn(() => fake.proc);
    _spawnImpl = spawnFn;

    const manager = new LSPManager('/test/project');
    await manager.touchFile('/test/project/src/index.ts');

    expect(spawnFn).toHaveBeenCalledWith(
      'typescript-language-server',
      ['--stdio'],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] })
    );

    await manager.stopAll();
  });

  // -----------------------------------------------------------------------
  // 2. LSPManager lazy-loads server for Python
  // -----------------------------------------------------------------------
  test('LSPManager lazy-loads server for Python on first touchFile', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    const spawnFn = vi.fn(() => fake.proc);
    _spawnImpl = spawnFn;

    const manager = new LSPManager('/test/project');
    await manager.touchFile('/test/project/main.py');

    expect(spawnFn).toHaveBeenCalledWith(
      'pylsp',
      [],
      expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] })
    );

    await manager.stopAll();
  });

  // -----------------------------------------------------------------------
  // 3. LSPManager auto-stops server after idle
  // -----------------------------------------------------------------------
  test('LSPManager auto-stops server after idle timeout', async () => {
    // Use fake timers only for this test
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const manager = new LSPManager('/test/project');
    await manager.touchFile('/test/project/src/app.ts');

    const statusBefore = await manager.getStatus();
    expect(statusBefore.find(s => s.language === 'TypeScript')?.active).toBe(true);

    // Advance past the default idle timeout (5 minutes)
    // The stop() calls shutdown which creates a pending request;
    // we also need to respond to shutdown.
    vi.advanceTimersByTime(5 * 60 * 1000 + 500);
    await tick(50);

    const statusAfter = await manager.getStatus();
    const tsAfter = statusAfter.find(s => s.language === 'TypeScript');
    // After idle timeout, stop() is called. Even if the shutdown handshake
    // doesn't fully complete, the manager removes the client and sets
    // initialized = false, so `active` should be false.
    expect(tsAfter?.active).toBe(false);

    vi.useRealTimers();
    await manager.stopAll();
  });

  // -----------------------------------------------------------------------
  // 4. LSPClient connects via stdio
  // -----------------------------------------------------------------------
  test('LSPClient connects via stdio and initializes', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const config = LANGUAGE_CONFIGS.find(c => c.id === 'typescript')!;
    const client = new LSPClient(config, '/test/project');

    const started = await client.start();
    expect(started).toBe(true);
    expect(client.isInitialized).toBe(true);
    expect(client.languageId).toBe('typescript');

    await client.stop();
  });

  // -----------------------------------------------------------------------
  // 5. LSPClient requests diagnostics
  // -----------------------------------------------------------------------
  test('LSPClient requests and receives diagnostics via publishDiagnostics', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const config = LANGUAGE_CONFIGS.find(c => c.id === 'typescript')!;
    const client = new LSPClient(config, '/test/project');
    await client.start();

    // Push a publishDiagnostics notification
    fake.stdout.write(
      jsonRpcNotification('textDocument/publishDiagnostics', {
        uri: 'file:///test/project/src/app.ts',
        diagnostics: [
          {
            range: { start: { line: 0, character: 5 }, end: { line: 0, character: 10 } },
            severity: 1,
            message: 'Type error: string is not assignable to number',
            source: 'ts',
          },
        ],
      })
    );

    await tick(50);

    const diagnostics = await client.getDiagnostics('/test/project/src/app.ts', 100);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe(1);
    expect(diagnostics[0].message).toContain('Type error');
    expect(diagnostics[0].line).toBe(1); // 0-indexed -> 1-indexed
    expect(diagnostics[0].column).toBe(6); // 0-indexed -> 1-indexed

    await client.stop();
  });

  // -----------------------------------------------------------------------
  // 6. LSPClient tracks file versions
  // -----------------------------------------------------------------------
  test('LSPClient sends didOpen with version for each touchFile call', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const config = LANGUAGE_CONFIGS.find(c => c.id === 'typescript')!;
    const client = new LSPClient(config, '/test/project');
    await client.start();

    await client.touchFile('/test/project/src/app.ts', 'const x = 1;', 1);
    await client.touchFile('/test/project/src/app.ts', 'const x = 2;', 2);
    await client.touchFile('/test/project/src/app.ts', 'const x = 3;', 3);

    const allWritten = fake.writtenData.join('');
    const didOpenMessages = allWritten
      .split('Content-Length:')
      .filter(chunk => chunk.includes('textDocument/didOpen'));

    expect(didOpenMessages.length).toBe(3);
    expect(didOpenMessages[0]).toContain('"version":1');
    expect(didOpenMessages[1]).toContain('"version":2');
    expect(didOpenMessages[2]).toContain('"version":3');

    await client.stop();
  });

  // -----------------------------------------------------------------------
  // 7. Diagnostics returns errors and warnings
  // -----------------------------------------------------------------------
  test('diagnostics contains both errors and warnings with correct severity', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const config = LANGUAGE_CONFIGS.find(c => c.id === 'typescript')!;
    const client = new LSPClient(config, '/test/project');
    await client.start();

    fake.stdout.write(
      jsonRpcNotification('textDocument/publishDiagnostics', {
        uri: 'file:///test/project/src/app.ts',
        diagnostics: [
          {
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
            severity: 1,
            message: 'Cannot find name "foo"',
            source: 'ts',
            code: 2304,
          },
          {
            range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
            severity: 2,
            message: 'Unused variable "bar"',
            source: 'ts',
            code: 6133,
          },
        ],
      })
    );

    await tick(50);

    const diagnostics = await client.getDiagnostics('/test/project/src/app.ts', 100);
    expect(diagnostics).toHaveLength(2);

    const errors = diagnostics.filter(d => d.severity === 1);
    const warnings = diagnostics.filter(d => d.severity === 2);
    expect(errors).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(errors[0].code).toBe(2304);
    expect(warnings[0].code).toBe(6133);

    expect(severityLabel(1)).toBe('Error');
    expect(severityLabel(2)).toBe('Warning');
    expect(severityLabel(3)).toBe('Info');
    expect(severityLabel(4)).toBe('Hint');

    await client.stop();
  });

  // -----------------------------------------------------------------------
  // 8. File synchronization notifies server
  // -----------------------------------------------------------------------
  test('touchFile sends textDocument/didOpen notification to server', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const config = LANGUAGE_CONFIGS.find(c => c.id === 'typescript')!;
    const client = new LSPClient(config, '/test/project');
    await client.start();

    // Now call touchFile after initialization
    await client.touchFile('/test/project/src/app.ts', 'const x: number = 42;', 1);

    const allWritten = fake.writtenData.join('');
    expect(allWritten).toContain('textDocument/didOpen');
    expect(allWritten).toContain('file:///test/project/src/app.ts');
    expect(allWritten).toContain('const x: number = 42;');
    expect(allWritten).toContain('"languageId":"typescript"');

    await client.stop();
  });

  // -----------------------------------------------------------------------
  // 9. Server availability caching
  // -----------------------------------------------------------------------
  test('LSPManager caches server availability checks', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const execFn = vi.fn((_cmd: string, cb: (err: Error | null, result?: any) => void) => {
      cb(null, { stdout: '/usr/bin/ts-server' });
    });
    _execImpl = execFn;

    const manager = new LSPManager('/test/project');
    await manager.touchFile('/test/project/src/app.ts');

    const status = await manager.getStatus();
    const tsStatus = status.find(s => s.language === 'TypeScript');
    expect(tsStatus?.available).toBe(true);

    // exec for typescript-language-server should have been called once then cached
    const tsCalls = execFn.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('typescript-language-server')
    );
    expect(tsCalls.length).toBe(1);

    await manager.stopAll();
  });

  // -----------------------------------------------------------------------
  // 10. Multiple language servers concurrent
  // -----------------------------------------------------------------------
  test('LSPManager runs multiple language servers concurrently', async () => {
    const tsFake = createFakeProcess({ autoInitialize: true });
    const pyFake = createFakeProcess({ autoInitialize: true });
    let callIdx = 0;
    const spawnFn = vi.fn(() => {
      callIdx++;
      return callIdx === 1 ? tsFake.proc : pyFake.proc;
    });
    _spawnImpl = spawnFn;

    const manager = new LSPManager('/test/project');

    await manager.touchFile('/test/project/src/index.ts');
    await manager.touchFile('/test/project/main.py');

    expect(spawnFn).toHaveBeenCalledTimes(2);

    const status = await manager.getStatus();
    expect(status.find(s => s.language === 'TypeScript')?.active).toBe(true);
    expect(status.find(s => s.language === 'Python')?.active).toBe(true);

    await manager.stopAll();
  });

  // -----------------------------------------------------------------------
  // 11. Server crash handled (restart)
  // -----------------------------------------------------------------------
  test('LSPManager handles server crash by removing client', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const manager = new LSPManager('/test/project');
    await manager.touchFile('/test/project/src/app.ts');

    let status = await manager.getStatus();
    expect(status.find(s => s.language === 'TypeScript')?.active).toBe(true);

    // Simulate server crash
    fake.proc.emit('exit', 1, null);
    await tick(50);

    status = await manager.getStatus();
    expect(status.find(s => s.language === 'TypeScript')?.active).toBe(false);

    await manager.stopAll();
  });

  // -----------------------------------------------------------------------
  // 12. Unsupported language returns empty
  // -----------------------------------------------------------------------
  test('unsupported language file returns no diagnostics', async () => {
    const manager = new LSPManager('/test/project');

    await manager.touchFile('/test/project/schema.sql');
    const diagnostics = await manager.getDiagnostics('/test/project/schema.sql', 10);
    expect(diagnostics).toEqual([]);

    await manager.stopAll();
  });

  // -----------------------------------------------------------------------
  // 13. Language detection for .ts, .py, .go, .rs, .java, .json
  // -----------------------------------------------------------------------
  test('getLanguageForFile detects correct languages', () => {
    // TypeScript
    expect(getLanguageForFile('/src/app.ts')?.id).toBe('typescript');
    expect(getLanguageForFile('/src/app.tsx')?.id).toBe('typescript');
    expect(getLanguageForFile('/src/app.js')?.id).toBe('typescript');
    expect(getLanguageForFile('/src/app.jsx')?.id).toBe('typescript');
    expect(getLanguageForFile('/src/app.mjs')?.id).toBe('typescript');
    expect(getLanguageForFile('/src/app.cjs')?.id).toBe('typescript');

    // Python
    expect(getLanguageForFile('/src/main.py')?.id).toBe('python');
    expect(getLanguageForFile('/src/stubs.pyi')?.id).toBe('python');

    // Go
    expect(getLanguageForFile('/src/main.go')?.id).toBe('go');

    // Rust -- not in LANGUAGE_CONFIGS, should be undefined
    expect(getLanguageForFile('/src/main.rs')).toBeUndefined();

    // Java -- not in LANGUAGE_CONFIGS, should be undefined
    expect(getLanguageForFile('/src/Main.java')).toBeUndefined();

    // YAML
    expect(getLanguageForFile('/src/config.yaml')?.id).toBe('yaml');
    expect(getLanguageForFile('/src/config.yml')?.id).toBe('yaml');

    // Terraform
    expect(getLanguageForFile('/infra/main.tf')?.id).toBe('terraform');
    expect(getLanguageForFile('/infra/vars.tfvars')?.id).toBe('terraform');
    expect(getLanguageForFile('/infra/config.hcl')?.id).toBe('terraform');

    // Docker
    expect(getLanguageForFile('/Dockerfile')?.id).toBe('docker');

    // Unknown extension
    expect(getLanguageForFile('/readme.md')).toBeUndefined();
    expect(getLanguageForFile('/data.csv')).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // 14. JSON-RPC format correct
  // -----------------------------------------------------------------------
  test('LSPClient sends correctly formatted JSON-RPC messages', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const config = LANGUAGE_CONFIGS.find(c => c.id === 'typescript')!;
    const client = new LSPClient(config, '/test/project');
    await client.start();

    // Parse the first JSON-RPC message (initialize request)
    const allWritten = fake.writtenData.join('');
    const headerMatch = allWritten.match(/Content-Length:\s*(\d+)\r\n\r\n/);
    expect(headerMatch).not.toBeNull();

    const contentLength = parseInt(headerMatch![1], 10);
    const bodyStart = headerMatch!.index! + headerMatch![0].length;
    const body = allWritten.slice(bodyStart, bodyStart + contentLength);
    const parsed = JSON.parse(body);

    expect(parsed.jsonrpc).toBe('2.0');
    expect(parsed.id).toBe(1);
    expect(parsed.method).toBe('initialize');
    expect(parsed.params).toBeDefined();

    await client.stop();
  });

  // -----------------------------------------------------------------------
  // 15. Init sends correct capabilities
  // -----------------------------------------------------------------------
  test('LSPClient initialize request sends correct capabilities', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const config = LANGUAGE_CONFIGS.find(c => c.id === 'typescript')!;
    const client = new LSPClient(config, '/test/project');
    await client.start();

    // Extract and parse the initialize request body
    const allWritten = fake.writtenData.join('');
    const match = allWritten.match(/Content-Length:\s*(\d+)\r\n\r\n/);
    expect(match).not.toBeNull();

    const len = parseInt(match![1], 10);
    const bodyIdx = match!.index! + match![0].length;
    const initRequest = JSON.parse(allWritten.slice(bodyIdx, bodyIdx + len));

    // Verify initialize params
    expect(initRequest.params.processId).toBe(process.pid);
    expect(initRequest.params.rootUri).toBe('file:///test/project');
    expect(initRequest.params.capabilities.textDocument.synchronization).toEqual({
      didOpen: true,
      didChange: true,
      didClose: true,
    });
    expect(initRequest.params.capabilities.textDocument.publishDiagnostics).toEqual({
      relatedInformation: true,
    });

    // TypeScript-specific initialization options
    expect(initRequest.params.initializationOptions).toEqual({
      preferences: { includeInlayParameterNameHints: 'none' },
    });

    await client.stop();
  });

  // -----------------------------------------------------------------------
  // Supplementary: LSPManager disabled returns empty diagnostics
  // -----------------------------------------------------------------------
  test('LSPManager when disabled returns empty diagnostics', async () => {
    const manager = new LSPManager('/test/project');
    manager.setEnabled(false);

    await manager.touchFile('/test/project/src/app.ts');
    const diagnostics = await manager.getDiagnostics('/test/project/src/app.ts', 10);
    expect(diagnostics).toEqual([]);

    await manager.stopAll();
  });

  // -----------------------------------------------------------------------
  // Supplementary: formatDiagnosticsForAgent
  // -----------------------------------------------------------------------
  test('formatDiagnosticsForAgent formats errors and warnings correctly', () => {
    const manager = new LSPManager('/test/project');

    // Empty diagnostics returns null
    expect(manager.formatDiagnosticsForAgent([])).toBeNull();

    // Only hints/info returns null
    expect(
      manager.formatDiagnosticsForAgent([
        { file: 'a.ts', line: 1, column: 1, severity: 3, message: 'info' },
        { file: 'b.ts', line: 1, column: 1, severity: 4, message: 'hint' },
      ])
    ).toBeNull();

    // Mixed errors and warnings
    const result = manager.formatDiagnosticsForAgent([
      { file: 'a.ts', line: 10, column: 5, severity: 1, message: 'Type error', source: 'ts' },
      { file: 'b.ts', line: 20, column: 1, severity: 2, message: 'Unused var', source: 'ts' },
    ]);
    expect(result).toContain('[LSP Diagnostics]');
    expect(result).toContain('Error: a.ts:10:5');
    expect(result).toContain('Warning: b.ts:20:1');
  });

  // -----------------------------------------------------------------------
  // Supplementary: getLanguagePriority and DEVOPS_LANGUAGE_IDS
  // -----------------------------------------------------------------------
  test('getLanguagePriority returns all configs and DEVOPS_LANGUAGE_IDS are correct', () => {
    const priority = getLanguagePriority();
    expect(priority).toHaveLength(LANGUAGE_CONFIGS.length);
    expect(priority[0].id).toBe('typescript');

    expect(DEVOPS_LANGUAGE_IDS).toContain('terraform');
    expect(DEVOPS_LANGUAGE_IDS).toContain('yaml');
    expect(DEVOPS_LANGUAGE_IDS).toContain('docker');
  });

  // -----------------------------------------------------------------------
  // Supplementary: LSPClient getCachedDiagnostics
  // -----------------------------------------------------------------------
  test('LSPClient getCachedDiagnostics returns empty for untracked files', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    _spawnImpl = vi.fn(() => fake.proc);

    const config = LANGUAGE_CONFIGS.find(c => c.id === 'typescript')!;
    const client = new LSPClient(config, '/test/project');
    await client.start();

    const cached = client.getCachedDiagnostics('/nonexistent/file.ts');
    expect(cached).toEqual([]);

    await client.stop();
  });

  // -----------------------------------------------------------------------
  // Supplementary: enabledLanguages filter
  // -----------------------------------------------------------------------
  test('LSPManager respects enabledLanguages filter', async () => {
    const fake = createFakeProcess({ autoInitialize: true });
    const spawnFn = vi.fn(() => fake.proc);
    _spawnImpl = spawnFn;

    // Only enable Python
    const manager = new LSPManager('/test/project', { enabledLanguages: ['python'] });

    // TypeScript file should be ignored (no spawn)
    await manager.touchFile('/test/project/src/app.ts');
    expect(spawnFn).not.toHaveBeenCalled();

    // Python file should trigger LSP
    await manager.touchFile('/test/project/main.py');

    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).toHaveBeenCalledWith('pylsp', [], expect.any(Object));

    await manager.stopAll();
  });
});
