/**
 * Tests for the Nimbus project initialization module (src/cli/init.ts).
 *
 * Each test creates a temporary directory with the appropriate marker files,
 * exercises the detection and init functions, and cleans up afterward.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  detectProjectType,
  detectInfrastructure,
  detectCloudProviders,
  detectPackageManager,
  detectProject,
  generateNimbusMd,
  runInit,
} from '../cli/init';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-init-test-'));
}

function removeTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ============================================================================
// detectProjectType()
// ============================================================================

describe('detectProjectType()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    removeTmpDir(tmpDir);
  });

  test('detects TypeScript (tsconfig.json)', () => {
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    expect(detectProjectType(tmpDir)).toBe('typescript');
  });

  test('detects Go (go.mod)', () => {
    fs.writeFileSync(path.join(tmpDir, 'go.mod'), 'module example.com/myapp\n\ngo 1.21\n');
    expect(detectProjectType(tmpDir)).toBe('go');
  });

  test('detects Python (pyproject.toml)', () => {
    fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[project]\nname = "myapp"\n');
    expect(detectProjectType(tmpDir)).toBe('python');
  });

  test('detects Rust (Cargo.toml)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'Cargo.toml'),
      '[package]\nname = "myapp"\nversion = "0.1.0"\n'
    );
    expect(detectProjectType(tmpDir)).toBe('rust');
  });

  test('detects Java (pom.xml)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pom.xml'),
      '<project><modelVersion>4.0.0</modelVersion></project>'
    );
    expect(detectProjectType(tmpDir)).toBe('java');
  });

  test('returns "unknown" for empty dir', () => {
    expect(detectProjectType(tmpDir)).toBe('unknown');
  });
});

// ============================================================================
// detectInfrastructure()
// ============================================================================

describe('detectInfrastructure()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    removeTmpDir(tmpDir);
  });

  test('detects Terraform (.tf files)', () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), 'provider "aws" {\n  region = "us-east-1"\n}\n');

    const infra = detectInfrastructure(tmpDir);
    expect(infra).toContain('terraform');
  });

  test('detects Kubernetes (manifest with kind: Deployment)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'deployment.yaml'),
      ['apiVersion: apps/v1', 'kind: Deployment', 'metadata:', '  name: web'].join('\n')
    );

    const infra = detectInfrastructure(tmpDir);
    expect(infra).toContain('kubernetes');
  });

  test('detects Helm (Chart.yaml)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'Chart.yaml'),
      'apiVersion: v2\nname: my-chart\nversion: 0.1.0\n'
    );

    const infra = detectInfrastructure(tmpDir);
    expect(infra).toContain('helm');
  });

  test('detects Docker (Dockerfile)', () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20-alpine\nWORKDIR /app\n');

    const infra = detectInfrastructure(tmpDir);
    expect(infra).toContain('docker');
  });

  test('detects CI/CD (.github/workflows/)', () => {
    const workflowsDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowsDir, { recursive: true });
    fs.writeFileSync(path.join(workflowsDir, 'ci.yml'), 'name: CI\non: push\n');

    const infra = detectInfrastructure(tmpDir);
    expect(infra).toContain('cicd');
  });

  test('returns empty array for bare directory', () => {
    const infra = detectInfrastructure(tmpDir);
    expect(infra).toEqual([]);
  });
});

// ============================================================================
// detectCloudProviders()
// ============================================================================

describe('detectCloudProviders()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    removeTmpDir(tmpDir);
  });

  test('detects AWS (provider "aws" in .tf)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'providers.tf'),
      'provider "aws" {\n  region = "us-east-1"\n}\n'
    );

    const providers = detectCloudProviders(tmpDir);
    expect(providers).toContain('aws');
  });

  test('detects GCP (provider "google" in .tf)', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'providers.tf'),
      'provider "google" {\n  project = "my-project"\n}\n'
    );

    const providers = detectCloudProviders(tmpDir);
    expect(providers).toContain('gcp');
  });

  test('detects Azure (provider "azurerm" in .tf)', () => {
    fs.writeFileSync(path.join(tmpDir, 'providers.tf'), 'provider "azurerm" {\n  features {}\n}\n');

    const providers = detectCloudProviders(tmpDir);
    expect(providers).toContain('azure');
  });
});

// ============================================================================
// detectPackageManager()
// ============================================================================

describe('detectPackageManager()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    removeTmpDir(tmpDir);
  });

  test('detects bun (bun.lock)', () => {
    fs.writeFileSync(path.join(tmpDir, 'bun.lock'), '');
    expect(detectPackageManager(tmpDir)).toBe('bun');
  });

  test('detects npm (package-lock.json)', () => {
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), '{}');
    expect(detectPackageManager(tmpDir)).toBe('npm');
  });

  test('returns undefined when no lock file is present', () => {
    expect(detectPackageManager(tmpDir)).toBeUndefined();
  });
});

// ============================================================================
// detectProject()
// ============================================================================

describe('detectProject()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    removeTmpDir(tmpDir);
  });

  test('aggregates all detection results', () => {
    // TypeScript project
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
    // Bun lock file
    fs.writeFileSync(path.join(tmpDir, 'bun.lock'), '');
    // Terraform
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), 'provider "aws" {\n  region = "us-east-1"\n}\n');
    // Docker
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:20\n');
    // Git
    fs.mkdirSync(path.join(tmpDir, '.git'));

    const detection = detectProject(tmpDir);

    expect(detection.projectName).toBe(path.basename(tmpDir));
    expect(detection.projectType).toBe('typescript');
    expect(detection.packageManager).toBe('bun');
    expect(detection.infraTypes).toContain('terraform');
    expect(detection.infraTypes).toContain('docker');
    expect(detection.cloudProviders).toContain('aws');
    expect(detection.hasGit).toBe(true);
  });
});

// ============================================================================
// generateNimbusMd()
// ============================================================================

describe('generateNimbusMd()', () => {
  test('includes project name', () => {
    const md = generateNimbusMd(
      {
        projectName: 'my-cool-app',
        projectType: 'typescript',
        infraTypes: [],
        cloudProviders: [],
        hasGit: true,
        packageManager: 'bun',
      },
      '/tmp/my-cool-app'
    );

    expect(md).toContain('# my-cool-app');
  });

  test('includes detected infrastructure', () => {
    const md = generateNimbusMd(
      {
        projectName: 'infra-project',
        projectType: 'typescript',
        infraTypes: ['terraform', 'kubernetes', 'docker'],
        cloudProviders: ['aws', 'gcp'],
        hasGit: true,
        packageManager: 'npm',
      },
      '/tmp/infra-project'
    );

    expect(md).toContain('## Infrastructure');
    expect(md).toContain('terraform');
    expect(md).toContain('kubernetes');
    expect(md).toContain('docker');
    expect(md).toContain('aws');
    expect(md).toContain('gcp');
  });

  test('includes safety rules section', () => {
    const md = generateNimbusMd(
      {
        projectName: 'test-project',
        projectType: 'go',
        infraTypes: [],
        cloudProviders: [],
        hasGit: false,
      },
      '/tmp/test-project'
    );

    expect(md).toContain('## Safety Rules');
    expect(md).toContain('Protected branches');
    expect(md).toContain('Never store secrets');
  });

  test('includes package manager when present', () => {
    const md = generateNimbusMd(
      {
        projectName: 'bun-app',
        projectType: 'typescript',
        infraTypes: [],
        cloudProviders: [],
        hasGit: true,
        packageManager: 'bun',
      },
      '/tmp/bun-app'
    );

    expect(md).toContain('**Package Manager:** bun');
  });
});

// ============================================================================
// runInit()
// ============================================================================

describe('runInit()', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    // Create a minimal project marker so detectProjectType returns something
    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');
  });

  afterEach(() => {
    removeTmpDir(tmpDir);
  });

  test('creates NIMBUS.md file', async () => {
    const result = await runInit({ cwd: tmpDir, quiet: true });

    const nimbusmdPath = path.join(tmpDir, 'NIMBUS.md');
    expect(fs.existsSync(nimbusmdPath)).toBe(true);
    expect(result.nimbusmdPath).toBe(nimbusmdPath);

    const content = fs.readFileSync(nimbusmdPath, 'utf-8');
    expect(content).toContain(path.basename(tmpDir));
    expect(content).toContain('typescript');
  });

  test('creates .nimbus/ directory', async () => {
    await runInit({ cwd: tmpDir, quiet: true });

    const nimbusDirPath = path.join(tmpDir, '.nimbus');
    expect(fs.existsSync(nimbusDirPath)).toBe(true);
    expect(fs.statSync(nimbusDirPath).isDirectory()).toBe(true);
  });

  test('creates .nimbus/config.yaml', async () => {
    const result = await runInit({ cwd: tmpDir, quiet: true });

    const configPath = path.join(tmpDir, '.nimbus', 'config.yaml');
    expect(fs.existsSync(configPath)).toBe(true);
    expect(result.filesCreated).toContain(configPath);

    const content = fs.readFileSync(configPath, 'utf-8');
    expect(content).toContain('default_model:');
    expect(content).toContain('permissions:');
    expect(content).toContain('safety:');
    expect(content).toContain('type: typescript');
  });

  test('throws if NIMBUS.md exists without --force', async () => {
    // First init
    await runInit({ cwd: tmpDir, quiet: true });
    expect(fs.existsSync(path.join(tmpDir, 'NIMBUS.md'))).toBe(true);

    // Second init should throw
    await expect(runInit({ cwd: tmpDir, quiet: true })).rejects.toThrow('NIMBUS.md already exists');
  });

  test('overwrites with --force', async () => {
    // First init
    await runInit({ cwd: tmpDir, quiet: true });

    // Modify NIMBUS.md so we can tell if it's overwritten
    const nimbusmdPath = path.join(tmpDir, 'NIMBUS.md');
    fs.writeFileSync(nimbusmdPath, 'CUSTOM CONTENT THAT SHOULD BE REPLACED');

    // Second init with force
    await runInit({ cwd: tmpDir, force: true, quiet: true });

    const content = fs.readFileSync(nimbusmdPath, 'utf-8');
    expect(content).not.toContain('CUSTOM CONTENT THAT SHOULD BE REPLACED');
    expect(content).toContain('Auto-generated by `nimbus init`');
  });

  test('creates hooks and agents subdirectories', async () => {
    await runInit({ cwd: tmpDir, quiet: true });

    expect(fs.existsSync(path.join(tmpDir, '.nimbus', 'hooks'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.nimbus', 'agents'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.nimbus', 'hooks', 'pre-commit.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.nimbus', 'agents', 'default.yaml'))).toBe(true);
  });

  test('returns correct detection results', async () => {
    // Add some extra markers
    fs.writeFileSync(path.join(tmpDir, 'bun.lock'), '');
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), 'provider "aws" {\n  region = "us-east-1"\n}\n');

    const result = await runInit({ cwd: tmpDir, quiet: true });

    expect(result.detection.projectType).toBe('typescript');
    expect(result.detection.packageManager).toBe('bun');
    expect(result.detection.infraTypes).toContain('terraform');
    expect(result.detection.cloudProviders).toContain('aws');
    expect(result.filesCreated.length).toBeGreaterThan(0);
  });
});
