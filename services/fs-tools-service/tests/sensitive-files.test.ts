import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { FileSystemOperations } from '../src/fs/operations';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Sensitive File Protection', () => {
  let fsOps: FileSystemOperations;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-sensitive-test-'));
    fsOps = new FileSystemOperations(tmpDir);
    // Ensure the env var is not set
    delete process.env.ALLOW_SENSITIVE_FILES;
  });

  afterEach(async () => {
    delete process.env.ALLOW_SENSITIVE_FILES;
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  describe('blocked patterns', () => {
    test('should block .env files', async () => {
      await fs.writeFile(path.join(tmpDir, '.env'), 'SECRET=123');

      await expect(fsOps.readFile('.env')).rejects.toThrow('Access denied');
    });

    test('should block .env.local', async () => {
      await fs.writeFile(path.join(tmpDir, '.env.local'), 'SECRET=123');

      await expect(fsOps.readFile('.env.local')).rejects.toThrow('Access denied');
    });

    test('should block .env.production', async () => {
      await fs.writeFile(path.join(tmpDir, '.env.production'), 'SECRET=123');

      await expect(fsOps.readFile('.env.production')).rejects.toThrow('Access denied');
    });

    test('should block credentials files', async () => {
      await fs.writeFile(path.join(tmpDir, 'credentials'), 'creds');

      await expect(fsOps.readFile('credentials')).rejects.toThrow('Access denied');
    });

    test('should block .pem files', async () => {
      await fs.writeFile(path.join(tmpDir, 'server.pem'), 'cert');

      await expect(fsOps.readFile('server.pem')).rejects.toThrow('Access denied');
    });

    test('should block .key files', async () => {
      await fs.writeFile(path.join(tmpDir, 'private.key'), 'key');

      await expect(fsOps.readFile('private.key')).rejects.toThrow('Access denied');
    });

    test('should block id_rsa', async () => {
      await fs.writeFile(path.join(tmpDir, 'id_rsa'), 'key');

      await expect(fsOps.readFile('id_rsa')).rejects.toThrow('Access denied');
    });

    test('should block id_ed25519', async () => {
      await fs.writeFile(path.join(tmpDir, 'id_ed25519'), 'key');

      await expect(fsOps.readFile('id_ed25519')).rejects.toThrow('Access denied');
    });

    test('should block id_ecdsa', async () => {
      await fs.writeFile(path.join(tmpDir, 'id_ecdsa'), 'key');

      await expect(fsOps.readFile('id_ecdsa')).rejects.toThrow('Access denied');
    });

    test('should block writeFile to sensitive paths', async () => {
      await expect(fsOps.writeFile('.env', 'hack=true')).rejects.toThrow('Access denied');
    });

    test('should block stat on sensitive files', async () => {
      await fs.writeFile(path.join(tmpDir, '.env'), 'secret');

      await expect(fsOps.stat('.env')).rejects.toThrow('Access denied');
    });
  });

  describe('allowed paths', () => {
    test('should allow reading normal files', async () => {
      await fs.writeFile(path.join(tmpDir, 'package.json'), '{}');

      const content = await fsOps.readFile('package.json');
      expect(content).toBe('{}');
    });

    test('should allow reading .ts files', async () => {
      await fs.writeFile(path.join(tmpDir, 'index.ts'), 'const x = 1;');

      const content = await fsOps.readFile('index.ts');
      expect(content).toBe('const x = 1;');
    });

    test('should allow reading README.md', async () => {
      await fs.writeFile(path.join(tmpDir, 'README.md'), '# Hello');

      const content = await fsOps.readFile('README.md');
      expect(content).toBe('# Hello');
    });
  });

  describe('ALLOW_SENSITIVE_FILES env var override', () => {
    test('should allow sensitive files when ALLOW_SENSITIVE_FILES=true', async () => {
      process.env.ALLOW_SENSITIVE_FILES = 'true';
      await fs.writeFile(path.join(tmpDir, '.env'), 'SECRET=123');

      const content = await fsOps.readFile('.env');
      expect(content).toBe('SECRET=123');
    });

    test('should still block when ALLOW_SENSITIVE_FILES is not true', async () => {
      process.env.ALLOW_SENSITIVE_FILES = 'false';
      await fs.writeFile(path.join(tmpDir, '.env'), 'SECRET=123');

      await expect(fsOps.readFile('.env')).rejects.toThrow('Access denied');
    });
  });
});
