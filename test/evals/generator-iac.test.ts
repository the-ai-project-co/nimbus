/**
 * E2E Tests -- IaC Generator Pipeline
 *
 * Validates intent parsing (heuristic fallback), Terraform project generation,
 * Kubernetes manifest generation, Helm chart generation, and the
 * BestPracticesEngine security/cost/tagging analysis.
 */

import { describe, test, expect, beforeEach } from 'vitest';

import {
  IntentParser,
  type ConversationalIntent,
} from '../../src/generator/intent-parser';
import {
  TerraformProjectGenerator,
  type TerraformProjectConfig,
  type GeneratedProject,
} from '../../src/generator/terraform';
import {
  KubernetesGenerator,
  type K8sGeneratorConfig,
  type GeneratedManifest,
} from '../../src/generator/kubernetes';
import {
  HelmGenerator,
  type HelmChartConfig,
} from '../../src/generator/helm';
import {
  BestPracticesEngine,
  type BestPracticeReport,
} from '../../src/generator/best-practices';

// ---------------------------------------------------------------------------
// 1. IntentParser -- heuristic (no LLM router)
// ---------------------------------------------------------------------------

describe('IntentParser', () => {
  let parser: IntentParser;

  beforeEach(() => {
    // No LLM router -- exercises the heuristic/regex path only
    parser = new IntentParser();
  });

  test('extracts Terraform intent from "create a VPC with 3 subnets"', async () => {
    const result: ConversationalIntent = await parser.parse(
      'create a VPC with 3 subnets'
    );

    expect(result.type).toBe('generate');
    expect(result.confidence).toBeGreaterThan(0);

    const componentEntity = result.entities.find(
      (e) => e.type === 'component'
    );
    expect(componentEntity).toBeDefined();
    expect(componentEntity!.value).toBe('vpc');
  });

  test('extracts K8s intent from "deploy nginx with 3 replicas"', async () => {
    const result: ConversationalIntent = await parser.parse(
      'deploy nginx with 3 replicas'
    );

    expect(result.type).toBe('generate');
    expect(result.confidence).toBeGreaterThan(0);
  });

  test('extracts Helm intent from "install redis chart"', async () => {
    const result: ConversationalIntent = await parser.parse(
      'install redis chart'
    );

    // "chart" keyword triggers the helm generation_type via matchByKeywords
    expect(result.type).toBe('generate');

    const genTypeEntity = result.entities.find(
      (e) => e.type === 'generation_type'
    );
    expect(genTypeEntity).toBeDefined();
    expect(genTypeEntity!.value).toBe('helm');
  });
});

// ---------------------------------------------------------------------------
// 2. TerraformProjectGenerator
// ---------------------------------------------------------------------------

describe('TerraformProjectGenerator', () => {
  let generator: TerraformProjectGenerator;
  let vpcProject: GeneratedProject;
  let ec2Project: GeneratedProject;

  const vpcConfig: TerraformProjectConfig = {
    projectName: 'test-vpc-project',
    provider: 'aws',
    region: 'us-east-1',
    environment: 'dev',
    components: ['vpc'],
  };

  const ec2Config: TerraformProjectConfig = {
    projectName: 'test-ec2-project',
    provider: 'aws',
    region: 'us-west-2',
    environment: 'dev',
    components: ['vpc', 'eks'],
  };

  beforeEach(async () => {
    generator = new TerraformProjectGenerator();
    vpcProject = await generator.generate(vpcConfig);
    ec2Project = await generator.generate(ec2Config);
  });

  test('produces valid HCL for VPC', () => {
    const mainTf = vpcProject.files.find((f) => f.path === 'main.tf');
    expect(mainTf).toBeDefined();
    expect(mainTf!.content).toContain('module "vpc"');
    expect(mainTf!.content).toContain('source = "./modules/vpc"');

    // Module files must exist
    const vpcModuleMain = vpcProject.files.find(
      (f) => f.path === 'modules/vpc/main.tf'
    );
    expect(vpcModuleMain).toBeDefined();
    expect(vpcModuleMain!.content.length).toBeGreaterThan(0);
  });

  test('produces valid HCL for EKS (EC2 node groups)', () => {
    const mainTf = ec2Project.files.find((f) => f.path === 'main.tf');
    expect(mainTf).toBeDefined();
    expect(mainTf!.content).toContain('module "eks"');
    expect(mainTf!.content).toContain('node_instance_type');

    const eksModuleMain = ec2Project.files.find(
      (f) => f.path === 'modules/eks/main.tf'
    );
    expect(eksModuleMain).toBeDefined();
  });

  test('includes provider block', () => {
    const mainTf = vpcProject.files.find((f) => f.path === 'main.tf');
    expect(mainTf).toBeDefined();
    expect(mainTf!.content).toContain('provider "aws"');
    expect(mainTf!.content).toContain('region = var.region');
  });

  test('includes required root files (main, variables, outputs, versions, backend)', () => {
    const paths = vpcProject.files.map((f) => f.path);
    expect(paths).toContain('main.tf');
    expect(paths).toContain('variables.tf');
    expect(paths).toContain('outputs.tf');
    expect(paths).toContain('versions.tf');
    expect(paths).toContain('backend.tf');
  });

  test('generated code includes terraform required_version block', () => {
    const versionsTf = vpcProject.files.find(
      (f) => f.path === 'versions.tf'
    );
    expect(versionsTf).toBeDefined();
    expect(versionsTf!.content).toContain('required_version');
    expect(versionsTf!.content).toContain('required_providers');
  });

  test('validation passes for well-formed project', () => {
    expect(vpcProject.validation.valid).toBe(true);
    expect(vpcProject.validation.summary.errors).toBe(0);
  });

  test('generates environment-specific tfvars', () => {
    const paths = vpcProject.files.map((f) => f.path);
    expect(paths).toContain('environments/dev/terraform.tfvars');
    expect(paths).toContain('environments/staging/terraform.tfvars');
    expect(paths).toContain('environments/prod/terraform.tfvars');
  });
});

// ---------------------------------------------------------------------------
// 3. KubernetesGenerator
// ---------------------------------------------------------------------------

describe('KubernetesGenerator', () => {
  test('produces valid Deployment YAML', () => {
    const config: K8sGeneratorConfig = {
      appName: 'test-app',
      workloadType: 'deployment',
      image: 'nginx',
      replicas: 3,
    };

    const gen = new KubernetesGenerator(config);
    const manifests: GeneratedManifest[] = gen.generate();

    const deployment = manifests.find((m) => m.kind === 'Deployment');
    expect(deployment).toBeDefined();
    expect(deployment!.content).toContain('kind: Deployment');
    expect(deployment!.content).toContain('replicas: 3');
    expect(deployment!.content).toContain('image: nginx:latest');
  });

  test('produces valid Service YAML', () => {
    const config: K8sGeneratorConfig = {
      appName: 'test-svc',
      workloadType: 'deployment',
      image: 'nginx',
      serviceType: 'ClusterIP',
      containerPort: 8080,
    };

    const gen = new KubernetesGenerator(config);
    const manifests = gen.generate();

    const service = manifests.find((m) => m.kind === 'Service');
    expect(service).toBeDefined();
    expect(service!.content).toContain('kind: Service');
    expect(service!.content).toContain('type: ClusterIP');
    expect(service!.content).toContain('port: 8080');
  });

  test('produces ConfigMap and Secret', () => {
    const config: K8sGeneratorConfig = {
      appName: 'test-cm',
      workloadType: 'deployment',
      image: 'myapp',
      configMap: {
        data: { APP_ENV: 'production', LOG_LEVEL: 'info' },
      },
      secret: {
        data: { DB_PASSWORD: 'supersecret' },
      },
    };

    const gen = new KubernetesGenerator(config);
    const manifests = gen.generate();

    const configMap = manifests.find((m) => m.kind === 'ConfigMap');
    expect(configMap).toBeDefined();
    expect(configMap!.content).toContain('kind: ConfigMap');
    expect(configMap!.content).toContain('APP_ENV');

    const secret = manifests.find((m) => m.kind === 'Secret');
    expect(secret).toBeDefined();
    expect(secret!.content).toContain('kind: Secret');
    // Secret data should be base64-encoded
    const b64Password = Buffer.from('supersecret').toString('base64');
    expect(secret!.content).toContain(b64Password);
  });

  test('includes standard Kubernetes labels', () => {
    const config: K8sGeneratorConfig = {
      appName: 'label-test',
      workloadType: 'deployment',
      image: 'nginx',
    };

    const gen = new KubernetesGenerator(config);
    const manifests = gen.generate();
    const deployment = manifests.find((m) => m.kind === 'Deployment');

    expect(deployment!.content).toContain('app.kubernetes.io/name: label-test');
    expect(deployment!.content).toContain('app.kubernetes.io/managed-by: nimbus');
  });
});

// ---------------------------------------------------------------------------
// 4. HelmGenerator
// ---------------------------------------------------------------------------

describe('HelmGenerator', () => {
  test('creates Chart.yaml with correct structure', () => {
    const config: HelmChartConfig = {
      name: 'my-redis',
      version: '1.0.0',
      appVersion: '7.2.0',
      description: 'Redis Helm chart',
      values: {
        image: { repository: 'redis', tag: '7.2.0' },
      },
    };

    const gen = new HelmGenerator(config);
    const files = gen.generate();

    const chartYaml = files.find((f) => f.path === 'Chart.yaml');
    expect(chartYaml).toBeDefined();
    expect(chartYaml!.content).toContain('apiVersion: v2');
    expect(chartYaml!.content).toContain('name: my-redis');
    expect(chartYaml!.content).toContain("version: 1.0.0");
    expect(chartYaml!.content).toContain("appVersion: 7.2.0");
    expect(chartYaml!.content).toContain('type: application');
  });

  test('creates values.yaml with template references', () => {
    const config: HelmChartConfig = {
      name: 'test-chart',
      values: {
        replicaCount: 2,
        image: { repository: 'nginx', tag: '1.25', pullPolicy: 'IfNotPresent' },
        service: { type: 'LoadBalancer', port: 80 },
        resources: {
          limits: { cpu: '500m', memory: '256Mi' },
          requests: { cpu: '250m', memory: '128Mi' },
        },
      },
    };

    const gen = new HelmGenerator(config);
    const files = gen.generate();

    const valuesYaml = files.find((f) => f.path === 'values.yaml');
    expect(valuesYaml).toBeDefined();
    expect(valuesYaml!.content).toContain('replicaCount: 2');
    expect(valuesYaml!.content).toContain('repository: nginx');

    // Deployment template should reference Helm template values
    const deploymentTpl = files.find(
      (f) => f.path === 'templates/deployment.yaml'
    );
    expect(deploymentTpl).toBeDefined();
    expect(deploymentTpl!.content).toContain('.Values.replicaCount');
    expect(deploymentTpl!.content).toContain('.Values.image.repository');
  });

  test('generates _helpers.tpl with named templates', () => {
    const config: HelmChartConfig = {
      name: 'helper-test',
      values: {
        image: { repository: 'myapp' },
      },
    };

    const gen = new HelmGenerator(config);
    const files = gen.generate();

    const helpers = files.find((f) => f.path === 'templates/_helpers.tpl');
    expect(helpers).toBeDefined();
    expect(helpers!.content).toContain('define "helper-test.fullname"');
    expect(helpers!.content).toContain('define "helper-test.labels"');
    expect(helpers!.content).toContain('define "helper-test.selectorLabels"');
  });

  test('generates service template', () => {
    const config: HelmChartConfig = {
      name: 'svc-test',
      values: {
        image: { repository: 'nginx' },
      },
    };

    const gen = new HelmGenerator(config);
    const files = gen.generate();

    const svcTpl = files.find((f) => f.path === 'templates/service.yaml');
    expect(svcTpl).toBeDefined();
    expect(svcTpl!.content).toContain('kind: Service');
    expect(svcTpl!.content).toContain('.Values.service.type');
    expect(svcTpl!.content).toContain('.Values.service.port');
  });
});

// ---------------------------------------------------------------------------
// 5. BestPracticesEngine
// ---------------------------------------------------------------------------

describe('BestPracticesEngine', () => {
  let engine: BestPracticesEngine;

  beforeEach(() => {
    engine = new BestPracticesEngine();
  });

  test('flags security violations for unencrypted S3', () => {
    const report: BestPracticeReport = engine.analyze('s3', {
      storage_encrypted: false,
      encryption_enabled: false,
      block_public_acls: false,
      block_public_policy: false,
      ignore_public_acls: false,
      restrict_public_buckets: false,
    });

    expect(report.violations.length).toBeGreaterThan(0);

    const securityViolations = report.violations.filter(
      (v) => v.category === 'security'
    );
    expect(securityViolations.length).toBeGreaterThan(0);

    // Should flag encryption and public access
    const ruleIds = securityViolations.map((v) => v.rule_id);
    expect(ruleIds).toContain('sec-001'); // Encryption at rest
    expect(ruleIds).toContain('sec-003'); // Block public access
  });

  test('flags cost inefficiencies for non-production VPC', () => {
    const report: BestPracticeReport = engine.analyze('vpc', {
      environment: 'development',
      single_nat_gateway: false,
      enable_flow_logs: true,
    });

    const costViolations = report.violations.filter(
      (v) => v.category === 'cost'
    );
    expect(costViolations.length).toBeGreaterThan(0);

    // Should flag multi-NAT in non-production
    const ruleIds = costViolations.map((v) => v.rule_id);
    expect(ruleIds).toContain('cost-002');
  });

  test('validates required tags are present', () => {
    const report: BestPracticeReport = engine.analyze('vpc', {
      // No tags at all
      enable_flow_logs: true,
    });

    const taggingViolations = report.violations.filter(
      (v) => v.category === 'tagging'
    );
    expect(taggingViolations.length).toBeGreaterThan(0);

    const ruleIds = taggingViolations.map((v) => v.rule_id);
    expect(ruleIds).toContain('tag-001'); // Mandatory tags
  });

  test('passes when all required tags are present', () => {
    const report: BestPracticeReport = engine.analyze('s3', {
      storage_encrypted: true,
      encryption_enabled: true,
      block_public_acls: true,
      block_public_policy: true,
      ignore_public_acls: true,
      restrict_public_buckets: true,
      enable_versioning: true,
      enable_lifecycle_rules: true,
      tags: {
        Environment: 'production',
        ManagedBy: 'Terraform',
        Project: 'my-project',
        CostCenter: 'CC-123',
      },
    });

    const taggingViolations = report.violations.filter(
      (v) => v.rule_id === 'tag-001'
    );
    expect(taggingViolations).toHaveLength(0);
  });

  test('provides autofixable violation counts', () => {
    const report: BestPracticeReport = engine.analyze('s3', {
      storage_encrypted: false,
      encryption_enabled: false,
    });

    expect(report.summary.autofixable_violations).toBeGreaterThan(0);

    const autofixable = report.violations.filter((v) => v.can_autofix);
    expect(autofixable.length).toBe(report.summary.autofixable_violations);
  });

  test('analyzeAll aggregates violations from multiple components', () => {
    const report = engine.analyzeAll([
      { component: 's3', config: { storage_encrypted: false } },
      { component: 'vpc', config: { enable_flow_logs: false } },
    ]);

    expect(report.violations.length).toBeGreaterThan(0);

    const s3Violations = report.violations.filter(
      (v) => v.component === 's3'
    );
    const vpcViolations = report.violations.filter(
      (v) => v.component === 'vpc'
    );

    expect(s3Violations.length).toBeGreaterThan(0);
    expect(vpcViolations.length).toBeGreaterThan(0);
  });
});
