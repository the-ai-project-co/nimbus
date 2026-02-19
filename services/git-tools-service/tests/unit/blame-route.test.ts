import { describe, test, expect, beforeAll, beforeEach, afterAll, afterEach, spyOn } from 'bun:test';
import { mkdirSync, rmSync } from 'fs';
import { startServer } from '../../src/server';
import { GitOperations } from '../../src/git/operations';

const BLAME_TEST_DIR = '/tmp/git-blame-route-test';

const SAMPLE_BLAME_OUTPUT = [
  'abc1234 (Alice 2024-01-15 10:00:00 +0000 1) const x = 1;',
  'def5678 (Bob   2024-01-16 11:00:00 +0000 2) const y = 2;',
  'abc1234 (Alice 2024-01-15 10:00:00 +0000 3) const z = x + y;',
].join('\n');

describe('Git Blame Route', () => {
  let server: any;
  const PORT = 13014;

  /** Collected spies so we can restore them after each test */
  const spies: ReturnType<typeof spyOn>[] = [];

  function installSpy(mockValue: string): void {
    spies.push(
      spyOn(GitOperations.prototype, 'blame').mockResolvedValue(mockValue)
    );
  }

  function installRejectingSpy(error: Error): void {
    spies.push(
      spyOn(GitOperations.prototype, 'blame').mockImplementation(() => Promise.reject(error))
    );
  }

  beforeAll(async () => {
    mkdirSync(BLAME_TEST_DIR, { recursive: true });
    server = await startServer(PORT);
  });

  afterAll(() => {
    server?.stop();
    rmSync(BLAME_TEST_DIR, { recursive: true, force: true });
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies.length = 0;
  });

  test('GET /api/git/blame returns blame data for a file', async () => {
    installSpy(SAMPLE_BLAME_OUTPUT);

    const response = await fetch(
      `http://localhost:${PORT}/api/git/blame?path=${encodeURIComponent(BLAME_TEST_DIR)}&file=index.ts`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.blame).toBeDefined();
    expect(Array.isArray(data.data.blame)).toBe(true);
    expect(data.data.blame.length).toBe(3);
  });

  test('GET /api/git/blame returns 400 when file param is missing', async () => {
    installSpy(SAMPLE_BLAME_OUTPUT);

    const response = await fetch(
      `http://localhost:${PORT}/api/git/blame?path=${encodeURIComponent(BLAME_TEST_DIR)}`
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('file');
  });

  test('GET /api/git/blame passes startLine and endLine to operations', async () => {
    installSpy('abc1234 (Alice 2024-01-15 10:00:00 +0000 2) const y = 2;');

    const response = await fetch(
      `http://localhost:${PORT}/api/git/blame?path=${encodeURIComponent(BLAME_TEST_DIR)}&file=index.ts&startLine=2&endLine=2`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.blame).toBeDefined();
    expect(data.data.blame.length).toBe(1);

    // Verify blame was called with the correct options
    expect(spies[0]).toHaveBeenCalledWith('index.ts', { startLine: 2, endLine: 2 });
  });

  test('GET /api/git/blame works without optional startLine/endLine', async () => {
    installSpy(SAMPLE_BLAME_OUTPUT);

    const response = await fetch(
      `http://localhost:${PORT}/api/git/blame?file=index.ts`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify blame was called without line range options
    expect(spies[0]).toHaveBeenCalledWith('index.ts', {});
  });

  test('GET /api/git/blame returns error when blame operation fails', async () => {
    installRejectingSpy(new Error('fatal: no such path'));

    const response = await fetch(
      `http://localhost:${PORT}/api/git/blame?path=${encodeURIComponent(BLAME_TEST_DIR)}&file=nonexistent.ts`
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('fatal: no such path');
  });

  test('GET /api/git/blame handles empty blame output', async () => {
    installSpy('');

    const response = await fetch(
      `http://localhost:${PORT}/api/git/blame?file=empty.ts`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.blame).toEqual([]);
  });

  test('GET /api/git/blame uses cwd as default path', async () => {
    installSpy(SAMPLE_BLAME_OUTPUT);

    const response = await fetch(
      `http://localhost:${PORT}/api/git/blame?file=src/index.ts`
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.blame.length).toBe(3);
  });
});
