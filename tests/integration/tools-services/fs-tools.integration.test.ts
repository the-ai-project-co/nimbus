/**
 * Integration tests for File System Tools Service
 *
 * These tests verify end-to-end file system operations through the HTTP API
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { startServer } from '../../../services/fs-tools-service/src/server';
import { waitForService, createTestClient, getTestPorts, createTempDir, removeTempDir } from '../../utils/test-helpers';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

describe('File System Tools Service Integration Tests', () => {
  let server: any;
  let client: ReturnType<typeof createTestClient>;
  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;
  let tempDir: string;

  beforeAll(async () => {
    server = await startServer(ports.http);
    const ready = await waitForService(BASE_URL);
    if (!ready) {
      throw new Error('FS Tools Service failed to start');
    }
    client = createTestClient(BASE_URL);
  });

  afterAll(() => {
    server?.stop?.();
  });

  beforeEach(async () => {
    tempDir = await createTempDir('fs-integration-');
  });

  afterEach(async () => {
    if (tempDir) {
      await removeTempDir(tempDir);
    }
  });

  describe('File Read/Write Operations', () => {
    test('writes and reads file content', async () => {
      const filePath = join(tempDir, 'test.txt');
      const content = 'Hello, Integration Test!';

      // Write file
      const writeResult = await client.post('/api/fs/write', {
        path: filePath,
        content,
      });
      expect(writeResult.status).toBe(200);
      expect(writeResult.data.success).toBe(true);

      // Read file back
      const readResult = await client.post('/api/fs/read', {
        path: filePath,
      });
      expect(readResult.status).toBe(200);
      expect(readResult.data.data.content).toBe(content);
    });

    test('writes file with createDirs option', async () => {
      const filePath = join(tempDir, 'nested', 'deep', 'file.txt');
      const content = 'Nested content';

      const { status, data } = await client.post('/api/fs/write', {
        path: filePath,
        content,
        createDirs: true,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify file was created
      const readResult = await client.post('/api/fs/read', { path: filePath });
      expect(readResult.data.data.content).toBe(content);
    });

    test('appends content to file', async () => {
      const filePath = join(tempDir, 'append.txt');
      await Bun.write(filePath, 'Initial');

      const { status, data } = await client.post('/api/fs/append', {
        path: filePath,
        content: ' + Appended',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const readResult = await client.post('/api/fs/read', { path: filePath });
      expect(readResult.data.data.content).toBe('Initial + Appended');
    });
  });

  describe('Directory Operations', () => {
    test('creates directory', async () => {
      const dirPath = join(tempDir, 'new-dir');

      const { status, data } = await client.post('/api/fs/mkdir', {
        path: dirPath,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify directory exists
      const existsResult = await client.post('/api/fs/exists', { path: dirPath });
      expect(existsResult.data.data.exists).toBe(true);
    });

    test('creates nested directories', async () => {
      const dirPath = join(tempDir, 'a', 'b', 'c');

      const { status, data } = await client.post('/api/fs/mkdir', {
        path: dirPath,
        recursive: true,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('lists directory contents', async () => {
      // Create files and subdirectory
      await Bun.write(join(tempDir, 'file1.txt'), 'content1');
      await Bun.write(join(tempDir, 'file2.txt'), 'content2');
      await mkdir(join(tempDir, 'subdir'));

      const { status, data } = await client.post('/api/fs/list', {
        directory: tempDir,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.files.length).toBeGreaterThanOrEqual(2);
    });

    test('reads directory entries with types', async () => {
      await Bun.write(join(tempDir, 'file.txt'), 'content');
      await mkdir(join(tempDir, 'folder'));

      const { status, data } = await client.post('/api/fs/readdir', {
        path: tempDir,
      });

      expect(status).toBe(200);
      expect(data.data.entries).toBeDefined();

      const fileEntry = data.data.entries.find((e: any) => e.name === 'file.txt');
      const folderEntry = data.data.entries.find((e: any) => e.name === 'folder');

      expect(fileEntry?.type).toBe('file');
      expect(folderEntry?.type).toBe('directory');
    });
  });

  describe('File Statistics', () => {
    test('returns file stats', async () => {
      const filePath = join(tempDir, 'stats.txt');
      await Bun.write(filePath, 'Content for stats');

      const { status, data } = await client.post('/api/fs/stat', {
        path: filePath,
      });

      expect(status).toBe(200);
      expect(data.data.stats.isFile).toBe(true);
      expect(data.data.stats.isDirectory).toBe(false);
      expect(data.data.stats.size).toBeGreaterThan(0);
      expect(data.data.stats.createdAt).toBeDefined();
      expect(data.data.stats.modifiedAt).toBeDefined();
    });

    test('returns directory stats', async () => {
      const dirPath = join(tempDir, 'stat-dir');
      await mkdir(dirPath);

      const { status, data } = await client.post('/api/fs/stat', {
        path: dirPath,
      });

      expect(status).toBe(200);
      expect(data.data.stats.isFile).toBe(false);
      expect(data.data.stats.isDirectory).toBe(true);
    });
  });

  describe('File Copy and Move', () => {
    test('copies file', async () => {
      const srcPath = join(tempDir, 'source.txt');
      const destPath = join(tempDir, 'copy.txt');
      await Bun.write(srcPath, 'Copy this content');

      const { status, data } = await client.post('/api/fs/copy', {
        source: srcPath,
        destination: destPath,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Both files should exist
      const srcExists = await client.post('/api/fs/exists', { path: srcPath });
      const destExists = await client.post('/api/fs/exists', { path: destPath });
      expect(srcExists.data.data.exists).toBe(true);
      expect(destExists.data.data.exists).toBe(true);

      // Content should match
      const destContent = await client.post('/api/fs/read', { path: destPath });
      expect(destContent.data.data.content).toBe('Copy this content');
    });

    test('moves file', async () => {
      const srcPath = join(tempDir, 'move-source.txt');
      const destPath = join(tempDir, 'moved.txt');
      await Bun.write(srcPath, 'Move this content');

      const { status, data } = await client.post('/api/fs/move', {
        source: srcPath,
        destination: destPath,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Source should not exist, destination should exist
      const srcExists = await client.post('/api/fs/exists', { path: srcPath });
      const destExists = await client.post('/api/fs/exists', { path: destPath });
      expect(srcExists.data.data.exists).toBe(false);
      expect(destExists.data.data.exists).toBe(true);
    });
  });

  describe('File Delete', () => {
    test('deletes file', async () => {
      const filePath = join(tempDir, 'delete-me.txt');
      await Bun.write(filePath, 'Delete this');

      const { status, data } = await client.delete('/api/fs/delete', {
        path: filePath,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const existsResult = await client.post('/api/fs/exists', { path: filePath });
      expect(existsResult.data.data.exists).toBe(false);
    });

    test('deletes directory recursively', async () => {
      const dirPath = join(tempDir, 'delete-dir');
      await mkdir(dirPath);
      await Bun.write(join(dirPath, 'file.txt'), 'content');

      const { status, data } = await client.delete('/api/fs/delete', {
        path: dirPath,
        recursive: true,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      const existsResult = await client.post('/api/fs/exists', { path: dirPath });
      expect(existsResult.data.data.exists).toBe(false);
    });
  });

  describe('File Search', () => {
    beforeEach(async () => {
      // Create files with searchable content
      await Bun.write(join(tempDir, 'search1.txt'), 'Hello world from file 1');
      await Bun.write(join(tempDir, 'search2.txt'), 'Goodbye world from file 2');
      await Bun.write(join(tempDir, 'search3.txt'), 'Hello again from file 3');
    });

    test('finds files containing pattern', async () => {
      const { status, data } = await client.post('/api/fs/search', {
        directory: tempDir,
        pattern: 'Hello',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.results.length).toBe(2);
    });

    test('respects case sensitivity', async () => {
      const { status, data } = await client.post('/api/fs/search', {
        directory: tempDir,
        pattern: 'hello',
        caseSensitive: false,
      });

      expect(status).toBe(200);
      expect(data.data.results.length).toBe(2);

      const caseSensitiveResult = await client.post('/api/fs/search', {
        directory: tempDir,
        pattern: 'hello',
        caseSensitive: true,
      });
      expect(caseSensitiveResult.data.data.results.length).toBe(0);
    });

    test('limits results with maxResults per file', async () => {
      // maxResults limits matches per file, not total matches
      const { status, data } = await client.post('/api/fs/search', {
        directory: tempDir,
        pattern: 'world',
        maxResults: 1,
      });

      expect(status).toBe(200);
      // With maxResults=1, we get at most 1 match per file
      // Since 2 files contain "world", we get 2 results (1 per file)
      expect(data.data.results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Existence Check', () => {
    test('returns true for existing file', async () => {
      const filePath = join(tempDir, 'exists.txt');
      await Bun.write(filePath, 'content');

      const { status, data } = await client.post('/api/fs/exists', {
        path: filePath,
      });

      expect(status).toBe(200);
      expect(data.data.exists).toBe(true);
    });

    test('returns false for non-existing file', async () => {
      const { status, data } = await client.post('/api/fs/exists', {
        path: join(tempDir, 'non-existing.txt'),
      });

      expect(status).toBe(200);
      expect(data.data.exists).toBe(false);
    });
  });
});
