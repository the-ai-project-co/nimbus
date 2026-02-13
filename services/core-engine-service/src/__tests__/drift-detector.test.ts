/**
 * Drift Detector Tests
 */

import { describe, it, expect, beforeEach, mock, spyOn } from 'bun:test';
import { DriftDetector } from '../components/drift-detector';

describe('DriftDetector', () => {
  let detector: DriftDetector;

  beforeEach(() => {
    detector = new DriftDetector();
  });

  describe('detectDrift', () => {
    it('should return a drift report for terraform provider', async () => {
      // Mock the terraformClient methods on the detector instance
      const client = (detector as any).terraformClient;
      client.refresh = mock(() => Promise.resolve({ success: true }));
      client.plan = mock(() => Promise.resolve({
        success: true,
        output: '',
        changes: { to_add: 0, to_change: 1, to_destroy: 0 },
        hasChanges: true,
      }));
      client.show = mock(() => Promise.resolve({
        json: {
          resource_changes: [
            {
              address: 'aws_instance.web',
              type: 'aws_instance',
              name: 'web',
              change: {
                actions: ['update'],
                before: { instance_type: 't2.micro' },
                after: { instance_type: 't3.micro' },
              },
            },
          ],
        },
      }));

      const report = await detector.detectDrift({
        provider: 'terraform',
        workDir: '/tmp/test-terraform',
      });

      expect(report).toBeDefined();
      expect(report.provider).toBe('terraform');
      expect(report.workDir).toBe('/tmp/test-terraform');
      expect(report.summary).toBeDefined();
      expect(report.resources).toBeInstanceOf(Array);
      expect(report.resources.length).toBe(1);
    });

    it('should handle terraform with no drift', async () => {
      const client = (detector as any).terraformClient;
      client.refresh = mock(() => Promise.resolve({ success: true }));
      client.plan = mock(() => Promise.resolve({
        success: true,
        output: '',
        changes: { to_add: 0, to_change: 0, to_destroy: 0 },
        hasChanges: false,
      }));

      const report = await detector.detectDrift({
        provider: 'terraform',
        workDir: '/tmp/test-terraform',
      });

      expect(report.summary.totalResources).toBe(0);
      expect(report.summary.driftedResources).toBe(0);
      expect(report.resources.length).toBe(0);
    });

    it('should calculate drift summary correctly', async () => {
      const client = (detector as any).terraformClient;
      client.refresh = mock(() => Promise.resolve({ success: true }));
      client.plan = mock(() => Promise.resolve({
        success: true,
        output: '',
        changes: { to_add: 0, to_change: 2, to_destroy: 1 },
        hasChanges: true,
      }));
      client.show = mock(() => Promise.resolve({
        json: {
          resource_changes: [
            // delete: has before, no after — not filtered by isNonDriftChange
            { address: 'r2', type: 't2', name: 'n2', change: { actions: ['delete'], before: { id: '2' }, after: null } },
            // update: has before and after — not filtered
            { address: 'r3', type: 't3', name: 'n3', change: { actions: ['update'], before: { v: 'a' }, after: { v: 'b' } } },
            { address: 'r4', type: 't4', name: 'n4', change: { actions: ['update'], before: { v: 'c' }, after: { v: 'd' } } },
          ],
        },
      }));

      const report = await detector.detectDrift({
        provider: 'terraform',
        workDir: '/tmp/test',
      });

      expect(report.resources.length).toBeGreaterThanOrEqual(1);
      expect(report.summary).toBeDefined();
      expect(report.summary.totalResources).toBeGreaterThanOrEqual(1);
      expect(report.summary.driftedResources).toBeGreaterThanOrEqual(1);
    });

    it('should handle kubernetes provider with mocked kubectl diff', async () => {
      // The detector internally calls compareKubernetesManifests which returns K8sResourceDiff[].
      // We spy on the private method to simulate kubectl diff output.
      const mockDiffs = [
        {
          kind: 'Deployment',
          name: 'web-app',
          namespace: 'production',
          differences: [
            { path: 'spec.replicas', expected: 3, actual: 5 },
            { path: 'spec.template.spec.containers[0].image', expected: 'nginx:1.25', actual: 'nginx:1.24' },
          ],
        },
        {
          kind: 'Service',
          name: 'web-svc',
          namespace: 'production',
          differences: [
            { path: 'spec.type', expected: 'ClusterIP', actual: 'NodePort' },
          ],
        },
      ];

      // @ts-ignore - accessing private method for testing
      const originalMethod = detector['compareKubernetesManifests'];
      // @ts-ignore
      detector['compareKubernetesManifests'] = mock(async () => mockDiffs);

      try {
        const report = await detector.detectDrift({
          provider: 'kubernetes',
          workDir: '/tmp/test-k8s',
          namespace: 'production',
        });

        expect(report).toBeDefined();
        expect(report.provider).toBe('kubernetes');
        expect(report.resources.length).toBe(2);
        expect(report.resources[0].address).toBe('Deployment/production/web-app');
        expect(report.resources[0].drifts.length).toBe(2);
        expect(report.resources[0].drifts[0].attribute).toBe('spec.replicas');
        expect(report.resources[0].drifts[0].expected).toBe(3);
        expect(report.resources[0].drifts[0].actual).toBe(5);
        expect(report.resources[1].address).toBe('Service/production/web-svc');
        expect(report.resources[1].drifts[0].attribute).toBe('spec.type');
        expect(report.summary.driftedResources).toBe(2);
      } finally {
        // @ts-ignore
        detector['compareKubernetesManifests'] = originalMethod;
      }
    });

    it('should handle kubernetes provider with no drift', async () => {
      // @ts-ignore
      const originalMethod = detector['compareKubernetesManifests'];
      // @ts-ignore
      detector['compareKubernetesManifests'] = mock(async () => []);

      try {
        const report = await detector.detectDrift({
          provider: 'kubernetes',
          workDir: '/tmp/test-k8s',
          namespace: 'default',
        });

        expect(report).toBeDefined();
        expect(report.provider).toBe('kubernetes');
        expect(report.resources.length).toBe(0);
        expect(report.summary.driftedResources).toBe(0);
        expect(report.summary.totalResources).toBe(0);
      } finally {
        // @ts-ignore
        detector['compareKubernetesManifests'] = originalMethod;
      }
    });

    it('should handle kubernetes drift with default namespace', async () => {
      const mockDiffs = [
        {
          kind: 'ConfigMap',
          name: 'app-config',
          namespace: undefined,
          differences: [
            { path: 'data.LOG_LEVEL', expected: 'info', actual: 'debug' },
          ],
        },
      ];

      // @ts-ignore
      const originalMethod = detector['compareKubernetesManifests'];
      // @ts-ignore
      detector['compareKubernetesManifests'] = mock(async () => mockDiffs);

      try {
        const report = await detector.detectDrift({
          provider: 'kubernetes',
          workDir: '/tmp/test-k8s',
        });

        expect(report.resources[0].address).toBe('ConfigMap/default/app-config');
        expect(report.resources[0].drifts[0].remediation).toContain('kubectl apply');
      } finally {
        // @ts-ignore
        detector['compareKubernetesManifests'] = originalMethod;
      }
    });

    it('should handle helm provider with mocked helm diff', async () => {
      const mockDiffs = [
        {
          name: 'my-release',
          namespace: 'default',
          chartVersion: { expected: '1.5.0', actual: '1.4.2' },
          valuesDiff: [
            { path: 'replicaCount', expected: 3, actual: 1 },
            { path: 'image.tag', expected: 'v2.0.0', actual: 'v1.9.0' },
            { path: 'resources.limits.memory', expected: '512Mi', actual: '256Mi' },
          ],
        },
      ];

      // @ts-ignore
      const originalMethod = detector['compareHelmReleases'];
      // @ts-ignore
      detector['compareHelmReleases'] = mock(async () => mockDiffs);

      try {
        const report = await detector.detectDrift({
          provider: 'helm',
          workDir: '/tmp/test-helm',
          namespace: 'default',
        });

        expect(report).toBeDefined();
        expect(report.provider).toBe('helm');
        expect(report.resources.length).toBe(1);
        expect(report.resources[0].address).toBe('default/my-release');
        expect(report.resources[0].resourceType).toBe('helm-release');
        // 1 chart version drift + 3 values drifts = 4 total
        expect(report.resources[0].drifts.length).toBe(4);

        const chartVersionDrift = report.resources[0].drifts.find(d => d.attribute === 'chartVersion');
        expect(chartVersionDrift).toBeDefined();
        expect(chartVersionDrift!.expected).toBe('1.5.0');
        expect(chartVersionDrift!.actual).toBe('1.4.2');
        expect(chartVersionDrift!.remediation).toContain('helm upgrade');

        const replicaDrift = report.resources[0].drifts.find(d => d.attribute === 'replicaCount');
        expect(replicaDrift).toBeDefined();
        expect(replicaDrift!.expected).toBe(3);
        expect(replicaDrift!.actual).toBe(1);
      } finally {
        // @ts-ignore
        detector['compareHelmReleases'] = originalMethod;
      }
    });

    it('should handle helm provider with no drift', async () => {
      const mockDiffs = [
        {
          name: 'stable-release',
          namespace: 'production',
          valuesDiff: [],
        },
      ];

      // @ts-ignore
      const originalMethod = detector['compareHelmReleases'];
      // @ts-ignore
      detector['compareHelmReleases'] = mock(async () => mockDiffs);

      try {
        const report = await detector.detectDrift({
          provider: 'helm',
          workDir: '/tmp/test-helm',
          namespace: 'production',
        });

        expect(report).toBeDefined();
        expect(report.provider).toBe('helm');
        // Resources with zero drifts are filtered out by detectHelmDrift
        expect(report.resources.length).toBe(0);
        expect(report.summary.driftedResources).toBe(0);
        expect(report.summary.totalResources).toBe(0);
      } finally {
        // @ts-ignore
        detector['compareHelmReleases'] = originalMethod;
      }
    });

    it('should handle helm provider with values-only drift (no chart version change)', async () => {
      const mockDiffs = [
        {
          name: 'api-service',
          namespace: 'staging',
          valuesDiff: [
            { path: 'autoscaling.enabled', expected: true, actual: false },
          ],
        },
      ];

      // @ts-ignore
      const originalMethod = detector['compareHelmReleases'];
      // @ts-ignore
      detector['compareHelmReleases'] = mock(async () => mockDiffs);

      try {
        const report = await detector.detectDrift({
          provider: 'helm',
          workDir: '/tmp/test-helm',
          namespace: 'staging',
        });

        expect(report.resources[0].drifts.length).toBe(1);
        expect(report.resources[0].drifts[0].attribute).toBe('autoscaling.enabled');
      } finally {
        // @ts-ignore
        detector['compareHelmReleases'] = originalMethod;
      }
    });

    it('should handle empty drift for kubernetes (no changes)', async () => {
      // @ts-ignore
      const origK8s = detector['compareKubernetesManifests'];
      // @ts-ignore
      detector['compareKubernetesManifests'] = mock(async () => []);

      try {
        const k8sReport = await detector.detectDrift({
          provider: 'kubernetes',
          workDir: '/tmp/k8s-empty',
        });

        expect(k8sReport.resources.length).toBe(0);
        expect(k8sReport.summary.driftedResources).toBe(0);
        expect(k8sReport.summary.totalResources).toBe(0);
      } finally {
        // @ts-ignore
        detector['compareKubernetesManifests'] = origK8s;
      }
    });

    it('should handle empty drift for helm (no changes)', async () => {
      // @ts-ignore
      const origHelm = detector['compareHelmReleases'];
      // @ts-ignore
      detector['compareHelmReleases'] = mock(async () => []);

      try {
        const helmReport = await detector.detectDrift({
          provider: 'helm',
          workDir: '/tmp/helm-empty',
        });

        expect(helmReport.resources.length).toBe(0);
        expect(helmReport.summary.driftedResources).toBe(0);
        expect(helmReport.summary.totalResources).toBe(0);
      } finally {
        // @ts-ignore
        detector['compareHelmReleases'] = origHelm;
      }
    });

    it('should throw error for unsupported provider', async () => {
      await expect(
        detector.detectDrift({
          provider: 'unsupported' as any,
          workDir: '/tmp/test',
        })
      ).rejects.toThrow('Unsupported provider');
    });
  });

  describe('formatReportAsMarkdown', () => {
    it('should generate markdown for terraform drift report', () => {
      const report = {
        id: 'drift_123',
        provider: 'terraform' as const,
        workDir: '/tmp/test',
        environment: 'production',
        generatedAt: new Date(),
        duration: 1500,
        summary: {
          totalResources: 2,
          driftedResources: 2,
          unchangedResources: 0,
          byDriftType: { added: 1, removed: 0, modified: 1, unchanged: 0 },
          bySeverity: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
          autoFixable: 2,
        },
        resources: [
          {
            address: 'aws_instance.web',
            provider: 'terraform' as const,
            resourceType: 'aws_instance',
            detectedAt: new Date(),
            drifts: [
              {
                resourceId: 'aws_instance.web',
                resourceType: 'aws_instance',
                resourceName: 'web',
                driftType: 'added' as const,
                severity: 'high' as const,
                description: 'Resource exists in config but not in state',
                remediation: "Run 'terraform apply' to create the resource",
                autoFixable: true,
              },
            ],
          },
          {
            address: 'aws_s3_bucket.data',
            provider: 'terraform' as const,
            resourceType: 'aws_s3_bucket',
            detectedAt: new Date(),
            drifts: [
              {
                resourceId: 'aws_s3_bucket.data',
                resourceType: 'aws_s3_bucket',
                resourceName: 'data',
                driftType: 'modified' as const,
                severity: 'medium' as const,
                attribute: 'versioning',
                expected: true,
                actual: false,
                description: "Attribute 'versioning' has drifted from expected value",
                remediation: "Run 'terraform apply' to restore the expected value",
                autoFixable: true,
              },
            ],
          },
        ],
      };

      const markdown = detector.formatReportAsMarkdown(report);

      expect(markdown).toContain('# Drift Detection Report');
      expect(markdown).toContain('terraform');
      expect(markdown).toContain('production');
      expect(markdown).toContain('aws_instance.web');
      expect(markdown).toContain('aws_s3_bucket.data');
      expect(markdown).toContain('Total Resources');
      expect(markdown).toContain('Drifted Resources');
      expect(markdown).toContain('Auto-Fixable');
      expect(markdown).toContain('By Severity');
      expect(markdown).toContain('Critical');
      expect(markdown).toContain('High');
      expect(markdown).toContain('Medium');
    });

    it('should generate markdown for kubernetes drift report', () => {
      const report = {
        id: 'drift_k8s_456',
        provider: 'kubernetes' as const,
        workDir: '/tmp/k8s-manifests',
        environment: 'staging',
        generatedAt: new Date(),
        duration: 800,
        summary: {
          totalResources: 1,
          driftedResources: 1,
          unchangedResources: 0,
          byDriftType: { added: 0, removed: 0, modified: 1, unchanged: 0 },
          bySeverity: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
          autoFixable: 1,
        },
        resources: [
          {
            address: 'Deployment/staging/api-server',
            provider: 'kubernetes' as const,
            resourceType: 'Deployment',
            detectedAt: new Date(),
            drifts: [
              {
                resourceId: 'Deployment/staging/api-server',
                resourceType: 'Deployment',
                resourceName: 'api-server',
                driftType: 'modified' as const,
                severity: 'high' as const,
                attribute: 'spec.replicas',
                expected: 3,
                actual: 1,
                description: "Attribute 'spec.replicas' has drifted",
                remediation: "Run 'kubectl apply' to restore the expected value",
                autoFixable: true,
              },
            ],
          },
        ],
      };

      const markdown = detector.formatReportAsMarkdown(report);

      expect(markdown).toContain('kubernetes');
      expect(markdown).toContain('staging');
      expect(markdown).toContain('Deployment/staging/api-server');
      expect(markdown).toContain('spec.replicas');
      expect(markdown).toContain('kubectl apply');
    });

    it('should generate markdown for helm drift report', () => {
      const report = {
        id: 'drift_helm_789',
        provider: 'helm' as const,
        workDir: '/tmp/helm-charts',
        environment: 'production',
        generatedAt: new Date(),
        duration: 600,
        summary: {
          totalResources: 1,
          driftedResources: 1,
          unchangedResources: 0,
          byDriftType: { added: 0, removed: 0, modified: 2, unchanged: 0 },
          bySeverity: { critical: 0, high: 0, medium: 2, low: 0, info: 0 },
          autoFixable: 2,
        },
        resources: [
          {
            address: 'production/my-release',
            provider: 'helm' as const,
            resourceType: 'helm-release',
            detectedAt: new Date(),
            drifts: [
              {
                resourceId: 'production/my-release',
                resourceType: 'helm-release',
                resourceName: 'my-release',
                driftType: 'modified' as const,
                severity: 'medium' as const,
                attribute: 'chartVersion',
                expected: '2.0.0',
                actual: '1.9.0',
                description: 'Chart version has drifted',
                remediation: "Run 'helm upgrade' to restore the expected version",
                autoFixable: true,
              },
              {
                resourceId: 'production/my-release',
                resourceType: 'helm-release',
                resourceName: 'my-release',
                driftType: 'modified' as const,
                severity: 'medium' as const,
                attribute: 'replicaCount',
                expected: 3,
                actual: 1,
                description: "Value 'replicaCount' has drifted",
                remediation: "Run 'helm upgrade' with correct values",
                autoFixable: true,
              },
            ],
          },
        ],
      };

      const markdown = detector.formatReportAsMarkdown(report);

      expect(markdown).toContain('helm');
      expect(markdown).toContain('production/my-release');
      expect(markdown).toContain('chartVersion');
      expect(markdown).toContain('replicaCount');
      expect(markdown).toContain('helm upgrade');
    });

    it('should handle report with no drifted resources', () => {
      const report = {
        id: 'drift_empty',
        provider: 'terraform' as const,
        workDir: '/tmp/test',
        generatedAt: new Date(),
        duration: 200,
        summary: {
          totalResources: 0,
          driftedResources: 0,
          unchangedResources: 0,
          byDriftType: { added: 0, removed: 0, modified: 0, unchanged: 0 },
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          autoFixable: 0,
        },
        resources: [],
      };

      const markdown = detector.formatReportAsMarkdown(report);

      expect(markdown).toContain('# Drift Detection Report');
      expect(markdown).toContain('terraform');
      // Should not contain the "Drifted Resources" section header when there are none
      expect(markdown).not.toContain('## Drifted Resources');
    });

    it('should include errors section when errors are present', () => {
      const report = {
        id: 'drift_errors',
        provider: 'terraform' as const,
        workDir: '/tmp/test',
        generatedAt: new Date(),
        duration: 300,
        summary: {
          totalResources: 0,
          driftedResources: 0,
          unchangedResources: 0,
          byDriftType: { added: 0, removed: 0, modified: 0, unchanged: 0 },
          bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
          autoFixable: 0,
        },
        resources: [],
        errors: [
          'State refresh warning: Could not refresh module.vpc',
          'Partial plan: some resources skipped',
        ],
      };

      const markdown = detector.formatReportAsMarkdown(report);

      expect(markdown).toContain('## Errors');
      expect(markdown).toContain('State refresh warning');
      expect(markdown).toContain('Partial plan');
    });

    it('should include severity and auto-fixable details per drift item', () => {
      const report = {
        id: 'drift_detail',
        provider: 'terraform' as const,
        workDir: '/tmp/test',
        generatedAt: new Date(),
        duration: 100,
        summary: {
          totalResources: 1,
          driftedResources: 1,
          unchangedResources: 0,
          byDriftType: { added: 0, removed: 0, modified: 1, unchanged: 0 },
          bySeverity: { critical: 1, high: 0, medium: 0, low: 0, info: 0 },
          autoFixable: 1,
        },
        resources: [
          {
            address: 'aws_security_group.main',
            provider: 'terraform' as const,
            resourceType: 'aws_security_group',
            detectedAt: new Date(),
            drifts: [
              {
                resourceId: 'aws_security_group.main',
                resourceType: 'aws_security_group',
                resourceName: 'main',
                driftType: 'modified' as const,
                severity: 'critical' as const,
                attribute: 'ingress',
                expected: [{ from_port: 443 }],
                actual: [{ from_port: 0 }],
                description: "Attribute 'ingress' has drifted from expected value",
                remediation: "Run 'terraform apply' to restore the expected value",
                autoFixable: true,
              },
            ],
          },
        ],
      };

      const markdown = detector.formatReportAsMarkdown(report);

      expect(markdown).toContain('critical');
      expect(markdown).toContain('Auto-fixable: Yes');
      expect(markdown).toContain('Remediation');
      expect(markdown).toContain('ingress');
    });
  });

  describe('calculateSummary', () => {
    it('should correctly tally by drift type and severity', () => {
      // Access the private method for targeted unit testing
      // @ts-ignore
      const calculateSummary = detector['calculateSummary'].bind(detector);

      const resources = [
        {
          address: 'r1',
          provider: 'terraform' as const,
          resourceType: 'aws_instance',
          detectedAt: new Date(),
          drifts: [
            {
              resourceId: 'r1',
              resourceType: 'aws_instance',
              resourceName: 'r1',
              driftType: 'modified' as const,
              severity: 'high' as const,
              description: 'test',
              autoFixable: true,
            },
            {
              resourceId: 'r1',
              resourceType: 'aws_instance',
              resourceName: 'r1',
              driftType: 'modified' as const,
              severity: 'critical' as const,
              description: 'test',
              autoFixable: false,
            },
          ],
        },
        {
          address: 'r2',
          provider: 'terraform' as const,
          resourceType: 'aws_s3_bucket',
          detectedAt: new Date(),
          drifts: [
            {
              resourceId: 'r2',
              resourceType: 'aws_s3_bucket',
              resourceName: 'r2',
              driftType: 'added' as const,
              severity: 'medium' as const,
              description: 'test',
              autoFixable: true,
            },
          ],
        },
        {
          address: 'r3',
          provider: 'terraform' as const,
          resourceType: 'aws_vpc',
          detectedAt: new Date(),
          drifts: [],
        },
      ];

      const summary = calculateSummary(resources);

      expect(summary.totalResources).toBe(3);
      expect(summary.driftedResources).toBe(2);
      expect(summary.unchangedResources).toBe(1);
      expect(summary.byDriftType.modified).toBe(2);
      expect(summary.byDriftType.added).toBe(1);
      expect(summary.byDriftType.removed).toBe(0);
      expect(summary.bySeverity.critical).toBe(1);
      expect(summary.bySeverity.high).toBe(1);
      expect(summary.bySeverity.medium).toBe(1);
      expect(summary.autoFixable).toBe(2);
    });
  });

  describe('determineSeverity', () => {
    it('should return critical for security-related resource types', () => {
      // @ts-ignore
      const determineSeverity = detector['determineSeverity'].bind(detector);

      expect(determineSeverity('aws_security_group', 'ingress')).toBe('critical');
      expect(determineSeverity('aws_iam_role', 'policy')).toBe('critical');
      expect(determineSeverity('aws_kms_key', 'rotation')).toBe('critical');
    });

    it('should return critical for security-related attributes', () => {
      // @ts-ignore
      const determineSeverity = detector['determineSeverity'].bind(detector);

      expect(determineSeverity('generic_resource', 'password')).toBe('critical');
      expect(determineSeverity('generic_resource', 'secret_key')).toBe('critical');
      expect(determineSeverity('generic_resource', 'encryption')).toBe('critical');
    });

    it('should return high for network and compute resource types', () => {
      // @ts-ignore
      const determineSeverity = detector['determineSeverity'].bind(detector);

      expect(determineSeverity('aws_vpc', 'cidr_block')).toBe('high');
      expect(determineSeverity('aws_instance', 'instance_type')).toBe('high');
      expect(determineSeverity('aws_subnet', 'availability_zone')).toBe('high');
      expect(determineSeverity('aws_eks_cluster', 'version')).toBe('high');
    });

    it('should return medium for storage resource types', () => {
      // @ts-ignore
      const determineSeverity = detector['determineSeverity'].bind(detector);

      expect(determineSeverity('aws_s3_bucket', 'acl')).toBe('medium');
      expect(determineSeverity('aws_rds_proxy', 'engine_version')).toBe('medium');
      expect(determineSeverity('gcp_storage_bucket', 'location')).toBe('medium');
      expect(determineSeverity('aws_dynamodb_table_config', 'read_capacity')).toBe('medium');
      expect(determineSeverity('azure_database_server', 'sku')).toBe('medium');
    });

    it('should return low for tag changes on resources with no other pattern match', () => {
      // @ts-ignore
      const determineSeverity = detector['determineSeverity'].bind(detector);

      // The 'tags' low-severity check only applies when no other
      // pattern (critical, high, medium) matches the resource type.
      expect(determineSeverity('aws_lambda_function', 'tags')).toBe('low');
      expect(determineSeverity('generic_resource', 'tags')).toBe('low');
      expect(determineSeverity('aws_sqs_queue', 'tag_name')).toBe('low');
    });

    it('should check resource type patterns before attribute patterns', () => {
      // @ts-ignore
      const determineSeverity = detector['determineSeverity'].bind(detector);

      // aws_instance matches high (instance pattern) even with tag attribute
      // because resource type is checked at the high level before tags at low level
      expect(determineSeverity('aws_instance', 'tags')).toBe('high');
    });

    it('should default to medium for unrecognized types', () => {
      // @ts-ignore
      const determineSeverity = detector['determineSeverity'].bind(detector);

      expect(determineSeverity('generic_resource', 'some_field')).toBe('medium');
    });
  });
});
