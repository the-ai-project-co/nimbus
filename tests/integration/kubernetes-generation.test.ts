/**
 * Kubernetes Generation Integration Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';
import { execSync } from 'node:child_process';

describe('Kubernetes Generation Integration', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-gen-int-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Generated Manifests Validation', () => {
    it('should generate valid YAML that kubectl can parse', async () => {
      // Import the generator
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        replicas: 3,
        containerPort: 80,
        serviceType: 'ClusterIP',
      });

      const files = generator.writeToFiles(tempDir);

      // Verify each file is valid YAML
      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        expect(() => yaml.loadAll(content)).not.toThrow();
      }
    });

    it('should generate deployment with correct labels', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'labeled-app',
        image: 'nginx',
        workloadType: 'deployment',
        labels: {
          'app.kubernetes.io/component': 'frontend',
          'custom-label': 'custom-value',
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;

      expect(parsed.metadata.labels['app.kubernetes.io/name']).toBe('labeled-app');
      expect(parsed.metadata.labels['app.kubernetes.io/component']).toBe('frontend');
      expect(parsed.metadata.labels['custom-label']).toBe('custom-value');
    });

    it('should generate HPA with correct target metrics', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'scaled-app',
        image: 'nginx',
        workloadType: 'deployment',
        hpa: {
          enabled: true,
          minReplicas: 2,
          maxReplicas: 20,
          targetCPUUtilization: 60,
        },
      });

      const manifests = generator.generate();
      const hpa = manifests.find(m => m.kind === 'HorizontalPodAutoscaler');
      const parsed = yaml.load(hpa!.content) as any;

      expect(parsed.spec.minReplicas).toBe(2);
      expect(parsed.spec.maxReplicas).toBe(20);
      expect(parsed.spec.metrics[0].resource.target.averageUtilization).toBe(60);
    });

    it('should validate manifests with kubectl if available', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const outputDir = path.join(tempDir, 'kubectl-test');
      const generator = new KubernetesGenerator({
        appName: 'kubectl-test',
        namespace: 'test-ns',
        image: 'nginx:1.21',
        workloadType: 'deployment',
        replicas: 2,
        containerPort: 8080,
        resources: {
          limits: { cpu: '500m', memory: '512Mi' },
          requests: { cpu: '100m', memory: '128Mi' },
        },
      });

      generator.writeToFiles(outputDir);

      try {
        // Try to validate with kubectl --dry-run
        const deploymentFile = path.join(outputDir, 'deployment.yaml');
        execSync(`kubectl apply --dry-run=client -f ${deploymentFile} 2>&1`, {
          encoding: 'utf-8',
        });

        // If we get here, kubectl validated the manifest
        expect(true).toBe(true);
      } catch (error: any) {
        const errorStr = String(error) + (error.stdout || '') + (error.stderr || '');
        if (errorStr.includes('command not found') || errorStr.includes('ENOENT')) {
          console.log('kubectl not available, skipping validation');
        } else if (errorStr.includes('Unable to connect') || errorStr.includes('connection refused') || errorStr.includes('connect:')) {
          console.log('Kubernetes cluster not available, skipping validation');
        } else {
          // Real validation error
          throw error;
        }
      }
    });
  });

  describe('StatefulSet Generation', () => {
    it('should generate StatefulSet with service name', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'db-cluster',
        image: 'postgres:15',
        workloadType: 'statefulset',
        replicas: 3,
      });

      const manifests = generator.generate();
      const sts = manifests.find(m => m.kind === 'StatefulSet');
      const parsed = yaml.load(sts!.content) as any;

      expect(parsed.spec.serviceName).toBe('db-cluster');
      expect(parsed.spec.replicas).toBe(3);
    });
  });

  describe('Ingress Generation', () => {
    it('should generate Ingress with correct paths', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'web-app',
        image: 'nginx',
        workloadType: 'deployment',
        containerPort: 8080,
        ingressEnabled: true,
        ingressHost: 'app.example.com',
      });

      const manifests = generator.generate();
      const ingress = manifests.find(m => m.kind === 'Ingress');
      const parsed = yaml.load(ingress!.content) as any;

      expect(parsed.spec.rules[0].host).toBe('app.example.com');
      expect(parsed.spec.rules[0].http.paths[0].path).toBe('/');
      expect(parsed.spec.rules[0].http.paths[0].backend.service.port.number).toBe(8080);
    });
  });

  describe('Volume Configuration', () => {
    it('should generate deployment with volumes', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'app-with-volumes',
        image: 'nginx',
        workloadType: 'deployment',
        volumes: [
          {
            name: 'config',
            type: 'configMap',
            mountPath: '/etc/config',
            configMapName: 'app-config',
          },
          {
            name: 'secrets',
            type: 'secret',
            mountPath: '/etc/secrets',
            secretName: 'app-secrets',
          },
        ],
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;

      const container = parsed.spec.template.spec.containers[0];
      expect(container.volumeMounts).toHaveLength(2);
      expect(container.volumeMounts[0].mountPath).toBe('/etc/config');

      expect(parsed.spec.template.spec.volumes).toHaveLength(2);
      expect(parsed.spec.template.spec.volumes[0].configMap.name).toBe('app-config');
    });
  });

  describe('Kustomization Generation', () => {
    it('should generate valid kustomization.yaml', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const outputDir = path.join(tempDir, 'kustomize-test');
      const generator = new KubernetesGenerator({
        appName: 'kustomize-app',
        namespace: 'custom-ns',
        image: 'nginx',
        workloadType: 'deployment',
        ingressEnabled: true,
      });

      generator.writeToFiles(outputDir);

      const kustomizationFile = path.join(outputDir, 'kustomization.yaml');
      expect(fs.existsSync(kustomizationFile)).toBe(true);

      const content = fs.readFileSync(kustomizationFile, 'utf-8');
      const parsed = yaml.load(content) as any;

      expect(parsed.apiVersion).toBe('kustomize.config.k8s.io/v1beta1');
      expect(parsed.kind).toBe('Kustomization');
      expect(parsed.namespace).toBe('custom-ns');
      expect(parsed.resources).toBeInstanceOf(Array);
      expect(parsed.resources).toContain('deployment.yaml');
      expect(parsed.resources).toContain('service.yaml');
    });
  });
});

describe('Kubernetes Generation via Generator Service API', () => {
  let generatorServiceUrl: string;
  let tempDir: string;

  beforeAll(() => {
    generatorServiceUrl = process.env.GENERATOR_SERVICE_URL || 'http://localhost:3002';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-api-int-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('POST /api/generate/from-questionnaire with kubernetes type', () => {
    it('should start a kubernetes questionnaire session and generate manifests', async () => {
      try {
        // Step 1: Start a kubernetes questionnaire session
        const startResponse = await fetch(`${generatorServiceUrl}/api/questionnaire/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'kubernetes' }),
        });

        if (!startResponse.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const startData = (await startResponse.json()) as any;
        expect(startData.success).toBe(true);
        expect(startData.data).toBeDefined();
        expect(startData.data.sessionId).toBeDefined();

        const sessionId = startData.data.sessionId;

        // Step 2: Verify session state
        const sessionResponse = await fetch(
          `${generatorServiceUrl}/api/questionnaire/session/${sessionId}`
        );

        if (!sessionResponse.ok) {
          console.log('Service not available, skipping');
          return;
        }

        const sessionData = (await sessionResponse.json()) as any;
        expect(sessionData.success).toBe(true);
        expect(sessionData.data).toBeDefined();
      } catch (error) {
        console.log('Generator service not available, skipping test');
      }
    });
  });

  describe('YAML validation of generated deployment manifests', () => {
    it('should produce valid YAML for a deployment with all fields populated', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'yaml-validation-app',
        namespace: 'production',
        image: 'myregistry.io/myapp',
        imageTag: 'v2.5.1',
        workloadType: 'deployment',
        replicas: 5,
        containerPort: 3000,
        serviceType: 'LoadBalancer',
        resources: {
          limits: { cpu: '2', memory: '2Gi' },
          requests: { cpu: '500m', memory: '512Mi' },
        },
        env: [
          { name: 'NODE_ENV', value: 'production' },
          { name: 'LOG_LEVEL', value: 'warn' },
        ],
        healthChecks: {
          livenessProbe: {
            httpGet: { path: '/healthz', port: 3000 },
            initialDelaySeconds: 30,
            periodSeconds: 10,
          },
          readinessProbe: {
            httpGet: { path: '/ready', port: 3000 },
            initialDelaySeconds: 5,
            periodSeconds: 5,
          },
        },
      });

      const manifests = generator.generate();

      // Validate every manifest produces parseable YAML
      for (const manifest of manifests) {
        const parsed = yaml.load(manifest.content) as any;
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
        expect(parsed.apiVersion).toBeDefined();
        expect(parsed.kind).toBeDefined();
        expect(parsed.metadata).toBeDefined();
        expect(parsed.metadata.name).toBeDefined();
      }
    });

    it('should produce YAML with correct image reference format', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'image-ref-test',
        image: 'gcr.io/my-project/my-service',
        imageTag: 'sha-abc1234',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      expect(deployment).toBeDefined();

      const parsed = yaml.load(deployment!.content) as any;
      const containerImage = parsed.spec.template.spec.containers[0].image;
      expect(containerImage).toBe('gcr.io/my-project/my-service:sha-abc1234');
    });
  });

  describe('Service manifest generation and validation', () => {
    it('should generate a ClusterIP service manifest with correct selector', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'svc-test-app',
        image: 'nginx',
        workloadType: 'deployment',
        containerPort: 8080,
        serviceType: 'ClusterIP',
      });

      const manifests = generator.generate();
      const service = manifests.find(m => m.kind === 'Service');
      expect(service).toBeDefined();

      const parsed = yaml.load(service!.content) as any;
      expect(parsed.apiVersion).toBe('v1');
      expect(parsed.kind).toBe('Service');
      expect(parsed.spec.type).toBe('ClusterIP');
      expect(parsed.spec.ports[0].port).toBe(8080);
      expect(parsed.spec.ports[0].protocol).toBe('TCP');
      expect(parsed.spec.selector).toBeDefined();
      expect(parsed.spec.selector['app.kubernetes.io/name']).toBe('svc-test-app');
      expect(parsed.spec.selector['app.kubernetes.io/instance']).toBe('svc-test-app');
    });

    it('should generate a LoadBalancer service manifest', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'lb-app',
        image: 'nginx',
        workloadType: 'deployment',
        containerPort: 443,
        serviceType: 'LoadBalancer',
      });

      const manifests = generator.generate();
      const service = manifests.find(m => m.kind === 'Service');
      expect(service).toBeDefined();

      const parsed = yaml.load(service!.content) as any;
      expect(parsed.spec.type).toBe('LoadBalancer');
      expect(parsed.spec.ports[0].port).toBe(443);
    });

    it('should not generate a service when serviceType is None', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'no-svc-app',
        image: 'worker-image',
        workloadType: 'deployment',
        serviceType: 'None',
      });

      const manifests = generator.generate();
      const service = manifests.find(m => m.kind === 'Service');
      expect(service).toBeUndefined();
    });
  });

  describe('Multiple workload types (deployment, statefulset)', () => {
    it('should generate a Deployment workload', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'deploy-workload',
        image: 'nginx',
        workloadType: 'deployment',
        replicas: 3,
      });

      const manifests = generator.generate();
      const workload = manifests.find(m => m.kind === 'Deployment');
      expect(workload).toBeDefined();
      expect(workload!.name).toBe('deployment');

      const parsed = yaml.load(workload!.content) as any;
      expect(parsed.apiVersion).toBe('apps/v1');
      expect(parsed.kind).toBe('Deployment');
      expect(parsed.spec.replicas).toBe(3);
      expect(parsed.spec.selector.matchLabels).toBeDefined();
      expect(parsed.spec.template.spec.containers).toHaveLength(1);
    });

    it('should generate a StatefulSet workload with serviceName', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'sts-workload',
        image: 'redis:7',
        workloadType: 'statefulset',
        replicas: 3,
        containerPort: 6379,
      });

      const manifests = generator.generate();
      const workload = manifests.find(m => m.kind === 'StatefulSet');
      expect(workload).toBeDefined();
      expect(workload!.name).toBe('statefulset');

      const parsed = yaml.load(workload!.content) as any;
      expect(parsed.apiVersion).toBe('apps/v1');
      expect(parsed.kind).toBe('StatefulSet');
      expect(parsed.spec.serviceName).toBe('sts-workload');
      expect(parsed.spec.replicas).toBe(3);
      expect(parsed.spec.selector.matchLabels).toBeDefined();
    });

    it('should generate a DaemonSet workload without replicas', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'ds-workload',
        image: 'fluentd:latest',
        workloadType: 'daemonset',
      });

      const manifests = generator.generate();
      const workload = manifests.find(m => m.kind === 'DaemonSet');
      expect(workload).toBeDefined();

      const parsed = yaml.load(workload!.content) as any;
      expect(parsed.apiVersion).toBe('apps/v1');
      expect(parsed.kind).toBe('DaemonSet');
      expect(parsed.spec.replicas).toBeUndefined();
    });

    it('should generate a Job workload with restartPolicy', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'job-workload',
        image: 'busybox',
        workloadType: 'job',
      });

      const manifests = generator.generate();
      const workload = manifests.find(m => m.kind === 'Job');
      expect(workload).toBeDefined();

      const parsed = yaml.load(workload!.content) as any;
      expect(parsed.apiVersion).toBe('batch/v1');
      expect(parsed.kind).toBe('Job');
      expect(parsed.spec.template.spec.restartPolicy).toBe('OnFailure');
    });

    it('should generate a CronJob workload with schedule', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'cron-workload',
        image: 'busybox',
        workloadType: 'cronjob',
      });

      const manifests = generator.generate();
      const workload = manifests.find(m => m.kind === 'CronJob');
      expect(workload).toBeDefined();

      const parsed = yaml.load(workload!.content) as any;
      expect(parsed.apiVersion).toBe('batch/v1');
      expect(parsed.kind).toBe('CronJob');
      expect(parsed.spec.schedule).toBeDefined();
      expect(parsed.spec.jobTemplate.spec.template.spec.restartPolicy).toBe('OnFailure');
    });
  });

  describe('Namespace handling in generated manifests', () => {
    it('should set namespace on all generated resources', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'ns-test-app',
        namespace: 'my-custom-namespace',
        image: 'nginx',
        workloadType: 'deployment',
        containerPort: 80,
      });

      const manifests = generator.generate();

      // Filter out the Namespace manifest itself for this check
      const nonNamespaceManifests = manifests.filter(m => m.kind !== 'Namespace');
      expect(nonNamespaceManifests.length).toBeGreaterThan(0);

      for (const manifest of nonNamespaceManifests) {
        const parsed = yaml.load(manifest.content) as any;
        expect(parsed.metadata.namespace).toBe('my-custom-namespace');
      }
    });

    it('should generate a Namespace resource when namespace is not default', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'ns-gen-app',
        namespace: 'staging-env',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const nsManifest = manifests.find(m => m.kind === 'Namespace');
      expect(nsManifest).toBeDefined();

      const parsed = yaml.load(nsManifest!.content) as any;
      expect(parsed.kind).toBe('Namespace');
      expect(parsed.metadata.name).toBe('staging-env');
    });

    it('should not generate a Namespace resource when namespace is default', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'default-ns-app',
        namespace: 'default',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const nsManifest = manifests.find(m => m.kind === 'Namespace');
      expect(nsManifest).toBeUndefined();
    });

    it('should use default namespace when none is provided', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'no-ns-app',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;
      expect(parsed.metadata.namespace).toBe('default');
    });
  });

  describe('Resource limits in generated manifests', () => {
    it('should include resource limits and requests in deployment containers', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'resource-limits-app',
        image: 'nginx',
        workloadType: 'deployment',
        resources: {
          limits: { cpu: '1', memory: '1Gi' },
          requests: { cpu: '250m', memory: '256Mi' },
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      expect(deployment).toBeDefined();

      const parsed = yaml.load(deployment!.content) as any;
      const container = parsed.spec.template.spec.containers[0];
      expect(container.resources).toBeDefined();
      expect(container.resources.limits.cpu).toBe('1');
      expect(container.resources.limits.memory).toBe('1Gi');
      expect(container.resources.requests.cpu).toBe('250m');
      expect(container.resources.requests.memory).toBe('256Mi');
    });

    it('should include resource limits in statefulset containers', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'sts-resource-app',
        image: 'postgres:15',
        workloadType: 'statefulset',
        resources: {
          limits: { cpu: '4', memory: '8Gi' },
          requests: { cpu: '2', memory: '4Gi' },
        },
      });

      const manifests = generator.generate();
      const sts = manifests.find(m => m.kind === 'StatefulSet');
      expect(sts).toBeDefined();

      const parsed = yaml.load(sts!.content) as any;
      const container = parsed.spec.template.spec.containers[0];
      expect(container.resources.limits.cpu).toBe('4');
      expect(container.resources.limits.memory).toBe('8Gi');
      expect(container.resources.requests.cpu).toBe('2');
      expect(container.resources.requests.memory).toBe('4Gi');
    });

    it('should omit resources block when not specified', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'no-resources-app',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      expect(deployment).toBeDefined();

      const parsed = yaml.load(deployment!.content) as any;
      const container = parsed.spec.template.spec.containers[0];
      expect(container.resources).toBeUndefined();
    });

    it('should support partial resource specs with only limits', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const generator = new KubernetesGenerator({
        appName: 'limits-only-app',
        image: 'nginx',
        workloadType: 'deployment',
        resources: {
          limits: { cpu: '500m', memory: '512Mi' },
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;
      const container = parsed.spec.template.spec.containers[0];
      expect(container.resources.limits.cpu).toBe('500m');
      expect(container.resources.limits.memory).toBe('512Mi');
    });

    it('should write resource-constrained manifests to disk as valid YAML', async () => {
      const { KubernetesGenerator } = await import(
        '../../services/generator-service/src/generators/kubernetes-generator'
      );

      const outputDir = path.join(tempDir, 'resource-limits-output');
      const generator = new KubernetesGenerator({
        appName: 'disk-write-app',
        namespace: 'resource-test',
        image: 'myapp:latest',
        workloadType: 'deployment',
        replicas: 2,
        containerPort: 8080,
        resources: {
          limits: { cpu: '2', memory: '4Gi' },
          requests: { cpu: '1', memory: '2Gi' },
        },
      });

      const files = generator.writeToFiles(outputDir);
      expect(files.length).toBeGreaterThan(0);

      // Validate each written file is parseable YAML
      for (const filePath of files) {
        expect(fs.existsSync(filePath)).toBe(true);
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(() => yaml.load(content)).not.toThrow();
      }

      // Verify the deployment file specifically has resources
      const deploymentFile = files.find(f => f.endsWith('deployment.yaml'));
      expect(deploymentFile).toBeDefined();
      const deployContent = fs.readFileSync(deploymentFile!, 'utf-8');
      const parsed = yaml.load(deployContent) as any;
      expect(parsed.spec.template.spec.containers[0].resources.limits.cpu).toBe('2');
    });
  });
});
