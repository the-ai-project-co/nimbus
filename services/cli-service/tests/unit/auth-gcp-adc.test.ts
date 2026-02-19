import { describe, test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Auth GCP — ADC check and --project fix', () => {
  let authCloudSource: string;

  test('should load the auth-cloud command source', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/auth-cloud.ts');
    authCloudSource = await fs.readFile(filePath, 'utf-8');
    expect(authCloudSource).toBeTruthy();
  });

  test('should include ADC check via gcloud auth application-default', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/auth-cloud.ts');
    authCloudSource = await fs.readFile(filePath, 'utf-8');

    expect(authCloudSource).toContain('application-default');
    expect(authCloudSource).toContain('print-access-token');
  });

  test('should display ADC status to user', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/auth-cloud.ts');
    authCloudSource = await fs.readFile(filePath, 'utf-8');

    expect(authCloudSource).toContain("'ADC:'");
    expect(authCloudSource).toContain("'configured'");
    expect(authCloudSource).toContain("'not configured'");
  });

  test('should show ADC setup instructions when not configured', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/auth-cloud.ts');
    authCloudSource = await fs.readFile(filePath, 'utf-8');

    expect(authCloudSource).toContain('gcloud auth application-default login');
  });

  test('should forward --project option to gcloud config get-value', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/auth-cloud.ts');
    authCloudSource = await fs.readFile(filePath, 'utf-8');

    // Should conditionally use options.project
    expect(authCloudSource).toContain('options.project');
    expect(authCloudSource).toContain("'--project'");
    expect(authCloudSource).toContain('options.project');

    // The project args should be a ternary based on options.project
    expect(authCloudSource).toMatch(/options\.project\s*\?\s*\[/);
  });
});
