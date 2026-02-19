import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { HistoryManager } from '../../src/history/manager';

describe('History Recording in Commands', () => {
  let tempDir: string;
  let manager: HistoryManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-history-test-'));
    const historyPath = path.join(tempDir, 'history.json');
    manager = new HistoryManager(historyPath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('addEntry creates a pending entry', () => {
    const entry = manager.addEntry('k8s', ['get', 'pods']);
    expect(entry.id).toBeDefined();
    expect(entry.command).toBe('k8s');
    expect(entry.args).toEqual(['get', 'pods']);
    expect(entry.status).toBe('pending');
  });

  test('completeEntry marks success with duration', () => {
    const entry = manager.addEntry('tf', ['plan']);
    const completed = manager.completeEntry(entry.id, 'success', 1500);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('success');
    expect(completed!.duration).toBe(1500);
  });

  test('completeEntry marks failure with error', () => {
    const entry = manager.addEntry('helm', ['install', 'myapp', 'chart']);
    const completed = manager.completeEntry(entry.id, 'failure', 500, { error: 'Service unavailable' });
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('failure');
    expect(completed!.result?.error).toBe('Service unavailable');
  });

  test('addEntry with metadata stores metadata', () => {
    const entry = manager.addEntry('chat', [], { model: 'gpt-4o', persona: 'expert' });
    expect(entry.metadata).toEqual({ model: 'gpt-4o', persona: 'expert' });
  });

  test('entries persist to disk', () => {
    manager.addEntry('git', ['status']);
    manager.addEntry('k8s', ['get', 'deployments']);

    // Create a new manager reading from same path
    const manager2 = new HistoryManager(path.join(tempDir, 'history.json'));
    const file = manager2.load();
    expect(file.entries.length).toBe(2);
    expect(file.entries[0].command).toBe('k8s'); // Most recent first
    expect(file.entries[1].command).toBe('git');
  });

  test('history records are ordered newest first', () => {
    manager.addEntry('tf', ['init']);
    manager.addEntry('tf', ['plan']);
    manager.addEntry('tf', ['apply']);

    const file = manager.load();
    expect(file.entries[0].args[0]).toBe('apply');
    expect(file.entries[1].args[0]).toBe('plan');
    expect(file.entries[2].args[0]).toBe('init');
  });
});
