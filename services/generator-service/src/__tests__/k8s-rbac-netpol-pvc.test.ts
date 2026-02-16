/**
 * Kubernetes Generator - RBAC, NetworkPolicy, PVC Tests
 */

import { describe, it, expect } from 'bun:test';
import { KubernetesGenerator } from '../generators/kubernetes-generator';
import * as yaml from 'js-yaml';

describe('KubernetesGenerator - RBAC, NetworkPolicy, PVC', () => {
  describe('RBAC - Role & RoleBinding', () => {
    it('should generate Role with default rules when rbac enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'rbac-app',
        image: 'nginx',
        workloadType: 'deployment',
        rbac: { enabled: true },
      });

      const manifests = generator.generate();
      const role = manifests.find(m => m.kind === 'Role');

      expect(role).toBeDefined();
      expect(role!.name).toBe('role');

      const parsed = yaml.load(role!.content) as any;
      expect(parsed.apiVersion).toBe('rbac.authorization.k8s.io/v1');
      expect(parsed.kind).toBe('Role');
      expect(parsed.metadata.name).toBe('rbac-app-role');
      expect(parsed.rules).toBeInstanceOf(Array);
      expect(parsed.rules.length).toBeGreaterThan(0);
    });

    it('should generate RoleBinding when rbac enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'rbac-app',
        image: 'nginx',
        workloadType: 'deployment',
        rbac: { enabled: true },
      });

      const manifests = generator.generate();
      const rb = manifests.find(m => m.kind === 'RoleBinding');

      expect(rb).toBeDefined();
      expect(rb!.name).toBe('rolebinding');

      const parsed = yaml.load(rb!.content) as any;
      expect(parsed.apiVersion).toBe('rbac.authorization.k8s.io/v1');
      expect(parsed.kind).toBe('RoleBinding');
      expect(parsed.metadata.name).toBe('rbac-app-rolebinding');
      expect(parsed.subjects[0].kind).toBe('ServiceAccount');
      expect(parsed.roleRef.kind).toBe('Role');
      expect(parsed.roleRef.name).toBe('rbac-app-role');
    });

    it('should use custom rules when provided', () => {
      const customRules = [
        { apiGroups: ['apps'], resources: ['deployments'], verbs: ['get', 'list', 'create', 'update'] },
        { apiGroups: [''], resources: ['secrets'], verbs: ['get'] },
      ];

      const generator = new KubernetesGenerator({
        appName: 'custom-rbac',
        image: 'nginx',
        workloadType: 'deployment',
        rbac: { enabled: true, rules: customRules },
      });

      const manifests = generator.generate();
      const role = manifests.find(m => m.kind === 'Role');
      const parsed = yaml.load(role!.content) as any;

      expect(parsed.rules).toHaveLength(2);
      expect(parsed.rules[0].apiGroups).toEqual(['apps']);
      expect(parsed.rules[0].resources).toEqual(['deployments']);
      expect(parsed.rules[1].resources).toEqual(['secrets']);
    });

    it('should not generate RBAC when disabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'no-rbac',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const role = manifests.find(m => m.kind === 'Role');
      const rb = manifests.find(m => m.kind === 'RoleBinding');

      expect(role).toBeUndefined();
      expect(rb).toBeUndefined();
    });

    it('should set correct namespace in Role and RoleBinding', () => {
      const generator = new KubernetesGenerator({
        appName: 'ns-rbac',
        image: 'nginx',
        workloadType: 'deployment',
        namespace: 'my-namespace',
        rbac: { enabled: true },
      });

      const manifests = generator.generate();
      const role = manifests.find(m => m.kind === 'Role');
      const rb = manifests.find(m => m.kind === 'RoleBinding');

      const roleParsed = yaml.load(role!.content) as any;
      const rbParsed = yaml.load(rb!.content) as any;

      expect(roleParsed.metadata.namespace).toBe('my-namespace');
      expect(rbParsed.metadata.namespace).toBe('my-namespace');
    });
  });

  describe('RBAC - ClusterRole & ClusterRoleBinding', () => {
    it('should generate ClusterRole when clusterWide is true', () => {
      const generator = new KubernetesGenerator({
        appName: 'cluster-app',
        image: 'nginx',
        workloadType: 'deployment',
        rbac: { enabled: true, clusterWide: true },
      });

      const manifests = generator.generate();
      const cr = manifests.find(m => m.kind === 'ClusterRole');

      expect(cr).toBeDefined();
      expect(cr!.name).toBe('clusterrole');

      const parsed = yaml.load(cr!.content) as any;
      expect(parsed.apiVersion).toBe('rbac.authorization.k8s.io/v1');
      expect(parsed.kind).toBe('ClusterRole');
      expect(parsed.metadata.name).toBe('cluster-app-clusterrole');
      // ClusterRole should not have namespace
      expect(parsed.metadata.namespace).toBeUndefined();
    });

    it('should generate ClusterRoleBinding when clusterWide is true', () => {
      const generator = new KubernetesGenerator({
        appName: 'cluster-app',
        image: 'nginx',
        workloadType: 'deployment',
        rbac: { enabled: true, clusterWide: true },
      });

      const manifests = generator.generate();
      const crb = manifests.find(m => m.kind === 'ClusterRoleBinding');

      expect(crb).toBeDefined();

      const parsed = yaml.load(crb!.content) as any;
      expect(parsed.kind).toBe('ClusterRoleBinding');
      expect(parsed.roleRef.kind).toBe('ClusterRole');
      expect(parsed.roleRef.name).toBe('cluster-app-clusterrole');
    });

    it('should not generate ClusterRole when clusterWide is false', () => {
      const generator = new KubernetesGenerator({
        appName: 'local-rbac',
        image: 'nginx',
        workloadType: 'deployment',
        rbac: { enabled: true, clusterWide: false },
      });

      const manifests = generator.generate();
      const cr = manifests.find(m => m.kind === 'ClusterRole');
      const crb = manifests.find(m => m.kind === 'ClusterRoleBinding');

      expect(cr).toBeUndefined();
      expect(crb).toBeUndefined();
    });

    it('should generate both Role and ClusterRole when clusterWide is true', () => {
      const generator = new KubernetesGenerator({
        appName: 'both-rbac',
        image: 'nginx',
        workloadType: 'deployment',
        rbac: { enabled: true, clusterWide: true },
      });

      const manifests = generator.generate();
      const role = manifests.find(m => m.kind === 'Role');
      const cr = manifests.find(m => m.kind === 'ClusterRole');

      expect(role).toBeDefined();
      expect(cr).toBeDefined();
    });
  });

  describe('NetworkPolicy', () => {
    it('should generate NetworkPolicy when enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'netpol-app',
        image: 'nginx',
        workloadType: 'deployment',
        containerPort: 8080,
        networkPolicy: { enabled: true },
      });

      const manifests = generator.generate();
      const np = manifests.find(m => m.kind === 'NetworkPolicy');

      expect(np).toBeDefined();
      expect(np!.name).toBe('networkpolicy');

      const parsed = yaml.load(np!.content) as any;
      expect(parsed.apiVersion).toBe('networking.k8s.io/v1');
      expect(parsed.kind).toBe('NetworkPolicy');
      expect(parsed.metadata.name).toBe('netpol-app-netpol');
      expect(parsed.spec.podSelector.matchLabels['app.kubernetes.io/name']).toBe('netpol-app');
      expect(parsed.spec.policyTypes).toContain('Ingress');
    });

    it('should use default ingress rules when none provided', () => {
      const generator = new KubernetesGenerator({
        appName: 'default-netpol',
        image: 'nginx',
        workloadType: 'deployment',
        containerPort: 3000,
        networkPolicy: { enabled: true },
      });

      const manifests = generator.generate();
      const np = manifests.find(m => m.kind === 'NetworkPolicy');
      const parsed = yaml.load(np!.content) as any;

      expect(parsed.spec.ingress).toBeDefined();
      expect(parsed.spec.ingress[0].ports[0].port).toBe(3000);
    });

    it('should use custom ingress rules when provided', () => {
      const customIngress = [
        {
          from: [{ namespaceSelector: { matchLabels: { name: 'frontend' } } }],
          ports: [{ protocol: 'TCP', port: 8080 }],
        },
      ];

      const generator = new KubernetesGenerator({
        appName: 'custom-netpol',
        image: 'nginx',
        workloadType: 'deployment',
        networkPolicy: { enabled: true, ingressRules: customIngress },
      });

      const manifests = generator.generate();
      const np = manifests.find(m => m.kind === 'NetworkPolicy');
      const parsed = yaml.load(np!.content) as any;

      expect(parsed.spec.ingress).toEqual(customIngress);
    });

    it('should include egress rules when provided', () => {
      const egressRules = [
        { to: [{ ipBlock: { cidr: '10.0.0.0/8' } }], ports: [{ protocol: 'TCP', port: 443 }] },
      ];

      const generator = new KubernetesGenerator({
        appName: 'egress-app',
        image: 'nginx',
        workloadType: 'deployment',
        networkPolicy: { enabled: true, egressRules },
      });

      const manifests = generator.generate();
      const np = manifests.find(m => m.kind === 'NetworkPolicy');
      const parsed = yaml.load(np!.content) as any;

      expect(parsed.spec.policyTypes).toContain('Egress');
      expect(parsed.spec.egress).toEqual(egressRules);
    });

    it('should not generate NetworkPolicy when disabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'no-netpol',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const np = manifests.find(m => m.kind === 'NetworkPolicy');

      expect(np).toBeUndefined();
    });

    it('should include namespace in NetworkPolicy', () => {
      const generator = new KubernetesGenerator({
        appName: 'ns-netpol',
        image: 'nginx',
        workloadType: 'deployment',
        namespace: 'secure-ns',
        networkPolicy: { enabled: true },
      });

      const manifests = generator.generate();
      const np = manifests.find(m => m.kind === 'NetworkPolicy');
      const parsed = yaml.load(np!.content) as any;

      expect(parsed.metadata.namespace).toBe('secure-ns');
    });
  });

  describe('PersistentVolumeClaim', () => {
    it('should generate PVC when persistence enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'pvc-app',
        image: 'nginx',
        workloadType: 'deployment',
        persistence: { enabled: true },
      });

      const manifests = generator.generate();
      const pvc = manifests.find(m => m.kind === 'PersistentVolumeClaim');

      expect(pvc).toBeDefined();
      expect(pvc!.name).toBe('pvc');

      const parsed = yaml.load(pvc!.content) as any;
      expect(parsed.apiVersion).toBe('v1');
      expect(parsed.kind).toBe('PersistentVolumeClaim');
      expect(parsed.metadata.name).toBe('pvc-app-pvc');
      expect(parsed.spec.accessModes).toEqual(['ReadWriteOnce']);
      expect(parsed.spec.storageClassName).toBe('standard');
      expect(parsed.spec.resources.requests.storage).toBe('10Gi');
    });

    it('should use custom storage class and size', () => {
      const generator = new KubernetesGenerator({
        appName: 'custom-pvc',
        image: 'postgres',
        workloadType: 'statefulset',
        persistence: {
          enabled: true,
          storageClass: 'gp3',
          size: '100Gi',
          accessModes: ['ReadWriteOnce'],
        },
      });

      const manifests = generator.generate();
      const pvc = manifests.find(m => m.kind === 'PersistentVolumeClaim');
      const parsed = yaml.load(pvc!.content) as any;

      expect(parsed.spec.storageClassName).toBe('gp3');
      expect(parsed.spec.resources.requests.storage).toBe('100Gi');
      expect(parsed.spec.accessModes).toEqual(['ReadWriteOnce']);
    });

    it('should support ReadWriteMany access mode', () => {
      const generator = new KubernetesGenerator({
        appName: 'shared-pvc',
        image: 'nginx',
        workloadType: 'deployment',
        persistence: {
          enabled: true,
          accessModes: ['ReadWriteMany'],
          size: '50Gi',
        },
      });

      const manifests = generator.generate();
      const pvc = manifests.find(m => m.kind === 'PersistentVolumeClaim');
      const parsed = yaml.load(pvc!.content) as any;

      expect(parsed.spec.accessModes).toEqual(['ReadWriteMany']);
    });

    it('should not generate PVC when persistence disabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'no-pvc',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const pvc = manifests.find(m => m.kind === 'PersistentVolumeClaim');

      expect(pvc).toBeUndefined();
    });

    it('should include namespace in PVC', () => {
      const generator = new KubernetesGenerator({
        appName: 'ns-pvc',
        image: 'nginx',
        workloadType: 'deployment',
        namespace: 'data-ns',
        persistence: { enabled: true, size: '20Gi' },
      });

      const manifests = generator.generate();
      const pvc = manifests.find(m => m.kind === 'PersistentVolumeClaim');
      const parsed = yaml.load(pvc!.content) as any;

      expect(parsed.metadata.namespace).toBe('data-ns');
    });

    it('should include labels in PVC', () => {
      const generator = new KubernetesGenerator({
        appName: 'labeled-pvc',
        image: 'nginx',
        workloadType: 'deployment',
        persistence: { enabled: true },
        labels: { tier: 'storage' },
      });

      const manifests = generator.generate();
      const pvc = manifests.find(m => m.kind === 'PersistentVolumeClaim');
      const parsed = yaml.load(pvc!.content) as any;

      expect(parsed.metadata.labels['app.kubernetes.io/name']).toBe('labeled-pvc');
      expect(parsed.metadata.labels['tier']).toBe('storage');
    });
  });

  describe('Conditional generation', () => {
    it('should not generate RBAC, NetworkPolicy, or PVC by default', () => {
      const generator = new KubernetesGenerator({
        appName: 'basic-app',
        image: 'nginx',
        workloadType: 'deployment',
      });

      const manifests = generator.generate();
      const kinds = manifests.map(m => m.kind);

      expect(kinds).not.toContain('Role');
      expect(kinds).not.toContain('RoleBinding');
      expect(kinds).not.toContain('ClusterRole');
      expect(kinds).not.toContain('ClusterRoleBinding');
      expect(kinds).not.toContain('NetworkPolicy');
      expect(kinds).not.toContain('PersistentVolumeClaim');
    });

    it('should generate all types when all features enabled', () => {
      const generator = new KubernetesGenerator({
        appName: 'full-app',
        image: 'nginx',
        workloadType: 'deployment',
        rbac: { enabled: true, clusterWide: true },
        networkPolicy: { enabled: true },
        persistence: { enabled: true },
      });

      const manifests = generator.generate();
      const kinds = manifests.map(m => m.kind);

      expect(kinds).toContain('Role');
      expect(kinds).toContain('RoleBinding');
      expect(kinds).toContain('ClusterRole');
      expect(kinds).toContain('ClusterRoleBinding');
      expect(kinds).toContain('NetworkPolicy');
      expect(kinds).toContain('PersistentVolumeClaim');
    });
  });
});
