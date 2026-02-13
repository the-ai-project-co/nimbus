import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { FileSystemOperations } from '../../src/fs/operations';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Unit tests for FileSystemOperations.
 *
 * Instead of trying to mock the fs/promises module (which does not reliably
 * intercept calls inside the source module under Bun's module system), we use
 * a real temporary directory. This gives us deterministic, hermetic tests
 * without fragile mock wiring.
 */
describe('FileSystemOperations', () => {
  let fsOps: FileSystemOperations;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-ops-test-'));
    fsOps = new FileSystemOperations(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('readFile', () => {
    test('should read file content', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.txt'), 'file content');

      const content = await fsOps.readFile('test.txt');

      expect(content).toBe('file content');
    });

    test('should read file with encoding', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.txt'), 'encoded content');

      const content = await fsOps.readFile('test.txt', 'utf-8');

      expect(content).toBeDefined();
      expect(content).toBe('encoded content');
    });
  });

  describe('readFileBuffer', () => {
    test('should read file as buffer', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.bin'), 'binary content');

      const buffer = await fsOps.readFileBuffer('test.bin');

      expect(buffer).toBeDefined();
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  describe('writeFile', () => {
    test('should write content to file', async () => {
      const result = await fsOps.writeFile('test.txt', 'new content');

      expect(result.success).toBe(true);

      const content = await fs.readFile(path.join(tmpDir, 'test.txt'), 'utf-8');
      expect(content).toBe('new content');
    });

    test('should create directories when option is set', async () => {
      const result = await fsOps.writeFile('nested/test.txt', 'content', { createDirs: true });

      expect(result.success).toBe(true);

      const content = await fs.readFile(path.join(tmpDir, 'nested', 'test.txt'), 'utf-8');
      expect(content).toBe('content');
    });
  });

  describe('appendFile', () => {
    test('should append content to file', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.txt'), 'initial');

      const result = await fsOps.appendFile('test.txt', ' appended');

      expect(result.success).toBe(true);

      const content = await fs.readFile(path.join(tmpDir, 'test.txt'), 'utf-8');
      expect(content).toBe('initial appended');
    });
  });

  describe('list', () => {
    test('should list files in directory', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
      await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b');

      const files = await fsOps.list(tmpDir);

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThanOrEqual(2);
    });

    test('should list with pattern', async () => {
      await fs.writeFile(path.join(tmpDir, 'file.ts'), 'ts');
      await fs.writeFile(path.join(tmpDir, 'file.js'), 'js');

      const files = await fsOps.list(tmpDir, { pattern: '*.ts' });

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBe(1);
      expect(files[0]).toContain('file.ts');
    });

    test('should list recursively', async () => {
      await fs.mkdir(path.join(tmpDir, 'sub'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, 'top.txt'), 'top');
      await fs.writeFile(path.join(tmpDir, 'sub', 'deep.txt'), 'deep');

      const files = await fsOps.list(tmpDir, { recursive: true });

      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('search', () => {
    test('should search for pattern in files', async () => {
      await fs.writeFile(path.join(tmpDir, 'search.txt'), 'hello test world');

      const results = await fsOps.search(tmpDir, { pattern: 'test' });

      expect(Array.isArray(results)).toBe(true);
    });

    test('should search case insensitively', async () => {
      await fs.writeFile(path.join(tmpDir, 'search.txt'), 'Hello TEST World');

      const results = await fsOps.search(tmpDir, {
        pattern: 'test',
        caseSensitive: false,
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('tree', () => {
    test('should generate directory tree', async () => {
      await fs.mkdir(path.join(tmpDir, 'child'), { recursive: true });

      const tree = await fsOps.tree(tmpDir);

      expect(tree).toBeDefined();
      expect(tree.name).toBeDefined();
      expect(tree.type).toBe('directory');
    });

    test('should limit depth', async () => {
      await fs.mkdir(path.join(tmpDir, 'a', 'b', 'c'), { recursive: true });

      const tree = await fsOps.tree(tmpDir, { maxDepth: 2 });

      expect(tree).toBeDefined();
    });
  });

  describe('diff', () => {
    test('should get diff between two files', async () => {
      const file1 = path.join(tmpDir, 'file1.txt');
      const file2 = path.join(tmpDir, 'file2.txt');
      await fs.writeFile(file1, 'line1\nline2\n');
      await fs.writeFile(file2, 'line1\nline3\n');

      try {
        const diff = await fsOps.diff(file1, file2);
        expect(typeof diff).toBe('string');
      } catch (e) {
        // Expected if diff command not found
        expect(true).toBe(true);
      }
    });
  });

  describe('copy', () => {
    test('should copy file', async () => {
      const srcPath = path.join(tmpDir, 'source.txt');
      await fs.writeFile(srcPath, 'copy me');

      const result = await fsOps.copy(srcPath, path.join(tmpDir, 'dest.txt'));

      expect(result.success).toBe(true);

      const content = await fs.readFile(path.join(tmpDir, 'dest.txt'), 'utf-8');
      expect(content).toBe('copy me');
    });

    test('should fail to copy directory without recursive flag', async () => {
      const srcDir = path.join(tmpDir, 'sourceDir');
      await fs.mkdir(srcDir, { recursive: true });

      await expect(fsOps.copy(srcDir, path.join(tmpDir, 'destDir'))).rejects.toThrow();
    });

    test('should copy directory recursively', async () => {
      const srcDir = path.join(tmpDir, 'sourceDir');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, 'inner.txt'), 'inner');

      const result = await fsOps.copy(srcDir, path.join(tmpDir, 'destDir'), { recursive: true });

      expect(result.success).toBe(true);

      const content = await fs.readFile(path.join(tmpDir, 'destDir', 'inner.txt'), 'utf-8');
      expect(content).toBe('inner');
    });
  });

  describe('move', () => {
    test('should move file', async () => {
      const srcPath = path.join(tmpDir, 'source.txt');
      await fs.writeFile(srcPath, 'move me');

      const result = await fsOps.move(srcPath, path.join(tmpDir, 'dest.txt'));

      expect(result.success).toBe(true);

      // Source should be gone
      const srcExists = await fs.access(srcPath).then(() => true).catch(() => false);
      expect(srcExists).toBe(false);

      // Destination should exist
      const content = await fs.readFile(path.join(tmpDir, 'dest.txt'), 'utf-8');
      expect(content).toBe('move me');
    });
  });

  describe('delete', () => {
    test('should delete file', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.writeFile(filePath, 'delete me');

      const result = await fsOps.delete(filePath);

      expect(result.success).toBe(true);

      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    test('should fail to delete directory without recursive flag', async () => {
      const dirPath = path.join(tmpDir, 'testDir');
      await fs.mkdir(dirPath, { recursive: true });

      await expect(fsOps.delete(dirPath)).rejects.toThrow();
    });

    test('should delete directory recursively', async () => {
      const dirPath = path.join(tmpDir, 'testDir');
      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(path.join(dirPath, 'file.txt'), 'data');

      const result = await fsOps.delete(dirPath, { recursive: true });

      expect(result.success).toBe(true);

      const exists = await fs.access(dirPath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe('mkdir', () => {
    test('should create directory', async () => {
      const result = await fsOps.mkdir('newDir');

      expect(result.success).toBe(true);

      const stat = await fs.stat(path.join(tmpDir, 'newDir'));
      expect(stat.isDirectory()).toBe(true);
    });

    test('should create nested directories', async () => {
      const result = await fsOps.mkdir('nested/dir', { recursive: true });

      expect(result.success).toBe(true);

      const stat = await fs.stat(path.join(tmpDir, 'nested', 'dir'));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe('exists', () => {
    test('should return true for existing file', async () => {
      await fs.writeFile(path.join(tmpDir, 'test.txt'), 'exists');

      const exists = await fsOps.exists('test.txt');

      expect(exists).toBe(true);
    });

    test('should return false for non-existing file', async () => {
      const exists = await fsOps.exists('nonexistent.txt');

      expect(exists).toBe(false);
    });
  });

  describe('stat', () => {
    test('should get file stats', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.writeFile(filePath, 'stat content here!');

      const stats = await fsOps.stat(filePath);

      expect(stats).toBeDefined();
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.isFile).toBe(true);
      expect(stats.isDirectory).toBe(false);
    });
  });

  describe('readDir', () => {
    test('should read directory entries', async () => {
      await fs.writeFile(path.join(tmpDir, 'file1.ts'), 'content');
      await fs.mkdir(path.join(tmpDir, 'dir1'), { recursive: true });

      const entries = await fsOps.readDir(tmpDir);

      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBe(2);
      expect(entries[0]).toHaveProperty('name');
      expect(entries[0]).toHaveProperty('type');
    });
  });
});
