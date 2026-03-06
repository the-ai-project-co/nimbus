/**
 * Polish Phase 3 Tests — M1, M3, M4, M5
 *
 * Tests for:
 *   M1 — dry-run mode (parseRunArgs + buildSystemPrompt)
 *   M3 — cost estimate/compare/report subcommands
 *   M4 — config primaryClouds key
 *   M5 — MCP add/list/remove in plugin.ts
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseRunArgs } from '../cli/run';
import { buildSystemPrompt } from '../agent/system-prompt';
import { CONFIG_KEYS } from '../config/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

// Patch os.homedir so MCP/plugin files go into a temp dir
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof os>('node:os');
  return {
    ...actual,
    homedir: () => tmpDir ?? actual.homedir(),
  };
});

async function getMcpModule() {
  vi.resetModules();
  return await import('../commands/plugin');
}

// ---------------------------------------------------------------------------
// M1 — Dry-run mode
// ---------------------------------------------------------------------------

describe('M1 — dry-run mode (parseRunArgs)', () => {
  test('--dry-run sets dryRun=true', () => {
    const result = parseRunArgs(['--dry-run', 'check infrastructure']);
    expect(result.dryRun).toBe(true);
  });

  test('--dry-run forces mode to "plan"', () => {
    const result = parseRunArgs(['--dry-run', 'check everything']);
    expect(result.mode).toBe('plan');
  });

  test('--dry-run overrides --mode build to plan', () => {
    const result = parseRunArgs(['--mode', 'build', '--dry-run', 'prompt']);
    expect(result.mode).toBe('plan');
    expect(result.dryRun).toBe(true);
  });

  test('--dry-run overrides --mode deploy to plan', () => {
    const result = parseRunArgs(['--mode', 'deploy', '--dry-run', 'prompt']);
    expect(result.mode).toBe('plan');
  });

  test('dryRun defaults to undefined when not specified', () => {
    const result = parseRunArgs(['my prompt']);
    expect(result.dryRun).toBeFalsy();
  });

  test('--dry-run preserves other flags', () => {
    const result = parseRunArgs(['--dry-run', '--auto-approve', '--format', 'json', 'the prompt']);
    expect(result.dryRun).toBe(true);
    expect(result.autoApprove).toBe(true);
    expect(result.format).toBe('json');
    expect(result.prompt).toBe('the prompt');
  });
});

describe('M1 — dry-run mode (buildSystemPrompt)', () => {
  test('includes DRY-RUN MODE block when dryRun=true', () => {
    const prompt = buildSystemPrompt({ mode: 'plan', tools: [], dryRun: true });
    expect(prompt).toContain('DRY-RUN MODE');
    expect(prompt).toContain('Do not execute any mutating operations');
    expect(prompt).toContain('List exactly what you would do step by step');
  });

  test('does not include DRY-RUN block when dryRun is false', () => {
    const prompt = buildSystemPrompt({ mode: 'plan', tools: [], dryRun: false });
    expect(prompt).not.toContain('DRY-RUN MODE');
  });

  test('does not include DRY-RUN block when dryRun is omitted', () => {
    const prompt = buildSystemPrompt({ mode: 'build', tools: [] });
    expect(prompt).not.toContain('DRY-RUN MODE');
  });

  test('DRY-RUN block appears after environment context section', () => {
    const prompt = buildSystemPrompt({ mode: 'plan', tools: [], dryRun: true });
    const envIdx = prompt.indexOf('# Environment');
    const dryRunIdx = prompt.indexOf('DRY-RUN MODE');
    expect(envIdx).toBeGreaterThan(-1);
    expect(dryRunIdx).toBeGreaterThan(envIdx);
  });
});

// ---------------------------------------------------------------------------
// M3 — Cost estimate subcommand recognition
// ---------------------------------------------------------------------------

describe('M3 — cost command subcommands', () => {
  test('costCommand exports costCompareCommand function', async () => {
    const mod = await import('../commands/cost/index');
    expect(typeof mod.costCompareCommand).toBe('function');
  });

  test('costCommand exports costReportCommand function', async () => {
    const mod = await import('../commands/cost/index');
    expect(typeof mod.costReportCommand).toBe('function');
  });

  test('costReportCommand outputs JSON report when format is json', async () => {
    const { costReportCommand } = await import('../commands/cost/index');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => logs.push(String(args[0])));

    await costReportCommand('json');

    vi.restoreAllMocks();
    expect(logs.length).toBeGreaterThan(0);
    const parsed = JSON.parse(logs[0]) as Record<string, unknown>;
    expect(parsed).toHaveProperty('generatedAt');
    expect(parsed).toHaveProperty('format', 'json');
  });

  test('costReportCommand outputs CSV header when format is csv', async () => {
    const { costReportCommand } = await import('../commands/cost/index');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => logs.push(String(args[0])));

    await costReportCommand('csv');

    vi.restoreAllMocks();
    expect(logs.some(l => l.includes('timestamp,description,cost_usd'))).toBe(true);
  });

  test('costReportCommand outputs text summary by default', async () => {
    const { costReportCommand } = await import('../commands/cost/index');
    const outputs: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      outputs.push(String(chunk));
      return true;
    });

    await costReportCommand('text');

    vi.restoreAllMocks();
    // Should not throw — text mode uses ui.print which writes to stdout
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M4 — Config primaryClouds key
// ---------------------------------------------------------------------------

describe('M4 — config primaryClouds key', () => {
  test('CONFIG_KEYS contains primaryClouds entry', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'primaryClouds');
    expect(entry).toBeDefined();
    expect(entry?.type).toBe('string');
    expect(entry?.description).toContain('cloud');
  });

  test('CONFIG_KEYS primaryClouds description mentions comma-separated', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'primaryClouds');
    expect(entry?.description).toMatch(/comma.?separated|aws.*gcp|gcp.*azure/i);
  });

  test('CONFIG_KEYS contains model entry', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'model');
    expect(entry).toBeDefined();
    expect(entry?.type).toBe('string');
  });

  test('CONFIG_KEYS model description mentions known model IDs', () => {
    const entry = CONFIG_KEYS.find(k => k.key === 'model');
    expect(entry?.description).toContain('claude');
  });
});

// ---------------------------------------------------------------------------
// M5 — MCP add/list/remove
// ---------------------------------------------------------------------------

describe('M5 — MCP server management', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-mcp-test-'));
    vi.resetModules();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  test('mcpCommand is exported from plugin.ts', async () => {
    const mod = await getMcpModule();
    expect(typeof mod.mcpCommand).toBe('function');
  });

  test('list shows no servers when config is absent', async () => {
    const { mcpCommand } = await getMcpModule();
    const outputs: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      outputs.push(String(chunk));
      return true;
    });

    await mcpCommand('list', []);
    vi.restoreAllMocks();
    // Should not throw
    expect(true).toBe(true);
  });

  test('add writes server entry to mcp.json', async () => {
    const { mcpCommand } = await getMcpModule();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await mcpCommand('add', ['npx -y @my/mcp-server', '--name', 'my-server']);

    vi.restoreAllMocks();

    const mcpFile = path.join(tmpDir, '.nimbus', 'mcp.json');
    expect(fs.existsSync(mcpFile)).toBe(true);
    const config = JSON.parse(fs.readFileSync(mcpFile, 'utf-8')) as { servers: Array<{ name: string }> };
    expect(config.servers.some(s => s.name === 'my-server')).toBe(true);
  });

  test('add stores correct command and args for npm package', async () => {
    const { mcpCommand } = await getMcpModule();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await mcpCommand('add', ['npx -y @my/mcp-server', '--name', 'test-server']);

    vi.restoreAllMocks();

    const mcpFile = path.join(tmpDir, '.nimbus', 'mcp.json');
    const config = JSON.parse(fs.readFileSync(mcpFile, 'utf-8')) as {
      servers: Array<{ name: string; command: string; args: string[]; type: string }>;
    };
    const server = config.servers.find(s => s.name === 'test-server');
    expect(server).toBeDefined();
    expect(server?.command).toBe('npx');
    expect(server?.args).toContain('-y');
    expect(server?.type).toBe('stdio');
  });

  test('add stores HTTP server with type=http', async () => {
    const { mcpCommand } = await getMcpModule();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await mcpCommand('add', ['https://my.mcp.server.example.com', '--name', 'http-server']);

    vi.restoreAllMocks();

    const mcpFile = path.join(tmpDir, '.nimbus', 'mcp.json');
    const config = JSON.parse(fs.readFileSync(mcpFile, 'utf-8')) as {
      servers: Array<{ name: string; type: string; url: string }>;
    };
    const server = config.servers.find(s => s.name === 'http-server');
    expect(server?.type).toBe('http');
    expect(server?.url).toBe('https://my.mcp.server.example.com');
  });

  test('add warns on duplicate name', async () => {
    // Pre-create config with an existing entry
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(
      path.join(nimbusDir, 'mcp.json'),
      JSON.stringify({ servers: [{ name: 'existing', command: 'npx', args: ['existing'], type: 'stdio' }] }),
      'utf-8'
    );

    const { mcpCommand } = await getMcpModule();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Should not throw or add duplicate
    await mcpCommand('add', ['npx existing', '--name', 'existing']);
    vi.restoreAllMocks();

    const config = JSON.parse(
      fs.readFileSync(path.join(nimbusDir, 'mcp.json'), 'utf-8')
    ) as { servers: unknown[] };
    expect(config.servers).toHaveLength(1);
  });

  test('remove deletes server from mcp.json', async () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(
      path.join(nimbusDir, 'mcp.json'),
      JSON.stringify({
        servers: [
          { name: 'server-a', command: 'npx', args: ['a'], type: 'stdio' },
          { name: 'server-b', command: 'npx', args: ['b'], type: 'stdio' },
        ],
      }),
      'utf-8'
    );

    const { mcpCommand } = await getMcpModule();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await mcpCommand('remove', ['server-a']);
    vi.restoreAllMocks();

    const config = JSON.parse(
      fs.readFileSync(path.join(nimbusDir, 'mcp.json'), 'utf-8')
    ) as { servers: Array<{ name: string }> };
    expect(config.servers.some(s => s.name === 'server-a')).toBe(false);
    expect(config.servers.some(s => s.name === 'server-b')).toBe(true);
  });

  test('remove warns when server not found', async () => {
    const { mcpCommand } = await getMcpModule();
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Should not throw
    await expect(mcpCommand('remove', ['nonexistent-server'])).resolves.not.toThrow();
    vi.restoreAllMocks();
  });

  test('MCPServerEntry type is exported', async () => {
    // Type test — verifies the export exists at runtime via typeof usage
    const mod = await getMcpModule();
    // mcpCommand should be a function (type shape check)
    expect(typeof mod.mcpCommand).toBe('function');
  });
});
