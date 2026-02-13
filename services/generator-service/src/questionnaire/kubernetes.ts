/**
 * Kubernetes Questionnaire
 *
 * Interactive questionnaire for generating Kubernetes manifests
 */

import type { QuestionnaireStep } from './types';

export const kubernetesQuestionnaire: QuestionnaireStep[] = [
  {
    id: 'workload',
    title: 'Workload Configuration',
    description: 'Configure your Kubernetes workload type and basic settings',
    questions: [
      {
        id: 'workload_type',
        type: 'select',
        label: 'What type of workload?',
        description: 'Choose the Kubernetes resource type for your application',
        options: [
          {
            value: 'deployment',
            label: 'Deployment',
            description: 'Standard stateless workload with rolling updates',
          },
          {
            value: 'statefulset',
            label: 'StatefulSet',
            description: 'Stateful workload with persistent storage and stable network identities',
          },
          {
            value: 'daemonset',
            label: 'DaemonSet',
            description: 'Run a pod on every node (or selected nodes)',
          },
          {
            value: 'job',
            label: 'Job',
            description: 'Run-to-completion batch workload',
          },
          {
            value: 'cronjob',
            label: 'CronJob',
            description: 'Scheduled batch workload',
          },
        ],
        default: 'deployment',
        validation: [
          { type: 'required', message: 'Workload type is required' },
        ],
      },
      {
        id: 'name',
        type: 'text',
        label: 'Workload name',
        description: 'Name for your Kubernetes resources (lowercase, alphanumeric with hyphens)',
        default: 'my-app',
        validation: [
          { type: 'required', message: 'Workload name is required' },
          {
            type: 'pattern',
            value: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
            message: 'Name must be lowercase alphanumeric with hyphens',
          },
        ],
      },
      {
        id: 'namespace',
        type: 'text',
        label: 'Namespace',
        description: 'Kubernetes namespace for your resources',
        default: 'default',
        validation: [
          { type: 'required', message: 'Namespace is required' },
          {
            type: 'pattern',
            value: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
            message: 'Namespace must be lowercase alphanumeric with hyphens',
          },
        ],
      },
      {
        id: 'create_namespace',
        type: 'confirm',
        label: 'Create namespace if not exists?',
        description: 'Include namespace creation in the manifest',
        default: false,
      },
    ],
  },
  {
    id: 'container',
    title: 'Container Configuration',
    description: 'Configure your container image and settings',
    questions: [
      {
        id: 'image',
        type: 'text',
        label: 'Container image',
        description: 'Full image name including registry and tag',
        default: 'nginx:latest',
        validation: [
          { type: 'required', message: 'Container image is required' },
        ],
      },
      {
        id: 'image_pull_policy',
        type: 'select',
        label: 'Image pull policy',
        options: [
          { value: 'Always', label: 'Always', description: 'Always pull the image' },
          { value: 'IfNotPresent', label: 'IfNotPresent', description: 'Pull only if not present' },
          { value: 'Never', label: 'Never', description: 'Never pull, use local image' },
        ],
        default: 'IfNotPresent',
      },
      {
        id: 'container_port',
        type: 'number',
        label: 'Container port',
        description: 'Primary port your application listens on',
        default: 80,
        validation: [
          { type: 'required', message: 'Container port is required' },
          { type: 'min', value: 1, message: 'Port must be at least 1' },
          { type: 'max', value: 65535, message: 'Port must be at most 65535' },
        ],
      },
      {
        id: 'additional_ports',
        type: 'text',
        label: 'Additional ports (comma-separated)',
        description: 'Example: 8080,9090,3000',
        placeholder: '8080,9090',
      },
      {
        id: 'command',
        type: 'text',
        label: 'Container command (optional)',
        description: 'Override container entrypoint',
        placeholder: '/app/start.sh',
      },
      {
        id: 'args',
        type: 'text',
        label: 'Container args (optional)',
        description: 'Arguments passed to the command (comma-separated)',
        placeholder: '--port=8080,--debug',
      },
    ],
  },
  {
    id: 'replicas',
    title: 'Scaling Configuration',
    description: 'Configure replica count and autoscaling',
    condition: (answers) => {
      const type = answers.workload_type as string;
      return type === 'deployment' || type === 'statefulset';
    },
    questions: [
      {
        id: 'replicas',
        type: 'number',
        label: 'Number of replicas',
        description: 'Initial number of pod replicas',
        default: 3,
        validation: [
          { type: 'required', message: 'Replica count is required' },
          { type: 'min', value: 1, message: 'At least 1 replica required' },
        ],
      },
      {
        id: 'enable_hpa',
        type: 'confirm',
        label: 'Enable Horizontal Pod Autoscaler?',
        description: 'Automatically scale pods based on resource usage',
        default: false,
      },
      {
        id: 'hpa_min_replicas',
        type: 'number',
        label: 'Minimum replicas',
        default: 2,
        dependsOn: { questionId: 'enable_hpa', value: true },
        validation: [
          { type: 'min', value: 1, message: 'At least 1 replica required' },
        ],
      },
      {
        id: 'hpa_max_replicas',
        type: 'number',
        label: 'Maximum replicas',
        default: 10,
        dependsOn: { questionId: 'enable_hpa', value: true },
        validation: [
          { type: 'min', value: 1, message: 'At least 1 replica required' },
        ],
      },
      {
        id: 'hpa_target_cpu',
        type: 'number',
        label: 'Target CPU utilization (%)',
        default: 80,
        dependsOn: { questionId: 'enable_hpa', value: true },
        validation: [
          { type: 'min', value: 1, message: 'Must be at least 1%' },
          { type: 'max', value: 100, message: 'Must be at most 100%' },
        ],
      },
    ],
  },
  {
    id: 'resources',
    title: 'Resource Limits',
    description: 'Configure CPU and memory requests/limits',
    questions: [
      {
        id: 'cpu_request',
        type: 'text',
        label: 'CPU request',
        description: 'Minimum CPU allocation (e.g., 100m, 0.5, 1)',
        default: '100m',
        validation: [
          { type: 'required', message: 'CPU request is required' },
        ],
      },
      {
        id: 'cpu_limit',
        type: 'text',
        label: 'CPU limit',
        description: 'Maximum CPU allocation',
        default: '500m',
        validation: [
          { type: 'required', message: 'CPU limit is required' },
        ],
      },
      {
        id: 'memory_request',
        type: 'text',
        label: 'Memory request',
        description: 'Minimum memory allocation (e.g., 128Mi, 1Gi)',
        default: '128Mi',
        validation: [
          { type: 'required', message: 'Memory request is required' },
        ],
      },
      {
        id: 'memory_limit',
        type: 'text',
        label: 'Memory limit',
        description: 'Maximum memory allocation',
        default: '512Mi',
        validation: [
          { type: 'required', message: 'Memory limit is required' },
        ],
      },
    ],
  },
  {
    id: 'service',
    title: 'Service Configuration',
    description: 'Configure how your application is exposed',
    questions: [
      {
        id: 'create_service',
        type: 'confirm',
        label: 'Create a Service?',
        description: 'Expose your workload to other pods or externally',
        default: true,
      },
      {
        id: 'service_type',
        type: 'select',
        label: 'Service type',
        options: [
          {
            value: 'ClusterIP',
            label: 'ClusterIP',
            description: 'Internal access only within the cluster',
          },
          {
            value: 'NodePort',
            label: 'NodePort',
            description: 'Expose on each node\'s IP at a static port',
          },
          {
            value: 'LoadBalancer',
            label: 'LoadBalancer',
            description: 'Expose externally using cloud provider\'s load balancer',
          },
        ],
        default: 'ClusterIP',
        dependsOn: { questionId: 'create_service', value: true },
      },
      {
        id: 'service_port',
        type: 'number',
        label: 'Service port',
        description: 'Port exposed by the service',
        default: 80,
        dependsOn: { questionId: 'create_service', value: true },
      },
    ],
  },
  {
    id: 'ingress',
    title: 'Ingress Configuration',
    description: 'Configure external HTTP/HTTPS access',
    condition: (answers) => answers.create_service === true,
    questions: [
      {
        id: 'create_ingress',
        type: 'confirm',
        label: 'Create an Ingress?',
        description: 'Expose your service via HTTP/HTTPS',
        default: false,
      },
      {
        id: 'ingress_class',
        type: 'select',
        label: 'Ingress class',
        options: [
          { value: 'nginx', label: 'NGINX Ingress Controller' },
          { value: 'traefik', label: 'Traefik' },
          { value: 'alb', label: 'AWS ALB Ingress Controller' },
          { value: 'gce', label: 'GCE Ingress Controller' },
        ],
        default: 'nginx',
        dependsOn: { questionId: 'create_ingress', value: true },
      },
      {
        id: 'ingress_host',
        type: 'text',
        label: 'Hostname',
        description: 'Domain name for your application',
        default: 'app.example.com',
        dependsOn: { questionId: 'create_ingress', value: true },
        validation: [
          { type: 'required', message: 'Hostname is required' },
        ],
      },
      {
        id: 'ingress_tls',
        type: 'confirm',
        label: 'Enable TLS/HTTPS?',
        default: true,
        dependsOn: { questionId: 'create_ingress', value: true },
      },
      {
        id: 'ingress_tls_secret',
        type: 'text',
        label: 'TLS secret name',
        description: 'Kubernetes secret containing TLS certificate',
        default: 'app-tls',
        dependsOn: { questionId: 'ingress_tls', value: true },
      },
    ],
  },
  {
    id: 'probes',
    title: 'Health Probes',
    description: 'Configure liveness and readiness probes',
    questions: [
      {
        id: 'enable_probes',
        type: 'confirm',
        label: 'Enable health probes?',
        description: 'Configure liveness and readiness checks',
        default: true,
      },
      {
        id: 'probe_path',
        type: 'text',
        label: 'Health check path',
        description: 'HTTP path for health checks',
        default: '/health',
        dependsOn: { questionId: 'enable_probes', value: true },
      },
      {
        id: 'probe_port',
        type: 'number',
        label: 'Health check port',
        description: 'Port for health checks (usually same as container port)',
        default: 80,
        dependsOn: { questionId: 'enable_probes', value: true },
      },
      {
        id: 'liveness_initial_delay',
        type: 'number',
        label: 'Liveness initial delay (seconds)',
        default: 30,
        dependsOn: { questionId: 'enable_probes', value: true },
      },
      {
        id: 'readiness_initial_delay',
        type: 'number',
        label: 'Readiness initial delay (seconds)',
        default: 5,
        dependsOn: { questionId: 'enable_probes', value: true },
      },
    ],
  },
  {
    id: 'storage',
    title: 'Storage Configuration',
    description: 'Configure persistent storage',
    condition: (answers) => answers.workload_type === 'statefulset',
    questions: [
      {
        id: 'enable_pvc',
        type: 'confirm',
        label: 'Enable persistent storage?',
        default: true,
      },
      {
        id: 'storage_class',
        type: 'text',
        label: 'Storage class',
        description: 'Kubernetes storage class name',
        default: 'standard',
        dependsOn: { questionId: 'enable_pvc', value: true },
      },
      {
        id: 'storage_size',
        type: 'text',
        label: 'Storage size',
        description: 'Size of persistent volume (e.g., 10Gi)',
        default: '10Gi',
        dependsOn: { questionId: 'enable_pvc', value: true },
      },
      {
        id: 'mount_path',
        type: 'text',
        label: 'Mount path',
        description: 'Path where volume is mounted in container',
        default: '/data',
        dependsOn: { questionId: 'enable_pvc', value: true },
      },
    ],
  },
  {
    id: 'configmap',
    title: 'Configuration',
    description: 'Configure ConfigMaps and environment variables',
    questions: [
      {
        id: 'create_configmap',
        type: 'confirm',
        label: 'Create a ConfigMap?',
        description: 'Store configuration data as key-value pairs',
        default: false,
      },
      {
        id: 'env_vars',
        type: 'text',
        label: 'Environment variables (KEY=value,KEY2=value2)',
        description: 'Comma-separated list of environment variables',
        placeholder: 'NODE_ENV=production,LOG_LEVEL=info',
      },
    ],
  },
];
