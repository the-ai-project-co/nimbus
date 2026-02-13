/**
 * Helm Questionnaire
 *
 * Interactive questionnaire for generating Helm charts
 */

import type { QuestionnaireStep } from './types';

export const helmQuestionnaire: QuestionnaireStep[] = [
  {
    id: 'chart_info',
    title: 'Chart Information',
    description: 'Basic information about your Helm chart',
    questions: [
      {
        id: 'chart_name',
        type: 'text',
        label: 'Chart name',
        description: 'Name of your Helm chart (lowercase, alphanumeric with hyphens)',
        default: 'my-chart',
        validation: [
          { type: 'required', message: 'Chart name is required' },
          {
            type: 'pattern',
            value: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
            message: 'Chart name must be lowercase alphanumeric with hyphens',
          },
        ],
      },
      {
        id: 'chart_version',
        type: 'text',
        label: 'Chart version',
        description: 'Semantic version of the chart',
        default: '0.1.0',
        validation: [
          { type: 'required', message: 'Chart version is required' },
          {
            type: 'pattern',
            value: /^\d+\.\d+\.\d+$/,
            message: 'Version must be in semver format (e.g., 1.0.0)',
          },
        ],
      },
      {
        id: 'app_version',
        type: 'text',
        label: 'Application version',
        description: 'Version of the application being deployed',
        default: '1.0.0',
        validation: [
          { type: 'required', message: 'Application version is required' },
        ],
      },
      {
        id: 'description',
        type: 'text',
        label: 'Chart description',
        description: 'Brief description of what this chart does',
        default: 'A Helm chart for Kubernetes',
      },
      {
        id: 'home',
        type: 'text',
        label: 'Project homepage URL (optional)',
        placeholder: 'https://github.com/org/repo',
      },
      {
        id: 'maintainer_name',
        type: 'text',
        label: 'Maintainer name',
        default: 'Your Name',
      },
      {
        id: 'maintainer_email',
        type: 'text',
        label: 'Maintainer email',
        placeholder: 'your@email.com',
      },
    ],
  },
  {
    id: 'image',
    title: 'Image Configuration',
    description: 'Configure the container image settings',
    questions: [
      {
        id: 'image_repository',
        type: 'text',
        label: 'Image repository',
        description: 'Container image repository (without tag)',
        default: 'nginx',
        validation: [
          { type: 'required', message: 'Image repository is required' },
        ],
      },
      {
        id: 'image_tag',
        type: 'text',
        label: 'Image tag',
        description: 'Default image tag (overridable via values)',
        default: 'latest',
      },
      {
        id: 'image_pull_policy',
        type: 'select',
        label: 'Image pull policy',
        options: [
          { value: 'Always', label: 'Always' },
          { value: 'IfNotPresent', label: 'IfNotPresent' },
          { value: 'Never', label: 'Never' },
        ],
        default: 'IfNotPresent',
      },
      {
        id: 'image_pull_secrets',
        type: 'confirm',
        label: 'Use image pull secrets?',
        description: 'Configure secrets for private registries',
        default: false,
      },
    ],
  },
  {
    id: 'deployment',
    title: 'Deployment Configuration',
    description: 'Configure the deployment settings',
    questions: [
      {
        id: 'replica_count',
        type: 'number',
        label: 'Default replica count',
        default: 1,
        validation: [
          { type: 'min', value: 1, message: 'At least 1 replica required' },
        ],
      },
      {
        id: 'strategy_type',
        type: 'select',
        label: 'Deployment strategy',
        options: [
          {
            value: 'RollingUpdate',
            label: 'Rolling Update',
            description: 'Gradually replace pods',
          },
          {
            value: 'Recreate',
            label: 'Recreate',
            description: 'Delete all pods before creating new ones',
          },
        ],
        default: 'RollingUpdate',
      },
      {
        id: 'container_port',
        type: 'number',
        label: 'Container port',
        default: 80,
        validation: [
          { type: 'min', value: 1, message: 'Port must be at least 1' },
          { type: 'max', value: 65535, message: 'Port must be at most 65535' },
        ],
      },
    ],
  },
  {
    id: 'service',
    title: 'Service Configuration',
    description: 'Configure the Kubernetes Service',
    questions: [
      {
        id: 'service_enabled',
        type: 'confirm',
        label: 'Create a Service?',
        default: true,
      },
      {
        id: 'service_type',
        type: 'select',
        label: 'Service type',
        options: [
          { value: 'ClusterIP', label: 'ClusterIP' },
          { value: 'NodePort', label: 'NodePort' },
          { value: 'LoadBalancer', label: 'LoadBalancer' },
        ],
        default: 'ClusterIP',
        dependsOn: { questionId: 'service_enabled', value: true },
      },
      {
        id: 'service_port',
        type: 'number',
        label: 'Service port',
        default: 80,
        dependsOn: { questionId: 'service_enabled', value: true },
      },
    ],
  },
  {
    id: 'ingress',
    title: 'Ingress Configuration',
    description: 'Configure external access via Ingress',
    questions: [
      {
        id: 'ingress_enabled',
        type: 'confirm',
        label: 'Enable Ingress?',
        default: false,
      },
      {
        id: 'ingress_class_name',
        type: 'text',
        label: 'Ingress class name',
        default: 'nginx',
        dependsOn: { questionId: 'ingress_enabled', value: true },
      },
      {
        id: 'ingress_host',
        type: 'text',
        label: 'Ingress hostname',
        description: 'Domain name for your application',
        default: 'chart.local',
        dependsOn: { questionId: 'ingress_enabled', value: true },
      },
      {
        id: 'ingress_path',
        type: 'text',
        label: 'Ingress path',
        default: '/',
        dependsOn: { questionId: 'ingress_enabled', value: true },
      },
      {
        id: 'ingress_tls_enabled',
        type: 'confirm',
        label: 'Enable TLS?',
        default: false,
        dependsOn: { questionId: 'ingress_enabled', value: true },
      },
      {
        id: 'ingress_tls_secret_name',
        type: 'text',
        label: 'TLS secret name',
        default: 'chart-tls',
        dependsOn: { questionId: 'ingress_tls_enabled', value: true },
      },
    ],
  },
  {
    id: 'resources',
    title: 'Resource Limits',
    description: 'Configure CPU and memory limits',
    questions: [
      {
        id: 'resources_enabled',
        type: 'confirm',
        label: 'Set resource limits?',
        default: true,
      },
      {
        id: 'resources_cpu_request',
        type: 'text',
        label: 'CPU request',
        default: '100m',
        dependsOn: { questionId: 'resources_enabled', value: true },
      },
      {
        id: 'resources_cpu_limit',
        type: 'text',
        label: 'CPU limit',
        default: '200m',
        dependsOn: { questionId: 'resources_enabled', value: true },
      },
      {
        id: 'resources_memory_request',
        type: 'text',
        label: 'Memory request',
        default: '128Mi',
        dependsOn: { questionId: 'resources_enabled', value: true },
      },
      {
        id: 'resources_memory_limit',
        type: 'text',
        label: 'Memory limit',
        default: '256Mi',
        dependsOn: { questionId: 'resources_enabled', value: true },
      },
    ],
  },
  {
    id: 'autoscaling',
    title: 'Autoscaling',
    description: 'Configure Horizontal Pod Autoscaler',
    questions: [
      {
        id: 'autoscaling_enabled',
        type: 'confirm',
        label: 'Enable autoscaling?',
        default: false,
      },
      {
        id: 'autoscaling_min_replicas',
        type: 'number',
        label: 'Minimum replicas',
        default: 1,
        dependsOn: { questionId: 'autoscaling_enabled', value: true },
      },
      {
        id: 'autoscaling_max_replicas',
        type: 'number',
        label: 'Maximum replicas',
        default: 10,
        dependsOn: { questionId: 'autoscaling_enabled', value: true },
      },
      {
        id: 'autoscaling_target_cpu',
        type: 'number',
        label: 'Target CPU utilization (%)',
        default: 80,
        dependsOn: { questionId: 'autoscaling_enabled', value: true },
      },
      {
        id: 'autoscaling_target_memory',
        type: 'number',
        label: 'Target memory utilization (%) - optional',
        dependsOn: { questionId: 'autoscaling_enabled', value: true },
      },
    ],
  },
  {
    id: 'probes',
    title: 'Health Probes',
    description: 'Configure liveness and readiness probes',
    questions: [
      {
        id: 'liveness_enabled',
        type: 'confirm',
        label: 'Enable liveness probe?',
        default: true,
      },
      {
        id: 'liveness_path',
        type: 'text',
        label: 'Liveness probe path',
        default: '/healthz',
        dependsOn: { questionId: 'liveness_enabled', value: true },
      },
      {
        id: 'readiness_enabled',
        type: 'confirm',
        label: 'Enable readiness probe?',
        default: true,
      },
      {
        id: 'readiness_path',
        type: 'text',
        label: 'Readiness probe path',
        default: '/ready',
        dependsOn: { questionId: 'readiness_enabled', value: true },
      },
    ],
  },
  {
    id: 'persistence',
    title: 'Persistence',
    description: 'Configure persistent storage',
    questions: [
      {
        id: 'persistence_enabled',
        type: 'confirm',
        label: 'Enable persistence?',
        default: false,
      },
      {
        id: 'persistence_storage_class',
        type: 'text',
        label: 'Storage class',
        description: 'Leave empty for default',
        placeholder: 'standard',
        dependsOn: { questionId: 'persistence_enabled', value: true },
      },
      {
        id: 'persistence_size',
        type: 'text',
        label: 'Storage size',
        default: '8Gi',
        dependsOn: { questionId: 'persistence_enabled', value: true },
      },
      {
        id: 'persistence_mount_path',
        type: 'text',
        label: 'Mount path',
        default: '/data',
        dependsOn: { questionId: 'persistence_enabled', value: true },
      },
    ],
  },
  {
    id: 'service_account',
    title: 'Service Account',
    description: 'Configure Kubernetes Service Account',
    questions: [
      {
        id: 'service_account_create',
        type: 'confirm',
        label: 'Create a Service Account?',
        default: true,
      },
      {
        id: 'service_account_name',
        type: 'text',
        label: 'Service Account name',
        description: 'Leave empty to auto-generate',
        placeholder: 'my-chart-sa',
        dependsOn: { questionId: 'service_account_create', value: true },
      },
      {
        id: 'service_account_annotations',
        type: 'text',
        label: 'Service Account annotations (key=value,key2=value2)',
        description: 'For IAM roles, etc.',
        placeholder: 'eks.amazonaws.com/role-arn=arn:aws:iam::...',
        dependsOn: { questionId: 'service_account_create', value: true },
      },
    ],
  },
  {
    id: 'security',
    title: 'Security Context',
    description: 'Configure pod and container security settings',
    questions: [
      {
        id: 'pod_security_context_enabled',
        type: 'confirm',
        label: 'Configure pod security context?',
        default: true,
      },
      {
        id: 'run_as_non_root',
        type: 'confirm',
        label: 'Run as non-root user?',
        default: true,
        dependsOn: { questionId: 'pod_security_context_enabled', value: true },
      },
      {
        id: 'run_as_user',
        type: 'number',
        label: 'Run as user ID',
        default: 1000,
        dependsOn: { questionId: 'run_as_non_root', value: true },
      },
      {
        id: 'read_only_root_filesystem',
        type: 'confirm',
        label: 'Read-only root filesystem?',
        default: false,
        dependsOn: { questionId: 'pod_security_context_enabled', value: true },
      },
    ],
  },
];
