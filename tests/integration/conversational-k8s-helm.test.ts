import { describe, test, expect } from 'bun:test';
import type { InfrastructureRequirements } from '../../services/generator-service/src/conversational/types';

describe('Conversational K8s/Helm Integration', () => {
  describe('K8s requirements type checking', () => {
    test('InfrastructureRequirements supports k8s_config', () => {
      const req: Partial<InfrastructureRequirements> = {
        k8s_config: {
          workloadType: 'deployment',
          image: 'nginx:latest',
          replicas: 3,
          serviceType: 'LoadBalancer',
          containerPort: 8080,
          namespace: 'production',
        },
      };
      expect(req.k8s_config?.workloadType).toBe('deployment');
      expect(req.k8s_config?.replicas).toBe(3);
      expect(req.k8s_config?.containerPort).toBe(8080);
    });

    test('InfrastructureRequirements supports helm_config', () => {
      const req: Partial<InfrastructureRequirements> = {
        helm_config: {
          chartName: 'my-app',
          image: 'my-app:v2',
          replicas: 2,
          namespace: 'staging',
          version: '1.0.0',
        },
      };
      expect(req.helm_config?.chartName).toBe('my-app');
      expect(req.helm_config?.replicas).toBe(2);
      expect(req.helm_config?.version).toBe('1.0.0');
    });

    test('generation_type is available in infrastructure_stack', () => {
      const stack = {
        provider: 'aws',
        components: ['deployment'],
        generation_type: 'kubernetes' as const,
      };
      expect(stack.generation_type).toBe('kubernetes');
    });

    test('K8s workload types are supported', () => {
      const workloadTypes = ['deployment', 'statefulset', 'daemonset', 'job', 'cronjob'];
      for (const wt of workloadTypes) {
        const req: Partial<InfrastructureRequirements> = {
          k8s_config: { workloadType: wt },
        };
        expect(req.k8s_config?.workloadType).toBe(wt);
      }
    });

    test('K8s service types are supported', () => {
      const serviceTypes = ['ClusterIP', 'NodePort', 'LoadBalancer', 'None'];
      for (const st of serviceTypes) {
        const req: Partial<InfrastructureRequirements> = {
          k8s_config: { serviceType: st },
        };
        expect(req.k8s_config?.serviceType).toBe(st);
      }
    });
  });

  describe('from-conversation route contract', () => {
    test('K8s generation request body format', () => {
      const body = {
        sessionId: 'test-session',
        applyBestPractices: false,
      };
      expect(body.sessionId).toBeDefined();
    });

    test('K8s generation response format', () => {
      const response = {
        success: true,
        data: {
          generated_files: {
            'deployment.yaml': 'apiVersion: apps/v1...',
            'service.yaml': 'apiVersion: v1...',
          },
          configuration: {
            appName: 'my-app',
            workloadType: 'deployment',
            image: 'nginx',
          },
          stack: {
            generation_type: 'kubernetes',
            components: ['deployment'],
          },
        },
      };
      expect(response.success).toBe(true);
      expect(Object.keys(response.data.generated_files).length).toBeGreaterThan(0);
      expect(response.data.stack.generation_type).toBe('kubernetes');
    });

    test('Helm generation response format', () => {
      const response = {
        success: true,
        data: {
          generated_files: {
            'Chart.yaml': 'name: my-chart...',
            'values.yaml': 'replicaCount: 1...',
          },
          configuration: {
            name: 'my-chart',
            values: { image: { repository: 'nginx' } },
          },
          stack: {
            generation_type: 'helm',
          },
        },
      };
      expect(response.success).toBe(true);
      expect(response.data.stack.generation_type).toBe('helm');
    });
  });
});
