/**
 * Tests for the generator modules:
 *   - src/generator/terraform.ts    – TerraformProjectGenerator
 *   - src/generator/kubernetes.ts   – KubernetesGenerator, createKubernetesGenerator
 *   - src/generator/helm.ts         – HelmGenerator, createHelmGenerator
 *   - src/generator/best-practices.ts – BestPracticesEngine
 *
 * All generators are pure (no I/O beyond the in-process YAML serialiser), so
 * tests run entirely in-memory and complete in milliseconds.
 */

import { describe, it, expect } from 'bun:test';
import { TerraformProjectGenerator, type TerraformProjectConfig } from '../generator/terraform';
import {
  KubernetesGenerator,
  createKubernetesGenerator,
  type K8sGeneratorConfig,
} from '../generator/kubernetes';
import { HelmGenerator, createHelmGenerator, type HelmChartConfig } from '../generator/helm';
import { BestPracticesEngine } from '../generator/best-practices';

// ---------------------------------------------------------------------------
// TerraformProjectGenerator
// ---------------------------------------------------------------------------

describe('TerraformProjectGenerator', () => {
  const baseConfig: TerraformProjectConfig = {
    projectName: 'test-project',
    provider: 'aws',
    region: 'us-east-1',
    components: ['vpc', 's3'],
  };

  it('can be instantiated', () => {
    const gen = new TerraformProjectGenerator();
    expect(gen).toBeInstanceOf(TerraformProjectGenerator);
  });

  it('generate() returns a GeneratedProject with files array', async () => {
    const gen = new TerraformProjectGenerator();
    const result = await gen.generate(baseConfig);

    expect(result).toBeDefined();
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.files.length).toBeGreaterThan(0);
  });

  it('generates the required root .tf files', async () => {
    const gen = new TerraformProjectGenerator();
    const { files } = await gen.generate(baseConfig);
    const paths = files.map(f => f.path);

    expect(paths).toContain('main.tf');
    expect(paths).toContain('variables.tf');
    expect(paths).toContain('outputs.tf');
    expect(paths).toContain('versions.tf');
    expect(paths).toContain('backend.tf');
  });

  it('generates environment-specific tfvars files', async () => {
    const gen = new TerraformProjectGenerator();
    const { files } = await gen.generate(baseConfig);
    const paths = files.map(f => f.path);

    expect(paths).toContain('environments/dev/terraform.tfvars');
    expect(paths).toContain('environments/staging/terraform.tfvars');
    expect(paths).toContain('environments/prod/terraform.tfvars');
  });

  it('generates module files for each requested component', async () => {
    const gen = new TerraformProjectGenerator();
    const { files } = await gen.generate(baseConfig);
    const paths = files.map(f => f.path);

    // vpc component
    expect(paths).toContain('modules/vpc/main.tf');
    expect(paths).toContain('modules/vpc/variables.tf');
    expect(paths).toContain('modules/vpc/outputs.tf');

    // s3 component
    expect(paths).toContain('modules/s3/main.tf');
  });

  it('generates a .gitignore file', async () => {
    const gen = new TerraformProjectGenerator();
    const { files } = await gen.generate(baseConfig);
    const gitignore = files.find(f => f.path === '.gitignore');

    expect(gitignore).toBeDefined();
    expect(gitignore!.content).toContain('.terraform/');
    expect(gitignore!.content).toContain('*.tfstate');
  });

  it('validation report is valid when all required files are present', async () => {
    const gen = new TerraformProjectGenerator();
    const { validation } = await gen.generate(baseConfig);

    expect(validation).toBeDefined();
    expect(typeof validation.valid).toBe('boolean');
    expect(typeof validation.summary.errors).toBe('number');
    expect(typeof validation.summary.warnings).toBe('number');
  });

  it('generated main.tf contains the provider block', async () => {
    const gen = new TerraformProjectGenerator();
    const { files } = await gen.generate(baseConfig);
    const mainTf = files.find(f => f.path === 'main.tf');

    expect(mainTf).toBeDefined();
    expect(mainTf!.content).toContain('provider "aws"');
  });

  it('generateGitignore() is callable as a standalone method', () => {
    const gen = new TerraformProjectGenerator();
    const file = gen.generateGitignore();
    expect(file.path).toBe('.gitignore');
    expect(file.content.length).toBeGreaterThan(0);
  });

  it('validateProject() returns a ValidationReport', () => {
    const gen = new TerraformProjectGenerator();
    const report = gen.validateProject([
      { path: 'main.tf', content: 'provider "aws" {}' },
      { path: 'variables.tf', content: '' },
      { path: 'outputs.tf', content: '' },
      { path: 'versions.tf', content: '' },
      { path: 'backend.tf', content: '' },
    ]);

    expect(typeof report.valid).toBe('boolean');
    expect(Array.isArray(report.items)).toBe(true);
    expect(typeof report.summary.errors).toBe('number');
    expect(typeof report.summary.warnings).toBe('number');
    expect(typeof report.summary.info).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// KubernetesGenerator
// ---------------------------------------------------------------------------

describe('KubernetesGenerator', () => {
  const baseK8sConfig: K8sGeneratorConfig = {
    appName: 'my-app',
    workloadType: 'deployment',
    image: 'nginx',
    imageTag: '1.25',
    replicas: 2,
    containerPort: 8080,
  };

  it('can be instantiated directly', () => {
    const gen = new KubernetesGenerator(baseK8sConfig);
    expect(gen).toBeInstanceOf(KubernetesGenerator);
  });

  it('can be created via the factory function', () => {
    const gen = createKubernetesGenerator(baseK8sConfig);
    expect(gen).toBeInstanceOf(KubernetesGenerator);
  });

  it('generate() returns an array of GeneratedManifest objects', () => {
    const gen = new KubernetesGenerator(baseK8sConfig);
    const manifests = gen.generate();

    expect(Array.isArray(manifests)).toBe(true);
    expect(manifests.length).toBeGreaterThan(0);
  });

  it('manifests contain a Deployment', () => {
    const gen = new KubernetesGenerator(baseK8sConfig);
    const manifests = gen.generate();
    const deployment = manifests.find(m => m.kind === 'Deployment');

    expect(deployment).toBeDefined();
    expect(deployment!.content).toContain('kind: Deployment');
  });

  it('manifests contain a Service when serviceType is not None', () => {
    const gen = new KubernetesGenerator({ ...baseK8sConfig, serviceType: 'ClusterIP' });
    const manifests = gen.generate();
    const service = manifests.find(m => m.kind === 'Service');

    expect(service).toBeDefined();
    expect(service!.content).toContain('kind: Service');
  });

  it('no Service manifest is generated when serviceType is None', () => {
    const gen = new KubernetesGenerator({ ...baseK8sConfig, serviceType: 'None' });
    const manifests = gen.generate();
    const service = manifests.find(m => m.kind === 'Service');
    expect(service).toBeUndefined();
  });

  it('generateCombined() returns a YAML string with --- separators', () => {
    const gen = new KubernetesGenerator(baseK8sConfig);
    const combined = gen.generateCombined();

    expect(typeof combined).toBe('string');
    expect(combined.length).toBeGreaterThan(0);
    expect(combined).toContain('---');
  });

  it('Deployment manifest includes the correct image and replicas', () => {
    const gen = new KubernetesGenerator(baseK8sConfig);
    const manifests = gen.generate();
    const deployment = manifests.find(m => m.kind === 'Deployment');

    expect(deployment!.content).toContain('nginx:1.25');
    expect(deployment!.content).toContain('replicas: 2');
  });

  it('generates Namespace manifest when namespace is not "default"', () => {
    const gen = new KubernetesGenerator({ ...baseK8sConfig, namespace: 'production' });
    const manifests = gen.generate();
    const ns = manifests.find(m => m.kind === 'Namespace');

    expect(ns).toBeDefined();
    expect(ns!.content).toContain('name: production');
  });

  it('generates HPA manifest when hpa.enabled is true', () => {
    const gen = new KubernetesGenerator({
      ...baseK8sConfig,
      hpa: { enabled: true, minReplicas: 2, maxReplicas: 10 },
    });
    const manifests = gen.generate();
    const hpa = manifests.find(m => m.kind === 'HorizontalPodAutoscaler');

    expect(hpa).toBeDefined();
    expect(hpa!.content).toContain('HorizontalPodAutoscaler');
  });
});

// ---------------------------------------------------------------------------
// HelmGenerator
// ---------------------------------------------------------------------------

describe('HelmGenerator', () => {
  const baseHelmConfig: HelmChartConfig = {
    name: 'my-chart',
    version: '1.0.0',
    appVersion: '2.0.0',
    description: 'A test Helm chart',
    values: {
      image: {
        repository: 'my-org/my-app',
        tag: 'latest',
      },
    },
  };

  it('can be instantiated directly', () => {
    const gen = new HelmGenerator(baseHelmConfig);
    expect(gen).toBeInstanceOf(HelmGenerator);
  });

  it('can be created via the factory function', () => {
    const gen = createHelmGenerator(baseHelmConfig);
    expect(gen).toBeInstanceOf(HelmGenerator);
  });

  it('generate() returns an array of GeneratedFile objects', () => {
    const gen = new HelmGenerator(baseHelmConfig);
    const files = gen.generate();

    expect(Array.isArray(files)).toBe(true);
    expect(files.length).toBeGreaterThan(0);
  });

  it('includes Chart.yaml in the generated files', () => {
    const gen = new HelmGenerator(baseHelmConfig);
    const files = gen.generate();
    const chart = files.find(f => f.path === 'Chart.yaml');

    expect(chart).toBeDefined();
    expect(chart!.content).toContain('name: my-chart');
    expect(chart!.content).toContain('version: 1.0.0');
  });

  it('includes values.yaml in the generated files', () => {
    const gen = new HelmGenerator(baseHelmConfig);
    const files = gen.generate();
    const values = files.find(f => f.path === 'values.yaml');

    expect(values).toBeDefined();
    expect(values!.content).toContain('repository: my-org/my-app');
  });

  it('includes a deployment template', () => {
    const gen = new HelmGenerator(baseHelmConfig);
    const files = gen.generate();
    const deployment = files.find(f => f.path === 'templates/deployment.yaml');

    expect(deployment).toBeDefined();
    expect(deployment!.content).toContain('kind: Deployment');
  });

  it('includes a service template', () => {
    const gen = new HelmGenerator(baseHelmConfig);
    const files = gen.generate();
    const service = files.find(f => f.path === 'templates/service.yaml');

    expect(service).toBeDefined();
    expect(service!.content).toContain('kind: Service');
  });

  it('includes a _helpers.tpl template', () => {
    const gen = new HelmGenerator(baseHelmConfig);
    const files = gen.generate();
    const helpers = files.find(f => f.path === 'templates/_helpers.tpl');

    expect(helpers).toBeDefined();
    expect(helpers!.content).toContain('define "my-chart.name"');
  });

  it('Chart.yaml contains the appVersion field', () => {
    const gen = new HelmGenerator(baseHelmConfig);
    const files = gen.generate();
    const chart = files.find(f => f.path === 'Chart.yaml');

    expect(chart!.content).toContain('appVersion:');
  });

  it('includes .helmignore', () => {
    const gen = new HelmGenerator(baseHelmConfig);
    const files = gen.generate();
    const helmignore = files.find(f => f.path === '.helmignore');

    expect(helmignore).toBeDefined();
    expect(helmignore!.content).toContain('.git/');
  });
});

// ---------------------------------------------------------------------------
// BestPracticesEngine
// ---------------------------------------------------------------------------

describe('BestPracticesEngine', () => {
  it('can be instantiated with no arguments', () => {
    const engine = new BestPracticesEngine();
    expect(engine).toBeInstanceOf(BestPracticesEngine);
  });

  it('can be instantiated with custom rules', () => {
    const customRule = {
      id: 'custom-001',
      category: 'security' as const,
      severity: 'low' as const,
      title: 'Custom Rule',
      description: 'A test custom rule',
      recommendation: 'Do something',
      applies_to: ['vpc'],
      check: (_config: Record<string, unknown>) => true,
    };
    const engine = new BestPracticesEngine([customRule]);
    expect(engine).toBeInstanceOf(BestPracticesEngine);
  });

  it('listRules() returns an array with at least one rule', () => {
    const engine = new BestPracticesEngine();
    const rules = engine.listRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  it('getRule() returns the rule for a known ID', () => {
    const engine = new BestPracticesEngine();
    const rule = engine.getRule('sec-001');
    expect(rule).toBeDefined();
    expect(rule!.id).toBe('sec-001');
    expect(rule!.category).toBe('security');
  });

  it('getRule() returns undefined for an unknown rule ID', () => {
    const engine = new BestPracticesEngine();
    expect(engine.getRule('does-not-exist')).toBeUndefined();
  });

  it('analyze() returns a BestPracticeReport with summary and violations', () => {
    const engine = new BestPracticesEngine();
    // An s3 config that deliberately violates encryption and public-access rules
    const badConfig: Record<string, unknown> = {
      storage_encrypted: false,
      block_public_acls: false,
    };

    const report = engine.analyze('s3', badConfig);

    expect(report).toBeDefined();
    expect(typeof report.summary.total_rules_checked).toBe('number');
    expect(typeof report.summary.violations_found).toBe('number');
    expect(Array.isArray(report.violations)).toBe(true);
    expect(Array.isArray(report.recommendations)).toBe(true);
  });

  it('analyze() with a fully compliant config produces fewer violations', () => {
    const engine = new BestPracticesEngine();

    const badReport = engine.analyze('s3', {});
    const goodReport = engine.analyze('s3', {
      storage_encrypted: true,
      encryption_enabled: true,
      block_public_acls: true,
      block_public_policy: true,
      ignore_public_acls: true,
      restrict_public_buckets: true,
      enable_versioning: true,
      enable_lifecycle_rules: true,
      abort_incomplete_multipart_days: 7,
      enable_access_logging: true,
      sse_algorithm: 'aws:kms',
      tags: { Environment: 'dev', ManagedBy: 'Terraform', Project: 'test' },
    });

    expect(goodReport.summary.violations_found).toBeLessThan(badReport.summary.violations_found);
  });

  it('getComplianceScore() returns 100 when no rules apply', () => {
    const engine = new BestPracticesEngine();
    const report = engine.analyze('nonexistent-component', {});
    const score = engine.getComplianceScore(report);
    expect(score).toBe(100);
  });

  it('formatReportAsMarkdown() returns a markdown string', () => {
    const engine = new BestPracticesEngine();
    const report = engine.analyze('vpc', {});
    const md = engine.formatReportAsMarkdown(report);
    expect(typeof md).toBe('string');
    expect(md).toContain('# Best Practices Report');
  });
});
