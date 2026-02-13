import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../src/server';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FS Tools Service API Integration', () => {
  let server: any;
  const PORT = 14005;
  const TEST_DIR = '/tmp/fs-integration-test';

  beforeAll(async () => {
    // Start server
    server = await startServer(PORT);

    // Create test directory
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Stop server
    server?.stop();

    // Cleanup test directory
    await fs.rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  });

  describe('Health Check Integration', () => {
    test('should respond to health check', async () => {
      const response = await fetch(`http://localhost:${PORT}/health`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('fs-tools-service');
    });
  });

  describe('Write and Read Integration', () => {
    test('should write and read a file', async () => {
      const filePath = path.join(TEST_DIR, 'test-write-read.txt');
      const content = 'Hello, World!';

      // Write file
      const writeResponse = await fetch(`http://localhost:${PORT}/api/fs/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content }),
      });

      const writeData = await writeResponse.json();
      expect(writeResponse.status).toBe(200);
      expect(writeData.success).toBe(true);

      // Read file
      const readResponse = await fetch(`http://localhost:${PORT}/api/fs/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });

      const readData = await readResponse.json();
      expect(readResponse.status).toBe(200);
      expect(readData.success).toBe(true);
      expect(readData.data.content).toBe(content);
    });
  });

  describe('Append Integration', () => {
    test('should append to a file', async () => {
      const filePath = path.join(TEST_DIR, 'test-append.txt');

      // Write initial content
      await fs.writeFile(filePath, 'Initial');

      // Append content
      const response = await fetch(`http://localhost:${PORT}/api/fs/append`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: ' Appended' }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify content
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('Initial Appended');
    });
  });

  describe('List Directory Integration', () => {
    test('should list directory contents', async () => {
      const listDir = path.join(TEST_DIR, 'list-test');
      await fs.mkdir(listDir, { recursive: true });

      // Create some files
      await fs.writeFile(path.join(listDir, 'file1.txt'), 'content1');
      await fs.writeFile(path.join(listDir, 'file2.txt'), 'content2');
      await fs.mkdir(path.join(listDir, 'subdir'), { recursive: true });

      const response = await fetch(`http://localhost:${PORT}/api/fs/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: listDir }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Mkdir Integration', () => {
    test('should create a directory', async () => {
      const newDir = path.join(TEST_DIR, 'new-directory');

      const response = await fetch(`http://localhost:${PORT}/api/fs/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: newDir }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify directory exists
      const stat = await fs.stat(newDir);
      expect(stat.isDirectory()).toBe(true);
    });

    test('should create nested directories', async () => {
      const nestedDir = path.join(TEST_DIR, 'nested', 'deep', 'directory');

      const response = await fetch(`http://localhost:${PORT}/api/fs/mkdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: nestedDir, recursive: true }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Exists Integration', () => {
    test('should check if file exists', async () => {
      const filePath = path.join(TEST_DIR, 'exists-test.txt');
      await fs.writeFile(filePath, 'content');

      const response = await fetch(`http://localhost:${PORT}/api/fs/exists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.exists).toBe(true);
    });

    test('should return false for non-existent file', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/exists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/nonexistent/file.txt' }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.data.exists).toBe(false);
    });
  });

  describe('Stat Integration', () => {
    test('should get file stats', async () => {
      const filePath = path.join(TEST_DIR, 'stat-test.txt');
      await fs.writeFile(filePath, 'stat content');

      const response = await fetch(`http://localhost:${PORT}/api/fs/stat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.stats.isFile).toBe(true);
      expect(data.data.stats.size).toBeGreaterThan(0);
    });
  });

  describe('Copy Integration', () => {
    test('should copy a file', async () => {
      const sourcePath = path.join(TEST_DIR, 'copy-source.txt');
      const destPath = path.join(TEST_DIR, 'copy-dest.txt');
      await fs.writeFile(sourcePath, 'copy content');

      const response = await fetch(`http://localhost:${PORT}/api/fs/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourcePath, destination: destPath }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify destination exists
      const destContent = await fs.readFile(destPath, 'utf-8');
      expect(destContent).toBe('copy content');
    });
  });

  describe('Move Integration', () => {
    test('should move a file', async () => {
      const sourcePath = path.join(TEST_DIR, 'move-source.txt');
      const destPath = path.join(TEST_DIR, 'move-dest.txt');
      await fs.writeFile(sourcePath, 'move content');

      const response = await fetch(`http://localhost:${PORT}/api/fs/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sourcePath, destination: destPath }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify source is gone and dest exists
      const sourceExists = await fs.access(sourcePath).then(() => true).catch(() => false);
      expect(sourceExists).toBe(false);

      const destExists = await fs.access(destPath).then(() => true).catch(() => false);
      expect(destExists).toBe(true);
    });
  });

  describe('Delete Integration', () => {
    test('should delete a file', async () => {
      const filePath = path.join(TEST_DIR, 'delete-test.txt');
      await fs.writeFile(filePath, 'delete me');

      const response = await fetch(`http://localhost:${PORT}/api/fs/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify file is deleted
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe('Readdir Integration', () => {
    test('should read directory entries', async () => {
      const dirPath = path.join(TEST_DIR, 'readdir-test');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'content');
      await fs.mkdir(path.join(dirPath, 'subdir'), { recursive: true });

      const response = await fetch(`http://localhost:${PORT}/api/fs/readdir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.entries.length).toBe(2);
    });
  });

  describe('Tree Integration', () => {
    test('should generate directory tree', async () => {
      const treeDir = path.join(TEST_DIR, 'tree-test');
      await fs.mkdir(treeDir, { recursive: true });
      await fs.mkdir(path.join(treeDir, 'sub1'), { recursive: true });
      await fs.writeFile(path.join(treeDir, 'file.txt'), 'content');

      const response = await fetch(`http://localhost:${PORT}/api/fs/tree`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: treeDir }),
      });

      const data = await response.json();
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.tree).toBeDefined();
      expect(data.data.tree.type).toBe('directory');
    });
  });

  describe('Error Handling Integration', () => {
    test('should handle missing required fields', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should handle non-existent file for read', async () => {
      const response = await fetch(`http://localhost:${PORT}/api/fs/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/nonexistent/file.txt' }),
      });

      const data = await response.json();
      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
