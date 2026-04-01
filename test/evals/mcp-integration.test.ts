/**
 * MCP Integration E2E Tests
 *
 * Tests MCPClient and MCPManager for MCP server communication,
 * tool discovery, tool invocation, and multi-server management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MCPClient, type MCPServerConfig } from '../../src/mcp/client';
import { MCPManager, type MCPConfig } from '../../src/mcp/manager';

// ---------------------------------------------------------------------------
// Mock fetch for HTTP-based MCP servers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// MCPClient — constructor and config
// ---------------------------------------------------------------------------

describe('MCPClient — config and state', () => {
  it('creates client with command config', () => {
    const client = new MCPClient({
      name: 'test-cmd',
      type: 'command',
      command: 'node',
      args: ['server.js'],
    });
    expect(client.config.name).toBe('test-cmd');
    expect(client.config.type).toBe('command');
    expect(client.isConnected).toBe(false);
    expect(client.discoveredTools).toEqual([]);
  });

  it('creates client with HTTP config', () => {
    const client = new MCPClient({
      name: 'test-http',
      type: 'http',
      url: 'http://localhost:9999',
      token: 'secret',
      lazy: true,
    });
    expect(client.config.name).toBe('test-http');
    expect(client.config.type).toBe('http');
    expect(client.config.url).toBe('http://localhost:9999');
    expect(client.config.token).toBe('secret');
    expect(client.config.lazy).toBe(true);
  });

  it('disconnect resets connected state', async () => {
    const client = new MCPClient({ name: 'dc', type: 'http', url: 'http://localhost:1' });
    // Force internal state
    (client as any).connected = true;
    (client as any).tools = [{ name: 'x', description: 'x', inputSchema: { type: 'object' } }];
    expect(client.isConnected).toBe(true);
    expect(client.discoveredTools.length).toBe(1);

    await client.disconnect();
    expect(client.isConnected).toBe(false);
    expect(client.discoveredTools).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// MCPClient — HTTP server integration
// ---------------------------------------------------------------------------

describe('MCPClient — HTTP server', () => {
  let client: MCPClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
    client = new MCPClient({
      name: 'http-test',
      type: 'http',
      url: 'http://localhost:8080',
      token: 'my-token',
    });
  });

  afterEach(async () => {
    await client.disconnect();
    globalThis.fetch = originalFetch;
  });

  it('connects to HTTP server', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await client.connect();
    expect(client.isConnected).toBe(true);
  });

  it('connect sends auth header', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await client.connect();
    const call = fetchMock.mock.calls[0];
    expect(call[1].headers.Authorization).toBe('Bearer my-token');
  });

  it('connect is idempotent', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await client.connect();
    await client.connect();
    // Should only call fetch once for connect
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('discovers tools via /tools/list', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            { name: 'search', description: 'Search docs', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } },
            { name: 'index', description: 'Index docs', inputSchema: { type: 'object' } },
          ],
        }),
      });

    await client.connect();
    const tools = await client.listTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('search');
    expect(tools[1].name).toBe('index');
  });

  it('callTool sends POST to /tools/call', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tools: [{ name: 's', description: 's', inputSchema: { type: 'object' } }] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'Result: 42' }] }),
      });

    await client.connect();
    await client.listTools();
    const result = await client.callTool('s', { q: 'test' });
    expect(result.isError).toBe(false);
    expect(result.output).toBe('Result: 42');

    const toolCall = fetchMock.mock.calls[2];
    expect(toolCall[0]).toBe('http://localhost:8080/tools/call');
    expect(toolCall[1].method).toBe('POST');
    expect(JSON.parse(toolCall[1].body)).toEqual({ name: 's', arguments: { q: 'test' } });
  });

  it('callTool handles server error result', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tools: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'Permission denied' }], isError: true }),
      });

    await client.connect();
    await client.listTools();
    const result = await client.callTool('restricted', {});
    expect(result.isError).toBe(true);
    expect(result.error).toContain('Permission denied');
  });

  it('callTool handles network failure gracefully', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tools: [] }) })
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await client.connect();
    await client.listTools();
    const result = await client.callTool('any', {});
    expect(result.isError).toBe(true);
    expect(result.error).toContain('MCP tool call failed');
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('connect failure throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(client.connect()).rejects.toThrow();
    expect(client.isConnected).toBe(false);
  });

  it('toToolDefinitions creates mcp-prefixed tools', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            { name: 'my_tool', description: 'Does stuff', inputSchema: { type: 'object', properties: {} } },
          ],
        }),
      });

    await client.connect();
    await client.listTools();
    const defs = client.toToolDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('mcp_http-test_my_tool');
    expect(defs[0].description).toContain('[MCP: http-test]');
    expect(defs[0].category).toBe('mcp');
    expect(defs[0].permissionTier).toBe('ask_once');
    expect(typeof defs[0].execute).toBe('function');
    expect(typeof defs[0].inputSchema.parse).toBe('function');
  });

  it('concatenates multiple text content blocks', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tools: [{ name: 't', description: 'd', inputSchema: { type: 'object' } }] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            { type: 'text', text: 'line 1' },
            { type: 'image', data: 'ignored' },
            { type: 'text', text: 'line 2' },
          ],
        }),
      });

    await client.connect();
    await client.listTools();
    const result = await client.callTool('t', {});
    expect(result.output).toBe('line 1\nline 2');
  });

  it('empty content falls back to JSON.stringify', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tools: [{ name: 't', description: 'd', inputSchema: { type: 'object' } }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: [] }) });

    await client.connect();
    await client.listTools();
    const result = await client.callTool('t', {});
    expect(result.output).toBeTruthy();
    expect(result.isError).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MCPManager Tests
// ---------------------------------------------------------------------------

describe('MCPManager', () => {
  let manager: MCPManager;
  let tmpDir: string;

  beforeEach(() => {
    manager = new MCPManager();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-mcp-mgr-'));
  });

  afterEach(async () => {
    await manager.disconnectAll();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with zero servers', () => {
    expect(manager.serverCount).toBe(0);
    expect(manager.connectedCount).toBe(0);
  });

  it('loads config from .nimbus/mcp.json', async () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    const config: MCPConfig = {
      mcpServers: {
        'server-a': { type: 'command', command: 'echo', args: [] },
        'server-b': { type: 'http', url: 'http://localhost:1234', lazy: true },
      },
    };
    fs.writeFileSync(path.join(nimbusDir, 'mcp.json'), JSON.stringify(config));

    await manager.loadConfig(tmpDir);
    expect(manager.serverCount).toBe(2);
  });

  it('skips invalid config files', async () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(path.join(nimbusDir, 'mcp.json'), 'not valid json{{{');

    await manager.loadConfig(tmpDir);
    expect(manager.serverCount).toBe(0); // No crash, no servers
  });

  it('getClient returns client by name', async () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(
      path.join(nimbusDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { 'my-srv': { type: 'http', url: 'http://localhost:1' } } })
    );

    await manager.loadConfig(tmpDir);
    const client = manager.getClient('my-srv');
    expect(client).toBeDefined();
    expect(client!.config.name).toBe('my-srv');
  });

  it('getClient returns undefined for unknown', () => {
    expect(manager.getClient('nope')).toBeUndefined();
  });

  it('getAllTools returns empty when nothing connected', () => {
    expect(manager.getAllTools()).toEqual([]);
  });

  it('disconnectAll is safe when empty', async () => {
    await expect(manager.disconnectAll()).resolves.not.toThrow();
  });

  it('does not duplicate servers on multiple loadConfig calls', async () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(
      path.join(nimbusDir, 'mcp.json'),
      JSON.stringify({ mcpServers: { 'dup': { type: 'http', url: 'http://localhost:1' } } })
    );

    await manager.loadConfig(tmpDir);
    await manager.loadConfig(tmpDir); // Second call
    expect(manager.serverCount).toBe(1); // Not duplicated
  });

  it('aggregates tools from all connected servers', async () => {
    // Inject two mock clients directly into the manager
    const clientA = new MCPClient({ name: 'agg-a', type: 'http', url: 'http://localhost:1' });
    const clientB = new MCPClient({ name: 'agg-b', type: 'http', url: 'http://localhost:2' });

    // Simulate connected state and discovered tools
    (clientA as any).connected = true;
    (clientA as any).tools = [
      { name: 'tool1', description: 'T1', inputSchema: { type: 'object', properties: {} } },
      { name: 'tool2', description: 'T2', inputSchema: { type: 'object', properties: {} } },
    ];
    (clientB as any).connected = true;
    (clientB as any).tools = [
      { name: 'tool3', description: 'T3', inputSchema: { type: 'object', properties: {} } },
    ];

    (manager as any).clients.set('agg-a', clientA);
    (manager as any).clients.set('agg-b', clientB);
    (manager as any).initialized = true;

    const allTools = manager.getAllTools();
    expect(allTools).toHaveLength(3);
    const names = allTools.map(t => t.name);
    expect(names).toContain('mcp_agg-a_tool1');
    expect(names).toContain('mcp_agg-a_tool2');
    expect(names).toContain('mcp_agg-b_tool3');
  });

  it('routes tool call to the correct server via execute()', async () => {
    const clientA = new MCPClient({ name: 'route-a', type: 'http', url: 'http://localhost:1' });
    const clientB = new MCPClient({ name: 'route-b', type: 'http', url: 'http://localhost:2' });

    (clientA as any).connected = true;
    (clientA as any).tools = [
      { name: 'toolA', description: 'A', inputSchema: { type: 'object', properties: {} } },
    ];
    (clientB as any).connected = true;
    (clientB as any).tools = [
      { name: 'toolB', description: 'B', inputSchema: { type: 'object', properties: {} } },
    ];

    // Track which client receives the call
    const calledOn: string[] = [];
    clientA.callTool = async (name: string) => {
      calledOn.push(`A:${name}`);
      return { output: 'from-A', isError: false };
    };
    clientB.callTool = async (name: string) => {
      calledOn.push(`B:${name}`);
      return { output: 'from-B', isError: false };
    };

    (manager as any).clients.set('route-a', clientA);
    (manager as any).clients.set('route-b', clientB);
    (manager as any).initialized = true;

    const allTools = manager.getAllTools();
    const toolDefA = allTools.find(t => t.name === 'mcp_route-a_toolA')!;
    const toolDefB = allTools.find(t => t.name === 'mcp_route-b_toolB')!;

    const resultA = await toolDefA.execute({});
    const resultB = await toolDefB.execute({});

    expect(resultA.output).toBe('from-A');
    expect(resultB.output).toBe('from-B');
    expect(calledOn).toEqual(['A:toolA', 'B:toolB']);
  });

  it('lazy server is not connected during connectAll', async () => {
    const nimbusDir = path.join(tmpDir, '.nimbus');
    fs.mkdirSync(nimbusDir, { recursive: true });
    fs.writeFileSync(
      path.join(nimbusDir, 'mcp.json'),
      JSON.stringify({
        mcpServers: {
          'eager': { type: 'http', url: 'http://localhost:1' },
          'lazy': { type: 'http', url: 'http://localhost:2', lazy: true },
        },
      })
    );

    await manager.loadConfig(tmpDir);
    // Stub connect on the eager client so it does not actually fetch
    const eagerClient = manager.getClient('eager')!;
    eagerClient.connect = async () => { (eagerClient as any).connected = true; };
    eagerClient.listTools = async () => [];

    await manager.connectAll();

    // Eager should be connected, lazy should not
    expect(eagerClient.isConnected).toBe(true);
    const lazyClient = manager.getClient('lazy')!;
    expect(lazyClient.isConnected).toBe(false);
  });

  it('handles concurrent tool calls to different servers', async () => {
    const clientA = new MCPClient({ name: 'conc-a', type: 'http', url: 'http://localhost:1' });
    const clientB = new MCPClient({ name: 'conc-b', type: 'http', url: 'http://localhost:2' });

    (clientA as any).connected = true;
    (clientA as any).tools = [
      { name: 'slow', description: 'Slow', inputSchema: { type: 'object', properties: {} } },
    ];
    (clientB as any).connected = true;
    (clientB as any).tools = [
      { name: 'fast', description: 'Fast', inputSchema: { type: 'object', properties: {} } },
    ];

    clientA.callTool = async () => {
      await new Promise(r => setTimeout(r, 50));
      return { output: 'slow-done', isError: false };
    };
    clientB.callTool = async () => {
      return { output: 'fast-done', isError: false };
    };

    (manager as any).clients.set('conc-a', clientA);
    (manager as any).clients.set('conc-b', clientB);
    (manager as any).initialized = true;

    const allTools = manager.getAllTools();
    const slowTool = allTools.find(t => t.name.includes('conc-a'))!;
    const fastTool = allTools.find(t => t.name.includes('conc-b'))!;

    const [rSlow, rFast] = await Promise.all([slowTool.execute({}), fastTool.execute({})]);
    expect(rSlow.output).toBe('slow-done');
    expect(rFast.output).toBe('fast-done');
  });

  it('propagates errors from MCP server to the caller', async () => {
    const errClient = new MCPClient({ name: 'err-srv', type: 'http', url: 'http://localhost:1' });
    (errClient as any).connected = true;
    (errClient as any).tools = [
      { name: 'boom', description: 'Fails', inputSchema: { type: 'object', properties: {} } },
    ];
    errClient.callTool = async () => ({
      output: '',
      isError: true,
      error: 'MCP tool call failed: Internal server error',
    });

    (manager as any).clients.set('err-srv', errClient);
    (manager as any).initialized = true;

    const allTools = manager.getAllTools();
    const boomTool = allTools.find(t => t.name.includes('boom'))!;
    const result = await boomTool.execute({});
    expect(result.isError).toBe(true);
    expect(result.error).toContain('MCP tool call failed');
  });
});

// ---------------------------------------------------------------------------
// MCPClient — Server Lifecycle (connect -> use -> disconnect)
// ---------------------------------------------------------------------------

describe('MCPClient — server lifecycle', () => {
  const originalFetchLifecycle = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: MCPClient;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as any;
    client = new MCPClient({
      name: 'lifecycle',
      type: 'http',
      url: 'http://localhost:7777',
    });
  });

  afterEach(async () => {
    await client.disconnect();
    globalThis.fetch = originalFetchLifecycle;
  });

  it('supports the full lifecycle: connect -> discover -> invoke -> disconnect', async () => {
    fetchMock
      // connect ping
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      // tools/list
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tools: [
            { name: 'greet', description: 'Greets', inputSchema: { type: 'object', properties: { name: { type: 'string' } } } },
          ],
        }),
      })
      // tools/call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'Hello, World!' }] }),
      });

    // 1. Connect
    expect(client.isConnected).toBe(false);
    await client.connect();
    expect(client.isConnected).toBe(true);

    // 2. Discover tools
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('greet');

    // 3. Invoke tool
    const result = await client.callTool('greet', { name: 'World' });
    expect(result.isError).toBe(false);
    expect(result.output).toBe('Hello, World!');

    // 4. Disconnect
    await client.disconnect();
    expect(client.isConnected).toBe(false);
    expect(client.discoveredTools).toHaveLength(0);
  });
});
