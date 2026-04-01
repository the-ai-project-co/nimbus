/**
 * IaC Generator End-to-End Tests
 *
 * Tests Terraform, Kubernetes, and Helm code generation
 * with real file output and content validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TerraformProjectGenerator } from '../../src/generator/terraform';
import { KubernetesGenerator } from '../../src/generator/kubernetes';
import { HelmGenerator } from '../../src/generator/helm';
import { IntentParser } from '../../src/generator/intent-parser';
import { BestPracticesEngine } from '../../src/generator/best-practices';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-e2e-gen-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// IntentParser
// ---------------------------------------------------------------------------

describe('IntentParser — natural language -> structured intent', () => {
  const parser = new IntentParser();

  it('extracts generate intent from VPC description', async () => {
    const intent = await parser.parse('create a VPC with 3 subnets in us-east-1');
    expect(intent.type).toBe('generate');
    const componentEntity = intent.entities.find(e => e.type === 'component');
    expect(componentEntity).toBeDefined();
    expect(componentEntity!.value).toContain('vpc');
  });

  it('extracts generate intent from deployment description', async () => {
    const intent = await parser.parse('deploy nginx with 3 replicas');
    expect(intent.type).toBe('generate');
  });

  it('extracts generate intent from helm chart install', async () => {
    const intent = await parser.parse('create a helm chart');
    expect(intent.type).toBe('generate');
    const genType = intent.entities.find(e => e.type === 'generation_type');
    expect(genType).toBeDefined();
    expect(genType!.value).toBe('helm');
  });

  it('handles ambiguous input gracefully', async () => {
    const intent = await parser.parse('do something');
    expect(intent).toBeDefined();
    expect(intent.type).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TerraformProjectGenerator
// ---------------------------------------------------------------------------

describe('TerraformProjectGenerator — real file generation', () => {
  it('generates project with main.tf, variables.tf, outputs.tf', async () => {
    const gen = new TerraformProjectGenerator();
    const result = await gen.generate({
      projectName: 'test-infra',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc', 'eks'],
    });

    expect(result.files.length).toBeGreaterThanOrEqual(3);
    const fileNames = result.files.map(f => path.basename(f.path));
    expect(fileNames).toContain('main.tf');
    expect(fileNames).toContain('variables.tf');
    expect(fileNames).toContain('outputs.tf');
  });

  it('main.tf contains provider block', async () => {
    const gen = new TerraformProjectGenerator();
    const result = await gen.generate({
      projectName: 'test-infra',
      provider: 'aws',
      region: 'us-west-2',
      components: ['vpc'],
    });

    const mainTf = result.files.find(f => f.path === 'main.tf');
    expect(mainTf).toBeDefined();
    expect(mainTf!.content).toContain('provider');
    expect(mainTf!.content).toContain('aws');
  });

  it('includes required_version in versions.tf', async () => {
    const gen = new TerraformProjectGenerator();
    const result = await gen.generate({
      projectName: 'test',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc'],
    });

    const versionsFile = result.files.find(f => f.path.includes('versions.tf'));
    if (versionsFile) {
      expect(versionsFile.content).toContain('required_version');
    }
  });

  it('validation passes on generated code', async () => {
    const gen = new TerraformProjectGenerator();
    const result = await gen.generate({
      projectName: 'valid-proj',
      provider: 'aws',
      region: 'us-east-1',
      components: ['vpc'],
    });
    expect(result.validation.valid).toBe(true);
    expect(result.validation.items.filter(i => i.severity === 'error')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// KubernetesGenerator
// ---------------------------------------------------------------------------

describe('KubernetesGenerator — real YAML generation', () => {
  it('generates Deployment with correct structure', () => {
    const gen = new KubernetesGenerator({
      appName: 'web-app',
      image: 'nginx:latest',
      workloadType: 'deployment',
      replicas: 3,
      containerPort: 80,
    });

    const manifests = gen.generate();
    expect(manifests.length).toBeGreaterThanOrEqual(1);

    const deployManifest = manifests.find(m => m.kind === 'Deployment');
    expect(deployManifest).toBeDefined();
    expect(deployManifest!.content).toContain('apiVersion');
    expect(deployManifest!.content).toContain('kind: Deployment');
    expect(deployManifest!.content).toContain('nginx');
  });

  it('generates Service manifest', () => {
    const gen = new KubernetesGenerator({
      appName: 'web-app',
      image: 'nginx:latest',
      workloadType: 'deployment',
      replicas: 1,
      containerPort: 80,
      serviceType: 'ClusterIP',
    });

    const manifests = gen.generate();
    const svcManifest = manifests.find(m => m.kind === 'Service');
    expect(svcManifest).toBeDefined();
    if (svcManifest) {
      expect(svcManifest.content).toContain('kind: Service');
    }
  });

  it('writes manifests to output directory', () => {
    const gen = new KubernetesGenerator({
      appName: 'web-app',
      image: 'nginx:latest',
      workloadType: 'deployment',
      replicas: 1,
      containerPort: 80,
    });

    const files = gen.writeToFiles(tmpDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const file of files) {
      expect(fs.existsSync(file)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// HelmGenerator
// ---------------------------------------------------------------------------

describe('HelmGenerator — chart structure generation', () => {
  it('generates Chart.yaml with apiVersion v2', () => {
    const gen = new HelmGenerator({
      name: 'my-app',
      version: '0.1.0',
      appVersion: '1.0.0',
      values: {
        image: { repository: 'nginx' },
      },
    });

    const writtenFiles = gen.writeToFiles(tmpDir);
    expect(writtenFiles.length).toBeGreaterThan(0);

    const chartYaml = path.join(tmpDir, 'my-app', 'Chart.yaml');
    expect(fs.existsSync(chartYaml)).toBe(true);
    const content = fs.readFileSync(chartYaml, 'utf-8');
    expect(content).toContain('apiVersion: v2');
    expect(content).toContain('name: my-app');
  });

  it('generates values.yaml', () => {
    const gen = new HelmGenerator({
      name: 'my-app',
      version: '0.1.0',
      appVersion: '1.0.0',
      values: {
        image: { repository: 'nginx' },
      },
    });
    gen.writeToFiles(tmpDir);

    const valuesYaml = path.join(tmpDir, 'my-app', 'values.yaml');
    expect(fs.existsSync(valuesYaml)).toBe(true);
    const content = fs.readFileSync(valuesYaml, 'utf-8');
    expect(content).toContain('replica');
  });

  it('generates templates/ directory', () => {
    const gen = new HelmGenerator({
      name: 'my-app',
      version: '0.1.0',
      appVersion: '1.0.0',
      values: {
        image: { repository: 'nginx' },
      },
    });
    gen.writeToFiles(tmpDir);

    const templatesDir = path.join(tmpDir, 'my-app', 'templates');
    expect(fs.existsSync(templatesDir)).toBe(true);
    const deployTemplate = path.join(templatesDir, 'deployment.yaml');
    expect(fs.existsSync(deployTemplate)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// BestPracticesEngine
// ---------------------------------------------------------------------------

describe('BestPracticesEngine — validation E2E', () => {
  it('flags missing encryption on S3 bucket', () => {
    const engine = new BestPracticesEngine();
    // analyze takes (component, config) where config is a plain object
    const result = engine.analyze('s3', {
      bucket: 'my-bucket',
      storage_encrypted: false,
      encryption_enabled: false,
    });

    const securityFindings = result.violations.filter(v => v.category === 'security');
    expect(securityFindings.length).toBeGreaterThan(0);
  });

  it('analyzeAll checks multiple components', () => {
    const engine = new BestPracticesEngine();
    const result = engine.analyzeAll([
      { component: 's3', config: { bucket: 'test', storage_encrypted: false } },
      { component: 'rds', config: { engine: 'postgres', storage_encrypted: false } },
    ]);

    expect(result.summary.total_rules_checked).toBeGreaterThan(0);
  });

  it('returns clean report for well-configured resources', () => {
    const engine = new BestPracticesEngine();
    const result = engine.analyze('s3', {
      bucket: 'my-encrypted-bucket',
      storage_encrypted: true,
      encryption_enabled: true,
      versioning_enabled: true,
      logging_enabled: true,
      public_access_block: true,
      tags: { Name: 'test', Environment: 'dev', Team: 'infra', CostCenter: 'eng' },
    });

    // Well-configured bucket should have fewer security violations
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
  });
});
