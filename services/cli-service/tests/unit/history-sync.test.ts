import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { HistoryManager } from '../../src/history/manager';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('HistoryManager - State Service Sync', () => {
  let manager: HistoryManager;
  let tempDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-history-test-'));
    const historyPath = path.join(tempDir, 'history.json');
    manager = new HistoryManager(historyPath);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should add entry locally even when State Service is unavailable', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Connection refused'))) as any;

    const entry = manager.addEntry('generate', ['terraform']);
    expect(entry.id).toBeDefined();
    expect(entry.command).toBe('generate');
  });

  it('should fire-and-forget sync to State Service on addEntry', async () => {
    let syncCalled = false;
    globalThis.fetch = mock(() => {
      syncCalled = true;
      return Promise.resolve(new Response(JSON.stringify({ success: true })));
    }) as any;

    manager.addEntry('chat', ['-m', 'hello']);

    // Give fire-and-forget time to execute
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(syncCalled).toBe(true);
  });

  it('should load from State Service when available', async () => {
    const remoteEntries = [
      { id: 'remote-1', command: 'generate', args: ['terraform'], timestamp: new Date().toISOString(), status: 'success' },
    ];

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true, data: remoteEntries })))
    ) as any;

    const entries = await manager.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].id).toBe('remote-1');
  });

  it('should fall back to local entries when State Service fails', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;

    // Add a local entry first
    manager.addEntry('help', []);

    const entries = await manager.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].command).toBe('help');
  });

  it('should not throw when sync fails', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('timeout'))) as any;

    // This should not throw
    expect(() => manager.addEntry('test', [])).not.toThrow();
  });
});
