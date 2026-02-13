/**
 * Helm Generator Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { HelmGenerator, createHelmGenerator } from '../generators/helm-generator';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';

describe('HelmGenerator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helm-gen-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('generate', () => {
    it('should generate Chart.yaml', () => {
      const generator = new HelmGenerator({
        name: 'test-chart',
        version: '1.0.0',
        appVersion: '2.0.0',
        description: 'Test Helm chart',
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');

      expect(chartFile).toBeDefined();

      const parsed = yaml.load(chartFile!.content) as any;
      expect(parsed.apiVersion).toBe('v2');
      expect(parsed.name).toBe('test-chart');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.appVersion).toBe('2.0.0');
      expect(parsed.description).toBe('Test Helm chart');
    });

    it('should generate values.yaml', () => {
      const generator = new HelmGenerator({
        name: 'test-chart',
        values: {
          image: { repository: 'nginx', tag: 'latest' },
          replicaCount: 3,
          service: { type: 'LoadBalancer', port: 8080 },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');

      expect(valuesFile).toBeDefined();

      const parsed = yaml.load(valuesFile!.content) as any;
      expect(parsed.image.repository).toBe('nginx');
      expect(parsed.replicaCount).toBe(3);
      expect(parsed.service.type).toBe('LoadBalancer');
      expect(parsed.service.port).toBe(8080);
    });

    it('should generate _helpers.tpl', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const helpersFile = files.find(f => f.path === 'templates/_helpers.tpl');

      expect(helpersFile).toBeDefined();
      expect(helpersFile!.content).toContain('define "my-app.name"');
      expect(helpersFile!.content).toContain('define "my-app.fullname"');
      expect(helpersFile!.content).toContain('define "my-app.labels"');
      expect(helpersFile!.content).toContain('define "my-app.selectorLabels"');
    });

    it('should generate deployment.yaml template', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const deploymentFile = files.find(f => f.path === 'templates/deployment.yaml');

      expect(deploymentFile).toBeDefined();
      expect(deploymentFile!.content).toContain('kind: Deployment');
      expect(deploymentFile!.content).toContain('include "my-app.fullname"');
      expect(deploymentFile!.content).toContain('.Values.image.repository');
    });

    it('should generate service.yaml template', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const serviceFile = files.find(f => f.path === 'templates/service.yaml');

      expect(serviceFile).toBeDefined();
      expect(serviceFile!.content).toContain('kind: Service');
      expect(serviceFile!.content).toContain('.Values.service.type');
    });

    it('should generate ingress.yaml template', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        values: {
          image: { repository: 'nginx' },
          ingress: { enabled: true },
        },
      });

      const files = generator.generate();
      const ingressFile = files.find(f => f.path === 'templates/ingress.yaml');

      expect(ingressFile).toBeDefined();
      expect(ingressFile!.content).toContain('if .Values.ingress.enabled');
      expect(ingressFile!.content).toContain('kind: Ingress');
    });

    it('should generate hpa.yaml template', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        values: {
          image: { repository: 'nginx' },
          autoscaling: { enabled: true, minReplicas: 2, maxReplicas: 10 },
        },
      });

      const files = generator.generate();
      const hpaFile = files.find(f => f.path === 'templates/hpa.yaml');

      expect(hpaFile).toBeDefined();
      expect(hpaFile!.content).toContain('if .Values.autoscaling.enabled');
      expect(hpaFile!.content).toContain('kind: HorizontalPodAutoscaler');
    });

    it('should generate serviceaccount.yaml when enabled', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        values: {
          image: { repository: 'nginx' },
          serviceAccount: { create: true },
        },
      });

      const files = generator.generate();
      const saFile = files.find(f => f.path === 'templates/serviceaccount.yaml');

      expect(saFile).toBeDefined();
      expect(saFile!.content).toContain('if .Values.serviceAccount.create');
      expect(saFile!.content).toContain('kind: ServiceAccount');
    });

    it('should generate NOTES.txt', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const notesFile = files.find(f => f.path === 'templates/NOTES.txt');

      expect(notesFile).toBeDefined();
      expect(notesFile!.content).toContain('Get the application URL');
    });

    it('should generate .helmignore', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const helmignoreFile = files.find(f => f.path === '.helmignore');

      expect(helmignoreFile).toBeDefined();
      expect(helmignoreFile!.content).toContain('.git/');
      expect(helmignoreFile!.content).toContain('.idea/');
    });

    it('should include dependencies in Chart.yaml when specified', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        dependencies: [
          { name: 'postgresql', version: '12.0.0', repository: 'https://charts.bitnami.com/bitnami' },
          { name: 'redis', version: '17.0.0', repository: 'https://charts.bitnami.com/bitnami' },
        ],
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');

      const parsed = yaml.load(chartFile!.content) as any;
      expect(parsed.dependencies).toHaveLength(2);
      expect(parsed.dependencies[0].name).toBe('postgresql');
    });

    it('should include maintainers in Chart.yaml when specified', () => {
      const generator = new HelmGenerator({
        name: 'my-app',
        maintainers: [
          { name: 'John Doe', email: 'john@example.com' },
        ],
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');

      const parsed = yaml.load(chartFile!.content) as any;
      expect(parsed.maintainers).toHaveLength(1);
      expect(parsed.maintainers[0].name).toBe('John Doe');
    });
  });

  describe('writeToFiles', () => {
    it('should write chart files to directory', () => {
      const generator = new HelmGenerator({
        name: 'test-chart',
        values: {
          image: { repository: 'nginx' },
        },
      });

      const files = generator.writeToFiles(tempDir);

      expect(files.length).toBeGreaterThan(0);

      const chartDir = path.join(tempDir, 'test-chart');
      expect(fs.existsSync(path.join(chartDir, 'Chart.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartDir, 'values.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartDir, 'templates', 'deployment.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(chartDir, 'templates', '_helpers.tpl'))).toBe(true);
    });

    it('should create nested directories for templates', () => {
      const generator = new HelmGenerator({
        name: 'test-chart',
        values: {
          image: { repository: 'nginx' },
        },
      });

      generator.writeToFiles(tempDir);

      const templatesDir = path.join(tempDir, 'test-chart', 'templates');
      expect(fs.existsSync(templatesDir)).toBe(true);
      expect(fs.statSync(templatesDir).isDirectory()).toBe(true);
    });
  });

  describe('createHelmGenerator', () => {
    it('should create a generator instance', () => {
      const generator = createHelmGenerator({
        name: 'factory-test',
        values: {
          image: { repository: 'nginx' },
        },
      });

      expect(generator).toBeInstanceOf(HelmGenerator);
    });
  });

  describe('values defaults', () => {
    it('should apply default values', () => {
      const generator = new HelmGenerator({
        name: 'test-chart',
        values: {
          image: { repository: 'nginx', tag: 'latest', pullPolicy: 'IfNotPresent' },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.replicaCount).toBe(1);
      expect(parsed.image.pullPolicy).toBe('IfNotPresent');
      expect(parsed.serviceAccount.create).toBe(true);
      expect(parsed.service.type).toBe('ClusterIP');
      expect(parsed.service.port).toBe(80);
      expect(parsed.ingress.enabled).toBe(false);
      expect(parsed.autoscaling.enabled).toBe(false);
    });
  });

  describe('Chart.yaml metadata validation', () => {
    it('should include apiVersion v2', () => {
      const generator = new HelmGenerator({
        name: 'metadata-chart',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.apiVersion).toBe('v2');
    });

    it('should use default version and appVersion when not specified', () => {
      const generator = new HelmGenerator({
        name: 'default-version-chart',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.version).toBe('0.1.0');
      expect(parsed.appVersion).toBe('1.0.0');
    });

    it('should use custom version and appVersion', () => {
      const generator = new HelmGenerator({
        name: 'custom-version-chart',
        version: '3.5.2',
        appVersion: '4.0.0-beta',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.version).toBe('3.5.2');
      expect(parsed.appVersion).toBe('4.0.0-beta');
    });

    it('should auto-generate description when not provided', () => {
      const generator = new HelmGenerator({
        name: 'auto-desc-chart',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.description).toBe('A Helm chart for auto-desc-chart');
    });

    it('should use provided description', () => {
      const generator = new HelmGenerator({
        name: 'custom-desc-chart',
        description: 'My custom chart for web application deployment',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.description).toBe('My custom chart for web application deployment');
    });

    it('should include chart type as application by default', () => {
      const generator = new HelmGenerator({
        name: 'app-chart',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.type).toBe('application');
    });

    it('should support library chart type', () => {
      const generator = new HelmGenerator({
        name: 'lib-chart',
        type: 'library',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.type).toBe('library');
    });

    it('should include keywords when provided', () => {
      const generator = new HelmGenerator({
        name: 'keyword-chart',
        keywords: ['web', 'nginx', 'proxy'],
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.keywords).toEqual(['web', 'nginx', 'proxy']);
    });

    it('should not include keywords when not provided', () => {
      const generator = new HelmGenerator({
        name: 'no-keyword-chart',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.keywords).toBeUndefined();
    });

    it('should include home and sources when provided', () => {
      const generator = new HelmGenerator({
        name: 'full-meta-chart',
        home: 'https://example.com/chart',
        sources: ['https://github.com/example/chart'],
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const chartFile = files.find(f => f.path === 'Chart.yaml');
      const parsed = yaml.load(chartFile!.content) as any;

      expect(parsed.home).toBe('https://example.com/chart');
      expect(parsed.sources).toEqual(['https://github.com/example/chart']);
    });
  });

  describe('values.yaml structure', () => {
    it('should structure image config correctly', () => {
      const generator = new HelmGenerator({
        name: 'image-chart',
        values: {
          image: { repository: 'my-registry/my-app', tag: 'v2.3.1', pullPolicy: 'Always' },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.image.repository).toBe('my-registry/my-app');
      expect(parsed.image.tag).toBe('v2.3.1');
      expect(parsed.image.pullPolicy).toBe('Always');
    });

    it('should include replicas in values', () => {
      const generator = new HelmGenerator({
        name: 'replica-chart',
        values: {
          image: { repository: 'nginx' },
          replicaCount: 5,
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.replicaCount).toBe(5);
    });

    it('should include resources in values', () => {
      const generator = new HelmGenerator({
        name: 'resource-chart',
        values: {
          image: { repository: 'nginx' },
          resources: {
            limits: { cpu: '500m', memory: '512Mi' },
            requests: { cpu: '100m', memory: '128Mi' },
          },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.resources.limits.cpu).toBe('500m');
      expect(parsed.resources.limits.memory).toBe('512Mi');
      expect(parsed.resources.requests.cpu).toBe('100m');
      expect(parsed.resources.requests.memory).toBe('128Mi');
    });

    it('should include service configuration in values', () => {
      const generator = new HelmGenerator({
        name: 'service-chart',
        values: {
          image: { repository: 'nginx' },
          service: { type: 'NodePort', port: 3000 },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.service.type).toBe('NodePort');
      expect(parsed.service.port).toBe(3000);
    });

    it('should include ingress configuration in values', () => {
      const generator = new HelmGenerator({
        name: 'ingress-chart',
        values: {
          image: { repository: 'nginx' },
          ingress: {
            enabled: true,
            className: 'nginx',
            annotations: { 'cert-manager.io/cluster-issuer': 'letsencrypt-prod' },
            hosts: [
              { host: 'app.example.com', paths: [{ path: '/', pathType: 'Prefix' }] },
            ],
            tls: [
              { secretName: 'app-tls', hosts: ['app.example.com'] },
            ],
          },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.ingress.enabled).toBe(true);
      expect(parsed.ingress.className).toBe('nginx');
      expect(parsed.ingress.hosts[0].host).toBe('app.example.com');
      expect(parsed.ingress.tls[0].secretName).toBe('app-tls');
    });

    it('should include environment variables in values', () => {
      const generator = new HelmGenerator({
        name: 'env-chart',
        values: {
          image: { repository: 'nginx' },
          env: [
            { name: 'DATABASE_URL', value: 'postgres://localhost' },
            { name: 'REDIS_URL', value: 'redis://localhost:6379' },
          ],
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.env).toHaveLength(2);
      expect(parsed.env[0].name).toBe('DATABASE_URL');
      expect(parsed.env[1].name).toBe('REDIS_URL');
    });

    it('should include autoscaling configuration in values', () => {
      const generator = new HelmGenerator({
        name: 'autoscaling-chart',
        values: {
          image: { repository: 'nginx' },
          autoscaling: {
            enabled: true,
            minReplicas: 3,
            maxReplicas: 15,
            targetCPUUtilizationPercentage: 70,
            targetMemoryUtilizationPercentage: 80,
          },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.autoscaling.enabled).toBe(true);
      expect(parsed.autoscaling.minReplicas).toBe(3);
      expect(parsed.autoscaling.maxReplicas).toBe(15);
      expect(parsed.autoscaling.targetCPUUtilizationPercentage).toBe(70);
      expect(parsed.autoscaling.targetMemoryUtilizationPercentage).toBe(80);
    });

    it('should include imagePullSecrets in values', () => {
      const generator = new HelmGenerator({
        name: 'private-chart',
        values: {
          image: { repository: 'private-registry.io/app' },
          imagePullSecrets: [{ name: 'registry-creds' }],
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.imagePullSecrets).toHaveLength(1);
      expect(parsed.imagePullSecrets[0].name).toBe('registry-creds');
    });
  });

  describe('template generation', () => {
    it('should generate deployment template referencing chart helpers', () => {
      const generator = new HelmGenerator({
        name: 'tmpl-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const deploymentFile = files.find(f => f.path === 'templates/deployment.yaml');

      expect(deploymentFile!.content).toContain('include "tmpl-app.fullname"');
      expect(deploymentFile!.content).toContain('include "tmpl-app.labels"');
      expect(deploymentFile!.content).toContain('include "tmpl-app.selectorLabels"');
      expect(deploymentFile!.content).toContain('include "tmpl-app.serviceAccountName"');
      expect(deploymentFile!.content).toContain('.Values.image.repository');
      expect(deploymentFile!.content).toContain('.Values.image.tag');
      expect(deploymentFile!.content).toContain('.Values.image.pullPolicy');
      expect(deploymentFile!.content).toContain('.Values.replicaCount');
      expect(deploymentFile!.content).toContain('.Values.resources');
    });

    it('should generate service template with correct references', () => {
      const generator = new HelmGenerator({
        name: 'svc-tmpl-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const serviceFile = files.find(f => f.path === 'templates/service.yaml');

      expect(serviceFile!.content).toContain('include "svc-tmpl-app.fullname"');
      expect(serviceFile!.content).toContain('include "svc-tmpl-app.labels"');
      expect(serviceFile!.content).toContain('include "svc-tmpl-app.selectorLabels"');
      expect(serviceFile!.content).toContain('.Values.service.type');
      expect(serviceFile!.content).toContain('.Values.service.port');
    });

    it('should generate ingress template with conditional', () => {
      const generator = new HelmGenerator({
        name: 'ing-tmpl-app',
        values: {
          image: { repository: 'nginx' },
          ingress: { enabled: true },
        },
      });

      const files = generator.generate();
      const ingressFile = files.find(f => f.path === 'templates/ingress.yaml');

      expect(ingressFile!.content).toContain('if .Values.ingress.enabled');
      expect(ingressFile!.content).toContain('kind: Ingress');
      expect(ingressFile!.content).toContain('.Values.ingress.className');
      expect(ingressFile!.content).toContain('.Values.ingress.tls');
      expect(ingressFile!.content).toContain('.Values.ingress.hosts');
      expect(ingressFile!.content).toContain('.Values.ingress.annotations');
    });

    it('should generate configmap template (deployment references env, envFrom)', () => {
      const generator = new HelmGenerator({
        name: 'cm-tmpl-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const deploymentFile = files.find(f => f.path === 'templates/deployment.yaml');

      expect(deploymentFile!.content).toContain('.Values.env');
      expect(deploymentFile!.content).toContain('.Values.envFrom');
    });

    it('should generate deployment template with volume support', () => {
      const generator = new HelmGenerator({
        name: 'vol-tmpl-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const deploymentFile = files.find(f => f.path === 'templates/deployment.yaml');

      expect(deploymentFile!.content).toContain('.Values.volumes');
      expect(deploymentFile!.content).toContain('.Values.volumeMounts');
    });

    it('should generate deployment with nodeSelector, affinity, tolerations', () => {
      const generator = new HelmGenerator({
        name: 'scheduling-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const deploymentFile = files.find(f => f.path === 'templates/deployment.yaml');

      expect(deploymentFile!.content).toContain('.Values.nodeSelector');
      expect(deploymentFile!.content).toContain('.Values.affinity');
      expect(deploymentFile!.content).toContain('.Values.tolerations');
    });

    it('should generate deployment with health probes', () => {
      const generator = new HelmGenerator({
        name: 'health-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const deploymentFile = files.find(f => f.path === 'templates/deployment.yaml');

      expect(deploymentFile!.content).toContain('.Values.livenessProbe');
      expect(deploymentFile!.content).toContain('.Values.readinessProbe');
    });

    it('should support init containers and extra containers', () => {
      const generator = new HelmGenerator({
        name: 'sidecar-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const deploymentFile = files.find(f => f.path === 'templates/deployment.yaml');

      expect(deploymentFile!.content).toContain('.Values.initContainers');
      expect(deploymentFile!.content).toContain('.Values.extraContainers');
    });
  });

  describe('helpers.tpl content validation', () => {
    it('should define all standard helper templates', () => {
      const generator = new HelmGenerator({
        name: 'helper-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const helpersFile = files.find(f => f.path === 'templates/_helpers.tpl');
      const content = helpersFile!.content;

      expect(content).toContain('define "helper-app.name"');
      expect(content).toContain('define "helper-app.fullname"');
      expect(content).toContain('define "helper-app.chart"');
      expect(content).toContain('define "helper-app.labels"');
      expect(content).toContain('define "helper-app.selectorLabels"');
      expect(content).toContain('define "helper-app.serviceAccountName"');
    });

    it('should truncate name at 63 characters', () => {
      const generator = new HelmGenerator({
        name: 'helper-trunc',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const helpersFile = files.find(f => f.path === 'templates/_helpers.tpl');

      expect(helpersFile!.content).toContain('trunc 63');
      expect(helpersFile!.content).toContain('trimSuffix "-"');
    });

    it('should support nameOverride and fullnameOverride', () => {
      const generator = new HelmGenerator({
        name: 'override-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const helpersFile = files.find(f => f.path === 'templates/_helpers.tpl');

      expect(helpersFile!.content).toContain('.Values.nameOverride');
      expect(helpersFile!.content).toContain('.Values.fullnameOverride');
    });

    it('should include standard Kubernetes labels in helpers', () => {
      const generator = new HelmGenerator({
        name: 'label-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const helpersFile = files.find(f => f.path === 'templates/_helpers.tpl');

      expect(helpersFile!.content).toContain('helm.sh/chart');
      expect(helpersFile!.content).toContain('app.kubernetes.io/name');
      expect(helpersFile!.content).toContain('app.kubernetes.io/instance');
      expect(helpersFile!.content).toContain('app.kubernetes.io/version');
      expect(helpersFile!.content).toContain('app.kubernetes.io/managed-by');
    });

    it('should handle service account name logic', () => {
      const generator = new HelmGenerator({
        name: 'sa-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const helpersFile = files.find(f => f.path === 'templates/_helpers.tpl');

      expect(helpersFile!.content).toContain('.Values.serviceAccount.create');
      expect(helpersFile!.content).toContain('.Values.serviceAccount.name');
      expect(helpersFile!.content).toContain('default "default"');
    });
  });

  describe('multi-environment values', () => {
    it('should generate development values with small resource footprint', () => {
      const generator = new HelmGenerator({
        name: 'dev-chart',
        values: {
          image: { repository: 'my-app', tag: 'dev-latest' },
          replicaCount: 1,
          resources: {
            limits: { cpu: '200m', memory: '256Mi' },
            requests: { cpu: '50m', memory: '64Mi' },
          },
          ingress: { enabled: false },
          autoscaling: { enabled: false },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.replicaCount).toBe(1);
      expect(parsed.resources.limits.cpu).toBe('200m');
      expect(parsed.ingress.enabled).toBe(false);
      expect(parsed.autoscaling.enabled).toBe(false);
    });

    it('should generate staging values with moderate settings', () => {
      const generator = new HelmGenerator({
        name: 'staging-chart',
        values: {
          image: { repository: 'my-app', tag: 'v1.2.3-rc1' },
          replicaCount: 2,
          resources: {
            limits: { cpu: '500m', memory: '512Mi' },
            requests: { cpu: '200m', memory: '256Mi' },
          },
          ingress: {
            enabled: true,
            hosts: [
              { host: 'staging.example.com', paths: [{ path: '/', pathType: 'Prefix' }] },
            ],
          },
          autoscaling: { enabled: true, minReplicas: 2, maxReplicas: 5 },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.replicaCount).toBe(2);
      expect(parsed.ingress.enabled).toBe(true);
      expect(parsed.ingress.hosts[0].host).toBe('staging.example.com');
      expect(parsed.autoscaling.enabled).toBe(true);
      expect(parsed.autoscaling.minReplicas).toBe(2);
      expect(parsed.autoscaling.maxReplicas).toBe(5);
    });

    it('should generate production values with high availability', () => {
      const generator = new HelmGenerator({
        name: 'prod-chart',
        values: {
          image: { repository: 'my-app', tag: 'v1.2.3', pullPolicy: 'Always' },
          replicaCount: 3,
          resources: {
            limits: { cpu: '2', memory: '2Gi' },
            requests: { cpu: '1', memory: '1Gi' },
          },
          service: { type: 'ClusterIP', port: 8080 },
          ingress: {
            enabled: true,
            className: 'nginx',
            annotations: {
              'cert-manager.io/cluster-issuer': 'letsencrypt-prod',
            },
            hosts: [
              { host: 'app.example.com', paths: [{ path: '/', pathType: 'Prefix' }] },
            ],
            tls: [
              { secretName: 'app-tls', hosts: ['app.example.com'] },
            ],
          },
          autoscaling: {
            enabled: true,
            minReplicas: 3,
            maxReplicas: 20,
            targetCPUUtilizationPercentage: 70,
            targetMemoryUtilizationPercentage: 80,
          },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.replicaCount).toBe(3);
      expect(parsed.image.pullPolicy).toBe('Always');
      expect(parsed.resources.limits.cpu).toBe('2');
      expect(parsed.resources.limits.memory).toBe('2Gi');
      expect(parsed.ingress.enabled).toBe(true);
      expect(parsed.ingress.tls).toHaveLength(1);
      expect(parsed.autoscaling.enabled).toBe(true);
      expect(parsed.autoscaling.minReplicas).toBe(3);
      expect(parsed.autoscaling.maxReplicas).toBe(20);
    });
  });

  describe('values merge/override behavior', () => {
    it('should allow overriding default service values', () => {
      const generator = new HelmGenerator({
        name: 'override-svc-chart',
        values: {
          image: { repository: 'nginx' },
          service: { type: 'LoadBalancer', port: 443 },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.service.type).toBe('LoadBalancer');
      expect(parsed.service.port).toBe(443);
    });

    it('should allow overriding default autoscaling values', () => {
      const generator = new HelmGenerator({
        name: 'override-hpa-chart',
        values: {
          image: { repository: 'nginx' },
          autoscaling: {
            enabled: true,
            minReplicas: 5,
            maxReplicas: 50,
            targetCPUUtilizationPercentage: 65,
          },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.autoscaling.enabled).toBe(true);
      expect(parsed.autoscaling.minReplicas).toBe(5);
      expect(parsed.autoscaling.maxReplicas).toBe(50);
      expect(parsed.autoscaling.targetCPUUtilizationPercentage).toBe(65);
    });

    it('should allow overriding default image tag', () => {
      const generator = new HelmGenerator({
        name: 'override-tag-chart',
        values: {
          image: { repository: 'my-app', tag: 'v3.0.0', pullPolicy: 'IfNotPresent' },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.image.tag).toBe('v3.0.0');
      expect(parsed.image.pullPolicy).toBe('IfNotPresent');
      expect(parsed.image.repository).toBe('my-app');
    });

    it('should preserve additional values fields', () => {
      const generator = new HelmGenerator({
        name: 'extra-values-chart',
        values: {
          image: { repository: 'nginx' },
          nodeSelector: { 'kubernetes.io/os': 'linux' },
          tolerations: [
            { key: 'dedicated', operator: 'Equal' as const, value: 'web', effect: 'NoSchedule' as const },
          ],
          affinity: {
            podAntiAffinity: {
              requiredDuringSchedulingIgnoredDuringExecution: [
                {
                  labelSelector: { matchExpressions: [{ key: 'app', operator: 'In', values: ['web'] }] },
                  topologyKey: 'kubernetes.io/hostname',
                },
              ],
            },
          },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.nodeSelector['kubernetes.io/os']).toBe('linux');
      expect(parsed.tolerations).toHaveLength(1);
      expect(parsed.tolerations[0].key).toBe('dedicated');
      expect(parsed.affinity.podAntiAffinity).toBeDefined();
    });

    it('should allow setting serviceAccount annotations', () => {
      const generator = new HelmGenerator({
        name: 'sa-override-chart',
        values: {
          image: { repository: 'nginx' },
          serviceAccount: {
            create: true,
            annotations: {
              'eks.amazonaws.com/role-arn': 'arn:aws:iam::123456789012:role/my-role',
            },
            name: 'custom-sa',
          },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.serviceAccount.create).toBe(true);
      expect(parsed.serviceAccount.name).toBe('custom-sa');
      expect(parsed.serviceAccount.annotations['eks.amazonaws.com/role-arn']).toBeDefined();
    });

    it('should use user-provided image values as the final image config', () => {
      // The HelmGenerator constructor spreads config.values last, so user-provided
      // image config takes precedence. When only repository is provided, tag and
      // pullPolicy must be explicitly included if desired.
      const generator = new HelmGenerator({
        name: 'merge-image-chart',
        values: {
          image: { repository: 'custom-registry/app' },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.image.repository).toBe('custom-registry/app');
      // When user provides image without tag/pullPolicy, those are not present
      // in the final output because ...config.values overwrites the merged defaults
    });

    it('should include all image fields when fully specified', () => {
      const generator = new HelmGenerator({
        name: 'full-image-chart',
        values: {
          image: { repository: 'custom-registry/app', tag: '1.0.0', pullPolicy: 'Always' },
        },
      });

      const files = generator.generate();
      const valuesFile = files.find(f => f.path === 'values.yaml');
      const parsed = yaml.load(valuesFile!.content) as any;

      expect(parsed.image.repository).toBe('custom-registry/app');
      expect(parsed.image.tag).toBe('1.0.0');
      expect(parsed.image.pullPolicy).toBe('Always');
    });
  });

  describe('NOTES.txt content', () => {
    it('should include instructions for all service types', () => {
      const generator = new HelmGenerator({
        name: 'notes-app',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const notesFile = files.find(f => f.path === 'templates/NOTES.txt');

      expect(notesFile!.content).toContain('Get the application URL');
      expect(notesFile!.content).toContain('NodePort');
      expect(notesFile!.content).toContain('LoadBalancer');
      expect(notesFile!.content).toContain('ClusterIP');
      expect(notesFile!.content).toContain('.Values.ingress.enabled');
    });

    it('should reference chart-specific helper names', () => {
      const generator = new HelmGenerator({
        name: 'specific-notes',
        values: { image: { repository: 'nginx' } },
      });

      const files = generator.generate();
      const notesFile = files.find(f => f.path === 'templates/NOTES.txt');

      expect(notesFile!.content).toContain('include "specific-notes.fullname"');
      expect(notesFile!.content).toContain('include "specific-notes.name"');
    });
  });

  describe('complete chart generation', () => {
    it('should generate a complete set of chart files', () => {
      const generator = new HelmGenerator({
        name: 'complete-chart',
        version: '1.0.0',
        appVersion: '2.0.0',
        description: 'A complete chart',
        values: {
          image: { repository: 'nginx' },
          serviceAccount: { create: true },
          ingress: { enabled: true },
          autoscaling: { enabled: true },
        },
      });

      const files = generator.generate();
      const filePaths = files.map(f => f.path);

      expect(filePaths).toContain('Chart.yaml');
      expect(filePaths).toContain('values.yaml');
      expect(filePaths).toContain('.helmignore');
      expect(filePaths).toContain('templates/_helpers.tpl');
      expect(filePaths).toContain('templates/deployment.yaml');
      expect(filePaths).toContain('templates/service.yaml');
      expect(filePaths).toContain('templates/serviceaccount.yaml');
      expect(filePaths).toContain('templates/ingress.yaml');
      expect(filePaths).toContain('templates/hpa.yaml');
      expect(filePaths).toContain('templates/NOTES.txt');
    });

    it('should not generate serviceaccount.yaml when create is false', () => {
      const generator = new HelmGenerator({
        name: 'no-sa-chart',
        values: {
          image: { repository: 'nginx' },
          serviceAccount: { create: false },
        },
      });

      const files = generator.generate();
      const saFile = files.find(f => f.path === 'templates/serviceaccount.yaml');

      expect(saFile).toBeUndefined();
    });
  });
});
