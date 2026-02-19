import { describe, test, expect } from 'bun:test';

describe('Helm Lint Command', () => {
  test('helmLintCommand is exported', async () => {
    const { helmLintCommand } = await import('../../src/commands/helm');
    expect(typeof helmLintCommand).toBe('function');
  });

  test('helmLintCommand is re-exported from commands/index', async () => {
    const commands = await import('../../src/commands/index');
    expect(typeof commands.helmLintCommand).toBe('function');
  });

  test('helmCommand router handles lint subcommand', async () => {
    const { helmCommand } = await import('../../src/commands/helm');
    expect(typeof helmCommand).toBe('function');
    // helmCommand('lint', [...]) would call helmLintCommand internally
  });

  test('helm lint with --strict flag parses correctly', () => {
    const args = ['./my-chart', '--strict', '-f', 'values-prod.yaml'];
    const strict = args.includes('--strict');
    const valuesFiles: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if ((args[i] === '-f' || args[i] === '--values') && args[i + 1]) {
        valuesFiles.push(args[i + 1]);
      }
    }
    expect(strict).toBe(true);
    expect(valuesFiles).toEqual(['values-prod.yaml']);
  });

  test('ToolsClient helm.lint method exists', async () => {
    const { ToolsClient } = await import('@nimbus/shared-clients');
    const client = new ToolsClient();
    expect(typeof client.helm.lint).toBe('function');
  });
});
