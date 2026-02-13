/**
 * Kubernetes Generator Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { KubernetesGenerator, createKubernetesGenerator } from '../generators/kubernetes-generator';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as yaml from 'js-yaml';

describe('KubernetesGenerator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-gen-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('generate', () => {
    it('should generate deployment manifest', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');

      expect(deployment).toBeDefined();
      expect(deployment?.name).toBe('deployment');

      const parsed = yaml.load(deployment!.content) as any;
      expect(parsed.kind).toBe('Deployment');
      expect(parsed.metadata.name).toBe('test-app');
      expect(parsed.spec.template.spec.containers[0].image).toBe('nginx:latest');
    });

    it('should generate service manifest', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        serviceType: 'LoadBalancer',
        containerPort: 8080,
      });

      const manifests = generator.generate();
      const service = manifests.find(m => m.kind === 'Service');

      expect(service).toBeDefined();

      const parsed = yaml.load(service!.content) as any;
      expect(parsed.kind).toBe('Service');
      expect(parsed.spec.type).toBe('LoadBalancer');
      expect(parsed.spec.ports[0].port).toBe(8080);
    });

    it('should generate ingress when enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        ingressEnabled: true,
        ingressHost: 'test.example.com',
      });

      const manifests = generator.generate();
      const ingress = manifests.find(m => m.kind === 'Ingress');

      expect(ingress).toBeDefined();

      const parsed = yaml.load(ingress!.content) as any;
      expect(parsed.kind).toBe('Ingress');
      expect(parsed.spec.rules[0].host).toBe('test.example.com');
    });

    it('should not generate ingress when disabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        ingressEnabled: false,
      });

      const manifests = generator.generate();
      const ingress = manifests.find(m => m.kind === 'Ingress');

      expect(ingress).toBeUndefined();
    });

    it('should generate HPA when enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        hpa: {
          enabled: true,
          minReplicas: 2,
          maxReplicas: 10,
          targetCPUUtilization: 70,
        },
      });

      const manifests = generator.generate();
      const hpa = manifests.find(m => m.kind === 'HorizontalPodAutoscaler');

      expect(hpa).toBeDefined();

      const parsed = yaml.load(hpa!.content) as any;
      expect(parsed.spec.minReplicas).toBe(2);
      expect(parsed.spec.maxReplicas).toBe(10);
    });

    it('should generate ServiceAccount when enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        serviceAccount: {
          create: true,
          name: 'custom-sa',
          annotations: { 'eks.amazonaws.com/role-arn': 'arn:aws:iam::123456789012:role/my-role' },
        },
      });

      const manifests = generator.generate();
      const sa = manifests.find(m => m.kind === 'ServiceAccount');

      expect(sa).toBeDefined();

      const parsed = yaml.load(sa!.content) as any;
      expect(parsed.metadata.name).toBe('custom-sa');
      expect(parsed.metadata.annotations['eks.amazonaws.com/role-arn']).toBeDefined();
    });

    it('should generate ConfigMap when provided', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        configMap: {
          data: {
            'config.json': '{"key": "value"}',
            'app.properties': 'setting=true',
          },
        },
      });

      const manifests = generator.generate();
      const cm = manifests.find(m => m.kind === 'ConfigMap');

      expect(cm).toBeDefined();

      const parsed = yaml.load(cm!.content) as any;
      expect(parsed.data['config.json']).toBe('{"key": "value"}');
    });

    it('should generate namespace when not default', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        namespace: 'custom-ns',
      });

      const manifests = generator.generate();
      const ns = manifests.find(m => m.kind === 'Namespace');

      expect(ns).toBeDefined();

      const parsed = yaml.load(ns!.content) as any;
      expect(parsed.metadata.name).toBe('custom-ns');
    });

    it('should handle StatefulSet workload type', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-db',
        image: 'postgres',
        workloadType: 'statefulset',
        replicas: 3,
      });

      const manifests = generator.generate();
      const sts = manifests.find(m => m.kind === 'StatefulSet');

      expect(sts).toBeDefined();

      const parsed = yaml.load(sts!.content) as any;
      expect(parsed.kind).toBe('StatefulSet');
      expect(parsed.spec.replicas).toBe(3);
      expect(parsed.spec.serviceName).toBe('test-db');
    });

    it('should handle DaemonSet workload type', () => {
      const generator = new KubernetesGenerator({
        appName: 'log-agent',
        image: 'fluentd',
        workloadType: 'daemonset',
      });

      const manifests = generator.generate();
      const ds = manifests.find(m => m.kind === 'DaemonSet');

      expect(ds).toBeDefined();

      const parsed = yaml.load(ds!.content) as any;
      expect(parsed.kind).toBe('DaemonSet');
    });

    it('should include resource limits and requests', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        resources: {
          limits: { cpu: '500m', memory: '512Mi' },
          requests: { cpu: '100m', memory: '128Mi' },
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');

      const parsed = yaml.load(deployment!.content) as any;
      expect(parsed.spec.template.spec.containers[0].resources.limits.cpu).toBe('500m');
      expect(parsed.spec.template.spec.containers[0].resources.requests.memory).toBe('128Mi');
    });

    it('should include environment variables', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        env: [
          { name: 'DATABASE_URL', value: 'postgres://localhost' },
          { name: 'LOG_LEVEL', value: 'debug' },
        ],
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');

      const parsed = yaml.load(deployment!.content) as any;
      const container = parsed.spec.template.spec.containers[0];
      expect(container.env).toHaveLength(2);
      expect(container.env[0].name).toBe('DATABASE_URL');
    });
  });

  describe('generateCombined', () => {
    it('should generate combined YAML with separators', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
        ingressEnabled: true,
      });

      const combined = generator.generateCombined();

      expect(combined).toContain('---');
      expect(combined).toContain('kind: Deployment');
      expect(combined).toContain('kind: Service');
      expect(combined).toContain('kind: Ingress');
    });
  });

  describe('writeToFiles', () => {
    it('should write manifests to individual files', () => {
      const generator = new KubernetesGenerator({
        appName: 'test-app',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const files = generator.writeToFiles(tempDir);

      expect(files.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(tempDir, 'deployment.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'service.yaml'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'kustomization.yaml'))).toBe(true);
    });
  });

  describe('createKubernetesGenerator', () => {
    it('should create a generator instance', () => {
      const generator = createKubernetesGenerator({
        appName: 'factory-test',
        image: 'nginx',
        workloadType: 'deployment',
      });

      expect(generator).toBeInstanceOf(KubernetesGenerator);
    });
  });

  describe('StatefulSet workload type', () => {
    it('should generate StatefulSet with serviceName matching appName', () => {
      const generator = new KubernetesGenerator({
        appName: 'postgres-db',
        image: 'postgres',
        imageTag: '15',
        workloadType: 'statefulset',
        replicas: 3,
      });

      const manifests = generator.generate();
      const sts = manifests.find(m => m.kind === 'StatefulSet');

      expect(sts).toBeDefined();
      expect(sts!.name).toBe('statefulset');

      const parsed = yaml.load(sts!.content) as any;
      expect(parsed.apiVersion).toBe('apps/v1');
      expect(parsed.kind).toBe('StatefulSet');
      expect(parsed.metadata.name).toBe('postgres-db');
      expect(parsed.spec.serviceName).toBe('postgres-db');
      expect(parsed.spec.replicas).toBe(3);
      expect(parsed.spec.selector.matchLabels['app.kubernetes.io/name']).toBe('postgres-db');
    });

    it('should include containers with correct image in StatefulSet', () => {
      const generator = new KubernetesGenerator({
        appName: 'redis-cluster',
        image: 'redis',
        imageTag: '7.2',
        workloadType: 'statefulset',
        replicas: 6,
        containerPort: 6379,
      });

      const manifests = generator.generate();
      const sts = manifests.find(m => m.kind === 'StatefulSet');
      const parsed = yaml.load(sts!.content) as any;

      const container = parsed.spec.template.spec.containers[0];
      expect(container.name).toBe('redis-cluster');
      expect(container.image).toBe('redis:7.2');
      expect(container.ports[0].containerPort).toBe(6379);
    });

    it('should generate a Service alongside a StatefulSet', () => {
      const generator = new KubernetesGenerator({
        appName: 'cassandra',
        image: 'cassandra',
        workloadType: 'statefulset',
        containerPort: 9042,
      });

      const manifests = generator.generate();
      const service = manifests.find(m => m.kind === 'Service');

      expect(service).toBeDefined();
      const parsed = yaml.load(service!.content) as any;
      expect(parsed.spec.ports[0].port).toBe(9042);
    });
  });

  describe('DaemonSet workload type', () => {
    it('should generate DaemonSet without replicas field', () => {
      const generator = new KubernetesGenerator({
        appName: 'node-exporter',
        image: 'prom/node-exporter',
        imageTag: 'v1.7.0',
        workloadType: 'daemonset',
        containerPort: 9100,
      });

      const manifests = generator.generate();
      const ds = manifests.find(m => m.kind === 'DaemonSet');

      expect(ds).toBeDefined();
      expect(ds!.name).toBe('daemonset');

      const parsed = yaml.load(ds!.content) as any;
      expect(parsed.apiVersion).toBe('apps/v1');
      expect(parsed.kind).toBe('DaemonSet');
      expect(parsed.metadata.name).toBe('node-exporter');
      // DaemonSets should not have a replicas field
      expect(parsed.spec.replicas).toBeUndefined();
      expect(parsed.spec.selector.matchLabels['app.kubernetes.io/name']).toBe('node-exporter');
    });

    it('should apply node selectors to DaemonSet', () => {
      const generator = new KubernetesGenerator({
        appName: 'log-collector',
        image: 'fluentd',
        workloadType: 'daemonset',
        nodeSelector: { 'node-role.kubernetes.io/worker': '' },
      });

      const manifests = generator.generate();
      const ds = manifests.find(m => m.kind === 'DaemonSet');
      const parsed = yaml.load(ds!.content) as any;

      expect(parsed.spec.template.spec.nodeSelector).toBeDefined();
      expect(parsed.spec.template.spec.nodeSelector['node-role.kubernetes.io/worker']).toBe('');
    });

    it('should apply tolerations to DaemonSet', () => {
      const generator = new KubernetesGenerator({
        appName: 'monitoring-agent',
        image: 'datadog/agent',
        workloadType: 'daemonset',
        tolerations: [
          { key: 'node-role.kubernetes.io/master', operator: 'Exists', effect: 'NoSchedule' },
        ],
      });

      const manifests = generator.generate();
      const ds = manifests.find(m => m.kind === 'DaemonSet');
      const parsed = yaml.load(ds!.content) as any;

      expect(parsed.spec.template.spec.tolerations).toHaveLength(1);
      expect(parsed.spec.template.spec.tolerations[0].key).toBe('node-role.kubernetes.io/master');
    });
  });

  describe('CronJob workload type', () => {
    it('should generate CronJob with schedule', () => {
      const generator = new KubernetesGenerator({
        appName: 'daily-backup',
        image: 'backup-tool',
        imageTag: 'v1.0',
        workloadType: 'cronjob',
      });

      const manifests = generator.generate();
      const cj = manifests.find(m => m.kind === 'CronJob');

      expect(cj).toBeDefined();
      expect(cj!.name).toBe('cronjob');

      const parsed = yaml.load(cj!.content) as any;
      expect(parsed.apiVersion).toBe('batch/v1');
      expect(parsed.kind).toBe('CronJob');
      expect(parsed.metadata.name).toBe('daily-backup');
      expect(parsed.spec.schedule).toBe('0 * * * *');
    });

    it('should nest job template correctly inside CronJob', () => {
      const generator = new KubernetesGenerator({
        appName: 'cleanup-job',
        image: 'alpine',
        workloadType: 'cronjob',
        containerPort: 8080,
      });

      const manifests = generator.generate();
      const cj = manifests.find(m => m.kind === 'CronJob');
      const parsed = yaml.load(cj!.content) as any;

      // CronJob -> spec -> jobTemplate -> spec -> template -> spec -> containers
      const container = parsed.spec.jobTemplate.spec.template.spec.containers[0];
      expect(container.name).toBe('cleanup-job');
      expect(container.image).toBe('alpine:latest');
      expect(parsed.spec.jobTemplate.spec.template.spec.restartPolicy).toBe('OnFailure');
    });

    it('should include labels in CronJob pod template', () => {
      const generator = new KubernetesGenerator({
        appName: 'report-gen',
        image: 'reporter',
        workloadType: 'cronjob',
        labels: { team: 'analytics' },
      });

      const manifests = generator.generate();
      const cj = manifests.find(m => m.kind === 'CronJob');
      const parsed = yaml.load(cj!.content) as any;

      const podLabels = parsed.spec.jobTemplate.spec.template.metadata.labels;
      expect(podLabels['app.kubernetes.io/name']).toBe('report-gen');
      expect(podLabels['team']).toBe('analytics');
    });
  });

  describe('Service types', () => {
    it('should generate NodePort service', () => {
      const generator = new KubernetesGenerator({
        appName: 'nodeport-app',
        image: 'nginx',
        workloadType: 'deployment',
        serviceType: 'NodePort',
        containerPort: 3000,
      });

      const manifests = generator.generate();
      const service = manifests.find(m => m.kind === 'Service');

      expect(service).toBeDefined();
      const parsed = yaml.load(service!.content) as any;
      expect(parsed.spec.type).toBe('NodePort');
      expect(parsed.spec.ports[0].port).toBe(3000);
      expect(parsed.spec.ports[0].targetPort).toBe('http');
    });

    it('should generate LoadBalancer service', () => {
      const generator = new KubernetesGenerator({
        appName: 'lb-app',
        image: 'nginx',
        workloadType: 'deployment',
        serviceType: 'LoadBalancer',
        containerPort: 443,
      });

      const manifests = generator.generate();
      const service = manifests.find(m => m.kind === 'Service');

      const parsed = yaml.load(service!.content) as any;
      expect(parsed.spec.type).toBe('LoadBalancer');
      expect(parsed.spec.ports[0].port).toBe(443);
    });

    it('should generate ClusterIP service by default', () => {
      const generator = new KubernetesGenerator({
        appName: 'internal-app',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const service = manifests.find(m => m.kind === 'Service');

      const parsed = yaml.load(service!.content) as any;
      expect(parsed.spec.type).toBe('ClusterIP');
    });

    it('should not generate service when serviceType is None', () => {
      const generator = new KubernetesGenerator({
        appName: 'headless-app',
        image: 'worker',
        workloadType: 'deployment',
        serviceType: 'None',
      });

      const manifests = generator.generate();
      const service = manifests.find(m => m.kind === 'Service');

      expect(service).toBeUndefined();
    });
  });

  describe('HPA (Horizontal Pod Autoscaler)', () => {
    it('should not generate HPA when disabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'no-hpa-app',
        image: 'nginx',
        workloadType: 'deployment',
        hpa: { enabled: false },
      });

      const manifests = generator.generate();
      const hpa = manifests.find(m => m.kind === 'HorizontalPodAutoscaler');

      expect(hpa).toBeUndefined();
    });

    it('should generate HPA with default values when only enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'auto-app',
        image: 'nginx',
        workloadType: 'deployment',
        hpa: { enabled: true },
      });

      const manifests = generator.generate();
      const hpa = manifests.find(m => m.kind === 'HorizontalPodAutoscaler');

      expect(hpa).toBeDefined();
      const parsed = yaml.load(hpa!.content) as any;
      expect(parsed.apiVersion).toBe('autoscaling/v2');
      expect(parsed.spec.minReplicas).toBe(1);
      expect(parsed.spec.maxReplicas).toBe(10);
      expect(parsed.spec.scaleTargetRef.kind).toBe('Deployment');
      expect(parsed.spec.scaleTargetRef.name).toBe('auto-app');
    });

    it('should generate HPA with custom CPU target', () => {
      const generator = new KubernetesGenerator({
        appName: 'custom-hpa-app',
        image: 'nginx',
        workloadType: 'deployment',
        hpa: {
          enabled: true,
          minReplicas: 3,
          maxReplicas: 20,
          targetCPUUtilization: 60,
        },
      });

      const manifests = generator.generate();
      const hpa = manifests.find(m => m.kind === 'HorizontalPodAutoscaler');
      const parsed = yaml.load(hpa!.content) as any;

      expect(parsed.spec.minReplicas).toBe(3);
      expect(parsed.spec.maxReplicas).toBe(20);
      expect(parsed.spec.metrics[0].resource.target.averageUtilization).toBe(60);
    });

    it('should set correct namespace in HPA', () => {
      const generator = new KubernetesGenerator({
        appName: 'ns-hpa-app',
        image: 'nginx',
        workloadType: 'deployment',
        namespace: 'production',
        hpa: { enabled: true, minReplicas: 2, maxReplicas: 8 },
      });

      const manifests = generator.generate();
      const hpa = manifests.find(m => m.kind === 'HorizontalPodAutoscaler');
      const parsed = yaml.load(hpa!.content) as any;

      expect(parsed.metadata.namespace).toBe('production');
    });
  });

  describe('PDB (Pod Disruption Budget)', () => {
    it('should generate PDB when enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'pdb-app',
        image: 'nginx',
        workloadType: 'deployment',
        pdb: {
          enabled: true,
          minAvailable: 2,
        },
      });

      const manifests = generator.generate();
      const pdb = manifests.find(m => m.kind === 'PodDisruptionBudget');

      expect(pdb).toBeDefined();
      expect(pdb!.name).toBe('pdb');

      const parsed = yaml.load(pdb!.content) as any;
      expect(parsed.apiVersion).toBe('policy/v1');
      expect(parsed.kind).toBe('PodDisruptionBudget');
      expect(parsed.spec.minAvailable).toBe(2);
      expect(parsed.spec.selector.matchLabels['app.kubernetes.io/name']).toBe('pdb-app');
    });

    it('should not generate PDB when disabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'no-pdb-app',
        image: 'nginx',
        workloadType: 'deployment',
        pdb: { enabled: false },
      });

      const manifests = generator.generate();
      const pdb = manifests.find(m => m.kind === 'PodDisruptionBudget');

      expect(pdb).toBeUndefined();
    });

    it('should use default minAvailable of 1 when not specified', () => {
      const generator = new KubernetesGenerator({
        appName: 'default-pdb-app',
        image: 'nginx',
        workloadType: 'deployment',
        pdb: { enabled: true },
      });

      const manifests = generator.generate();
      const pdb = manifests.find(m => m.kind === 'PodDisruptionBudget');
      const parsed = yaml.load(pdb!.content) as any;

      expect(parsed.spec.minAvailable).toBe(1);
    });

    it('should support string minAvailable (percentage)', () => {
      const generator = new KubernetesGenerator({
        appName: 'pct-pdb-app',
        image: 'nginx',
        workloadType: 'deployment',
        pdb: { enabled: true, minAvailable: '50%' },
      });

      const manifests = generator.generate();
      const pdb = manifests.find(m => m.kind === 'PodDisruptionBudget');
      const parsed = yaml.load(pdb!.content) as any;

      expect(parsed.spec.minAvailable).toBe('50%');
    });
  });

  describe('ConfigMap and Secret generation', () => {
    it('should generate ConfigMap with multiple data entries', () => {
      const generator = new KubernetesGenerator({
        appName: 'config-app',
        image: 'nginx',
        workloadType: 'deployment',
        configMap: {
          data: {
            'database.yml': 'host: localhost\nport: 5432',
            'app.conf': 'debug=false\nlog_level=info',
            'settings.json': '{"timeout": 30}',
          },
        },
      });

      const manifests = generator.generate();
      const cm = manifests.find(m => m.kind === 'ConfigMap');

      expect(cm).toBeDefined();
      expect(cm!.name).toBe('configmap');

      const parsed = yaml.load(cm!.content) as any;
      expect(parsed.kind).toBe('ConfigMap');
      expect(parsed.metadata.name).toBe('config-app-config');
      expect(Object.keys(parsed.data)).toHaveLength(3);
      expect(parsed.data['database.yml']).toContain('host: localhost');
      expect(parsed.data['settings.json']).toBe('{"timeout": 30}');
    });

    it('should generate Secret with base64-encoded data', () => {
      const generator = new KubernetesGenerator({
        appName: 'secret-app',
        image: 'nginx',
        workloadType: 'deployment',
        secret: {
          data: {
            'db-password': 'super-secret-password',
            'api-key': 'sk_live_abc123',
          },
        },
      });

      const manifests = generator.generate();
      const secret = manifests.find(m => m.kind === 'Secret');

      expect(secret).toBeDefined();
      expect(secret!.name).toBe('secret');

      const parsed = yaml.load(secret!.content) as any;
      expect(parsed.kind).toBe('Secret');
      expect(parsed.metadata.name).toBe('secret-app-secret');
      expect(parsed.type).toBe('Opaque');

      // Verify base64 encoding
      const decodedPassword = Buffer.from(parsed.data['db-password'], 'base64').toString();
      expect(decodedPassword).toBe('super-secret-password');

      const decodedKey = Buffer.from(parsed.data['api-key'], 'base64').toString();
      expect(decodedKey).toBe('sk_live_abc123');
    });

    it('should support custom secret type', () => {
      const generator = new KubernetesGenerator({
        appName: 'tls-app',
        image: 'nginx',
        workloadType: 'deployment',
        secret: {
          data: {
            'tls.crt': 'certificate-data',
            'tls.key': 'key-data',
          },
          type: 'kubernetes.io/tls',
        },
      });

      const manifests = generator.generate();
      const secret = manifests.find(m => m.kind === 'Secret');
      const parsed = yaml.load(secret!.content) as any;

      expect(parsed.type).toBe('kubernetes.io/tls');
    });

    it('should not generate ConfigMap when not configured', () => {
      const generator = new KubernetesGenerator({
        appName: 'no-config-app',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const cm = manifests.find(m => m.kind === 'ConfigMap');

      expect(cm).toBeUndefined();
    });

    it('should not generate Secret when not configured', () => {
      const generator = new KubernetesGenerator({
        appName: 'no-secret-app',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const secret = manifests.find(m => m.kind === 'Secret');

      expect(secret).toBeUndefined();
    });

    it('should include namespace in ConfigMap and Secret', () => {
      const generator = new KubernetesGenerator({
        appName: 'ns-app',
        image: 'nginx',
        workloadType: 'deployment',
        namespace: 'my-namespace',
        configMap: { data: { key: 'value' } },
        secret: { data: { pw: 'pass' } },
      });

      const manifests = generator.generate();
      const cm = manifests.find(m => m.kind === 'ConfigMap');
      const secret = manifests.find(m => m.kind === 'Secret');

      const cmParsed = yaml.load(cm!.content) as any;
      const secretParsed = yaml.load(secret!.content) as any;

      expect(cmParsed.metadata.namespace).toBe('my-namespace');
      expect(secretParsed.metadata.namespace).toBe('my-namespace');
    });
  });

  describe('Resource limits and requests', () => {
    it('should include both limits and requests', () => {
      const generator = new KubernetesGenerator({
        appName: 'resource-app',
        image: 'nginx',
        workloadType: 'deployment',
        resources: {
          limits: { cpu: '1000m', memory: '1Gi' },
          requests: { cpu: '250m', memory: '256Mi' },
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;
      const container = parsed.spec.template.spec.containers[0];

      expect(container.resources.limits.cpu).toBe('1000m');
      expect(container.resources.limits.memory).toBe('1Gi');
      expect(container.resources.requests.cpu).toBe('250m');
      expect(container.resources.requests.memory).toBe('256Mi');
    });

    it('should include only limits when requests are omitted', () => {
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
      expect(container.resources.requests).toBeUndefined();
    });

    it('should include only requests when limits are omitted', () => {
      const generator = new KubernetesGenerator({
        appName: 'requests-only-app',
        image: 'nginx',
        workloadType: 'deployment',
        resources: {
          requests: { cpu: '100m', memory: '128Mi' },
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;
      const container = parsed.spec.template.spec.containers[0];

      expect(container.resources.requests.cpu).toBe('100m');
      expect(container.resources.requests.memory).toBe('128Mi');
      expect(container.resources.limits).toBeUndefined();
    });

    it('should not include resources when not configured', () => {
      const generator = new KubernetesGenerator({
        appName: 'no-resource-app',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;
      const container = parsed.spec.template.spec.containers[0];

      expect(container.resources).toBeUndefined();
    });

    it('should include resources in StatefulSet containers', () => {
      const generator = new KubernetesGenerator({
        appName: 'sts-resource-app',
        image: 'postgres',
        workloadType: 'statefulset',
        resources: {
          limits: { cpu: '2', memory: '4Gi' },
          requests: { cpu: '1', memory: '2Gi' },
        },
      });

      const manifests = generator.generate();
      const sts = manifests.find(m => m.kind === 'StatefulSet');
      const parsed = yaml.load(sts!.content) as any;
      const container = parsed.spec.template.spec.containers[0];

      expect(container.resources.limits.cpu).toBe('2');
      expect(container.resources.limits.memory).toBe('4Gi');
      expect(container.resources.requests.cpu).toBe('1');
      expect(container.resources.requests.memory).toBe('2Gi');
    });

    it('should include resources in DaemonSet containers', () => {
      const generator = new KubernetesGenerator({
        appName: 'ds-resource-app',
        image: 'fluentd',
        workloadType: 'daemonset',
        resources: {
          limits: { cpu: '200m', memory: '256Mi' },
          requests: { cpu: '50m', memory: '64Mi' },
        },
      });

      const manifests = generator.generate();
      const ds = manifests.find(m => m.kind === 'DaemonSet');
      const parsed = yaml.load(ds!.content) as any;
      const container = parsed.spec.template.spec.containers[0];

      expect(container.resources.limits.cpu).toBe('200m');
      expect(container.resources.requests.memory).toBe('64Mi');
    });
  });

  describe('Job workload type', () => {
    it('should generate Job with restartPolicy OnFailure', () => {
      const generator = new KubernetesGenerator({
        appName: 'migration-job',
        image: 'migrate-tool',
        workloadType: 'job',
      });

      const manifests = generator.generate();
      const job = manifests.find(m => m.kind === 'Job');

      expect(job).toBeDefined();
      expect(job!.name).toBe('job');

      const parsed = yaml.load(job!.content) as any;
      expect(parsed.apiVersion).toBe('batch/v1');
      expect(parsed.kind).toBe('Job');
      expect(parsed.metadata.name).toBe('migration-job');
      expect(parsed.spec.template.spec.restartPolicy).toBe('OnFailure');
    });
  });

  describe('health checks', () => {
    it('should include liveness and readiness probes', () => {
      const generator = new KubernetesGenerator({
        appName: 'health-app',
        image: 'nginx',
        workloadType: 'deployment',
        healthChecks: {
          livenessProbe: {
            httpGet: { path: '/healthz', port: 8080 },
            initialDelaySeconds: 15,
            periodSeconds: 10,
          },
          readinessProbe: {
            httpGet: { path: '/ready', port: 8080 },
            initialDelaySeconds: 5,
            periodSeconds: 5,
          },
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;
      const container = parsed.spec.template.spec.containers[0];

      expect(container.livenessProbe.httpGet.path).toBe('/healthz');
      expect(container.livenessProbe.initialDelaySeconds).toBe(15);
      expect(container.readinessProbe.httpGet.path).toBe('/ready');
      expect(container.readinessProbe.initialDelaySeconds).toBe(5);
    });

    it('should include startup probe', () => {
      const generator = new KubernetesGenerator({
        appName: 'slow-start-app',
        image: 'heavy-app',
        workloadType: 'deployment',
        healthChecks: {
          startupProbe: {
            httpGet: { path: '/startup', port: 8080 },
            failureThreshold: 30,
            periodSeconds: 10,
          },
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;
      const container = parsed.spec.template.spec.containers[0];

      expect(container.startupProbe.httpGet.path).toBe('/startup');
      expect(container.startupProbe.failureThreshold).toBe(30);
    });
  });

  describe('volumes', () => {
    it('should generate volume mounts and volume definitions', () => {
      const generator = new KubernetesGenerator({
        appName: 'volume-app',
        image: 'nginx',
        workloadType: 'deployment',
        volumes: [
          {
            name: 'data',
            type: 'persistentVolumeClaim',
            mountPath: '/data',
            pvcName: 'data-pvc',
          },
          {
            name: 'config',
            type: 'configMap',
            mountPath: '/etc/config',
            configMapName: 'app-config',
          },
          {
            name: 'cache',
            type: 'emptyDir',
            mountPath: '/tmp/cache',
          },
        ],
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;

      const container = parsed.spec.template.spec.containers[0];
      expect(container.volumeMounts).toHaveLength(3);
      expect(container.volumeMounts[0].name).toBe('data');
      expect(container.volumeMounts[0].mountPath).toBe('/data');

      const volumes = parsed.spec.template.spec.volumes;
      expect(volumes).toHaveLength(3);
      expect(volumes[0].persistentVolumeClaim.claimName).toBe('data-pvc');
      expect(volumes[1].configMap.name).toBe('app-config');
      expect(volumes[2].emptyDir).toEqual({});
    });
  });

  describe('labels and annotations', () => {
    it('should include custom labels in workload', () => {
      const generator = new KubernetesGenerator({
        appName: 'labeled-app',
        image: 'nginx',
        workloadType: 'deployment',
        labels: {
          team: 'platform',
          version: 'v2',
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;

      expect(parsed.metadata.labels['team']).toBe('platform');
      expect(parsed.metadata.labels['version']).toBe('v2');
      expect(parsed.metadata.labels['app.kubernetes.io/managed-by']).toBe('nimbus');
    });

    it('should include annotations in deployment', () => {
      const generator = new KubernetesGenerator({
        appName: 'annotated-app',
        image: 'nginx',
        workloadType: 'deployment',
        annotations: {
          'prometheus.io/scrape': 'true',
          'prometheus.io/port': '9090',
        },
      });

      const manifests = generator.generate();
      const deployment = manifests.find(m => m.kind === 'Deployment');
      const parsed = yaml.load(deployment!.content) as any;

      expect(parsed.metadata.annotations['prometheus.io/scrape']).toBe('true');
      expect(parsed.metadata.annotations['prometheus.io/port']).toBe('9090');
    });
  });
});
