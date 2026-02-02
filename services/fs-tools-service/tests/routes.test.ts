import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { startServer } from '../src/server';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('File System Tools Service Routes', () => {
  let server: any;
  const PORT = 3105; // Different port to avoid conflicts
  let tempDir: string;

  beforeAll(async () => {
    server = await startServer(PORT);
  });

  afterAll(() => {
    server?.stop();
  });

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'fs-test-'));
  });

  afterEach(async () => {
    // Cleanup temp directory
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('health endpoint returns healthy status', async () => {
    const response = await fetch(`http://localhost:${PORT}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('fs-tools-service');
  });

  test('POST /api/fs/write creates a file', async () => {
    const filePath = join(tempDir, 'test.txt');
    const content = 'Hello World';

    const response = await fetch(`http://localhost:${PORT}/api/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify file was created
    const fileContent = await Bun.file(filePath).text();
    expect(fileContent).toBe(content);
  });

  test('POST /api/fs/write returns error without path', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/fs/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('path');
  });

  test('POST /api/fs/read reads a file', async () => {
    // Create a file first
    const filePath = join(tempDir, 'test.txt');
    const content = 'Hello World';
    await Bun.write(filePath, content);

    const response = await fetch(`http://localhost:${PORT}/api/fs/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.content).toBe(content);
  });

  test('POST /api/fs/read returns error without path', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/fs/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('path');
  });

  test('POST /api/fs/list lists directory contents', async () => {
    // Create some files
    await Bun.write(join(tempDir, 'file1.txt'), 'content1');
    await Bun.write(join(tempDir, 'file2.txt'), 'content2');
    await mkdir(join(tempDir, 'subdir'));

    const response = await fetch(`http://localhost:${PORT}/api/fs/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: tempDir }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.files.length).toBeGreaterThanOrEqual(3);
  });

  test('POST /api/fs/list returns error without directory', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/fs/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('directory');
  });

  test('POST /api/fs/exists returns true for existing file', async () => {
    const filePath = join(tempDir, 'test.txt');
    await Bun.write(filePath, 'content');

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

  test('POST /api/fs/exists returns false for non-existent file', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/fs/exists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: join(tempDir, 'non-existent.txt') }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.exists).toBe(false);
  });

  test('POST /api/fs/stat returns file stats', async () => {
    const filePath = join(tempDir, 'test.txt');
    await Bun.write(filePath, 'Hello World');

    const response = await fetch(`http://localhost:${PORT}/api/fs/stat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.stats).toBeDefined();
    expect(data.data.stats.isFile).toBe(true);
    expect(data.data.stats.size).toBeGreaterThan(0);
  });

  test('POST /api/fs/mkdir creates a directory', async () => {
    const dirPath = join(tempDir, 'new-dir');

    const response = await fetch(`http://localhost:${PORT}/api/fs/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dirPath }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('POST /api/fs/copy copies a file', async () => {
    const sourcePath = join(tempDir, 'source.txt');
    const destPath = join(tempDir, 'dest.txt');
    await Bun.write(sourcePath, 'Original content');

    const response = await fetch(`http://localhost:${PORT}/api/fs/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourcePath, destination: destPath }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify both files exist
    const sourceContent = await Bun.file(sourcePath).text();
    const destContent = await Bun.file(destPath).text();
    expect(sourceContent).toBe('Original content');
    expect(destContent).toBe('Original content');
  });

  test('POST /api/fs/move moves a file', async () => {
    const sourcePath = join(tempDir, 'source.txt');
    const destPath = join(tempDir, 'dest.txt');
    await Bun.write(sourcePath, 'Content to move');

    const response = await fetch(`http://localhost:${PORT}/api/fs/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: sourcePath, destination: destPath }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify source is gone and dest exists
    const sourceExists = await Bun.file(sourcePath).exists();
    const destContent = await Bun.file(destPath).text();
    expect(sourceExists).toBe(false);
    expect(destContent).toBe('Content to move');
  });

  test('DELETE /api/fs/delete deletes a file', async () => {
    const filePath = join(tempDir, 'to-delete.txt');
    await Bun.write(filePath, 'Delete me');

    const response = await fetch(`http://localhost:${PORT}/api/fs/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify file is gone
    const exists = await Bun.file(filePath).exists();
    expect(exists).toBe(false);
  });

  test('POST /api/fs/search finds content in files', async () => {
    // Create some files with content
    await Bun.write(join(tempDir, 'file1.txt'), 'hello world');
    await Bun.write(join(tempDir, 'file2.txt'), 'goodbye world');
    await Bun.write(join(tempDir, 'file3.txt'), 'hello again');

    const response = await fetch(`http://localhost:${PORT}/api/fs/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: tempDir, pattern: 'hello' }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.results.length).toBe(2);
  });

  test('POST /api/fs/search returns error without required fields', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/fs/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directory: tempDir }),
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test('returns 404 for unknown routes', async () => {
    const response = await fetch(`http://localhost:${PORT}/api/fs/unknown`);
    expect(response.status).toBe(404);
  });
});
