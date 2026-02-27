/**
 * Generate Helm Values Command
 *
 * Interactive wizard for generating Helm values files
 *
 * Usage: nimbus generate helm [options]
 */

import { logger } from '../utils';
import {
  createWizard,
  ui,
  select,
  confirm,
  input,
  pathInput,
  type WizardStep,
  type StepResult,
} from '../wizard';
import { helmClient } from '../clients';

/**
 * Environment types
 */
export type HelmEnvironment = 'dev' | 'staging' | 'production';

/**
 * Command options from CLI arguments
 */
export interface GenerateHelmOptions {
  chart?: string;
  releaseName?: string;
  namespace?: string;
  values?: Record<string, unknown>;
  valuesFile?: string;
  output?: string;
  nonInteractive?: boolean;
  includeSecrets?: boolean;
  environment?: HelmEnvironment;
  version?: string;
  repo?: string;
}

/**
 * Wizard context for Helm generation
 */
export interface HelmWizardContext {
  // Chart selection
  chartSource?: 'repo' | 'local';
  chart?: string;
  chartVersion?: string;
  repoName?: string;
  repoUrl?: string;
  localPath?: string;

  // Release configuration
  releaseName?: string;
  namespace?: string;

  // Environment
  environment?: HelmEnvironment;

  // Values customization
  customValues?: Record<string, unknown>;
  imageRepository?: string;
  imageTag?: string;
  replicas?: number;
  cpuRequest?: string;
  cpuLimit?: string;
  memoryRequest?: string;
  memoryLimit?: string;

  // Service configuration
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  servicePort?: number;

  // Ingress configuration
  ingressEnabled?: boolean;
  ingressHost?: string;
  ingressTls?: boolean;

  // Secret management
  includeSecrets?: boolean;
  secretValues?: Record<string, string>;

  // Chart default values (fetched from chart)
  defaultValues?: string;

  // Output
  outputPath?: string;
  generatedFiles?: string[];
}

/**
 * Popular Helm charts with their repos
 */
const POPULAR_CHARTS = [
  {
    name: 'nginx',
    repo: 'bitnami',
    url: 'https://charts.bitnami.com/bitnami',
    description: 'NGINX web server',
  },
  {
    name: 'postgresql',
    repo: 'bitnami',
    url: 'https://charts.bitnami.com/bitnami',
    description: 'PostgreSQL database',
  },
  {
    name: 'redis',
    repo: 'bitnami',
    url: 'https://charts.bitnami.com/bitnami',
    description: 'Redis cache',
  },
  {
    name: 'mysql',
    repo: 'bitnami',
    url: 'https://charts.bitnami.com/bitnami',
    description: 'MySQL database',
  },
  {
    name: 'mongodb',
    repo: 'bitnami',
    url: 'https://charts.bitnami.com/bitnami',
    description: 'MongoDB database',
  },
  {
    name: 'kafka',
    repo: 'bitnami',
    url: 'https://charts.bitnami.com/bitnami',
    description: 'Apache Kafka',
  },
  {
    name: 'rabbitmq',
    repo: 'bitnami',
    url: 'https://charts.bitnami.com/bitnami',
    description: 'RabbitMQ message broker',
  },
  {
    name: 'elasticsearch',
    repo: 'elastic',
    url: 'https://helm.elastic.co',
    description: 'Elasticsearch search engine',
  },
  {
    name: 'prometheus',
    repo: 'prometheus-community',
    url: 'https://prometheus-community.github.io/helm-charts',
    description: 'Prometheus monitoring',
  },
  {
    name: 'grafana',
    repo: 'grafana',
    url: 'https://grafana.github.io/helm-charts',
    description: 'Grafana dashboards',
  },
];

/**
 * Run the generate helm command
 */
export async function generateHelmCommand(options: GenerateHelmOptions = {}): Promise<void> {
  logger.info('Starting Helm values generation wizard');

  // Non-interactive mode
  if (options.nonInteractive) {
    await runNonInteractive(options);
    return;
  }

  // Interactive wizard mode
  const wizard = createWizard<HelmWizardContext>({
    title: 'nimbus generate helm',
    description: 'Generate Helm values files for your deployment',
    initialContext: {
      chart: options.chart,
      releaseName: options.releaseName,
      namespace: options.namespace,
      environment: options.environment,
      includeSecrets: options.includeSecrets,
      outputPath: options.output,
      chartVersion: options.version,
    },
    steps: createWizardSteps(),
    onEvent: event => {
      logger.debug('Wizard event', { type: event.type });
    },
  });

  const result = await wizard.run();

  if (result.success) {
    ui.newLine();
    ui.box({
      title: 'Complete!',
      content: [
        'Your Helm values have been generated.',
        '',
        'Generated files:',
        ...(result.context.generatedFiles?.map(f => `  - ${f}`) || ['  - values.yaml']),
        '',
        'Next steps:',
        `  1. Review the generated files in ${result.context.outputPath}`,
        '  2. Customize values as needed for your environment',
        `  3. Run "helm install ${result.context.releaseName} ${result.context.chart} -f <values-file>"`,
        '     or use "nimbus apply helm"',
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
function createWizardSteps(): WizardStep<HelmWizardContext>[] {
  return [
    // Step 1: Chart Selection
    {
      id: 'chart-selection',
      title: 'Chart Selection',
      description: 'Select a Helm chart to configure',
      execute: chartSelectionStep,
    },

    // Step 2: Release Configuration
    {
      id: 'release-config',
      title: 'Release Configuration',
      description: 'Configure release name and namespace',
      execute: releaseConfigStep,
    },

    // Step 3: Environment Selection
    {
      id: 'environment',
      title: 'Environment Selection',
      description: 'Select target environment',
      execute: environmentStep,
    },

    // Step 4: Image Configuration
    {
      id: 'image-config',
      title: 'Image Configuration',
      description: 'Configure container image settings',
      execute: imageConfigStep,
    },

    // Step 5: Resource Configuration
    {
      id: 'resources',
      title: 'Resource Configuration',
      description: 'Configure replicas and resource limits',
      execute: resourceConfigStep,
    },

    // Step 6: Service Configuration
    {
      id: 'service-config',
      title: 'Service Configuration',
      description: 'Configure service exposure',
      execute: serviceConfigStep,
    },

    // Step 7: Ingress Configuration
    {
      id: 'ingress-config',
      title: 'Ingress Configuration',
      description: 'Configure ingress settings',
      execute: ingressConfigStep,
    },

    // Step 8: Secrets Configuration
    {
      id: 'secrets-config',
      title: 'Secrets Configuration',
      description: 'Configure secret values',
      execute: secretsConfigStep,
    },

    // Step 9: Output Configuration
    {
      id: 'output',
      title: 'Output Configuration',
      description: 'Configure where to save the values files',
      execute: outputConfigStep,
    },

    // Step 10: Generate
    {
      id: 'generate',
      title: 'Generate Values',
      description: 'Generating your Helm values files...',
      execute: generateStep,
    },
  ];
}

/**
 * Step 1: Chart Selection
 */
async function chartSelectionStep(ctx: HelmWizardContext): Promise<StepResult> {
  // Chart source selection
  const chartSource = await select<'repo' | 'local' | 'popular'>({
    message: 'How would you like to select a chart?',
    options: [
      {
        value: 'popular',
        label: 'Popular charts',
        description: 'Choose from commonly used Helm charts',
      },
      {
        value: 'repo',
        label: 'From repository',
        description: 'Specify a chart from a Helm repository',
      },
      {
        value: 'local',
        label: 'Local chart',
        description: 'Use a local chart directory',
      },
    ],
  });

  if (!chartSource) {
    return { success: false, error: 'No chart source selected' };
  }

  let chart: string | undefined;
  let repoName: string | undefined;
  let repoUrl: string | undefined;
  let localPath: string | undefined;
  let chartVersion: string | undefined;

  if (chartSource === 'popular') {
    // Show popular charts
    ui.newLine();
    const selectedChart = await select({
      message: 'Select a popular chart:',
      options: POPULAR_CHARTS.map(c => ({
        value: c.name,
        label: `${c.repo}/${c.name}`,
        description: c.description,
      })),
    });

    if (!selectedChart) {
      return { success: false, error: 'No chart selected' };
    }

    const chartInfo = POPULAR_CHARTS.find(c => c.name === selectedChart);
    chart = `${chartInfo!.repo}/${chartInfo!.name}`;
    repoName = chartInfo!.repo;
    repoUrl = chartInfo!.url;
  } else if (chartSource === 'repo') {
    // Manual chart specification
    ui.newLine();
    repoName = await input({
      message: 'Repository name (e.g., bitnami):',
      defaultValue: ctx.repoName,
    });

    repoUrl = await input({
      message: 'Repository URL:',
      defaultValue: ctx.repoUrl,
    });

    const chartName = await input({
      message: 'Chart name:',
      defaultValue: ctx.chart?.split('/')[1],
    });

    if (!chartName) {
      return { success: false, error: 'Chart name is required' };
    }

    chart = repoName ? `${repoName}/${chartName}` : chartName;
  } else {
    // Local chart
    ui.newLine();
    localPath = await pathInput('Path to local chart:', ctx.localPath || './chart');

    if (!localPath) {
      return { success: false, error: 'Chart path is required' };
    }

    chart = localPath;
  }

  // Version selection
  if (chartSource !== 'local') {
    ui.newLine();
    const specifyVersion = await confirm({
      message: 'Specify a chart version?',
      defaultValue: false,
    });

    if (specifyVersion) {
      chartVersion = await input({
        message: 'Chart version:',
        defaultValue: ctx.chartVersion,
      });
    }
  }

  return {
    success: true,
    data: {
      chartSource: chartSource === 'popular' ? 'repo' : chartSource,
      chart,
      repoName,
      repoUrl,
      localPath,
      chartVersion,
    },
  };
}

/**
 * Step 2: Release Configuration
 */
async function releaseConfigStep(ctx: HelmWizardContext): Promise<StepResult> {
  // Extract chart name for default release name
  const chartName = ctx.chart?.split('/').pop() || 'release';

  const releaseName = await input({
    message: 'Release name:',
    defaultValue: ctx.releaseName || chartName,
    validate: value => {
      if (!value) {
        return 'Release name is required';
      }
      if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value)) {
        return 'Release name must be lowercase alphanumeric with dashes only';
      }
      return true;
    },
  });

  if (!releaseName) {
    return { success: false, error: 'Release name is required' };
  }

  ui.newLine();
  const namespace = await input({
    message: 'Namespace:',
    defaultValue: ctx.namespace || 'default',
    validate: value => {
      if (!value) {
        return 'Namespace is required';
      }
      if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value)) {
        return 'Namespace must be lowercase alphanumeric with dashes only';
      }
      return true;
    },
  });

  if (!namespace) {
    return { success: false, error: 'Namespace is required' };
  }

  return {
    success: true,
    data: { releaseName, namespace },
  };
}

/**
 * Step 3: Environment Selection
 */
async function environmentStep(ctx: HelmWizardContext): Promise<StepResult> {
  const environment = await select<HelmEnvironment>({
    message: 'Target environment:',
    options: [
      {
        value: 'dev',
        label: 'Development',
        description: 'Local development settings (minimal resources)',
      },
      {
        value: 'staging',
        label: 'Staging',
        description: 'Pre-production testing environment',
      },
      {
        value: 'production',
        label: 'Production',
        description: 'Production-ready settings (HA, security hardening)',
      },
    ],
    defaultValue: ctx.environment || 'dev',
  });

  if (!environment) {
    return { success: false, error: 'No environment selected' };
  }

  return {
    success: true,
    data: { environment },
  };
}

/**
 * Step 4: Image Configuration
 */
async function imageConfigStep(ctx: HelmWizardContext): Promise<StepResult> {
  const customizeImage = await confirm({
    message: 'Customize container image settings?',
    defaultValue: false,
  });

  if (!customizeImage) {
    return { success: true, data: {} };
  }

  ui.newLine();
  const imageRepository = await input({
    message: 'Image repository (leave empty for chart default):',
    defaultValue: ctx.imageRepository,
  });

  const imageTag = await input({
    message: 'Image tag (leave empty for chart default):',
    defaultValue: ctx.imageTag,
  });

  return {
    success: true,
    data: {
      imageRepository: imageRepository || undefined,
      imageTag: imageTag || undefined,
    },
  };
}

/**
 * Step 5: Resource Configuration
 */
async function resourceConfigStep(ctx: HelmWizardContext): Promise<StepResult> {
  // Replicas
  const replicasInput = await input({
    message: 'Number of replicas:',
    defaultValue: String(ctx.replicas || getDefaultReplicas(ctx.environment)),
    validate: value => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1) {
        return 'Must be a positive number';
      }
      return true;
    },
  });

  const replicas = parseInt(replicasInput || '1', 10);

  // Resource limits
  ui.newLine();
  const setResources = await confirm({
    message: 'Configure resource requests and limits?',
    defaultValue: ctx.environment === 'production',
  });

  let cpuRequest: string | undefined;
  let cpuLimit: string | undefined;
  let memoryRequest: string | undefined;
  let memoryLimit: string | undefined;

  if (setResources) {
    const defaults = getDefaultResources(ctx.environment);

    ui.newLine();
    ui.info('Resource requests (guaranteed resources):');

    cpuRequest = await input({
      message: 'CPU request:',
      defaultValue: ctx.cpuRequest || defaults.cpuRequest,
    });

    memoryRequest = await input({
      message: 'Memory request:',
      defaultValue: ctx.memoryRequest || defaults.memoryRequest,
    });

    ui.newLine();
    ui.info('Resource limits (maximum allowed):');

    cpuLimit = await input({
      message: 'CPU limit:',
      defaultValue: ctx.cpuLimit || defaults.cpuLimit,
    });

    memoryLimit = await input({
      message: 'Memory limit:',
      defaultValue: ctx.memoryLimit || defaults.memoryLimit,
    });
  }

  return {
    success: true,
    data: {
      replicas,
      cpuRequest,
      cpuLimit,
      memoryRequest,
      memoryLimit,
    },
  };
}

/**
 * Step 6: Service Configuration
 */
async function serviceConfigStep(ctx: HelmWizardContext): Promise<StepResult> {
  const serviceType = await select<'ClusterIP' | 'NodePort' | 'LoadBalancer'>({
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
        description: "Expose on each node's IP at a static port",
      },
      {
        value: 'LoadBalancer',
        label: 'LoadBalancer',
        description: 'External load balancer (cloud provider)',
      },
    ],
    defaultValue: ctx.serviceType || 'ClusterIP',
  });

  const servicePortInput = await input({
    message: 'Service port:',
    defaultValue: String(ctx.servicePort || 80),
    validate: value => {
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 1 || num > 65535) {
        return 'Must be between 1 and 65535';
      }
      return true;
    },
  });

  const servicePort = parseInt(servicePortInput || '80', 10);

  return {
    success: true,
    data: { serviceType, servicePort },
  };
}

/**
 * Step 7: Ingress Configuration
 */
async function ingressConfigStep(ctx: HelmWizardContext): Promise<StepResult> {
  const ingressEnabled = await confirm({
    message: 'Enable Ingress?',
    defaultValue: ctx.ingressEnabled ?? ctx.environment === 'production',
  });

  if (!ingressEnabled) {
    return { success: true, data: { ingressEnabled: false } };
  }

  ui.newLine();
  const ingressHost = await input({
    message: 'Hostname (e.g., app.example.com):',
    defaultValue: ctx.ingressHost || `${ctx.releaseName}.example.com`,
    validate: value => {
      if (!value) {
        return 'Hostname is required for Ingress';
      }
      return true;
    },
  });

  const ingressTls = await confirm({
    message: 'Enable TLS?',
    defaultValue: ctx.ingressTls ?? ctx.environment === 'production',
  });

  return {
    success: true,
    data: { ingressEnabled, ingressHost, ingressTls },
  };
}

/**
 * Step 8: Secrets Configuration
 */
async function secretsConfigStep(ctx: HelmWizardContext): Promise<StepResult> {
  const includeSecrets =
    ctx.includeSecrets ??
    (await confirm({
      message: 'Generate a separate secrets values file?',
      defaultValue: true,
    }));

  if (!includeSecrets) {
    return { success: true, data: { includeSecrets: false } };
  }

  ui.newLine();
  ui.info('You can add secret values below. Press Enter to skip.');
  ui.info('(Actual secret values should be added later or managed by a secrets tool)');

  const secretValues: Record<string, string> = {};

  // Common secret keys based on chart
  const chartName = ctx.chart?.split('/').pop() || '';
  const suggestedKeys = getSuggestedSecretKeys(chartName);

  for (const key of suggestedKeys) {
    const value = await input({
      message: `${key}:`,
      defaultValue: '',
    });
    if (value) {
      secretValues[key] = value;
    }
  }

  // Allow adding custom secret keys
  let addMore =
    Object.keys(secretValues).length === 0 ||
    (await confirm({
      message: 'Add custom secret keys?',
      defaultValue: false,
    }));

  while (addMore) {
    const key = await input({
      message: 'Secret key (or press Enter to finish):',
    });

    if (!key) {
      break;
    }

    const value = await input({
      message: `Value for ${key}:`,
    });

    if (value) {
      secretValues[key] = value;
    }

    addMore = await confirm({
      message: 'Add another secret?',
      defaultValue: false,
    });
  }

  return {
    success: true,
    data: {
      includeSecrets,
      secretValues: Object.keys(secretValues).length > 0 ? secretValues : undefined,
    },
  };
}

/**
 * Step 9: Output Configuration
 */
async function outputConfigStep(ctx: HelmWizardContext): Promise<StepResult> {
  const outputPath = await pathInput(
    'Output directory:',
    ctx.outputPath || `./${ctx.releaseName}-helm`
  );

  if (!outputPath) {
    return { success: false, error: 'Output path is required' };
  }

  return {
    success: true,
    data: { outputPath },
  };
}

/**
 * Step 10: Generate Values Files
 */
async function generateStep(ctx: HelmWizardContext): Promise<StepResult> {
  ui.startSpinner({ message: 'Generating Helm values files...' });

  try {
    // Fetch default values from chart if available
    if (ctx.chartSource === 'repo' && ctx.chart) {
      try {
        const valuesResult = await helmClient.showValues(ctx.chart, {
          version: ctx.chartVersion,
        });
        if (valuesResult.success) {
          ctx.defaultValues = valuesResult.values;
        }
      } catch {
        // Continue without default values
      }
    }

    // Generate values files
    const files = generateValuesFiles(ctx);
    await writeFilesToDisk(files, ctx.outputPath!);

    ui.stopSpinnerSuccess(`Generated ${files.length} values file(s)`);

    return {
      success: true,
      data: {
        generatedFiles: files.map(f => f.path),
      },
    };
  } catch (error: any) {
    ui.stopSpinnerFail('Generation failed');
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Generate values files
 */
function generateValuesFiles(
  ctx: HelmWizardContext
): Array<{ name: string; content: string; path: string }> {
  const files: Array<{ name: string; content: string; path: string }> = [];

  // Main values file
  const mainValues = generateMainValues(ctx);
  const envSuffix = ctx.environment !== 'dev' ? `-${ctx.environment}` : '';

  files.push({
    name: `values${envSuffix}.yaml`,
    content: mainValues,
    path: `${ctx.outputPath}/values${envSuffix}.yaml`,
  });

  // Secrets values file
  if (ctx.includeSecrets) {
    const secretsValues = generateSecretsValues(ctx);
    files.push({
      name: `secrets${envSuffix}.yaml`,
      content: secretsValues,
      path: `${ctx.outputPath}/secrets${envSuffix}.yaml`,
    });
  }

  // README
  files.push({
    name: 'README.md',
    content: generateReadme(ctx),
    path: `${ctx.outputPath}/README.md`,
  });

  return files;
}

/**
 * Generate main values content
 */
function generateMainValues(ctx: HelmWizardContext): string {
  const lines: string[] = [
    `# Helm values for ${ctx.releaseName}`,
    `# Environment: ${ctx.environment}`,
    `# Generated by Nimbus CLI`,
    `# Chart: ${ctx.chart}`,
    '',
  ];

  // Replicas
  lines.push(`replicaCount: ${ctx.replicas}`);
  lines.push('');

  // Image configuration
  if (ctx.imageRepository || ctx.imageTag) {
    lines.push('image:');
    if (ctx.imageRepository) {
      lines.push(`  repository: ${ctx.imageRepository}`);
    }
    if (ctx.imageTag) {
      lines.push(`  tag: "${ctx.imageTag}"`);
    }
    lines.push('');
  }

  // Service configuration
  lines.push('service:');
  lines.push(`  type: ${ctx.serviceType}`);
  lines.push(`  port: ${ctx.servicePort}`);
  lines.push('');

  // Ingress configuration
  lines.push('ingress:');
  lines.push(`  enabled: ${ctx.ingressEnabled}`);
  if (ctx.ingressEnabled) {
    lines.push('  annotations:');
    lines.push('    kubernetes.io/ingress.class: nginx');
    lines.push('  hosts:');
    lines.push(`    - host: ${ctx.ingressHost}`);
    lines.push('      paths:');
    lines.push('        - path: /');
    lines.push('          pathType: Prefix');
    if (ctx.ingressTls) {
      lines.push('  tls:');
      lines.push(`    - secretName: ${ctx.releaseName}-tls`);
      lines.push('      hosts:');
      lines.push(`        - ${ctx.ingressHost}`);
    }
  }
  lines.push('');

  // Resource configuration
  if (ctx.cpuRequest || ctx.memoryRequest || ctx.cpuLimit || ctx.memoryLimit) {
    lines.push('resources:');
    if (ctx.cpuRequest || ctx.memoryRequest) {
      lines.push('  requests:');
      if (ctx.cpuRequest) {
        lines.push(`    cpu: ${ctx.cpuRequest}`);
      }
      if (ctx.memoryRequest) {
        lines.push(`    memory: ${ctx.memoryRequest}`);
      }
    }
    if (ctx.cpuLimit || ctx.memoryLimit) {
      lines.push('  limits:');
      if (ctx.cpuLimit) {
        lines.push(`    cpu: ${ctx.cpuLimit}`);
      }
      if (ctx.memoryLimit) {
        lines.push(`    memory: ${ctx.memoryLimit}`);
      }
    }
    lines.push('');
  }

  // Environment-specific settings
  if (ctx.environment === 'production') {
    lines.push('# Production settings');
    lines.push('podDisruptionBudget:');
    lines.push('  enabled: true');
    lines.push('  minAvailable: 1');
    lines.push('');
    lines.push('autoscaling:');
    lines.push('  enabled: true');
    lines.push(`  minReplicas: ${ctx.replicas}`);
    lines.push(`  maxReplicas: ${(ctx.replicas || 1) * 3}`);
    lines.push('  targetCPUUtilizationPercentage: 70');
    lines.push('');
  }

  // Node selector / tolerations placeholder
  lines.push('nodeSelector: {}');
  lines.push('');
  lines.push('tolerations: []');
  lines.push('');
  lines.push('affinity: {}');

  return lines.join('\n');
}

/**
 * Generate secrets values content
 */
function generateSecretsValues(ctx: HelmWizardContext): string {
  const lines: string[] = [
    `# Helm secrets for ${ctx.releaseName}`,
    `# Environment: ${ctx.environment}`,
    '# IMPORTANT: Do not commit this file to version control!',
    '# Consider using tools like SOPS, sealed-secrets, or external-secrets',
    '',
  ];

  if (ctx.secretValues && Object.keys(ctx.secretValues).length > 0) {
    lines.push('secrets:');
    for (const [key, value] of Object.entries(ctx.secretValues)) {
      // Mask actual values in generated file with placeholders
      const placeholder = value || Buffer.from('REPLACE_ME').toString('base64');
      lines.push(
        `  ${key}: "${placeholder}"  # base64-encoded value — replace with: echo -n 'your-value' | base64`
      );
    }
  } else {
    lines.push('# Add your secret values here');
    lines.push('# Example:');
    lines.push('# secrets:');
    lines.push('#   databasePassword: "<YOUR_PASSWORD>"');
    lines.push('#   apiKey: "<YOUR_API_KEY>"');
  }

  return lines.join('\n');
}

/**
 * Generate README content
 */
function generateReadme(ctx: HelmWizardContext): string {
  const envSuffix = ctx.environment !== 'dev' ? `-${ctx.environment}` : '';

  return `# ${ctx.releaseName} Helm Values

Generated by Nimbus CLI

## Chart Information

- **Chart:** ${ctx.chart}
- **Release Name:** ${ctx.releaseName}
- **Namespace:** ${ctx.namespace}
- **Environment:** ${ctx.environment}

## Installation

\`\`\`bash
# Add repository (if using a repo chart)
${ctx.repoName && ctx.repoUrl ? `helm repo add ${ctx.repoName} ${ctx.repoUrl}` : '# helm repo add <repo-name> <repo-url>'}
helm repo update

# Install the chart
helm install ${ctx.releaseName} ${ctx.chart} \\
  --namespace ${ctx.namespace} \\
  --create-namespace \\
  -f values${envSuffix}.yaml${
    ctx.includeSecrets
      ? ` \\
  -f secrets${envSuffix}.yaml`
      : ''
  }
\`\`\`

## Upgrade

\`\`\`bash
helm upgrade ${ctx.releaseName} ${ctx.chart} \\
  --namespace ${ctx.namespace} \\
  -f values${envSuffix}.yaml${
    ctx.includeSecrets
      ? ` \\
  -f secrets${envSuffix}.yaml`
      : ''
  }
\`\`\`

## Uninstall

\`\`\`bash
helm uninstall ${ctx.releaseName} --namespace ${ctx.namespace}
\`\`\`

## Files

- \`values${envSuffix}.yaml\` - Main configuration values
${ctx.includeSecrets ? `- \`secrets${envSuffix}.yaml\` - Secret values (DO NOT commit to git!)` : ''}

## Security Notes

${
  ctx.includeSecrets
    ? `- The \`secrets${envSuffix}.yaml\` file contains sensitive data
- Add it to \`.gitignore\` to prevent accidental commits
- Consider using:
  - [SOPS](https://github.com/mozilla/sops) for encrypted secrets in git
  - [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) for Kubernetes-native encryption
  - [External Secrets](https://external-secrets.io/) for external secret managers`
    : '- No secrets file generated'
}

## Customization

Edit the values files to customize your deployment. Common modifications:

- Increase/decrease replicas
- Adjust resource limits
- Configure ingress hosts
- Add environment variables
- Configure persistence
`;
}

/**
 * Get default replicas based on environment
 */
function getDefaultReplicas(environment?: HelmEnvironment): number {
  switch (environment) {
    case 'production':
      return 3;
    case 'staging':
      return 2;
    default:
      return 1;
  }
}

/**
 * Get default resources based on environment
 */
function getDefaultResources(environment?: HelmEnvironment): {
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;
} {
  switch (environment) {
    case 'production':
      return {
        cpuRequest: '250m',
        cpuLimit: '1000m',
        memoryRequest: '256Mi',
        memoryLimit: '512Mi',
      };
    case 'staging':
      return {
        cpuRequest: '100m',
        cpuLimit: '500m',
        memoryRequest: '128Mi',
        memoryLimit: '256Mi',
      };
    default:
      return {
        cpuRequest: '50m',
        cpuLimit: '200m',
        memoryRequest: '64Mi',
        memoryLimit: '128Mi',
      };
  }
}

/**
 * Get suggested secret keys based on chart name
 */
function getSuggestedSecretKeys(chartName: string): string[] {
  const chartSecrets: Record<string, string[]> = {
    postgresql: ['postgresql-password', 'postgresql-postgres-password', 'replication-password'],
    mysql: ['mysql-root-password', 'mysql-password'],
    mongodb: ['mongodb-root-password', 'mongodb-password'],
    redis: ['redis-password'],
    rabbitmq: ['rabbitmq-password', 'rabbitmq-erlang-cookie'],
    kafka: ['kafka-password'],
    elasticsearch: ['elasticsearch-password'],
  };

  return chartSecrets[chartName.toLowerCase()] || ['secret-key'];
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

  // Create .gitignore for secrets
  const gitignorePath = path.join(outputPath, '.gitignore');
  await fs.writeFile(gitignorePath, 'secrets*.yaml\n', 'utf-8');
}

/**
 * Run in non-interactive mode
 */
async function runNonInteractive(options: GenerateHelmOptions): Promise<void> {
  ui.header('nimbus generate helm', 'Non-interactive mode');

  // Validate required options
  if (!options.chart) {
    ui.error('Chart is required in non-interactive mode (--chart)');
    process.exit(1);
  }

  if (!options.releaseName) {
    ui.error('Release name is required in non-interactive mode (--release)');
    process.exit(1);
  }

  ui.info(`Chart: ${options.chart}`);
  ui.info(`Release: ${options.releaseName}`);
  ui.info(`Namespace: ${options.namespace || 'default'}`);
  ui.info(`Environment: ${options.environment || 'dev'}`);
  ui.info(`Output: ${options.output || `./${options.releaseName}-helm`}`);

  // Build context from options
  const ctx: HelmWizardContext = {
    chartSource: 'repo',
    chart: options.chart,
    releaseName: options.releaseName,
    namespace: options.namespace || 'default',
    environment: options.environment || 'dev',
    replicas: getDefaultReplicas(options.environment),
    serviceType: 'ClusterIP',
    servicePort: 80,
    ingressEnabled: false,
    includeSecrets: options.includeSecrets ?? true,
    outputPath: options.output || `./${options.releaseName}-helm`,
  };

  ui.newLine();
  ui.startSpinner({ message: 'Generating values files...' });

  try {
    const files = generateValuesFiles(ctx);
    await writeFilesToDisk(files, ctx.outputPath!);

    ui.stopSpinnerSuccess(`Generated ${files.length} file(s)`);

    ui.newLine();
    ui.box({
      title: 'Complete!',
      content: [
        `Generated ${files.length} file(s) in ${ctx.outputPath}:`,
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
export default generateHelmCommand;
