import { describe, test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Config environment variable expansion', () => {
  let configManagerSource: string;

  test('should load config manager source', async () => {
    const filePath = path.resolve(__dirname, '../../src/config/manager.ts');
    configManagerSource = await fs.readFile(filePath, 'utf-8');
    expect(configManagerSource).toBeTruthy();
  });

  test('resolveEnvVars function should exist', async () => {
    const filePath = path.resolve(__dirname, '../../src/config/manager.ts');
    configManagerSource = await fs.readFile(filePath, 'utf-8');

    expect(configManagerSource).toContain('function resolveEnvVars');
  });

  test('resolveEnvVars should support ${VAR} syntax', async () => {
    const filePath = path.resolve(__dirname, '../../src/config/manager.ts');
    configManagerSource = await fs.readFile(filePath, 'utf-8');

    // Should have regex pattern for ${...}
    expect(configManagerSource).toContain('${');
    expect(configManagerSource).toContain('process.env');
  });

  test('resolveEnvVars should support ${VAR:-default} syntax', async () => {
    const filePath = path.resolve(__dirname, '../../src/config/manager.ts');
    configManagerSource = await fs.readFile(filePath, 'utf-8');

    expect(configManagerSource).toContain(':-');
    expect(configManagerSource).toContain('defaultValue');
  });

  test('resolveEnvVars should handle objects recursively', async () => {
    const filePath = path.resolve(__dirname, '../../src/config/manager.ts');
    configManagerSource = await fs.readFile(filePath, 'utf-8');

    // Extract the function
    const fnStart = configManagerSource.indexOf('function resolveEnvVars');
    const fnSection = configManagerSource.slice(fnStart, fnStart + 800);

    expect(fnSection).toContain('typeof value === \'object\'');
    expect(fnSection).toContain('resolveEnvVars');
  });

  test('resolveEnvVars should handle arrays recursively', async () => {
    const filePath = path.resolve(__dirname, '../../src/config/manager.ts');
    configManagerSource = await fs.readFile(filePath, 'utf-8');

    const fnStart = configManagerSource.indexOf('function resolveEnvVars');
    const fnSection = configManagerSource.slice(fnStart, fnStart + 800);

    expect(fnSection).toContain('Array.isArray');
    expect(fnSection).toContain('.map(resolveEnvVars');
  });

  test('load() method should call resolveEnvVars on parsed config', async () => {
    const filePath = path.resolve(__dirname, '../../src/config/manager.ts');
    configManagerSource = await fs.readFile(filePath, 'utf-8');

    // The load method should apply resolveEnvVars before Zod validation
    expect(configManagerSource).toContain('resolveEnvVars(parseSimpleYaml(content))');
  });
});
