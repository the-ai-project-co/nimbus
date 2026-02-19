import { describe, test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('FS tree command', () => {
  let fsCommandSource: string;
  let toolsClientSource: string;

  test('should load fs commands source', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/fs/index.ts');
    fsCommandSource = await fs.readFile(filePath, 'utf-8');
    expect(fsCommandSource).toBeTruthy();
  });

  test('fsTreeCommand function should exist', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/fs/index.ts');
    fsCommandSource = await fs.readFile(filePath, 'utf-8');

    expect(fsCommandSource).toContain('async function fsTreeCommand');
    expect(fsCommandSource).toContain('File Tree');
  });

  test('fsTreeCommand should call toolsClient.fs.tree()', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/fs/index.ts');
    fsCommandSource = await fs.readFile(filePath, 'utf-8');

    expect(fsCommandSource).toContain('toolsClient.fs.tree(');
  });

  test('tree case in switch should use fsTreeCommand (not fsListCommand)', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/fs/index.ts');
    fsCommandSource = await fs.readFile(filePath, 'utf-8');

    // Extract the tree case
    const treeCase = fsCommandSource.indexOf("case 'tree':");
    const nextCase = fsCommandSource.indexOf('case ', treeCase + 1);
    const treeCaseSection = fsCommandSource.slice(treeCase, nextCase);

    expect(treeCaseSection).toContain('fsTreeCommand');
    expect(treeCaseSection).not.toContain('fsListCommand');
  });

  test('FsCommandOptions should include maxDepth', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/fs/index.ts');
    fsCommandSource = await fs.readFile(filePath, 'utf-8');

    expect(fsCommandSource).toContain('maxDepth?: number');
  });

  test('--depth option should be parsed', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/fs/index.ts');
    fsCommandSource = await fs.readFile(filePath, 'utf-8');

    expect(fsCommandSource).toContain("'--depth'");
    expect(fsCommandSource).toContain('options.maxDepth');
  });

  test('ToolsClient should have fs.tree() method', async () => {
    const filePath = path.resolve(__dirname, '../../../../shared/clients/src/tools-client.ts');
    toolsClientSource = await fs.readFile(filePath, 'utf-8');

    expect(toolsClientSource).toContain('tree: async');
    expect(toolsClientSource).toContain('/api/fs/tree');
  });

  test('fs.tree() should support maxDepth option', async () => {
    const filePath = path.resolve(__dirname, '../../../../shared/clients/src/tools-client.ts');
    toolsClientSource = await fs.readFile(filePath, 'utf-8');

    expect(toolsClientSource).toContain('maxDepth');
  });

  test('fsTreeCommand should have a printTree helper for tree rendering', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/fs/index.ts');
    fsCommandSource = await fs.readFile(filePath, 'utf-8');

    expect(fsCommandSource).toContain('function printTree');
    expect(fsCommandSource).toContain('├──');
    expect(fsCommandSource).toContain('└──');
  });
});
