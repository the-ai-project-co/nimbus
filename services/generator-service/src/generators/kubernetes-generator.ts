/**
 * Kubernetes Manifest Generator
 *
 * Generates Kubernetes manifests from configuration
 */

import * as yaml from 'js-yaml';
import * as path from 'node:path';
import * as fs from 'node:fs';

// ==========================================
// Types
// ==========================================

export interface K8sGeneratorConfig {
  appName: string;
  namespace?: string;
  workloadType: 'deployment' | 'statefulset' | 'daemonset' | 'job' | 'cronjob';
  replicas?: number;
  image: string;
  imageTag?: string;
  containerPort?: number;
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'None';
  ingressEnabled?: boolean;
  ingressHost?: string;
  resources?: {
    requests?: { cpu?: string; memory?: string };
    limits?: { cpu?: string; memory?: string };
  };
  env?: { name: string; value: string }[];
  envFrom?: { configMapRef?: string; secretRef?: string }[];
  volumes?: K8sVolume[];
  hpa?: {
    enabled: boolean;
    minReplicas?: number;
    maxReplicas?: number;
    targetCPUUtilization?: number;
  };
  pdb?: {
    enabled: boolean;
    minAvailable?: number | string;
  };
  serviceAccount?: {
    create: boolean;
    name?: string;
    annotations?: Record<string, string>;
  };
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  nodeSelector?: Record<string, string>;
  tolerations?: K8sToleration[];
  affinity?: K8sAffinity;
  healthChecks?: {
    livenessProbe?: K8sProbe;
    readinessProbe?: K8sProbe;
    startupProbe?: K8sProbe;
  };
  configMap?: {
    data: Record<string, string>;
  };
  secret?: {
    data: Record<string, string>;
    type?: string;
  };
  rbac?: {
    enabled?: boolean;
    clusterWide?: boolean;
    rules?: Array<{ apiGroups: string[]; resources: string[]; verbs: string[] }>;
  };
  networkPolicy?: {
    enabled?: boolean;
    ingressRules?: Array<{ from?: any[]; ports?: any[] }>;
    egressRules?: Array<{ to?: any[]; ports?: any[] }>;
  };
  persistence?: {
    enabled?: boolean;
    storageClass?: string;
    size?: string;
    accessModes?: string[];
  };
}

interface K8sVolume {
  name: string;
  type: 'emptyDir' | 'configMap' | 'secret' | 'persistentVolumeClaim' | 'hostPath';
  mountPath: string;
  subPath?: string;
  configMapName?: string;
  secretName?: string;
  pvcName?: string;
  hostPath?: string;
}

interface K8sToleration {
  key: string;
  operator: 'Equal' | 'Exists';
  value?: string;
  effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
}

interface K8sAffinity {
  nodeAffinity?: any;
  podAffinity?: any;
  podAntiAffinity?: any;
}

interface K8sProbe {
  httpGet?: { path: string; port: number | string };
  tcpSocket?: { port: number | string };
  exec?: { command: string[] };
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  successThreshold?: number;
  failureThreshold?: number;
}

export interface GeneratedManifest {
  name: string;
  kind: string;
  content: string;
}

// ==========================================
// Generator Class
// ==========================================

export class KubernetesGenerator {
  private config: K8sGeneratorConfig;

  constructor(config: K8sGeneratorConfig) {
    this.config = {
      namespace: 'default',
      imageTag: 'latest',
      replicas: 1,
      containerPort: 8080,
      serviceType: 'ClusterIP',
      ...config,
    };
  }

  /**
   * Generate all manifests based on configuration
   */
  generate(): GeneratedManifest[] {
    const manifests: GeneratedManifest[] = [];

    // Namespace (if not default)
    if (this.config.namespace && this.config.namespace !== 'default') {
      manifests.push(this.generateNamespace());
    }

    // ServiceAccount
    if (this.config.serviceAccount?.create) {
      manifests.push(this.generateServiceAccount());
    }

    // ConfigMap
    if (this.config.configMap) {
      manifests.push(this.generateConfigMap());
    }

    // Secret
    if (this.config.secret) {
      manifests.push(this.generateSecret());
    }

    // Workload (Deployment, StatefulSet, etc.)
    manifests.push(this.generateWorkload());

    // Service
    if (this.config.serviceType !== 'None') {
      manifests.push(this.generateService());
    }

    // Ingress
    if (this.config.ingressEnabled) {
      manifests.push(this.generateIngress());
    }

    // HPA
    if (this.config.hpa?.enabled) {
      manifests.push(this.generateHPA());
    }

    // PDB
    if (this.config.pdb?.enabled) {
      manifests.push(this.generatePDB());
    }

    // RBAC
    if (this.config.rbac?.enabled) {
      manifests.push(this.generateRole());
      manifests.push(this.generateRoleBinding());
      if (this.config.rbac?.clusterWide) {
        manifests.push(this.generateClusterRole());
        manifests.push(this.generateClusterRoleBinding());
      }
    }

    // NetworkPolicy
    if (this.config.networkPolicy?.enabled) {
      manifests.push(this.generateNetworkPolicy());
    }

    // PersistentVolumeClaim
    if (this.config.persistence?.enabled) {
      manifests.push(this.generatePersistentVolumeClaim());
    }

    return manifests;
  }

  /**
   * Generate combined YAML file
   */
  generateCombined(): string {
    const manifests = this.generate();
    return manifests.map(m => m.content).join('\n---\n');
  }

  /**
   * Write manifests to files
   */
  writeToFiles(outputDir: string): string[] {
    const manifests = this.generate();
    const files: string[] = [];

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const manifest of manifests) {
      const filename = `${manifest.name}.yaml`;
      const filepath = path.join(outputDir, filename);
      fs.writeFileSync(filepath, manifest.content);
      files.push(filepath);
    }

    // Write kustomization.yaml
    const kustomization = this.generateKustomization(manifests);
    const kustomizationPath = path.join(outputDir, 'kustomization.yaml');
    fs.writeFileSync(kustomizationPath, kustomization);
    files.push(kustomizationPath);

    return files;
  }

  // ==========================================
  // Private Generator Methods
  // ==========================================

  private getLabels(): Record<string, string> {
    return {
      'app.kubernetes.io/name': this.config.appName,
      'app.kubernetes.io/instance': this.config.appName,
      'app.kubernetes.io/managed-by': 'nimbus',
      ...this.config.labels,
    };
  }

  private getSelectorLabels(): Record<string, string> {
    return {
      'app.kubernetes.io/name': this.config.appName,
      'app.kubernetes.io/instance': this.config.appName,
    };
  }

  private generateNamespace(): GeneratedManifest {
    const manifest = {
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: this.config.namespace,
        labels: this.getLabels(),
      },
    };

    return {
      name: 'namespace',
      kind: 'Namespace',
      content: yaml.dump(manifest),
    };
  }

  private generateServiceAccount(): GeneratedManifest {
    const manifest = {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name: this.config.serviceAccount?.name || this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
        ...(this.config.serviceAccount?.annotations && {
          annotations: this.config.serviceAccount.annotations,
        }),
      },
    };

    return {
      name: 'serviceaccount',
      kind: 'ServiceAccount',
      content: yaml.dump(manifest),
    };
  }

  private generateConfigMap(): GeneratedManifest {
    const manifest = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${this.config.appName}-config`,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      data: this.config.configMap?.data || {},
    };

    return {
      name: 'configmap',
      kind: 'ConfigMap',
      content: yaml.dump(manifest),
    };
  }

  private generateSecret(): GeneratedManifest {
    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.config.secret?.data || {})) {
      data[key] = Buffer.from(value).toString('base64');
    }

    const manifest = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${this.config.appName}-secret`,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      type: this.config.secret?.type || 'Opaque',
      data,
    };

    return {
      name: 'secret',
      kind: 'Secret',
      content: yaml.dump(manifest),
    };
  }

  private generateWorkload(): GeneratedManifest {
    const container = this.buildContainer();
    const volumes = this.buildVolumes();

    let manifest: any;

    switch (this.config.workloadType) {
      case 'deployment':
        manifest = this.buildDeployment(container, volumes);
        break;
      case 'statefulset':
        manifest = this.buildStatefulSet(container, volumes);
        break;
      case 'daemonset':
        manifest = this.buildDaemonSet(container, volumes);
        break;
      case 'job':
        manifest = this.buildJob(container, volumes);
        break;
      case 'cronjob':
        manifest = this.buildCronJob(container, volumes);
        break;
      default:
        manifest = this.buildDeployment(container, volumes);
    }

    return {
      name: this.config.workloadType,
      kind: manifest.kind,
      content: yaml.dump(manifest),
    };
  }

  private buildContainer(): any {
    const container: any = {
      name: this.config.appName,
      image: `${this.config.image}:${this.config.imageTag}`,
      ports: [
        {
          name: 'http',
          containerPort: this.config.containerPort,
          protocol: 'TCP',
        },
      ],
    };

    // Resources
    if (this.config.resources) {
      container.resources = this.config.resources;
    }

    // Environment variables
    if (this.config.env && this.config.env.length > 0) {
      container.env = this.config.env;
    }

    // Environment from ConfigMaps/Secrets
    if (this.config.envFrom && this.config.envFrom.length > 0) {
      container.envFrom = this.config.envFrom.map(ef => {
        if (ef.configMapRef) {
          return { configMapRef: { name: ef.configMapRef } };
        }
        if (ef.secretRef) {
          return { secretRef: { name: ef.secretRef } };
        }
        return {};
      });
    }

    // Volume mounts
    if (this.config.volumes && this.config.volumes.length > 0) {
      container.volumeMounts = this.config.volumes.map(v => ({
        name: v.name,
        mountPath: v.mountPath,
        ...(v.subPath && { subPath: v.subPath }),
      }));
    }

    // Health checks
    if (this.config.healthChecks) {
      if (this.config.healthChecks.livenessProbe) {
        container.livenessProbe = this.config.healthChecks.livenessProbe;
      }
      if (this.config.healthChecks.readinessProbe) {
        container.readinessProbe = this.config.healthChecks.readinessProbe;
      }
      if (this.config.healthChecks.startupProbe) {
        container.startupProbe = this.config.healthChecks.startupProbe;
      }
    }

    return container;
  }

  private buildVolumes(): any[] {
    if (!this.config.volumes || this.config.volumes.length === 0) {
      return [];
    }

    return this.config.volumes.map(v => {
      const volume: any = { name: v.name };

      switch (v.type) {
        case 'emptyDir':
          volume.emptyDir = {};
          break;
        case 'configMap':
          volume.configMap = { name: v.configMapName };
          break;
        case 'secret':
          volume.secret = { secretName: v.secretName };
          break;
        case 'persistentVolumeClaim':
          volume.persistentVolumeClaim = { claimName: v.pvcName };
          break;
        case 'hostPath':
          volume.hostPath = { path: v.hostPath };
          break;
      }

      return volume;
    });
  }

  private buildPodSpec(container: any, volumes: any[]): any {
    const spec: any = {
      containers: [container],
    };

    if (this.config.serviceAccount?.create || this.config.serviceAccount?.name) {
      spec.serviceAccountName = this.config.serviceAccount?.name || this.config.appName;
    }

    if (volumes.length > 0) {
      spec.volumes = volumes;
    }

    if (this.config.nodeSelector) {
      spec.nodeSelector = this.config.nodeSelector;
    }

    if (this.config.tolerations && this.config.tolerations.length > 0) {
      spec.tolerations = this.config.tolerations;
    }

    if (this.config.affinity) {
      spec.affinity = this.config.affinity;
    }

    return spec;
  }

  private buildDeployment(container: any, volumes: any[]): any {
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
        ...(this.config.annotations && { annotations: this.config.annotations }),
      },
      spec: {
        replicas: this.config.replicas,
        selector: {
          matchLabels: this.getSelectorLabels(),
        },
        template: {
          metadata: {
            labels: this.getLabels(),
          },
          spec: this.buildPodSpec(container, volumes),
        },
      },
    };
  }

  private buildStatefulSet(container: any, volumes: any[]): any {
    return {
      apiVersion: 'apps/v1',
      kind: 'StatefulSet',
      metadata: {
        name: this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      spec: {
        serviceName: this.config.appName,
        replicas: this.config.replicas,
        selector: {
          matchLabels: this.getSelectorLabels(),
        },
        template: {
          metadata: {
            labels: this.getLabels(),
          },
          spec: this.buildPodSpec(container, volumes),
        },
      },
    };
  }

  private buildDaemonSet(container: any, volumes: any[]): any {
    return {
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      metadata: {
        name: this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      spec: {
        selector: {
          matchLabels: this.getSelectorLabels(),
        },
        template: {
          metadata: {
            labels: this.getLabels(),
          },
          spec: this.buildPodSpec(container, volumes),
        },
      },
    };
  }

  private buildJob(container: any, volumes: any[]): any {
    return {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      spec: {
        template: {
          metadata: {
            labels: this.getLabels(),
          },
          spec: {
            ...this.buildPodSpec(container, volumes),
            restartPolicy: 'OnFailure',
          },
        },
      },
    };
  }

  private buildCronJob(container: any, volumes: any[]): any {
    return {
      apiVersion: 'batch/v1',
      kind: 'CronJob',
      metadata: {
        name: this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      spec: {
        schedule: '0 * * * *', // Default: every hour
        jobTemplate: {
          spec: {
            template: {
              metadata: {
                labels: this.getLabels(),
              },
              spec: {
                ...this.buildPodSpec(container, volumes),
                restartPolicy: 'OnFailure',
              },
            },
          },
        },
      },
    };
  }

  private generateService(): GeneratedManifest {
    const manifest = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      spec: {
        type: this.config.serviceType,
        ports: [
          {
            port: this.config.containerPort,
            targetPort: 'http',
            protocol: 'TCP',
            name: 'http',
          },
        ],
        selector: this.getSelectorLabels(),
      },
    };

    return {
      name: 'service',
      kind: 'Service',
      content: yaml.dump(manifest),
    };
  }

  private generateIngress(): GeneratedManifest {
    const manifest = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
        annotations: {
          'kubernetes.io/ingress.class': 'nginx',
        },
      },
      spec: {
        rules: [
          {
            host: this.config.ingressHost || `${this.config.appName}.example.com`,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: this.config.appName,
                      port: {
                        number: this.config.containerPort,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    };

    return {
      name: 'ingress',
      kind: 'Ingress',
      content: yaml.dump(manifest),
    };
  }

  private generateHPA(): GeneratedManifest {
    const manifest = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: this.config.appName,
        },
        minReplicas: this.config.hpa?.minReplicas || 1,
        maxReplicas: this.config.hpa?.maxReplicas || 10,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: this.config.hpa?.targetCPUUtilization || 80,
              },
            },
          },
        ],
      },
    };

    return {
      name: 'hpa',
      kind: 'HorizontalPodAutoscaler',
      content: yaml.dump(manifest),
    };
  }

  private generatePDB(): GeneratedManifest {
    const manifest = {
      apiVersion: 'policy/v1',
      kind: 'PodDisruptionBudget',
      metadata: {
        name: this.config.appName,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      spec: {
        minAvailable: this.config.pdb?.minAvailable || 1,
        selector: {
          matchLabels: this.getSelectorLabels(),
        },
      },
    };

    return {
      name: 'pdb',
      kind: 'PodDisruptionBudget',
      content: yaml.dump(manifest),
    };
  }

  private generateRole(): GeneratedManifest {
    const rules = this.config.rbac?.rules || [
      { apiGroups: [''], resources: ['pods', 'services', 'configmaps'], verbs: ['get', 'list', 'watch'] },
    ];

    const manifest = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: {
        name: `${this.config.appName}-role`,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      rules,
    };

    return {
      name: 'role',
      kind: 'Role',
      content: yaml.dump(manifest),
    };
  }

  private generateRoleBinding(): GeneratedManifest {
    const manifest = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: {
        name: `${this.config.appName}-rolebinding`,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: this.config.serviceAccount?.name || this.config.appName,
          namespace: this.config.namespace,
        },
      ],
      roleRef: {
        kind: 'Role',
        name: `${this.config.appName}-role`,
        apiGroup: 'rbac.authorization.k8s.io',
      },
    };

    return {
      name: 'rolebinding',
      kind: 'RoleBinding',
      content: yaml.dump(manifest),
    };
  }

  private generateClusterRole(): GeneratedManifest {
    const rules = this.config.rbac?.rules || [
      { apiGroups: [''], resources: ['pods', 'services', 'configmaps'], verbs: ['get', 'list', 'watch'] },
    ];

    const manifest = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRole',
      metadata: {
        name: `${this.config.appName}-clusterrole`,
        labels: this.getLabels(),
      },
      rules,
    };

    return {
      name: 'clusterrole',
      kind: 'ClusterRole',
      content: yaml.dump(manifest),
    };
  }

  private generateClusterRoleBinding(): GeneratedManifest {
    const manifest = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'ClusterRoleBinding',
      metadata: {
        name: `${this.config.appName}-clusterrolebinding`,
        labels: this.getLabels(),
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: this.config.serviceAccount?.name || this.config.appName,
          namespace: this.config.namespace,
        },
      ],
      roleRef: {
        kind: 'ClusterRole',
        name: `${this.config.appName}-clusterrole`,
        apiGroup: 'rbac.authorization.k8s.io',
      },
    };

    return {
      name: 'clusterrolebinding',
      kind: 'ClusterRoleBinding',
      content: yaml.dump(manifest),
    };
  }

  private generateNetworkPolicy(): GeneratedManifest {
    const spec: any = {
      podSelector: {
        matchLabels: this.getSelectorLabels(),
      },
      policyTypes: [] as string[],
    };

    if (this.config.networkPolicy?.ingressRules) {
      spec.policyTypes.push('Ingress');
      spec.ingress = this.config.networkPolicy.ingressRules;
    } else {
      spec.policyTypes.push('Ingress');
      spec.ingress = [
        {
          from: [
            {
              podSelector: {
                matchLabels: this.getSelectorLabels(),
              },
            },
          ],
          ports: [
            {
              protocol: 'TCP',
              port: this.config.containerPort,
            },
          ],
        },
      ];
    }

    if (this.config.networkPolicy?.egressRules) {
      spec.policyTypes.push('Egress');
      spec.egress = this.config.networkPolicy.egressRules;
    }

    const manifest = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: `${this.config.appName}-netpol`,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      spec,
    };

    return {
      name: 'networkpolicy',
      kind: 'NetworkPolicy',
      content: yaml.dump(manifest),
    };
  }

  private generatePersistentVolumeClaim(): GeneratedManifest {
    const manifest = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: `${this.config.appName}-pvc`,
        namespace: this.config.namespace,
        labels: this.getLabels(),
      },
      spec: {
        accessModes: this.config.persistence?.accessModes || ['ReadWriteOnce'],
        storageClassName: this.config.persistence?.storageClass || 'standard',
        resources: {
          requests: {
            storage: this.config.persistence?.size || '10Gi',
          },
        },
      },
    };

    return {
      name: 'pvc',
      kind: 'PersistentVolumeClaim',
      content: yaml.dump(manifest),
    };
  }

  private generateKustomization(manifests: GeneratedManifest[]): string {
    const kustomization = {
      apiVersion: 'kustomize.config.k8s.io/v1beta1',
      kind: 'Kustomization',
      namespace: this.config.namespace,
      resources: manifests.map(m => `${m.name}.yaml`),
      commonLabels: this.getSelectorLabels(),
    };

    return yaml.dump(kustomization);
  }
}

/**
 * Factory function for creating a Kubernetes generator
 */
export function createKubernetesGenerator(config: K8sGeneratorConfig): KubernetesGenerator {
  return new KubernetesGenerator(config);
}
