import { describe, test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Git clone command', () => {
  let gitClientSource: string;
  let gitCommandSource: string;

  test('should load git client source', async () => {
    const filePath = path.resolve(__dirname, '../../src/clients/git-client.ts');
    gitClientSource = await fs.readFile(filePath, 'utf-8');
    expect(gitClientSource).toBeTruthy();
  });

  test('GitClient should have a clone() method', async () => {
    const filePath = path.resolve(__dirname, '../../src/clients/git-client.ts');
    gitClientSource = await fs.readFile(filePath, 'utf-8');

    expect(gitClientSource).toContain('async clone(');
    expect(gitClientSource).toContain('/api/git/clone');
  });

  test('clone method should accept url and path parameters', async () => {
    const filePath = path.resolve(__dirname, '../../src/clients/git-client.ts');
    gitClientSource = await fs.readFile(filePath, 'utf-8');

    expect(gitClientSource).toContain('url: string');
    expect(gitClientSource).toContain('targetPath');
  });

  test('clone method should support branch and depth options', async () => {
    const filePath = path.resolve(__dirname, '../../src/clients/git-client.ts');
    gitClientSource = await fs.readFile(filePath, 'utf-8');

    // Extract the clone method region
    const cloneStart = gitClientSource.indexOf('async clone(');
    const cloneEnd = gitClientSource.indexOf('async isAvailable');
    const cloneSection = gitClientSource.slice(cloneStart, cloneEnd);

    expect(cloneSection).toContain('branch');
    expect(cloneSection).toContain('depth');
  });

  test('should load git commands source', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/git/index.ts');
    gitCommandSource = await fs.readFile(filePath, 'utf-8');
    expect(gitCommandSource).toBeTruthy();
  });

  test('gitCloneCommand function should exist', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/git/index.ts');
    gitCommandSource = await fs.readFile(filePath, 'utf-8');

    expect(gitCommandSource).toContain('async function gitCloneCommand');
    expect(gitCommandSource).toContain('Git Clone');
  });

  test('clone case should be in the switch router', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/git/index.ts');
    gitCommandSource = await fs.readFile(filePath, 'utf-8');

    expect(gitCommandSource).toContain("case 'clone':");
    expect(gitCommandSource).toContain('gitCloneCommand(');
  });

  test('available commands list should include clone', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/git/index.ts');
    gitCommandSource = await fs.readFile(filePath, 'utf-8');

    expect(gitCommandSource).toContain('clone, stash');
  });
});
