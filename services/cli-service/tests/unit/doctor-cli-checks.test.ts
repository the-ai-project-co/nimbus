import { describe, test, expect } from 'bun:test';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Doctor CLI checks — gcloud and az entries', () => {
  let doctorSource: string;

  test('should load the doctor command source', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/doctor.ts');
    doctorSource = await fs.readFile(filePath, 'utf-8');
    expect(doctorSource).toBeTruthy();
  });

  test('tools array should include gcloud entry', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/doctor.ts');
    doctorSource = await fs.readFile(filePath, 'utf-8');

    expect(doctorSource).toContain("name: 'gcloud'");
    expect(doctorSource).toContain("cmd: 'gcloud'");
    expect(doctorSource).toContain("'version'");
  });

  test('tools array should include az entry', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/doctor.ts');
    doctorSource = await fs.readFile(filePath, 'utf-8');

    expect(doctorSource).toContain("name: 'az'");
    expect(doctorSource).toContain("cmd: 'az'");
  });

  test('gcloud and az should be optional (required: false)', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/doctor.ts');
    doctorSource = await fs.readFile(filePath, 'utf-8');

    // Extract the tools array region
    const toolsStart = doctorSource.indexOf('const tools = [');
    const toolsEnd = doctorSource.indexOf('];', toolsStart) + 2;
    const toolsSection = doctorSource.slice(toolsStart, toolsEnd);

    // Check gcloud entry has required: false
    const gcloudEntry = toolsSection.match(/\{[^}]*name:\s*'gcloud'[^}]*\}/s);
    expect(gcloudEntry).toBeTruthy();
    expect(gcloudEntry![0]).toContain('required: false');

    // Check az entry has required: false
    const azEntry = toolsSection.match(/\{[^}]*name:\s*'az'[^}]*\}/s);
    expect(azEntry).toBeTruthy();
    expect(azEntry![0]).toContain('required: false');
  });

  test('tools array should still include original tools', async () => {
    const filePath = path.resolve(__dirname, '../../src/commands/doctor.ts');
    doctorSource = await fs.readFile(filePath, 'utf-8');

    expect(doctorSource).toContain("name: 'git'");
    expect(doctorSource).toContain("name: 'terraform'");
    expect(doctorSource).toContain("name: 'kubectl'");
    expect(doctorSource).toContain("name: 'helm'");
    expect(doctorSource).toContain("name: 'aws'");
  });
});
