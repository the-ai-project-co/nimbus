/**
 * Generate Kubernetes Manifests Command
 *
 * Interactive wizard for generating K8s resources
 *
 * Usage: nimbus generate k8s [options]
 */

import { logger } from '../utils';
import { RestClient } from '../clients';
import {
  createWizard,
  ui,
  select,
  multiSelect,
  confirm,
  input,
  pathInput,
  type WizardStep,
  type StepResult,
} from '../wizard';

// Generator Service client
const generatorUrl = process.env.GENERATOR_SERVICE_URL || 'http://localhost:3003';
const generatorClient = new RestClient(generatorUrl);

/**
 * Workload types for Kubernetes
 */
export type K8sWorkloadType = 'deployment' | 'statefulset' | 'daemonset' | 'job' | 'cronjob';

/**
 * Service types for Kubernetes
 */
export type K8sServiceType = 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'None';

/**
 * Command options from CLI arguments
 */
export interface GenerateK8sOptions {
  workloadType?: K8sWorkloadType;
  namespace?: string;
  name?: string;
  image?: string;
  replicas?: number;
  port?: number;
  serviceType?: K8sServiceType;
  output?: string;
  nonInteractive?: boolean;
  includeIngress?: boolean;
  includeHpa?: boolean;
  includePdb?: boolean;
  includeConfigMap?: boolean;
  includeSecret?: boolean;
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;
}

/**
 * Wizard context for K8s generation
 */
export interface K8sWizardContext {
  // Workload configuration
  workloadType?: K8sWorkloadType;
  name?: string;
  namespace?: string;
  image?: string;
  imageTag?: string;

  // Replica configuration
  replicas?: number;
  minReplicas?: number;
  maxReplicas?: number;
  targetCPUUtilization?: number;

  // Port & Service configuration
  containerPort?: number;
  serviceType?: K8sServiceType;
  servicePort?: number;

  // Resource limits
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;

  // Additional resources
  includeService?: boolean;
  includeIngress?: boolean;
  includeHpa?: boolean;
  includePdb?: boolean;
  includeConfigMap?: boolean;
  includeSecret?: boolean;

  // Ingress configuration
  ingressHost?: string;
  ingressPath?: string;
  ingressTls?: boolean;

  // PDB configuration
  minAvailable?: number | string;

  // Job/CronJob specific
  schedule?: string;
  backoffLimit?: number;
  completions?: number;
  parallelism?: number;

  // Health checks
  includeProbes?: boolean;
  livenessPath?: string;
  readinessPath?: string;

  // Output
  outputPath?: string;
  outputFormat?: 'multiple' | 'single' | 'kustomize';
  generatedFiles?: string[];
}

/**
 * Run the generate k8s command
 */
export async function generateK8sCommand(options: GenerateK8sOptions = {}): Promise<void> {
  logger.info('Starting Kubernetes manifest generation wizard');

  // Non-interactive mode
  if (options.nonInteractive) {
    await runNonInteractive(options);
    return;
  }

  // Interactive wizard mode
  const wizard = createWizard<K8sWizardContext>({
    title: 'nimbus generate k8s',
    description: 'Generate Kubernetes manifests for your application',
    initialContext: {
      workloadType: options.workloadType,
      namespace: options.namespace,
      name: options.name,
      image: options.image,
      replicas: options.replicas,
      containerPort: options.port,
      serviceType: options.serviceType,
      outputPath: options.output,
      includeIngress: options.includeIngress,
      includeHpa: options.includeHpa,
      includePdb: options.includePdb,
      includeConfigMap: options.includeConfigMap,
      includeSecret: options.includeSecret,
      cpuRequest: options.cpuRequest,
      cpuLimit: options.cpuLimit,
      memoryRequest: options.memoryRequest,
      memoryLimit: options.memoryLimit,
    },
    steps: createWizardSteps(),
    onEvent: (event) => {
      logger.debug('Wizard event', { type: event.type });
    },
  });

  const result = await wizard.run();

  if (result.success) {
    ui.newLine();
    ui.box({
      title: 'Complete!',
      content: [
        'Your Kubernetes manifests have been generated.',
        '',
        'Generated files:',
        ...(result.context.generatedFiles?.map(f => `  - ${f}`) || ['  - (manifests generated)']),
        '',
        'Next steps:',
        `  1. Review the generated files in ${result.context.outputPath}`,
        '  2. Customize values as needed for your environment',
        '  3. Run "kubectl apply -f <path>" or "nimbus apply k8s <path>"',
      ],
      style: 'rounded',
      borderColor: 'green',
      padding: 1,
    });
  } else {
    ui.error(`Wizard failed: ${result.error?.message || 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Create wizard steps
 */
function createWizardSteps(): WizardStep<K8sWizardContext>[] {
  return [
    // Step 1: Workload Type Selection
    {
      id: 'workload-type',
      title: 'Workload Type',
      description: 'Select the type of Kubernetes workload to generate',
      execute: workloadTypeStep,
    },

    // Step 2: Basic Configuration
    {
      id: 'basic-config',
      title: 'Basic Configuration',
      description: 'Configure name, namespace, and image',
      execute: basicConfigStep,
    },

    // Step 3: Replica Configuration (not for DaemonSet or Job)
    {
      id: 'replicas',
      title: 'Replica Configuration',
      description: 'Configure replicas and scaling options',
      condition: (ctx) => !['daemonset', 'job'].includes(ctx.workloadType || ''),
      execute: replicaConfigStep,
    },

    // Step 4: Job/CronJob Configuration
    {
      id: 'job-config',
      title: 'Job Configuration',
      description: 'Configure job-specific settings',
      condition: (ctx) => ['job', 'cronjob'].includes(ctx.workloadType || ''),
      execute: jobConfigStep,
    },

    // Step 5: Port & Service Configuration
    {
      id: 'service-config',
      title: 'Port & Service Configuration',
      description: 'Configure container ports and service exposure',
      execute: serviceConfigStep,
    },

    // Step 6: Resource Limits
    {
      id: 'resources',
      title: 'Resource Limits',
      description: 'Configure CPU and memory requests/limits',
      execute: resourceLimitsStep,
    },

    // Step 7: Additional Resources
    {
      id: 'additional-resources',
      title: 'Additional Resources',
      description: 'Select additional Kubernetes resources to generate',
      execute: additionalResourcesStep,
    },

    // Step 8: Health Checks
    {
      id: 'health-checks',
      title: 'Health Checks',
      description: 'Configure liveness and readiness probes',
      condition: (ctx) => !['job', 'cronjob'].includes(ctx.workloadType || ''),
      execute: healthChecksStep,
    },

    // Step 9: Output Configuration
    {
      id: 'output',
      title: 'Output Configuration',
      description: 'Configure where and how to save the manifests',
      execute: outputConfigStep,
    },

    // Step 10: Generate
    {
      id: 'generate',
      title: 'Generate Manifests',
      description: 'Generating your Kubernetes manifests...',
      execute: generateStep,
    },
  ];
}

/**
 * Step 1: Workload Type Selection
 */
async function workloadTypeStep(ctx: K8sWizardContext): Promise<StepResult> {
  const workloadType = await select<K8sWorkloadType>({
    message: 'Select workload type:',
    options: [
      {
        value: 'deployment',
        label: 'Deployment',
        description: 'Stateless application with rolling updates (most common)',
      },
      {
        value: 'statefulset',
        label: 'StatefulSet',
        description: 'Stateful application with stable network identity and storage',
      },
      {
        value: 'daemonset',
        label: 'DaemonSet',
        description: 'Run a pod on every node (e.g., monitoring agents)',
      },
      {
        value: 'job',
        label: 'Job',
        description: 'Run a task to completion',
      },
      {
        value: 'cronjob',
        label: 'CronJob',
        description: 'Run a job on a schedule',
      },
    ],
    defaultValue: ctx.workloadType || 'deployment',
  });

  if (!workloadType) {
    return { success: false, error: 'No workload type selected' };
  }

  return {
    success: true,
    data: { workloadType },
  };
}

/**
 * Step 2: Basic Configuration
 */
async function basicConfigStep(ctx: K8sWizardContext): Promise<StepResult> {
  // Application name
  const name = await input({
    message: 'Application name:',
    defaultValue: ctx.name || 'my-app',
    validate: (value) => {
      if (!value) return 'Name is required';
      if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value)) {
        return 'Name must be lowercase alphanumeric with dashes only';
      }
      return true;
    },
  });

  if (!name) {
    return { success: false, error: 'Name is required' };
  }

  // Namespace
  ui.newLine();
  const namespace = await input({
    message: 'Namespace:',
    defaultValue: ctx.namespace || 'default',
    validate: (value) => {
      if (!value) return 'Namespace is required';
      if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value)) {
        return 'Namespace must be lowercase alphanumeric with dashes only';
      }
      return true;
    },
  });

  if (!namespace) {
    return { success: false, error: 'Namespace is required' };
  }

  // Container image
  ui.newLine();
  const image = await input({
    message: 'Container image (e.g., nginx:latest, myregistry/myapp):',
    defaultValue: ctx.image || '',
    validate: (value) => {
      if (!value) return 'Image is required';
      return true;
    },
  });

  if (!image) {
    return { success: false, error: 'Image is required' };
  }

  // Parse image and tag
  const imageParts = image.split(':');
  const imageBase = imageParts[0];
  const imageTag = imageParts[1] || 'latest';

  return {
    success: true,
    data: {
      name,
      namespace,
      image: imageBase,
      imageTag,
    },
  };
}

/**
 * Step 3: Replica Configuration
 */
async function replicaConfigStep(ctx: K8sWizardContext): Promise<StepResult> {
  const replicas = await input({
    message: 'Number of replicas:',
    defaultValue: String(ctx.replicas || 2),
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) return 'Must be a positive number';
      return true;
    },
  });

  if (!replicas) {
    return { success: false, error: 'Replicas required' };
  }

  // Ask about HPA
  ui.newLine();
  const includeHpa = ctx.includeHpa ?? await confirm({
    message: 'Include Horizontal Pod Autoscaler (HPA)?',
    defaultValue: false,
  });

  let minReplicas: number | undefined;
  let maxReplicas: number | undefined;
  let targetCPUUtilization: number | undefined;

  if (includeHpa) {
    ui.newLine();
    const min = await input({
      message: 'Minimum replicas:',
      defaultValue: String(ctx.minReplicas || Math.max(1, parseInt(replicas, 10) - 1)),
      validate: (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1) return 'Must be a positive number';
        return true;
      },
    });
    minReplicas = parseInt(min || '1', 10);

    const max = await input({
      message: 'Maximum replicas:',
      defaultValue: String(ctx.maxReplicas || parseInt(replicas, 10) * 2),
      validate: (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < minReplicas!) return `Must be >= ${minReplicas}`;
        return true;
      },
    });
    maxReplicas = parseInt(max || '4', 10);

    const cpu = await input({
      message: 'Target CPU utilization (%):',
      defaultValue: String(ctx.targetCPUUtilization || 70),
      validate: (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num < 1 || num > 100) return 'Must be between 1 and 100';
        return true;
      },
    });
    targetCPUUtilization = parseInt(cpu || '70', 10);
  }

  return {
    success: true,
    data: {
      replicas: parseInt(replicas, 10),
      includeHpa,
      minReplicas,
      maxReplicas,
      targetCPUUtilization,
    },
  };
}

/**
 * Step 4: Job/CronJob Configuration
 */
async function jobConfigStep(ctx: K8sWizardContext): Promise<StepResult> {
  let schedule: string | undefined;

  if (ctx.workloadType === 'cronjob') {
    const scheduleInput = await input({
      message: 'Cron schedule (e.g., "*/5 * * * *" for every 5 minutes):',
      defaultValue: ctx.schedule || '0 * * * *',
      validate: (value) => {
        if (!value) return 'Schedule is required for CronJob';
        // Basic cron validation (5 fields)
        const parts = value.trim().split(/\s+/);
        if (parts.length !== 5) return 'Schedule must have 5 fields (min hour day month weekday)';
        return true;
      },
    });
    schedule = scheduleInput;
  }

  // Backoff limit
  ui.newLine();
  const backoffInput = await input({
    message: 'Backoff limit (retries on failure):',
    defaultValue: String(ctx.backoffLimit || 6),
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 0) return 'Must be a non-negative number';
      return true;
    },
  });
  const backoffLimit = parseInt(backoffInput || '6', 10);

  // Completions
  ui.newLine();
  const completionsInput = await input({
    message: 'Number of completions (total successful pods):',
    defaultValue: String(ctx.completions || 1),
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) return 'Must be a positive number';
      return true;
    },
  });
  const completions = parseInt(completionsInput || '1', 10);

  // Parallelism
  ui.newLine();
  const parallelismInput = await input({
    message: 'Parallelism (concurrent pods):',
    defaultValue: String(ctx.parallelism || 1),
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) return 'Must be a positive number';
      return true;
    },
  });
  const parallelism = parseInt(parallelismInput || '1', 10);

  return {
    success: true,
    data: {
      schedule,
      backoffLimit,
      completions,
      parallelism,
    },
  };
}

/**
 * Step 5: Port & Service Configuration
 */
async function serviceConfigStep(ctx: K8sWizardContext): Promise<StepResult> {
  // Container port
  const portInput = await input({
    message: 'Container port:',
    defaultValue: String(ctx.containerPort || 8080),
    validate: (value) => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 65535) return 'Must be between 1 and 65535';
      return true;
    },
  });

  if (!portInput) {
    return { success: false, error: 'Port is required' };
  }

  const containerPort = parseInt(portInput, 10);

  // Service exposure (not for Jobs)
  let includeService = false;
  let serviceType: K8sServiceType = 'ClusterIP';
  let servicePort = containerPort;

  if (!['job', 'cronjob'].includes(ctx.workloadType || '')) {
    ui.newLine();
    includeService = await confirm({
      message: 'Create a Service to expose this workload?',
      defaultValue: true,
    });

    if (includeService) {
      ui.newLine();
      serviceType = await select<K8sServiceType>({
        message: 'Service type:',
        options: [
          {
            value: 'ClusterIP',
            label: 'ClusterIP',
            description: 'Internal cluster access only (default)',
          },
          {
            value: 'NodePort',
            label: 'NodePort',
            description: 'Expose on each node\'s IP at a static port',
          },
          {
            value: 'LoadBalancer',
            label: 'LoadBalancer',
            description: 'External load balancer (cloud provider)',
          },
        ],
        defaultValue: ctx.serviceType || 'ClusterIP',
      }) || 'ClusterIP';

      const servicePortInput = await input({
        message: 'Service port:',
        defaultValue: String(ctx.servicePort || containerPort),
        validate: (value) => {
          const num = parseInt(value, 10);
          if (isNaN(num) || num < 1 || num > 65535) return 'Must be between 1 and 65535';
          return true;
        },
      });
      servicePort = parseInt(servicePortInput || String(containerPort), 10);
    }
  }

  return {
    success: true,
    data: {
      containerPort,
      includeService,
      serviceType,
      servicePort,
    },
  };
}

/**
 * Step 6: Resource Limits
 */
async function resourceLimitsStep(ctx: K8sWizardContext): Promise<StepResult> {
  const setLimits = await confirm({
    message: 'Configure resource requests and limits? (recommended for production)',
    defaultValue: true,
  });

  if (!setLimits) {
    return { success: true, data: {} };
  }

  ui.newLine();
  ui.info('Resource requests (guaranteed resources):');

  const cpuRequest = await input({
    message: 'CPU request (e.g., 100m, 0.5):',
    defaultValue: ctx.cpuRequest || '100m',
  });

  const memoryRequest = await input({
    message: 'Memory request (e.g., 128Mi, 1Gi):',
    defaultValue: ctx.memoryRequest || '128Mi',
  });

  ui.newLine();
  ui.info('Resource limits (maximum allowed):');

  const cpuLimit = await input({
    message: 'CPU limit (e.g., 500m, 1):',
    defaultValue: ctx.cpuLimit || '500m',
  });

  const memoryLimit = await input({
    message: 'Memory limit (e.g., 256Mi, 2Gi):',
    defaultValue: ctx.memoryLimit || '256Mi',
  });

  return {
    success: true,
    data: {
      cpuRequest,
      cpuLimit,
      memoryRequest,
      memoryLimit,
    },
  };
}

/**
 * Step 7: Additional Resources
 */
async function additionalResourcesStep(ctx: K8sWizardContext): Promise<StepResult> {
  const resourceOptions = [
    { value: 'configmap', label: 'ConfigMap', description: 'Environment configuration' },
    { value: 'secret', label: 'Secret', description: 'Sensitive data (passwords, tokens)' },
  ];

  // Only show Ingress for services
  if (ctx.includeService) {
    resourceOptions.push({
      value: 'ingress',
      label: 'Ingress',
      description: 'HTTP/HTTPS routing (requires ingress controller)',
    });
  }

  // Only show PDB for Deployments/StatefulSets
  if (['deployment', 'statefulset'].includes(ctx.workloadType || '')) {
    resourceOptions.push({
      value: 'pdb',
      label: 'PodDisruptionBudget',
      description: 'Ensure availability during disruptions',
    });
  }

  const selectedResources = await multiSelect({
    message: 'Select additional resources to generate:',
    options: resourceOptions,
    required: false,
  }) as string[];

  const includeConfigMap = selectedResources.includes('configmap') || ctx.includeConfigMap;
  const includeSecret = selectedResources.includes('secret') || ctx.includeSecret;
  const includeIngress = selectedResources.includes('ingress') || ctx.includeIngress;
  const includePdb = selectedResources.includes('pdb') || ctx.includePdb;

  // Ingress configuration
  let ingressHost: string | undefined;
  let ingressPath: string | undefined;
  let ingressTls = false;

  if (includeIngress) {
    ui.newLine();
    ui.info('Ingress Configuration:');

    ingressHost = await input({
      message: 'Hostname (e.g., app.example.com):',
      defaultValue: ctx.ingressHost || `${ctx.name}.example.com`,
    });

    ingressPath = await input({
      message: 'Path:',
      defaultValue: ctx.ingressPath || '/',
    });

    ingressTls = await confirm({
      message: 'Enable TLS?',
      defaultValue: ctx.ingressTls ?? true,
    });
  }

  // PDB configuration
  let minAvailable: number | string | undefined;

  if (includePdb) {
    ui.newLine();
    const minAvailableInput = await input({
      message: 'Minimum available pods (number or percentage like "50%"):',
      defaultValue: String(ctx.minAvailable || 1),
    });
    minAvailable = minAvailableInput?.includes('%')
      ? minAvailableInput
      : parseInt(minAvailableInput || '1', 10);
  }

  return {
    success: true,
    data: {
      includeConfigMap,
      includeSecret,
      includeIngress,
      includePdb,
      ingressHost,
      ingressPath,
      ingressTls,
      minAvailable,
    },
  };
}

/**
 * Step 8: Health Checks
 */
async function healthChecksStep(ctx: K8sWizardContext): Promise<StepResult> {
  const includeProbes = await confirm({
    message: 'Configure health check probes? (recommended for production)',
    defaultValue: true,
  });

  if (!includeProbes) {
    return { success: true, data: { includeProbes: false } };
  }

  ui.newLine();
  const livenessPath = await input({
    message: 'Liveness probe path (e.g., /healthz):',
    defaultValue: ctx.livenessPath || '/healthz',
  });

  const readinessPath = await input({
    message: 'Readiness probe path (e.g., /ready):',
    defaultValue: ctx.readinessPath || '/ready',
  });

  return {
    success: true,
    data: {
      includeProbes,
      livenessPath,
      readinessPath,
    },
  };
}

/**
 * Step 9: Output Configuration
 */
async function outputConfigStep(ctx: K8sWizardContext): Promise<StepResult> {
  const outputFormat = await select<'multiple' | 'single' | 'kustomize'>({
    message: 'Output format:',
    options: [
      {
        value: 'multiple',
        label: 'Multiple files',
        description: 'One file per resource (deployment.yaml, service.yaml, etc.)',
      },
      {
        value: 'single',
        label: 'Single file',
        description: 'All resources in one file with document separators',
      },
      {
        value: 'kustomize',
        label: 'Kustomize structure',
        description: 'Base with kustomization.yaml for overlays',
      },
    ],
    defaultValue: ctx.outputFormat || 'multiple',
  });

  ui.newLine();
  const outputPath = await pathInput(
    'Output directory:',
    ctx.outputPath || `./${ctx.name}-k8s`
  );

  if (!outputPath) {
    return { success: false, error: 'Output path is required' };
  }

  return {
    success: true,
    data: {
      outputFormat,
      outputPath,
    },
  };
}

/**
 * Step 10: Generate Manifests
 */
async function generateStep(ctx: K8sWizardContext): Promise<StepResult> {
  ui.startSpinner({ message: 'Generating Kubernetes manifests...' });

  try {
    // Build the generation request
    const request = buildGenerationRequest(ctx);

    // Call generator service
    const response = await generatorClient.post<{
      success: boolean;
      files: Array<{ name: string; content: string; path: string }>;
      error?: string;
    }>('/api/generate/k8s', request);

    if (!response.success || !response.data?.success) {
      // If generator service is not available, generate locally
      ui.stopSpinnerFail('Generator service unavailable');
      ui.info('Generating manifests locally...');

      const files = generateManifestsLocally(ctx);
      await writeFilesToDisk(files, ctx.outputPath!);

      ui.newLine();
      ui.success(`Generated ${files.length} manifest(s)`);

      return {
        success: true,
        data: {
          generatedFiles: files.map(f => f.path),
        },
      };
    }

    // Write files from generator service response
    await writeFilesToDisk(response.data.files, ctx.outputPath!);

    ui.stopSpinnerSuccess(`Generated ${response.data.files.length} manifest(s)`);

    return {
      success: true,
      data: {
        generatedFiles: response.data.files.map(f => f.path),
      },
    };
  } catch (error: any) {
    // Fall back to local generation
    ui.stopSpinnerFail('Generator service error');
    ui.info('Generating manifests locally...');

    try {
      const files = generateManifestsLocally(ctx);
      await writeFilesToDisk(files, ctx.outputPath!);

      ui.newLine();
      ui.success(`Generated ${files.length} manifest(s)`);

      return {
        success: true,
        data: {
          generatedFiles: files.map(f => f.path),
        },
      };
    } catch (localError: any) {
      return {
        success: false,
        error: localError.message,
      };
    }
  }
}

/**
 * Build the generation request from context
 */
function buildGenerationRequest(ctx: K8sWizardContext): Record<string, unknown> {
  return {
    workloadType: ctx.workloadType,
    name: ctx.name,
    namespace: ctx.namespace,
    image: ctx.image,
    imageTag: ctx.imageTag,
    replicas: ctx.replicas,
    containerPort: ctx.containerPort,
    serviceType: ctx.serviceType,
    servicePort: ctx.servicePort,
    cpuRequest: ctx.cpuRequest,
    cpuLimit: ctx.cpuLimit,
    memoryRequest: ctx.memoryRequest,
    memoryLimit: ctx.memoryLimit,
    includeService: ctx.includeService,
    includeIngress: ctx.includeIngress,
    includeHpa: ctx.includeHpa,
    includePdb: ctx.includePdb,
    includeConfigMap: ctx.includeConfigMap,
    includeSecret: ctx.includeSecret,
    includeProbes: ctx.includeProbes,
    livenessPath: ctx.livenessPath,
    readinessPath: ctx.readinessPath,
    ingressHost: ctx.ingressHost,
    ingressPath: ctx.ingressPath,
    ingressTls: ctx.ingressTls,
    minAvailable: ctx.minAvailable,
    minReplicas: ctx.minReplicas,
    maxReplicas: ctx.maxReplicas,
    targetCPUUtilization: ctx.targetCPUUtilization,
    schedule: ctx.schedule,
    backoffLimit: ctx.backoffLimit,
    completions: ctx.completions,
    parallelism: ctx.parallelism,
    outputFormat: ctx.outputFormat,
    outputPath: ctx.outputPath,
  };
}

/**
 * Generate manifests locally when service is unavailable
 */
function generateManifestsLocally(ctx: K8sWizardContext): Array<{ name: string; content: string; path: string }> {
  const files: Array<{ name: string; content: string; path: string }> = [];
  const labels: Record<string, string> = {
    'app.kubernetes.io/name': ctx.name || 'unnamed',
    'app.kubernetes.io/instance': ctx.name || 'unnamed',
    'app.kubernetes.io/managed-by': 'nimbus',
  };

  // Generate main workload
  const workloadManifest = generateWorkloadManifest(ctx, labels);
  files.push({
    name: `${ctx.workloadType}.yaml`,
    content: workloadManifest,
    path: `${ctx.outputPath}/${ctx.workloadType}.yaml`,
  });

  // Generate Service
  if (ctx.includeService) {
    files.push({
      name: 'service.yaml',
      content: generateServiceManifest(ctx, labels),
      path: `${ctx.outputPath}/service.yaml`,
    });
  }

  // Generate Ingress
  if (ctx.includeIngress) {
    files.push({
      name: 'ingress.yaml',
      content: generateIngressManifest(ctx, labels),
      path: `${ctx.outputPath}/ingress.yaml`,
    });
  }

  // Generate HPA
  if (ctx.includeHpa) {
    files.push({
      name: 'hpa.yaml',
      content: generateHpaManifest(ctx, labels),
      path: `${ctx.outputPath}/hpa.yaml`,
    });
  }

  // Generate PDB
  if (ctx.includePdb) {
    files.push({
      name: 'pdb.yaml',
      content: generatePdbManifest(ctx, labels),
      path: `${ctx.outputPath}/pdb.yaml`,
    });
  }

  // Generate ConfigMap
  if (ctx.includeConfigMap) {
    files.push({
      name: 'configmap.yaml',
      content: generateConfigMapManifest(ctx, labels),
      path: `${ctx.outputPath}/configmap.yaml`,
    });
  }

  // Generate Secret
  if (ctx.includeSecret) {
    files.push({
      name: 'secret.yaml',
      content: generateSecretManifest(ctx, labels),
      path: `${ctx.outputPath}/secret.yaml`,
    });
  }

  return files;
}

/**
 * Generate main workload manifest
 */
function generateWorkloadManifest(ctx: K8sWizardContext, labels: Record<string, string>): string {
  const { workloadType, name, namespace, image, imageTag, replicas, containerPort } = ctx;

  // Build container spec
  const containerSpec: Record<string, unknown> = {
    name: name,
    image: `${image}:${imageTag || 'latest'}`,
    ports: containerPort ? [{ containerPort }] : undefined,
    resources: (ctx.cpuRequest || ctx.memoryRequest) ? {
      requests: {
        ...(ctx.cpuRequest && { cpu: ctx.cpuRequest }),
        ...(ctx.memoryRequest && { memory: ctx.memoryRequest }),
      },
      limits: {
        ...(ctx.cpuLimit && { cpu: ctx.cpuLimit }),
        ...(ctx.memoryLimit && { memory: ctx.memoryLimit }),
      },
    } : undefined,
  };

  // Add probes if configured
  if (ctx.includeProbes) {
    containerSpec.livenessProbe = {
      httpGet: {
        path: ctx.livenessPath || '/healthz',
        port: containerPort,
      },
      initialDelaySeconds: 10,
      periodSeconds: 10,
    };
    containerSpec.readinessProbe = {
      httpGet: {
        path: ctx.readinessPath || '/ready',
        port: containerPort,
      },
      initialDelaySeconds: 5,
      periodSeconds: 5,
    };
  }

  // Add envFrom if ConfigMap or Secret
  const envFrom = [];
  if (ctx.includeConfigMap) {
    envFrom.push({ configMapRef: { name: `${name}-config` } });
  }
  if (ctx.includeSecret) {
    envFrom.push({ secretRef: { name: `${name}-secret` } });
  }
  if (envFrom.length > 0) {
    containerSpec.envFrom = envFrom;
  }

  // Clean up undefined values
  Object.keys(containerSpec).forEach(key => {
    if (containerSpec[key] === undefined) {
      delete containerSpec[key];
    }
  });

  const podSpec = {
    containers: [containerSpec],
  };

  let manifest: Record<string, unknown>;

  switch (workloadType) {
    case 'deployment':
      manifest = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name, namespace, labels },
        spec: {
          replicas,
          selector: { matchLabels: { 'app.kubernetes.io/name': name } },
          template: {
            metadata: { labels },
            spec: podSpec,
          },
        },
      };
      break;

    case 'statefulset':
      manifest = {
        apiVersion: 'apps/v1',
        kind: 'StatefulSet',
        metadata: { name, namespace, labels },
        spec: {
          replicas,
          serviceName: name,
          selector: { matchLabels: { 'app.kubernetes.io/name': name } },
          template: {
            metadata: { labels },
            spec: podSpec,
          },
        },
      };
      break;

    case 'daemonset':
      manifest = {
        apiVersion: 'apps/v1',
        kind: 'DaemonSet',
        metadata: { name, namespace, labels },
        spec: {
          selector: { matchLabels: { 'app.kubernetes.io/name': name } },
          template: {
            metadata: { labels },
            spec: podSpec,
          },
        },
      };
      break;

    case 'job':
      manifest = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name, namespace, labels },
        spec: {
          backoffLimit: ctx.backoffLimit,
          completions: ctx.completions,
          parallelism: ctx.parallelism,
          template: {
            metadata: { labels },
            spec: {
              ...podSpec,
              restartPolicy: 'Never',
            },
          },
        },
      };
      break;

    case 'cronjob':
      manifest = {
        apiVersion: 'batch/v1',
        kind: 'CronJob',
        metadata: { name, namespace, labels },
        spec: {
          schedule: ctx.schedule,
          jobTemplate: {
            spec: {
              backoffLimit: ctx.backoffLimit,
              template: {
                metadata: { labels },
                spec: {
                  ...podSpec,
                  restartPolicy: 'Never',
                },
              },
            },
          },
        },
      };
      break;

    default:
      manifest = {};
  }

  return toYaml(manifest);
}

/**
 * Generate Service manifest
 */
function generateServiceManifest(ctx: K8sWizardContext, labels: Record<string, string>): string {
  const manifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: ctx.name,
      namespace: ctx.namespace,
      labels,
    },
    spec: {
      type: ctx.serviceType,
      selector: { 'app.kubernetes.io/name': ctx.name },
      ports: [
        {
          port: ctx.servicePort,
          targetPort: ctx.containerPort,
          protocol: 'TCP',
        },
      ],
    },
  };

  return toYaml(manifest);
}

/**
 * Generate Ingress manifest
 */
function generateIngressManifest(ctx: K8sWizardContext, labels: Record<string, string>): string {
  const manifest: Record<string, unknown> = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: ctx.name,
      namespace: ctx.namespace,
      labels,
      annotations: {
        'kubernetes.io/ingress.class': 'nginx',
      },
    },
    spec: {
      rules: [
        {
          host: ctx.ingressHost,
          http: {
            paths: [
              {
                path: ctx.ingressPath || '/',
                pathType: 'Prefix',
                backend: {
                  service: {
                    name: ctx.name,
                    port: { number: ctx.servicePort },
                  },
                },
              },
            ],
          },
        },
      ],
    },
  };

  if (ctx.ingressTls) {
    (manifest.spec as Record<string, unknown>).tls = [
      {
        hosts: [ctx.ingressHost],
        secretName: `${ctx.name}-tls`,
      },
    ];
  }

  return toYaml(manifest);
}

/**
 * Generate HPA manifest
 */
function generateHpaManifest(ctx: K8sWizardContext, labels: Record<string, string>): string {
  const manifest = {
    apiVersion: 'autoscaling/v2',
    kind: 'HorizontalPodAutoscaler',
    metadata: {
      name: ctx.name,
      namespace: ctx.namespace,
      labels,
    },
    spec: {
      scaleTargetRef: {
        apiVersion: 'apps/v1',
        kind: ctx.workloadType === 'statefulset' ? 'StatefulSet' : 'Deployment',
        name: ctx.name,
      },
      minReplicas: ctx.minReplicas,
      maxReplicas: ctx.maxReplicas,
      metrics: [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: {
              type: 'Utilization',
              averageUtilization: ctx.targetCPUUtilization,
            },
          },
        },
      ],
    },
  };

  return toYaml(manifest);
}

/**
 * Generate PDB manifest
 */
function generatePdbManifest(ctx: K8sWizardContext, labels: Record<string, string>): string {
  const manifest = {
    apiVersion: 'policy/v1',
    kind: 'PodDisruptionBudget',
    metadata: {
      name: ctx.name,
      namespace: ctx.namespace,
      labels,
    },
    spec: {
      minAvailable: ctx.minAvailable,
      selector: { matchLabels: { 'app.kubernetes.io/name': ctx.name } },
    },
  };

  return toYaml(manifest);
}

/**
 * Generate ConfigMap manifest
 */
function generateConfigMapManifest(ctx: K8sWizardContext, labels: Record<string, string>): string {
  const manifest = {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: `${ctx.name}-config`,
      namespace: ctx.namespace,
      labels,
    },
    data: {
      // Placeholder values - user should customize
      APP_ENV: 'production',
      LOG_LEVEL: 'info',
    },
  };

  return toYaml(manifest);
}

/**
 * Generate Secret manifest
 */
function generateSecretManifest(ctx: K8sWizardContext, labels: Record<string, string>): string {
  const manifest = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: `${ctx.name}-secret`,
      namespace: ctx.namespace,
      labels,
    },
    type: 'Opaque',
    stringData: {
      // Placeholder values - user should customize
      'example-key': 'example-value',
    },
  };

  return toYaml(manifest);
}

/**
 * Convert object to YAML string
 */
function toYaml(obj: Record<string, unknown>, indent = 0): string {
  const lines: string[] = [];
  const spaces = '  '.repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${spaces}${key}:`);
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          const itemYaml = toYaml(item as Record<string, unknown>, indent + 1);
          const itemLines = itemYaml.split('\n').filter(l => l.trim());
          lines.push(`${spaces}- ${itemLines[0].trim()}`);
          for (let i = 1; i < itemLines.length; i++) {
            lines.push(`${spaces}  ${itemLines[i].trim()}`);
          }
        } else {
          lines.push(`${spaces}- ${item}`);
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${spaces}${key}:`);
      lines.push(toYaml(value as Record<string, unknown>, indent + 1));
    } else if (typeof value === 'string' && (value.includes(':') || value.includes('#') || value.includes('\n'))) {
      lines.push(`${spaces}${key}: "${value}"`);
    } else {
      lines.push(`${spaces}${key}: ${value}`);
    }
  }

  return lines.join('\n');
}

/**
 * Write files to disk
 */
async function writeFilesToDisk(
  files: Array<{ name: string; content: string; path: string }>,
  outputPath: string
): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  // Create output directory
  await fs.mkdir(outputPath, { recursive: true });

  // Write each file
  for (const file of files) {
    const filePath = path.join(outputPath, file.name);
    await fs.writeFile(filePath, file.content, 'utf-8');
  }
}

/**
 * Run in non-interactive mode
 */
async function runNonInteractive(options: GenerateK8sOptions): Promise<void> {
  ui.header('nimbus generate k8s', 'Non-interactive mode');

  // Validate required options
  if (!options.name) {
    ui.error('Name is required in non-interactive mode (--name)');
    process.exit(1);
  }

  if (!options.image) {
    ui.error('Image is required in non-interactive mode (--image)');
    process.exit(1);
  }

  ui.info(`Workload type: ${options.workloadType || 'deployment'}`);
  ui.info(`Name: ${options.name}`);
  ui.info(`Namespace: ${options.namespace || 'default'}`);
  ui.info(`Image: ${options.image}`);
  ui.info(`Output: ${options.output || `./${options.name}-k8s`}`);

  // Build context from options
  const ctx: K8sWizardContext = {
    workloadType: options.workloadType || 'deployment',
    name: options.name,
    namespace: options.namespace || 'default',
    image: options.image.split(':')[0],
    imageTag: options.image.split(':')[1] || 'latest',
    replicas: options.replicas ?? 2,
    containerPort: options.port ?? 8080,
    serviceType: options.serviceType || 'ClusterIP',
    includeService: true,
    includeIngress: options.includeIngress ?? false,
    includeHpa: options.includeHpa ?? false,
    includePdb: options.includePdb ?? false,
    includeConfigMap: options.includeConfigMap ?? false,
    includeSecret: options.includeSecret ?? false,
    cpuRequest: options.cpuRequest,
    cpuLimit: options.cpuLimit,
    memoryRequest: options.memoryRequest,
    memoryLimit: options.memoryLimit,
    outputPath: options.output || `./${options.name}-k8s`,
    outputFormat: 'multiple',
  };

  ui.newLine();
  ui.startSpinner({ message: 'Generating manifests...' });

  try {
    const files = generateManifestsLocally(ctx);
    await writeFilesToDisk(files, ctx.outputPath!);

    ui.stopSpinnerSuccess(`Generated ${files.length} manifest(s)`);

    ui.newLine();
    ui.box({
      title: 'Complete!',
      content: [
        `Generated ${files.length} manifest(s) in ${ctx.outputPath}:`,
        ...files.map(f => `  - ${f.name}`),
      ],
      style: 'rounded',
      borderColor: 'green',
      padding: 1,
    });
  } catch (error: any) {
    ui.stopSpinnerFail('Generation failed');
    ui.error(error.message);
    process.exit(1);
  }
}

// Export as default command
export default generateK8sCommand;
