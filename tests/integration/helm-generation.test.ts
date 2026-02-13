/**
 * Helm Chart Generation Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';
import { execSync } from 'node:child_process';

describe('Helm Chart Generation Integration', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-gen-int-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Chart Structure Validation', () => {
    it('should generate valid Helm chart structure', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const chartDir = path.join(tempDir, 'structure-test');
      const generator = new HelmGenerator({
        name: 'my-app',
        version: '1.0.0',
        values: {
          image: { repository: 'nginx' },
        },
      });

      generator.writeToFiles(chartDir);

      const chartPath = path.join(chartDir, 'my-app');

      // Check required files exist
      expect(fs.existsSync(path.join(chartPath, 'Chart.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'values.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, '.helmignore'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates', '_helpers.tpl'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates', 'deployment.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates', 'service.yaml'))).toBe(true);
    });

    it('should generate valid Chart.yaml', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'chart-yaml-test',
        version: '2.0.0',
        appVersion: '3.0.0',
        description: 'A test chart',
        type: 'application',
        keywords: ['test', 'sample'],
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.apiVersion).toBe('v2');
      expect(parsed.name).toBe('chart-yaml-test');
      expect(parsed.version).toBe('2.0.0');
      expect(parsed.appVersion).toBe('3.0.0');
      expect(parsed.description).toBe('A test chart');
      expect(parsed.type).toBe('application');
      expect(parsed.keywords).toContain('test');
    });
  });

  describe('Helm Lint Validation', () => {
    it('should pass helm lint if available', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const chartDir = path.join(tempDir, 'lint-test');
      const generator = new HelmGenerator({
        name: 'lint-test',
        version: '1.0.0',
        values: {
          image: { repository: 'nginx', tag: '1.21' },
          replicaCount: 2,
          service: { type: 'ClusterIP', port: 80 },
        },
      });

      generator.writeToFiles(chartDir);
      const chartPath = path.join(chartDir, 'lint-test');

      try {
        const result = execSync(`helm lint ${chartPath} 2>&1`, { encoding: 'utf-8' });
        expect(result).toContain('0 chart(s) failed');
      } catch (error: any) {
        if (error.message.includes('command not found') || error.message.includes('ENOENT')) {
          console.log('helm not available, skipping lint validation');
        } else {
          // Real lint error
          console.log('Helm lint output:', error.stdout || error.message);
          throw error;
        }
      }
    });
  });

  describe('Template Rendering', () => {
    it('should render templates correctly with helm template if available', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const chartDir = path.join(tempDir, 'template-test');
      const generator = new HelmGenerator({
        name: 'template-test',
        version: '1.0.0',
        values: {
          image: { repository: 'myapp', tag: 'v1.0.0' },
          replicaCount: 3,
          service: { type: 'LoadBalancer', port: 8080 },
          resources: {
            limits: { cpu: '500m', memory: '512Mi' },
            requests: { cpu: '100m', memory: '128Mi' },
          },
        },
      });

      generator.writeToFiles(chartDir);
      const chartPath = path.join(chartDir, 'template-test');

      try {
        const result = execSync(`helm template test-release ${chartPath} 2>&1`, {
          encoding: 'utf-8',
        });

        // Verify rendered output
        expect(result).toContain('kind: Deployment');
        expect(result).toContain('kind: Service');
        expect(result).toContain('image: "myapp:v1.0.0"');
        expect(result).toContain('replicas: 3');
        expect(result).toContain('type: LoadBalancer');
      } catch (error: any) {
        if (error.message.includes('command not found') || error.message.includes('ENOENT')) {
          console.log('helm not available, skipping template validation');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Dependencies', () => {
    it('should include dependencies in Chart.yaml', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'app-with-deps',
        version: '1.0.0',
        dependencies: [
          {
            name: 'postgresql',
            version: '12.x.x',
            repository: 'https://charts.bitnami.com/bitnami',
            condition: 'postgresql.enabled',
          },
          {
            name: 'redis',
            version: '17.x.x',
            repository: 'https://charts.bitnami.com/bitnami',
            condition: 'redis.enabled',
          },
        ],
        values: {
          image: { repository: 'myapp' },
        },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.dependencies).toHaveLength(2);
      expect(parsed.dependencies[0].name).toBe('postgresql');
      expect(parsed.dependencies[0].condition).toBe('postgresql.enabled');
      expect(parsed.dependencies[1].name).toBe('redis');
    });
  });

  describe('Values Configuration', () => {
    it('should generate comprehensive values.yaml', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'values-test',
        values: {
          image: { repository: 'nginx', tag: 'stable', pullPolicy: 'Always' },
          replicaCount: 5,
          serviceAccount: { create: true, name: 'custom-sa' },
          service: { type: 'NodePort', port: 3000 },
          ingress: {
            enabled: true,
            className: 'nginx',
            hosts: [{ host: 'app.example.com', paths: [{ path: '/', pathType: 'Prefix' }] }],
          },
          autoscaling: {
            enabled: true,
            minReplicas: 3,
            maxReplicas: 50,
            targetCPUUtilizationPercentage: 70,
          },
          resources: {
            limits: { cpu: '1', memory: '1Gi' },
            requests: { cpu: '500m', memory: '512Mi' },
          },
          nodeSelector: { 'node-type': 'worker' },
          env: [
            { name: 'LOG_LEVEL', value: 'debug' },
            { name: 'ENV', value: 'production' },
          ],
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.replicaCount).toBe(5);
      expect(parsed.image.pullPolicy).toBe('Always');
      expect(parsed.serviceAccount.create).toBe(true);
      expect(parsed.service.type).toBe('NodePort');
      expect(parsed.ingress.enabled).toBe(true);
      expect(parsed.autoscaling.enabled).toBe(true);
      expect(parsed.autoscaling.maxReplicas).toBe(50);
      expect(parsed.resources.limits.cpu).toBe('1');
      expect(parsed.nodeSelector['node-type']).toBe('worker');
      expect(parsed.env).toHaveLength(2);
    });
  });

  describe('Helper Templates', () => {
    it('should generate correct helper templates', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'helper-test',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const helpersFile = files.find(f => f.path === 'templates/_helpers.tpl');

      expect(helpersFile!.content).toContain('define "helper-test.name"');
      expect(helpersFile!.content).toContain('define "helper-test.fullname"');
      expect(helpersFile!.content).toContain('define "helper-test.chart"');
      expect(helpersFile!.content).toContain('define "helper-test.labels"');
      expect(helpersFile!.content).toContain('define "helper-test.selectorLabels"');
      expect(helpersFile!.content).toContain('define "helper-test.serviceAccountName"');
    });
  });
});

describe('Helm Chart Structure and Advanced Generation', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-adv-int-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Chart structure validation on disk', () => {
    it('should write Chart.yaml, values.yaml, and templates/ directory to disk', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const chartDir = path.join(tempDir, 'disk-structure-test');
      const generator = new HelmGenerator({
        name: 'disk-chart',
        version: '1.2.3',
        appVersion: '2.0.0',
        description: 'Chart written to disk for structure validation',
        values: {
          image: { repository: 'myapp', tag: 'stable' },
          replicaCount: 2,
          service: { type: 'ClusterIP', port: 8080 },
        },
      });

      const writtenFiles = generator.writeToFiles(chartDir);
      const chartPath = path.join(chartDir, 'disk-chart');

      // Verify all essential files exist
      expect(fs.existsSync(path.join(chartPath, 'Chart.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'values.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, '.helmignore'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates', '_helpers.tpl'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates', 'deployment.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates', 'service.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates', 'ingress.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates', 'hpa.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartPath, 'templates', 'NOTES.txt'))).toBe(true);

      // Verify returned file paths match written files
      expect(writtenFiles.length).toBeGreaterThan(0);
      for (const filePath of writtenFiles) {
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });

    it('should ensure templates directory is populated with template files', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const chartDir = path.join(tempDir, 'templates-dir-test');
      const generator = new HelmGenerator({
        name: 'tpl-dir-chart',
        values: {
          image: { repository: 'nginx' },
          serviceAccount: { create: true, name: 'my-sa' },
        },
      });

      generator.writeToFiles(chartDir);
      const templatesDir = path.join(chartDir, 'tpl-dir-chart', 'templates');

      expect(fs.existsSync(templatesDir)).toBe(true);

      const templateFiles = fs.readdirSync(templatesDir);
      expect(templateFiles).toContain('_helpers.tpl');
      expect(templateFiles).toContain('deployment.yaml');
      expect(templateFiles).toContain('service.yaml');
      expect(templateFiles).toContain('serviceaccount.yaml');
      expect(templateFiles).toContain('ingress.yaml');
      expect(templateFiles).toContain('hpa.yaml');
      expect(templateFiles).toContain('NOTES.txt');
    });
  });

  describe('Values file merge behavior when custom values provided', () => {
    it('should apply default values when only image is specified', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'defaults-chart',
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      // Verify provided values are present
      expect(parsed.image.repository).toBe('nginx');
      // Generator uses config.values directly — defaults come from Helm template
      // (e.g., .Chart.AppVersion for tag), not from values.yaml generation
      expect(parsed.serviceAccount.create).toBe(true);
      expect(parsed.service.type).toBe('ClusterIP');
      expect(parsed.service.port).toBe(80);
      expect(parsed.ingress.enabled).toBe(false);
      expect(parsed.autoscaling.enabled).toBe(false);
      expect(parsed.autoscaling.minReplicas).toBe(1);
      expect(parsed.autoscaling.maxReplicas).toBe(100);
      expect(parsed.autoscaling.targetCPUUtilizationPercentage).toBe(80);
    });

    it('should override defaults with custom values', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'custom-vals-chart',
        values: {
          image: { repository: 'myapp', tag: 'v3.0.0', pullPolicy: 'Always' },
          replicaCount: 10,
          service: { type: 'LoadBalancer', port: 9090 },
          ingress: { enabled: true, className: 'nginx' },
          autoscaling: {
            enabled: true,
            minReplicas: 5,
            maxReplicas: 200,
            targetCPUUtilizationPercentage: 50,
          },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.replicaCount).toBe(10);
      expect(parsed.image.repository).toBe('myapp');
      expect(parsed.image.tag).toBe('v3.0.0');
      expect(parsed.image.pullPolicy).toBe('Always');
      expect(parsed.service.type).toBe('LoadBalancer');
      expect(parsed.service.port).toBe(9090);
      expect(parsed.ingress.enabled).toBe(true);
      expect(parsed.ingress.className).toBe('nginx');
      expect(parsed.autoscaling.enabled).toBe(true);
      expect(parsed.autoscaling.minReplicas).toBe(5);
      expect(parsed.autoscaling.maxReplicas).toBe(200);
      expect(parsed.autoscaling.targetCPUUtilizationPercentage).toBe(50);
    });

    it('should preserve custom fields alongside defaults', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'mixed-vals-chart',
        values: {
          image: { repository: 'myapp' },
          nodeSelector: { 'kubernetes.io/arch': 'amd64' },
          tolerations: [{ key: 'special', operator: 'Exists', effect: 'NoSchedule' }],
          env: [{ name: 'APP_MODE', value: 'production' }],
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      // Custom fields should be preserved
      expect(parsed.nodeSelector['kubernetes.io/arch']).toBe('amd64');
      expect(parsed.tolerations).toHaveLength(1);
      expect(parsed.tolerations[0].key).toBe('special');
      expect(parsed.env).toHaveLength(1);
      expect(parsed.env[0].name).toBe('APP_MODE');

      // Defaults should still apply
      expect(parsed.replicaCount).toBe(1);
      expect(parsed.service.type).toBe('ClusterIP');
    });
  });

  describe('Template rendering with different value sets', () => {
    it('should generate deployment template with Helm template syntax', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'render-test',
        values: {
          image: { repository: 'nginx', tag: '1.25' },
          replicaCount: 3,
          service: { type: 'ClusterIP', port: 80 },
        },
      });

      const files = generator.generate();
      const deploymentFile = files.find(f => f.path === 'templates/deployment.yaml');
      expect(deploymentFile).toBeDefined();

      const content = deploymentFile!.content;
      // Verify Helm template directives are present
      expect(content).toContain('include "render-test.fullname" .');
      expect(content).toContain('include "render-test.labels" . | nindent 4');
      expect(content).toContain('include "render-test.selectorLabels" . | nindent');
      expect(content).toContain('.Values.replicaCount');
      expect(content).toContain('.Values.image.repository');
      expect(content).toContain('.Values.image.pullPolicy');
      expect(content).toContain('.Values.autoscaling.enabled');
    });

    it('should generate service template with Helm template syntax', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'svc-render-test',
        values: {
          image: { repository: 'myapp' },
          service: { type: 'NodePort', port: 3000 },
        },
      });

      const files = generator.generate();
      const serviceFile = files.find(f => f.path === 'templates/service.yaml');
      expect(serviceFile).toBeDefined();

      const content = serviceFile!.content;
      expect(content).toContain('apiVersion: v1');
      expect(content).toContain('kind: Service');
      expect(content).toContain('{{ include "svc-render-test.fullname" . }}');
      expect(content).toContain('{{ .Values.service.type }}');
      expect(content).toContain('{{ .Values.service.port }}');
    });

    it('should generate ingress template with conditional rendering', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'ingress-render-test',
        values: {
          image: { repository: 'myapp' },
          ingress: {
            enabled: true,
            className: 'nginx',
            hosts: [{ host: 'app.example.com', paths: [{ path: '/', pathType: 'Prefix' }] }],
          },
        },
      });

      const files = generator.generate();
      const ingressFile = files.find(f => f.path === 'templates/ingress.yaml');
      expect(ingressFile).toBeDefined();

      const content = ingressFile!.content;
      expect(content).toContain('{{- if .Values.ingress.enabled -}}');
      expect(content).toContain('kind: Ingress');
      expect(content).toContain('.Values.ingress.className');
      expect(content).toContain('.Values.ingress.hosts');
      expect(content).toContain('.Values.ingress.tls');
    });

    it('should generate HPA template with conditional rendering', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'hpa-render-test',
        values: {
          image: { repository: 'myapp' },
          autoscaling: {
            enabled: true,
            minReplicas: 2,
            maxReplicas: 10,
            targetCPUUtilizationPercentage: 70,
          },
        },
      });

      const files = generator.generate();
      const hpaFile = files.find(f => f.path === 'templates/hpa.yaml');
      expect(hpaFile).toBeDefined();

      const content = hpaFile!.content;
      expect(content).toContain('{{- if .Values.autoscaling.enabled }}');
      expect(content).toContain('kind: HorizontalPodAutoscaler');
      expect(content).toContain('{{ .Values.autoscaling.minReplicas }}');
      expect(content).toContain('{{ .Values.autoscaling.maxReplicas }}');
      expect(content).toContain('targetCPUUtilizationPercentage');
    });
  });

  describe('Chart metadata validation', () => {
    it('should set apiVersion to v2 in Chart.yaml', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'api-version-chart',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.apiVersion).toBe('v2');
    });

    it('should validate name, version, and description in Chart.yaml', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'metadata-chart',
        version: '3.2.1',
        appVersion: '5.0.0',
        description: 'A production-ready chart for metadata testing',
        type: 'application',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.name).toBe('metadata-chart');
      expect(parsed.version).toBe('3.2.1');
      expect(parsed.appVersion).toBe('5.0.0');
      expect(parsed.description).toBe('A production-ready chart for metadata testing');
      expect(parsed.type).toBe('application');
    });

    it('should apply default version and appVersion when not specified', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'default-version-chart',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.version).toBe('0.1.0');
      expect(parsed.appVersion).toBe('1.0.0');
      expect(parsed.type).toBe('application');
    });

    it('should include keywords in Chart.yaml when provided', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'keywords-chart',
        keywords: ['web', 'api', 'microservice'],
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.keywords).toBeInstanceOf(Array);
      expect(parsed.keywords).toContain('web');
      expect(parsed.keywords).toContain('api');
      expect(parsed.keywords).toContain('microservice');
    });

    it('should include maintainers in Chart.yaml when provided', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'maintainers-chart',
        maintainers: [
          { name: 'Team Lead', email: 'lead@example.com' },
          { name: 'DevOps', email: 'devops@example.com', url: 'https://devops.example.com' },
        ],
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.maintainers).toHaveLength(2);
      expect(parsed.maintainers[0].name).toBe('Team Lead');
      expect(parsed.maintainers[0].email).toBe('lead@example.com');
      expect(parsed.maintainers[1].url).toBe('https://devops.example.com');
    });

    it('should generate default description when none is provided', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'no-desc-chart',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.description).toBeDefined();
      expect(parsed.description).toContain('no-desc-chart');
    });
  });

  describe('Dependencies handling in Chart.yaml', () => {
    it('should include multiple dependencies with all fields', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'deps-chart',
        version: '1.0.0',
        dependencies: [
          {
            name: 'postgresql',
            version: '12.x.x',
            repository: 'https://charts.bitnami.com/bitnami',
            condition: 'postgresql.enabled',
          },
          {
            name: 'redis',
            version: '17.x.x',
            repository: 'https://charts.bitnami.com/bitnami',
            condition: 'redis.enabled',
          },
          {
            name: 'elasticsearch',
            version: '19.x.x',
            repository: 'https://charts.bitnami.com/bitnami',
            condition: 'elasticsearch.enabled',
            alias: 'es',
          },
        ],
        values: {
          image: { repository: 'myapp' },
        },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.dependencies).toHaveLength(3);

      const pgDep = parsed.dependencies.find((d: any) => d.name === 'postgresql');
      expect(pgDep).toBeDefined();
      expect(pgDep.version).toBe('12.x.x');
      expect(pgDep.repository).toBe('https://charts.bitnami.com/bitnami');
      expect(pgDep.condition).toBe('postgresql.enabled');

      const redisDep = parsed.dependencies.find((d: any) => d.name === 'redis');
      expect(redisDep).toBeDefined();
      expect(redisDep.version).toBe('17.x.x');

      const esDep = parsed.dependencies.find((d: any) => d.name === 'elasticsearch');
      expect(esDep).toBeDefined();
      expect(esDep.alias).toBe('es');
    });

    it('should omit dependencies from Chart.yaml when none are specified', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'no-deps-chart',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.dependencies).toBeUndefined();
    });

    it('should include dependency condition fields for conditional enablement', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const generator = new HelmGenerator({
        name: 'cond-deps-chart',
        dependencies: [
          {
            name: 'mysql',
            version: '9.x.x',
            repository: 'https://charts.bitnami.com/bitnami',
            condition: 'mysql.enabled',
          },
        ],
        values: { image: { repository: 'myapp' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.dependencies).toHaveLength(1);
      expect(parsed.dependencies[0].condition).toBe('mysql.enabled');
    });
  });

  describe('Multi-environment chart generation (dev vs prod values)', () => {
    it('should generate dev-oriented chart with minimal resources', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const devGenerator = new HelmGenerator({
        name: 'env-app',
        version: '1.0.0',
        values: {
          image: { repository: 'myapp', tag: 'dev', pullPolicy: 'Always' },
          replicaCount: 1,
          service: { type: 'ClusterIP', port: 8080 },
          resources: {
            limits: { cpu: '250m', memory: '256Mi' },
            requests: { cpu: '100m', memory: '128Mi' },
          },
          autoscaling: { enabled: false },
          ingress: { enabled: false },
        },
      });

      const devFiles = devGenerator.generate();
      const devValuesFile = devFiles.find(f => f.path === 'values.yaml');
      const devValues = yaml.load(devValuesFile!.content) as any;

      expect(devValues.replicaCount).toBe(1);
      expect(devValues.image.tag).toBe('dev');
      expect(devValues.image.pullPolicy).toBe('Always');
      expect(devValues.resources.limits.cpu).toBe('250m');
      expect(devValues.resources.limits.memory).toBe('256Mi');
      expect(devValues.autoscaling.enabled).toBe(false);
      expect(devValues.ingress.enabled).toBe(false);
    });

    it('should generate prod-oriented chart with production resources', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const prodGenerator = new HelmGenerator({
        name: 'env-app',
        version: '1.0.0',
        values: {
          image: { repository: 'myapp', tag: 'v1.0.0', pullPolicy: 'IfNotPresent' },
          replicaCount: 5,
          service: { type: 'ClusterIP', port: 8080 },
          resources: {
            limits: { cpu: '2', memory: '2Gi' },
            requests: { cpu: '1', memory: '1Gi' },
          },
          autoscaling: {
            enabled: true,
            minReplicas: 3,
            maxReplicas: 20,
            targetCPUUtilizationPercentage: 70,
          },
          ingress: {
            enabled: true,
            className: 'nginx',
            hosts: [{ host: 'app.prod.example.com', paths: [{ path: '/', pathType: 'Prefix' }] }],
            tls: [{ secretName: 'app-tls', hosts: ['app.prod.example.com'] }],
          },
          nodeSelector: { 'node-pool': 'production' },
        },
      });

      const prodFiles = prodGenerator.generate();
      const prodValuesFile = prodFiles.find(f => f.path === 'values.yaml');
      const prodValues = yaml.load(prodValuesFile!.content) as any;

      expect(prodValues.replicaCount).toBe(5);
      expect(prodValues.image.tag).toBe('v1.0.0');
      expect(prodValues.image.pullPolicy).toBe('IfNotPresent');
      expect(prodValues.resources.limits.cpu).toBe('2');
      expect(prodValues.resources.limits.memory).toBe('2Gi');
      expect(prodValues.autoscaling.enabled).toBe(true);
      expect(prodValues.autoscaling.minReplicas).toBe(3);
      expect(prodValues.autoscaling.maxReplicas).toBe(20);
      expect(prodValues.ingress.enabled).toBe(true);
      expect(prodValues.ingress.tls).toHaveLength(1);
      expect(prodValues.ingress.tls[0].secretName).toBe('app-tls');
      expect(prodValues.nodeSelector['node-pool']).toBe('production');
    });

    it('should produce consistent Chart.yaml across environment variations', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const chartConfig = {
        name: 'consistent-chart',
        version: '2.0.0',
        appVersion: '3.0.0',
        description: 'Chart with consistent metadata across environments',
        type: 'application' as const,
      };

      const devGenerator = new HelmGenerator({
        ...chartConfig,
        values: {
          image: { repository: 'myapp', tag: 'dev' },
          replicaCount: 1,
        },
      });

      const prodGenerator = new HelmGenerator({
        ...chartConfig,
        values: {
          image: { repository: 'myapp', tag: 'v3.0.0' },
          replicaCount: 10,
        },
      });

      const devFiles = devGenerator.generate();
      const prodFiles = prodGenerator.generate();

      const devChart = yaml.load(devFiles.find(f => f.path === 'Chart.yaml')!.content) as any;
      const prodChart = yaml.load(prodFiles.find(f => f.path === 'Chart.yaml')!.content) as any;

      // Chart metadata should be identical across environments
      expect(devChart.name).toBe(prodChart.name);
      expect(devChart.version).toBe(prodChart.version);
      expect(devChart.appVersion).toBe(prodChart.appVersion);
      expect(devChart.description).toBe(prodChart.description);
      expect(devChart.type).toBe(prodChart.type);
      expect(devChart.apiVersion).toBe(prodChart.apiVersion);

      // But values should differ
      const devValues = yaml.load(devFiles.find(f => f.path === 'values.yaml')!.content) as any;
      const prodValues = yaml.load(prodFiles.find(f => f.path === 'values.yaml')!.content) as any;

      expect(devValues.replicaCount).not.toBe(prodValues.replicaCount);
      expect(devValues.image.tag).not.toBe(prodValues.image.tag);
    });

    it('should write both dev and prod charts to separate directories', async () => {
      const { HelmGenerator } = await import(
        '../../services/generator-service/src/generators/helm-generator'
      );

      const devDir = path.join(tempDir, 'multi-env-dev');
      const prodDir = path.join(tempDir, 'multi-env-prod');

      const devGenerator = new HelmGenerator({
        name: 'multi-env-app',
        values: {
          image: { repository: 'myapp', tag: 'dev' },
          replicaCount: 1,
          resources: {
            limits: { cpu: '200m', memory: '256Mi' },
            requests: { cpu: '100m', memory: '128Mi' },
          },
        },
      });

      const prodGenerator = new HelmGenerator({
        name: 'multi-env-app',
        values: {
          image: { repository: 'myapp', tag: 'v1.0.0' },
          replicaCount: 5,
          resources: {
            limits: { cpu: '2', memory: '4Gi' },
            requests: { cpu: '1', memory: '2Gi' },
          },
        },
      });

      devGenerator.writeToFiles(devDir);
      prodGenerator.writeToFiles(prodDir);

      // Both directories should have complete chart structures
      const devChartPath = path.join(devDir, 'multi-env-app');
      const prodChartPath = path.join(prodDir, 'multi-env-app');

      expect(fs.existsSync(path.join(devChartPath, 'Chart.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(prodChartPath, 'Chart.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(devChartPath, 'values.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(prodChartPath, 'values.yaml'))).toBe(true);

      // Verify values differ between environments
      const devValues = yaml.load(
        fs.readFileSync(path.join(devChartPath, 'values.yaml'), 'utf-8')
      ) as any;
      const prodValues = yaml.load(
        fs.readFileSync(path.join(prodChartPath, 'values.yaml'), 'utf-8')
      ) as any;

      expect(devValues.replicaCount).toBe(1);
      expect(prodValues.replicaCount).toBe(5);
      expect(devValues.image.tag).toBe('dev');
      expect(prodValues.image.tag).toBe('v1.0.0');
      expect(devValues.resources.limits.cpu).toBe('200m');
      expect(prodValues.resources.limits.cpu).toBe('2');
    });
  });
});
