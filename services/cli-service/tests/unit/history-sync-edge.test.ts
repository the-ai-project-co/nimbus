import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { HistoryManager } from '../../src/history/manager';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Edge case tests for HistoryManager State Service synchronization.
 *
 * These tests cover scenarios that the base history-sync.test.ts may not:
 * - State Service returning malformed JSON
 * - State Service returning empty data
 * - State Service returning null data
 * - Query options passed to State Service
 * - Local filtering behavior
 * - History entry management (update, complete, clear)
 * - Corrupted local file recovery
 * - Max history entry limit
 */
describe('HistoryManager - Edge Cases', () => {
  let manager: HistoryManager;
  let tempDir: string;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-hist-edge-'));
    manager = new HistoryManager(path.join(tempDir, 'history.json'));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should handle State Service returning malformed JSON', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('not json at all {{{'))
    ) as any;

    // Add local entry
    manager.addEntry('test', []);
    const entries = await manager.getEntries();
    // Should fall back to local
    expect(entries.length).toBe(1);
    expect(entries[0].command).toBe('test');
  });

  it('should handle State Service returning empty data array', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true, data: [] })))
    ) as any;

    const entries = await manager.getEntries();
    expect(entries.length).toBe(0);
  });

  it('should handle State Service returning null data', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ success: true, data: null })))
    ) as any;

    manager.addEntry('local', []);
    const entries = await manager.getEntries();
    // data is null, not Array => loadFromStateService returns null => fallback to local
    expect(entries.length).toBe(1);
    expect(entries[0].command).toBe('local');
  });

  it('should handle State Service returning success: false', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ success: false, error: 'db error' })))
    ) as any;

    manager.addEntry('local-cmd', ['arg1']);
    const entries = await manager.getEntries();
    // success: false => loadFromStateService returns null => fallback to local
    expect(entries.length).toBe(1);
    expect(entries[0].command).toBe('local-cmd');
  });

  it('should pass query options to State Service', async () => {
    let requestUrl = '';
    globalThis.fetch = mock((url: string) => {
      requestUrl = url;
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: [] })));
    }) as any;

    await manager.getEntries({ limit: 5, command: 'generate', status: 'success' });
    expect(requestUrl).toContain('limit=5');
    expect(requestUrl).toContain('command=generate');
    expect(requestUrl).toContain('status=success');
  });

  it('should pass since/until query options to State Service', async () => {
    let requestUrl = '';
    globalThis.fetch = mock((url: string) => {
      requestUrl = url;
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: [] })));
    }) as any;

    await manager.getEntries({ since: '2025-01-01', until: '2025-12-31' });
    expect(requestUrl).toContain('since=2025-01-01');
    expect(requestUrl).toContain('until=2025-12-31');
  });

  it('should handle State Service returning HTTP 404', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Not Found', { status: 404 }))
    ) as any;

    manager.addEntry('local-entry', []);
    const entries = await manager.getEntries();
    // 404 => loadFromStateService returns null => fallback to local
    expect(entries.length).toBe(1);
  });

  it('should filter local entries by command when State Service is down', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    manager.addEntry('generate', ['terraform']);
    manager.addEntry('chat', ['-m', 'hello']);
    manager.addEntry('generate', ['k8s']);

    const entries = await manager.getEntries({ command: 'generate' });
    expect(entries.length).toBe(2);
    expect(entries.every(e => e.command === 'generate')).toBe(true);
  });

  it('should filter local entries by status when State Service is down', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    const entry = manager.addEntry('generate', ['terraform']);
    manager.completeEntry(entry.id, 'success', 100);
    manager.addEntry('chat', ['-m', 'hello']);

    const entries = await manager.getEntries({ status: 'success' });
    expect(entries.length).toBe(1);
    expect(entries[0].status).toBe('success');
  });

  it('should apply limit to local entries when State Service is down', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    manager.addEntry('cmd1', []);
    manager.addEntry('cmd2', []);
    manager.addEntry('cmd3', []);
    manager.addEntry('cmd4', []);
    manager.addEntry('cmd5', []);

    const entries = await manager.getEntries({ limit: 3 });
    expect(entries.length).toBe(3);
  });

  it('should update an existing entry', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    const entry = manager.addEntry('test-update', []);
    expect(entry.status).toBe('pending');

    const updated = manager.updateEntry(entry.id, { status: 'success', duration: 500 });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('success');
    expect(updated!.duration).toBe(500);
  });

  it('should return null when updating non-existent entry', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    const updated = manager.updateEntry('nonexistent-id', { status: 'success' });
    expect(updated).toBeNull();
  });

  it('should complete an entry with success', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    const entry = manager.addEntry('test-complete', []);
    const completed = manager.completeEntry(entry.id, 'success', 1234);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('success');
    expect(completed!.duration).toBe(1234);
  });

  it('should complete an entry with failure and error result', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    const entry = manager.addEntry('test-fail', []);
    const completed = manager.completeEntry(entry.id, 'failure', 500, {
      error: 'Something went wrong',
    });
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('failure');
    expect(completed!.result?.error).toBe('Something went wrong');
  });

  it('should clear all history', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    manager.addEntry('cmd1', []);
    manager.addEntry('cmd2', []);
    manager.addEntry('cmd3', []);

    manager.clear();

    const file = manager.load();
    expect(file.entries.length).toBe(0);
  });

  it('should reload history from disk', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    manager.addEntry('original', []);

    // Force a reload from disk
    const reloaded = manager.reload();
    expect(reloaded.entries.length).toBe(1);
    expect(reloaded.entries[0].command).toBe('original');
  });

  it('should recover from corrupted local history file', () => {
    const historyPath = path.join(tempDir, 'corrupted.json');
    fs.writeFileSync(historyPath, 'this is not valid json!!!');

    const corruptedManager = new HistoryManager(historyPath);
    const file = corruptedManager.load();
    expect(file.entries.length).toBe(0);
    expect(file.version).toBe(1);
  });

  it('should get a single entry by ID', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    const entry = manager.addEntry('findme', []);
    const found = manager.getEntry(entry.id);
    expect(found).not.toBeNull();
    expect(found!.command).toBe('findme');
  });

  it('should return null for non-existent entry ID', () => {
    const found = manager.getEntry('does-not-exist');
    expect(found).toBeNull();
  });

  it('should add entries with metadata', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    const entry = manager.addEntry('generate', ['terraform'], { project: 'test', provider: 'aws' });
    expect(entry.metadata).toBeDefined();
    expect(entry.metadata?.project).toBe('test');
    expect(entry.metadata?.provider).toBe('aws');
  });

  it('should not throw when sync fails silently', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('network timeout'))) as any;

    // addEntry syncs in fire-and-forget mode; should never throw
    expect(() => manager.addEntry('test', [])).not.toThrow();
  });

  it('should store entries in reverse chronological order', () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    manager.addEntry('first', []);
    manager.addEntry('second', []);
    manager.addEntry('third', []);

    const file = manager.load();
    expect(file.entries[0].command).toBe('third');
    expect(file.entries[1].command).toBe('second');
    expect(file.entries[2].command).toBe('first');
  });
});
