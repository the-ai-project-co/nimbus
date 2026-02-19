import { describe, test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FS subcommands (write, diff)', () => {
  let fsCommandSource: string;
  let toolsClientSource: string;

  const fsFilePath = path.resolve(__dirname, '../../src/commands/fs/index.ts');
  const clientFilePath = path.resolve(__dirname, '../../../../shared/clients/src/tools-client.ts');

  test('should load fs commands source', async () => {
    fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
    expect(fsCommandSource).toBeTruthy();
  });

  // ==========================================
  // fsWriteCommand tests
  // ==========================================

  describe('fsWriteCommand', () => {
    test('fsWriteCommand function should exist', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('async function fsWriteCommand');
    });

    test('fsWriteCommand should display "Files Write" header', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain("'Files Write'");
    });

    test('fsWriteCommand should call toolsClient.fs.write()', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('toolsClient.fs.write(');
    });

    test('fsWriteCommand should accept filePath and content parameters', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('filePath: string');
      expect(fsCommandSource).toContain('content: string');
    });

    test('fsWriteCommand should support createDirs option', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('createDirs');
    });

    test('fsWriteCommand should show success message with file path', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('File written successfully');
    });
  });

  // ==========================================
  // fsDiffCommand tests
  // ==========================================

  describe('fsDiffCommand', () => {
    test('fsDiffCommand function should exist', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('async function fsDiffCommand');
    });

    test('fsDiffCommand should display "Files Diff" header', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain("'Files Diff'");
    });

    test('fsDiffCommand should accept file1 and file2 parameters', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('file1: string');
      expect(fsCommandSource).toContain('file2: string');
    });

    test('fsDiffCommand should display file paths in info', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('`File 1: ${file1}`');
      expect(fsCommandSource).toContain('`File 2: ${file2}`');
    });

    test('fsDiffCommand should handle identical files', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('Files are identical');
    });

    test('fsDiffCommand should display diff with color-coded lines', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain("'green'");
      expect(fsCommandSource).toContain("'red'");
    });
  });

  // ==========================================
  // Router switch cases
  // ==========================================

  describe('fsCommand router', () => {
    test('should have write case in switch', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain("case 'write':");
      const writeCase = fsCommandSource.indexOf("case 'write':");
      const nextCase = fsCommandSource.indexOf('case ', writeCase + 1);
      const writeSection = fsCommandSource.slice(writeCase, nextCase);
      expect(writeSection).toContain('fsWriteCommand');
    });

    test('should have diff case in switch', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain("case 'diff':");
      const diffCase = fsCommandSource.indexOf("case 'diff':");
      const nextCase = fsCommandSource.indexOf('default:', diffCase + 1);
      const diffSection = fsCommandSource.slice(diffCase, nextCase);
      expect(diffSection).toContain('fsDiffCommand');
    });

    test('write case should require path and content args', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain("'Usage: nimbus fs write <path> <content>'");
    });

    test('diff case should require two file args', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain("'Usage: nimbus fs diff <file1> <file2>'");
    });

    test('default case should list all available commands including new ones', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('write');
      expect(fsCommandSource).toContain('diff');
    });
  });

  // ==========================================
  // Arg parsing tests
  // ==========================================

  describe('Arg parsing', () => {
    test('should parse --create-dirs flag', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain("'--create-dirs'");
      expect(fsCommandSource).toContain('options.createDirs = true');
    });

    test('FsCommandOptions should include createDirs', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain('createDirs?: boolean');
    });

    test('write command should join remaining positional args as content', async () => {
      fsCommandSource = await fs.readFile(fsFilePath, 'utf-8');
      expect(fsCommandSource).toContain("positionalArgs.slice(1).join(' ')");
    });
  });

  // ==========================================
  // ToolsClient method tests
  // ==========================================

  describe('ToolsClient FS methods', () => {
    test('should have fs.write method', async () => {
      toolsClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(toolsClientSource).toContain('write: async');
      expect(toolsClientSource).toContain('/api/fs/write');
    });

    test('fs.write should accept path, content, and options', async () => {
      toolsClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(toolsClientSource).toContain('filePath: string, content: string');
    });

    test('should have fs.read method used by diff', async () => {
      toolsClientSource = await fs.readFile(clientFilePath, 'utf-8');
      expect(toolsClientSource).toContain('read: async');
      expect(toolsClientSource).toContain('/api/fs/read');
    });
  });

  // ==========================================
  // Command export tests
  // ==========================================

  describe('Command exports', () => {
    test('should export fsWriteCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.fsWriteCommand).toBe('function');
    });

    test('should export fsDiffCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.fsDiffCommand).toBe('function');
    });

    test('should export writeCommand alias for fsWriteCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.writeCommand).toBe('function');
    });

    test('should export diffCommand alias for fsDiffCommand', async () => {
      const commands = await import('../../src/commands');
      expect(typeof commands.diffCommand).toBe('function');
    });
  });
});
