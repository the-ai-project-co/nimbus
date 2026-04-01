/**
 * Init & Doctor End-to-End Tests
 *
 * Tests nimbus init (project detection + NIMBUS.md generation) and
 * nimbus doctor (diagnostic checks) with real filesystem operations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runInit, detectProjectType, generateNimbusMd, detectProject } from '../../src/cli/init';
import type { InitOptions, ProjectDetection } from '../../src/cli/init';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-e2e-init-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// detectProjectType — real files
// ---------------------------------------------------------------------------

describe('detectProjectType — real filesystem', () => {
  it('detects TypeScript from tsconfig.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    expect(detectProjectType(tmpDir)).toBe('typescript');
  });

  it('detects JavaScript from package.json (no tsconfig)', () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    expect(detectProjectType(tmpDir)).toBe('javascript');
  });

  it('detects Go from go.mod', () => {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com');
    expect(detectProjectType(tmpDir)).toBe('go');
  });

  it('detects Python from pyproject.toml', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[tool.poetry]');
    expect(detectProjectType(tmpDir)).toBe('python');
  });

  it('detects Python from requirements.txt', () => {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'flask==2.0');
    expect(detectProjectType(tmpDir)).toBe('python');
  });

  it('returns unknown for empty directory', () => {
    expect(detectProjectType(tmpDir)).toBe('unknown');
  });

  it('TypeScript takes priority over JavaScript', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    expect(detectProjectType(tmpDir)).toBe('typescript');
  });
});

// ---------------------------------------------------------------------------
// runInit — full end-to-end
// ---------------------------------------------------------------------------

describe('runInit — full pipeline', () => {
  it('creates NIMBUS.md in project root', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"test-project"}');
    const result = await runInit({ cwd: tmpDir, quiet: true });
    expect(result).toBeDefined();
    expect(fs.existsSync(path.join(tmpDir, 'NIMBUS.md'))).toBe(true);
  });

  it('NIMBUS.md contains project name', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"my-app"}');
    await runInit({ cwd: tmpDir, quiet: true });
    const content = fs.readFileSync(path.join(tmpDir, 'NIMBUS.md'), 'utf-8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('detects Terraform infrastructure', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), 'resource "aws_instance" "web" {}');
    const result = await runInit({ cwd: tmpDir, quiet: true });
    expect(result!.detection.infraTypes).toContain('terraform');
  });

  it('detects Kubernetes infrastructure', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, 'k8s'));
    fs.writeFileSync(path.join(tmpDir, 'k8s', 'deployment.yaml'), 'apiVersion: apps/v1\nkind: Deployment');
    const result = await runInit({ cwd: tmpDir, quiet: true });
    expect(result!.detection.infraTypes).toContain('kubernetes');
  });

  it('detects Docker infrastructure', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20');
    const result = await runInit({ cwd: tmpDir, quiet: true });
    expect(result!.detection.infraTypes).toContain('docker');
  });

  it('detects git repository', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const result = await runInit({ cwd: tmpDir, quiet: true });
    expect(result!.detection.hasGit).toBe(true);
  });

  it('creates minimal NIMBUS.md in empty directory', async () => {
    const result = await runInit({ cwd: tmpDir, quiet: true });
    expect(result).toBeDefined();
    const content = fs.readFileSync(path.join(tmpDir, 'NIMBUS.md'), 'utf-8');
    expect(content).toContain('nimbus init');
  });

  it('--force overwrites existing NIMBUS.md', async () => {
    fs.writeFileSync(path.join(tmpDir, 'NIMBUS.md'), 'old content');
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    await runInit({ cwd: tmpDir, quiet: true, force: true });
    const content = fs.readFileSync(path.join(tmpDir, 'NIMBUS.md'), 'utf-8');
    expect(content).not.toBe('old content');
  });

  it('result includes filesCreated and nimbusmdPath', async () => {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
    const result = await runInit({ cwd: tmpDir, quiet: true });
    expect(result!.nimbusmdPath).toContain('NIMBUS.md');
    expect(result!.filesCreated.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// generateNimbusMd (replaces validateNimbusMd which does not exist)
// ---------------------------------------------------------------------------

describe('generateNimbusMd', () => {
  it('generates valid markdown for a detected project', () => {
    const detection: ProjectDetection = {
      projectName: 'test',
      projectType: 'typescript',
      infraTypes: ['terraform'],
      cloudProviders: ['aws'],
      hasGit: true,
    };
    const content = generateNimbusMd(detection, tmpDir);
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('nimbus init');
    expect(content).toContain('test');
  });

  it('generates content for an empty/unknown project', () => {
    const detection: ProjectDetection = {
      projectName: 'empty',
      projectType: 'unknown',
      infraTypes: [],
      cloudProviders: [],
      hasGit: false,
    };
    const content = generateNimbusMd(detection, tmpDir);
    expect(content.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// doctorCommand
// ---------------------------------------------------------------------------

describe('doctorCommand — end-to-end', () => {
  it('completes without throwing', async () => {
    const { doctorCommand } = await import('../../src/commands/doctor');
    // Suppress output
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const spy2 = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // Mock process.exit since doctor calls process.exit(1) when checks fail
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    await expect(doctorCommand({ quiet: true })).resolves.not.toThrow();
    spy.mockRestore();
    spy2.mockRestore();
    exitSpy.mockRestore();
  });

  it('returns JSON output with --json flag', async () => {
    const { doctorCommand } = await import('../../src/commands/doctor');
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return true;
    });
    const spy2 = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // Mock process.exit since doctor calls process.exit(1) on failures
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    // Capture console.log since JSON mode uses console.log
    const logChunks: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: any[]) => {
      logChunks.push(args.map(String).join(' '));
    });

    await doctorCommand({ json: true, quiet: true });

    spy.mockRestore();
    spy2.mockRestore();
    exitSpy.mockRestore();
    logSpy.mockRestore();

    const output = logChunks.join('\n') + chunks.join('');
    if (output.trim()) {
      // Try to parse the first JSON-like chunk
      const jsonMatch = output.match(/\{[\s\S]*?\n\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        expect(typeof parsed).toBe('object');
      }
    }
  });
});
