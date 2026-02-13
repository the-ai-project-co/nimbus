import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, spyOn } from 'bun:test';
import { FileSystemOperations } from '../../src/fs/operations';
import { startServer } from '../../src/server';

describe('FS Tools Service Routes', () => {
  let server: any;
  const PORT = 13005;

  /**
   * Spies on FileSystemOperations.prototype methods.
   *
   * The route handlers in routes.ts create `new FileSystemOperations()` inside
   * each handler, so spying on the prototype intercepts those calls without
   * replacing the module globally. This prevents mock contamination of other
   * test files (operations.test.ts, api.test.ts) when bun runs them together.
   */
  let readFileSpy: ReturnType<typeof spyOn>;
  let writeFileSpy: ReturnType<typeof spyOn>;
  let appendFileSpy: ReturnType<typeof spyOn>;
  let listSpy: ReturnType<typeof spyOn>;
  let searchSpy: ReturnType<typeof spyOn>;
  let treeSpy: ReturnType<typeof spyOn>;
  let diffSpy: ReturnType<typeof spyOn>;
  let copySpy: ReturnType<typeof spyOn>;
  let moveSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;
  let mkdirSpy: ReturnType<typeof spyOn>;
  let existsSpy: ReturnType<typeof spyOn>;
  let statSpy: ReturnType<typeof spyOn>;
  let readDirSpy: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    server = await startServer(PORT);
  });

  beforeEach(() => {
    readFileSpy = spyOn(FileSystemOperations.prototype, 'readFile')
      .mockResolvedValue('file content');
    writeFileSpy = spyOn(FileSystemOperations.prototype, 'writeFile')
      .mockResolvedValue({ success: true, path: '/tmp/test.txt' });
    appendFileSpy = spyOn(FileSystemOperations.prototype, 'appendFile')
      .mockResolvedValue({ success: true, path: '/tmp/test.txt' });
    listSpy = spyOn(FileSystemOperations.prototype, 'list')
      .mockResolvedValue(['/tmp/file1.ts', '/tmp/file2.ts']);
    searchSpy = spyOn(FileSystemOperations.prototype, 'search')
      .mockResolvedValue([{ file: '/tmp/test.ts', line: 1, column: 0, match: 'test' }]);
    treeSpy = spyOn(FileSystemOperations.prototype, 'tree')
      .mockResolvedValue({ name: 'test', path: '/tmp/test', type: 'directory', children: [] });
    diffSpy = spyOn(FileSystemOperations.prototype, 'diff')
      .mockResolvedValue('--- a/file1\n+++ b/file2');
    copySpy = spyOn(FileSystemOperations.prototype, 'copy')
      .mockResolvedValue({ success: true, source: '/tmp/src', destination: '/tmp/dest' });
    moveSpy = spyOn(FileSystemOperations.prototype, 'move')
      .mockResolvedValue({ success: true, source: '/tmp/src', destination: '/tmp/dest' });
    deleteSpy = spyOn(FileSystemOperations.prototype, 'delete')
      .mockResolvedValue({ success: true, path: '/tmp/test.txt' });
    mkdirSpy = spyOn(FileSystemOperations.prototype, 'mkdir')
      .mockResolvedValue({ success: true, path: '/tmp/newdir' });
    existsSpy = spyOn(FileSystemOperations.prototype, 'exists')
      .mockResolvedValue(true);
    statSpy = spyOn(FileSystemOperations.prototype, 'stat')
      .mockResolvedValue({
        size: 1024,
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
        createdAt: new Date(),
        modifiedAt: new Date(),
        accessedAt: new Date(),
        permissions: '644',
      });
    readDirSpy = spyOn(FileSystemOperations.prototype, 'readDir')
      .mockResolvedValue([{ name: 'file1.ts', type: 'file' }]);
  });

  afterEach(() => {
    readFileSpy.mockRestore();
    writeFileSpy.mockRestore();
    appendFileSpy.mockRestore();
    listSpy.mockRestore();
    searchSpy.mockRestore();
    treeSpy.mockRestore();
    diffSpy.mockRestore();
    copySpy.mockRestore();
    moveSpy.mockRestore();
    deleteSpy.mockRestore();
    mkdirSpy.mockRestore();
    existsSpy.mockRestore();
    statSpy.mockRestore();
    readDirSpy.mockRestore();
  });

  afterAll(() => {
    server?.stop();
  });

  describe('Health Check', () => {
    test('GET /health should return healthy status', async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('fs-tools-service');
    });
  });

  describe('Read', () => {
    test('POST /api/fs/read should read file', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp/test.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.content).toBe('file content');
    });

    test('POST /api/fs/read should fail without path', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Write', () => {
    test('POST /api/fs/write should write file', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp/test.txt', content: 'new content' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/fs/write should fail without path or content', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp/test.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Append', () => {
    test('POST /api/fs/append should append to file', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp/test.txt', content: 'appended' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('List', () => {
    test('POST /api/fs/list should list directory', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.files)).toBe(true);
    });

    test('POST /api/fs/list should fail without directory', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Search', () => {
    test('POST /api/fs/search should search in files', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp', pattern: 'test' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.results)).toBe(true);
    });

    test('POST /api/fs/search should fail without directory or pattern', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Tree', () => {
    test('POST /api/fs/tree should generate tree', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/tree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: '/tmp' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.tree).toBeDefined();
    });
  });

  describe('Diff', () => {
    test('POST /api/fs/diff should get diff', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file1: '/tmp/file1.txt', file2: '/tmp/file2.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/fs/diff should fail without files', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file1: '/tmp/file1.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Copy', () => {
    test('POST /api/fs/copy should copy file', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: '/tmp/src.txt', destination: '/tmp/dest.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('POST /api/fs/copy should fail without source or destination', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: '/tmp/src.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Move', () => {
    test('POST /api/fs/move should move file', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: '/tmp/src.txt', destination: '/tmp/dest.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Delete', () => {
    test('DELETE /api/fs/delete should delete file', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp/test.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('DELETE /api/fs/delete should fail without path', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Mkdir', () => {
    test('POST /api/fs/mkdir should create directory', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp/newdir' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Exists', () => {
    test('POST /api/fs/exists should check existence', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/exists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp/test.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(typeof data.data.exists).toBe('boolean');
    });
  });

  describe('Stat', () => {
    test('POST /api/fs/stat should get file stats', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/stat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp/test.txt' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.stats).toBeDefined();
    });
  });

  describe('Readdir', () => {
    test('POST /api/fs/readdir should read directory', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/readdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/tmp' }),
      });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.entries)).toBe(true);
    });
  });

  describe('404 Not Found', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/unknown`);
      expect(response.status).toBe(404);
    });
  });
});
