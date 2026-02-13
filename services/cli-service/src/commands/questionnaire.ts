/**
 * Questionnaire Command
 *
 * Interactive questionnaire flow for generating infrastructure code
 *
 * Usage:
 *   nimbus questionnaire terraform
 *   nimbus questionnaire kubernetes
 *   nimbus questionnaire helm
 *   nimbus generate terraform --interactive
 */

import { logger } from '@nimbus/shared-utils';
import { ui } from '../wizard/ui';
import { select, input, confirm, multiSelect } from '../wizard/prompts';

export interface QuestionnaireOptions {
  /** Questionnaire type */
  type: 'terraform' | 'kubernetes' | 'helm';
  /** Non-interactive mode (use answers file) */
  nonInteractive?: boolean;
  /** Path to answers file (JSON) */
  answersFile?: string;
  /** Output directory for generated code */
  outputDir?: string;
  /** Skip generation, just collect answers */
  dryRun?: boolean;
}

interface Question {
  id: string;
  type: 'select' | 'multiselect' | 'text' | 'number' | 'confirm';
  label: string;
  description?: string;
  options?: Array<{ value: string; label: string; description?: string }>;
  default?: unknown;
  validation?: Array<{ type: string; value?: unknown; message: string }>;
}

interface QuestionnaireStep {
  id: string;
  title: string;
  description?: string;
  questions: Question[];
}

interface QuestionnaireResponse {
  session: {
    id: string;
    type: string;
    completed: boolean;
  };
  currentStep?: QuestionnaireStep;
  nextStep?: QuestionnaireStep;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
}

/**
 * Run questionnaire command
 */
export async function questionnaireCommand(options: QuestionnaireOptions): Promise<void> {
  logger.info('Starting questionnaire', { type: options.type });

  ui.newLine();
  ui.header(`${capitalize(options.type)} Configuration Wizard`);

  // TODO: Add generatorClient integration when available
  // For now, always use local questionnaire
  await runLocal(options);
}

/**
 * Run questionnaire locally
 */
async function runLocal(options: QuestionnaireOptions): Promise<void> {
  ui.info('Starting local questionnaire...');
  ui.newLine();

  const answers: Record<string, unknown> = {};

  // Get questionnaire steps based on type
  const steps = getLocalQuestionnaireSteps(options.type);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Check step condition
    if (step.condition && !step.condition(answers)) {
      continue;
    }

    // Display step header
    ui.print(ui.bold(`Step ${i + 1}/${steps.length}: ${step.title}`));
    if (step.description) {
      ui.print(ui.dim(step.description));
    }
    ui.newLine();

    // Process questions
    for (const question of step.questions) {
      // Check question dependency
      if (question.dependsOn) {
        const depValue = answers[question.dependsOn.questionId];
        if (depValue !== question.dependsOn.value) {
          continue;
        }
      }

      const answer = await askQuestion(question, answers);
      answers[question.id] = answer;
    }

    // Show progress
    displayProgress({
      current: i + 1,
      total: steps.length,
      percentage: Math.round(((i + 1) / steps.length) * 100),
    });
  }

  ui.newLine();
  ui.success('Questionnaire completed!');

  if (!options.dryRun) {
    // Generate code from answers
    await generateFromAnswers(answers, options.type, options);
  } else {
    ui.newLine();
    ui.print(ui.bold('Collected answers:'));
    ui.print(JSON.stringify(answers, null, 2));
  }
}

/**
 * Ask a single question and return the answer
 */
async function askQuestion(
  question: Question,
  currentAnswers: Record<string, unknown>
): Promise<unknown> {
  // Substitute variables in label and description
  const label = substituteVariables(question.label, currentAnswers);
  const description = question.description
    ? substituteVariables(question.description, currentAnswers)
    : undefined;

  switch (question.type) {
    case 'select':
      return select({
        message: label,
        options: question.options || [],
      });

    case 'multiselect':
      return multiSelect({
        message: label,
        options: question.options || [],
      });

    case 'text':
      return input({
        message: label,
        defaultValue: question.default as string,
      });

    case 'number':
      const numStr = await input({
        message: label,
        defaultValue: String(question.default ?? ''),
      });
      return parseInt(numStr, 10);

    case 'confirm':
      return confirm({
        message: label,
        defaultValue: question.default as boolean,
      });

    default:
      return input({
        message: label,
        defaultValue: question.default as string,
      });
  }
}

/**
 * Substitute variables in text ({{variable}} format)
 */
function substituteVariables(text: string, answers: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = answers[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

/**
 * Display progress bar
 */
function displayProgress(progress: { current: number; total: number; percentage: number }): void {
  const barWidth = 30;
  const filled = Math.round((progress.current / progress.total) * barWidth);
  const empty = barWidth - filled;
  const bar = ui.color('█'.repeat(filled), 'green') + ui.dim('░'.repeat(empty));

  ui.newLine();
  ui.print(`  Progress: ${bar} ${progress.percentage}%`);
}

/**
 * Generate code from answers
 */
async function generateFromAnswers(
  answers: Record<string, unknown>,
  type: string,
  options: QuestionnaireOptions
): Promise<void> {
  ui.newLine();
  ui.startSpinner({ message: 'Generating code...' });

  try {
    const outputDir = options.outputDir || `./${type}`;
    const fs = await import('fs/promises');
    const path = await import('path');

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Generate code based on type
    let files: string[] = [];

    if (type === 'terraform') {
      files = await generateTerraformCode(answers, outputDir, fs, path);
    } else if (type === 'kubernetes') {
      files = await generateKubernetesCode(answers, outputDir, fs, path);
    } else if (type === 'helm') {
      files = await generateHelmCode(answers, outputDir, fs, path);
    }

    ui.stopSpinnerSuccess('Code generated successfully');

    // Display generated files
    ui.newLine();
    ui.print(ui.bold('Generated files:'));
    for (const file of files) {
      ui.print(`  ${ui.color('●', 'green')} ${file}`);
    }
    ui.newLine();
    ui.print(`Output directory: ${outputDir}`);

    // Run post-generation validation for Terraform
    if (type === 'terraform') {
      await runPostGenerationValidation(outputDir);
    }
  } catch (error) {
    ui.stopSpinnerFail('Code generation failed');
    ui.error((error as Error).message);
  }
}

/**
 * Generate Terraform code from answers
 */
async function generateTerraformCode(
  answers: Record<string, unknown>,
  outputDir: string,
  fs: typeof import('fs/promises'),
  path: typeof import('path')
): Promise<string[]> {
  const files: string[] = [];

  // Generate main.tf
  const mainContent = generateTerraformMain(answers);
  const mainPath = path.join(outputDir, 'main.tf');
  await fs.writeFile(mainPath, mainContent);
  files.push('main.tf');

  // Generate variables.tf
  const varsContent = generateTerraformVariables(answers);
  const varsPath = path.join(outputDir, 'variables.tf');
  await fs.writeFile(varsPath, varsContent);
  files.push('variables.tf');

  // Generate outputs.tf
  const outputsContent = generateTerraformOutputs(answers);
  const outputsPath = path.join(outputDir, 'outputs.tf');
  await fs.writeFile(outputsPath, outputsContent);
  files.push('outputs.tf');

  // Generate environment directories if environments were selected
  const environments = answers.environments as string[] | undefined;
  if (environments && environments.length > 0) {
    const envFiles = await generateEnvironmentDirs(answers, outputDir, fs, path);
    files.push(...envFiles);
  }

  return files;
}

/**
 * Generate Terraform main.tf content
 */
function generateTerraformMain(answers: Record<string, unknown>): string {
  const provider = answers.provider as string || 'aws';
  const region = answers.region as string || 'us-east-1';

  let content = `# Generated by Nimbus CLI

terraform {
  required_version = ">= 1.0.0"

  required_providers {
    ${provider} = {
      source  = "hashicorp/${provider}"
      version = "~> 5.0"
    }
  }
}

provider "${provider}" {
  region = var.region
}
`;

  // Add VPC if selected
  const components = answers.components as string[] || [];
  if (components.includes('vpc')) {
    const vpcCidr = answers.vpc_cidr as string || '10.0.0.0/16';
    content += `
# VPC
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = var.project_name
  cidr = "${vpcCidr}"

  azs             = var.availability_zones
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = var.tags
}
`;
  }

  return content;
}

/**
 * Generate Terraform variables.tf content
 */
function generateTerraformVariables(answers: Record<string, unknown>): string {
  const projectName = answers.project_name as string || 'my-project';

  return `# Generated by Nimbus CLI

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "${projectName}"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "availability_zones" {
  description = "List of availability zones"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "private_subnets" {
  description = "Private subnet CIDRs"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "public_subnets" {
  description = "Public subnet CIDRs"
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
`;
}

/**
 * Generate Terraform outputs.tf content
 */
function generateTerraformOutputs(answers: Record<string, unknown>): string {
  const components = answers.components as string[] || [];

  let content = `# Generated by Nimbus CLI
`;

  if (components.includes('vpc')) {
    content += `
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}
`;
  }

  return content;
}

/**
 * Generate Kubernetes code from answers
 */
async function generateKubernetesCode(
  answers: Record<string, unknown>,
  outputDir: string,
  fs: typeof import('fs/promises'),
  path: typeof import('path')
): Promise<string[]> {
  const files: string[] = [];
  const appName = answers.app_name as string || 'my-app';

  // Generate deployment.yaml
  const deploymentContent = `# Generated by Nimbus CLI
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${appName}
  labels:
    app: ${appName}
spec:
  replicas: ${answers.replicas || 2}
  selector:
    matchLabels:
      app: ${appName}
  template:
    metadata:
      labels:
        app: ${appName}
    spec:
      containers:
        - name: ${appName}
          image: ${answers.image || 'nginx:latest'}
          ports:
            - containerPort: ${answers.port || 80}
          resources:
            requests:
              cpu: ${answers.cpu_request || '100m'}
              memory: ${answers.memory_request || '128Mi'}
            limits:
              cpu: ${answers.cpu_limit || '500m'}
              memory: ${answers.memory_limit || '512Mi'}
`;

  const deploymentPath = path.join(outputDir, 'deployment.yaml');
  await fs.writeFile(deploymentPath, deploymentContent);
  files.push('deployment.yaml');

  // Generate service.yaml if enabled
  if (answers.create_service !== false) {
    const serviceContent = `# Generated by Nimbus CLI
apiVersion: v1
kind: Service
metadata:
  name: ${appName}
spec:
  selector:
    app: ${appName}
  ports:
    - protocol: TCP
      port: ${answers.service_port || 80}
      targetPort: ${answers.port || 80}
  type: ${answers.service_type || 'ClusterIP'}
`;

    const servicePath = path.join(outputDir, 'service.yaml');
    await fs.writeFile(servicePath, serviceContent);
    files.push('service.yaml');
  }

  return files;
}

/**
 * Generate Helm chart code from answers
 */
async function generateHelmCode(
  answers: Record<string, unknown>,
  outputDir: string,
  fs: typeof import('fs/promises'),
  path: typeof import('path')
): Promise<string[]> {
  const files: string[] = [];
  const chartName = answers.chart_name as string || 'my-chart';

  // Create templates directory
  const templatesDir = path.join(outputDir, 'templates');
  await fs.mkdir(templatesDir, { recursive: true });

  // Generate Chart.yaml
  const chartContent = `# Generated by Nimbus CLI
apiVersion: v2
name: ${chartName}
description: ${answers.description || 'A Helm chart for Kubernetes'}
type: application
version: ${answers.version || '0.1.0'}
appVersion: "${answers.app_version || '1.0.0'}"
`;

  const chartPath = path.join(outputDir, 'Chart.yaml');
  await fs.writeFile(chartPath, chartContent);
  files.push('Chart.yaml');

  // Generate values.yaml
  const valuesContent = `# Generated by Nimbus CLI
# Default values for ${chartName}

replicaCount: ${answers.replicas || 1}

image:
  repository: ${answers.image_repository || 'nginx'}
  tag: ${answers.image_tag || 'latest'}
  pullPolicy: IfNotPresent

service:
  type: ${answers.service_type || 'ClusterIP'}
  port: ${answers.service_port || 80}

resources:
  requests:
    cpu: ${answers.cpu_request || '100m'}
    memory: ${answers.memory_request || '128Mi'}
  limits:
    cpu: ${answers.cpu_limit || '500m'}
    memory: ${answers.memory_limit || '512Mi'}
`;

  const valuesPath = path.join(outputDir, 'values.yaml');
  await fs.writeFile(valuesPath, valuesContent);
  files.push('values.yaml');

  return files;
}

/**
 * Generate per-environment directories with module references
 */
async function generateEnvironmentDirs(
  answers: Record<string, unknown>,
  outputDir: string,
  fs: typeof import('fs/promises'),
  path: typeof import('path')
): Promise<string[]> {
  const environments = answers.environments as string[];
  const projectName = answers.project_name as string || 'my-project';
  const provider = answers.cloud as string || answers.provider as string || 'aws';
  const region = answers.region as string || 'us-east-1';
  const useRemoteState = answers.use_remote_state as boolean;
  const files: string[] = [];

  const envsDir = path.join(outputDir, 'environments');
  await fs.mkdir(envsDir, { recursive: true });

  for (const env of environments) {
    const envDir = path.join(envsDir, env);
    await fs.mkdir(envDir, { recursive: true });

    // main.tf — module source pointing to root
    const mainContent = `# ${env.charAt(0).toUpperCase() + env.slice(1)} Environment
# Generated by Nimbus CLI

module "infrastructure" {
  source = "../../"

  project_name = "${projectName}"
  environment  = "${env}"
  region       = var.region

  tags = merge(var.tags, {
    Environment = "${env}"
  })
}
`;
    await fs.writeFile(path.join(envDir, 'main.tf'), mainContent);
    files.push(`environments/${env}/main.tf`);

    // terraform.tfvars
    const instanceSize = env === 'prod' ? 't3.large' : env === 'staging' ? 't3.medium' : 't3.small';
    const tfvarsContent = `# ${env.charAt(0).toUpperCase() + env.slice(1)} environment variables
# Generated by Nimbus CLI

region       = "${region}"

tags = {
  Environment = "${env}"
  Project     = "${projectName}"
  ManagedBy   = "terraform"
}
`;
    await fs.writeFile(path.join(envDir, 'terraform.tfvars'), tfvarsContent);
    files.push(`environments/${env}/terraform.tfvars`);

    // backend.tf — remote state if selected
    if (useRemoteState) {
      const backendContent = `# Remote state configuration for ${env}
# Generated by Nimbus CLI

terraform {
  backend "s3" {
    bucket         = "${projectName}-tfstate"
    key            = "${env}/terraform.tfstate"
    region         = "${region}"
    encrypt        = true
    dynamodb_table = "${projectName}-tflock"
  }
}
`;
      await fs.writeFile(path.join(envDir, 'backend.tf'), backendContent);
      files.push(`environments/${env}/backend.tf`);
    }
  }

  return files;
}

/**
 * Run post-generation validation on Terraform files
 */
async function runPostGenerationValidation(outputDir: string): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  ui.newLine();
  ui.section('Post-Generation Validation');

  // Check if terraform CLI is available
  let hasTerraform = false;
  try {
    await execFileAsync('terraform', ['version'], { timeout: 5000 });
    hasTerraform = true;
  } catch {
    ui.info('Terraform CLI not found - skipping validation');
    ui.print(ui.dim('  Install terraform for automatic validation'));
    return;
  }

  // Run terraform fmt -check
  try {
    ui.startSpinner({ message: 'Running terraform fmt...' });
    await execFileAsync('terraform', ['fmt', '-check', '-diff'], { cwd: outputDir, timeout: 15000 });
    ui.stopSpinnerSuccess('Code formatting valid');
  } catch (error: any) {
    ui.stopSpinnerFail('Formatting issues found');
    // Try to auto-fix
    try {
      await execFileAsync('terraform', ['fmt'], { cwd: outputDir, timeout: 15000 });
      ui.success('Auto-formatted Terraform files');
    } catch {
      ui.warning('Could not auto-format files');
    }
  }

  // Run terraform init -backend=false for validation
  try {
    ui.startSpinner({ message: 'Running terraform validate...' });
    await execFileAsync('terraform', ['init', '-backend=false', '-no-color'], { cwd: outputDir, timeout: 30000 });
    const { stdout } = await execFileAsync('terraform', ['validate', '-no-color'], { cwd: outputDir, timeout: 15000 });
    ui.stopSpinnerSuccess('Terraform validation passed');
    if (stdout.includes('Success')) {
      ui.print(ui.dim(`  ${stdout.trim()}`));
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Terraform validation failed');
    const output = error.stdout || error.stderr || error.message;
    ui.print(ui.dim(`  ${output}`));
  }

  // Check if tflint is available
  try {
    await execFileAsync('tflint', ['--version'], { timeout: 5000 });
    ui.startSpinner({ message: 'Running tflint...' });
    const { stdout } = await execFileAsync('tflint', ['--no-color'], { cwd: outputDir, timeout: 15000 });
    ui.stopSpinnerSuccess('tflint check passed');
    if (stdout) {
      ui.print(ui.dim(`  ${stdout.trim()}`));
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      ui.info('tflint not found - skipping lint check');
      ui.print(ui.dim('  Install tflint for additional validation'));
    } else {
      ui.warning('tflint found issues');
      const output = error.stdout || error.stderr || error.message;
      ui.print(ui.dim(`  ${output}`));
    }
  }

  // Check if checkov is available for security scanning
  try {
    await execFileAsync('checkov', ['--version'], { timeout: 5000 });
    ui.startSpinner({ message: 'Running checkov security scan...' });
    const { stdout } = await execFileAsync(
      'checkov',
      ['-d', outputDir, '--framework', 'terraform', '--compact', '--quiet'],
      { timeout: 60000 }
    );
    ui.stopSpinnerSuccess('checkov security scan passed');
    // Parse passed/failed from output
    const passedMatch = stdout.match(/Passed checks: (\d+)/);
    const failedMatch = stdout.match(/Failed checks: (\d+)/);
    if (passedMatch || failedMatch) {
      const passed = passedMatch ? passedMatch[1] : '0';
      const failed = failedMatch ? failedMatch[1] : '0';
      ui.print(ui.dim(`  Passed: ${passed}, Failed: ${failed}`));
    } else if (stdout.trim()) {
      ui.print(ui.dim(`  ${stdout.trim()}`));
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      ui.info('Security scanning available with checkov. Install: pip install checkov');
    } else {
      ui.warning('checkov found security issues');
      const output = error.stdout || error.stderr || error.message;
      // Parse passed/failed from output even on non-zero exit
      const passedMatch = output.match(/Passed checks: (\d+)/);
      const failedMatch = output.match(/Failed checks: (\d+)/);
      if (passedMatch || failedMatch) {
        const passed = passedMatch ? passedMatch[1] : '0';
        const failed = failedMatch ? failedMatch[1] : '0';
        ui.print(ui.dim(`  Passed: ${passed}, Failed: ${failed}`));
      } else {
        ui.print(ui.dim(`  ${output}`));
      }
    }
  }
}

/**
 * Get local questionnaire steps based on type
 */
function getLocalQuestionnaireSteps(type: 'terraform' | 'kubernetes' | 'helm'): Array<{
  id: string;
  title: string;
  description?: string;
  questions: Array<Question & { dependsOn?: { questionId: string; value: unknown } }>;
  condition?: (answers: Record<string, unknown>) => boolean;
}> {
  switch (type) {
    case 'terraform':
      return getTerraformSteps();
    case 'kubernetes':
      return getKubernetesSteps();
    case 'helm':
      return getHelmSteps();
    default:
      return [];
  }
}

/**
 * Terraform questionnaire steps (local fallback)
 */
function getTerraformSteps() {
  return [
    {
      id: 'provider',
      title: 'Cloud Provider',
      description: 'Select your cloud provider and region',
      questions: [
        {
          id: 'cloud',
          type: 'select' as const,
          label: 'Which cloud provider?',
          options: [
            { value: 'aws', label: 'AWS', description: 'Amazon Web Services' },
            { value: 'gcp', label: 'GCP', description: 'Google Cloud Platform' },
            { value: 'azure', label: 'Azure', description: 'Microsoft Azure' },
          ],
          default: 'aws',
        },
        {
          id: 'region',
          type: 'select' as const,
          label: 'Which region?',
          options: [
            { value: 'us-east-1', label: 'US East (N. Virginia)' },
            { value: 'us-west-2', label: 'US West (Oregon)' },
            { value: 'eu-west-1', label: 'EU (Ireland)' },
            { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
          ],
          default: 'us-east-1',
          dependsOn: { questionId: 'cloud', value: 'aws' },
        },
        {
          id: 'project_name',
          type: 'text' as const,
          label: 'Project name',
          default: 'my-project',
        },
        {
          id: 'environment',
          type: 'select' as const,
          label: 'Environment',
          options: [
            { value: 'dev', label: 'Development' },
            { value: 'staging', label: 'Staging' },
            { value: 'prod', label: 'Production' },
          ],
          default: 'dev',
        },
      ],
    },
    {
      id: 'components',
      title: 'Infrastructure Components',
      description: 'Select the components you need',
      questions: [
        {
          id: 'components',
          type: 'multiselect' as const,
          label: 'What components do you need?',
          options: [
            { value: 'vpc', label: 'VPC / Network' },
            { value: 'eks', label: 'Kubernetes (EKS)' },
            { value: 'rds', label: 'Database (RDS)' },
            { value: 's3', label: 'Object Storage (S3)' },
            { value: 'ecs', label: 'Container Service (ECS)' },
          ],
          default: ['vpc'],
        },
      ],
    },
    {
      id: 'environments',
      title: 'Environment Separation',
      description: 'Configure environment-specific deployments',
      questions: [
        {
          id: 'environments',
          type: 'multiselect' as const,
          label: 'Which environments do you need?',
          options: [
            { value: 'dev', label: 'Development' },
            { value: 'staging', label: 'Staging' },
            { value: 'prod', label: 'Production' },
          ],
          default: ['dev'],
        },
        {
          id: 'use_remote_state',
          type: 'confirm' as const,
          label: 'Use remote state backend (S3)?',
          default: true,
        },
      ],
    },
    {
      id: 'vpc_config',
      title: 'VPC Configuration',
      condition: (answers: Record<string, unknown>) => {
        const components = answers.components as string[];
        return components && components.includes('vpc');
      },
      questions: [
        {
          id: 'vpc_cidr',
          type: 'text' as const,
          label: 'VPC CIDR block',
          default: '10.0.0.0/16',
        },
        {
          id: 'availability_zones',
          type: 'number' as const,
          label: 'Number of availability zones',
          default: 3,
        },
        {
          id: 'nat_gateway',
          type: 'select' as const,
          label: 'NAT Gateway configuration',
          options: [
            { value: 'single', label: 'Single NAT (~$32/month)' },
            { value: 'ha', label: 'HA NAT (one per AZ)' },
            { value: 'none', label: 'No NAT Gateway' },
          ],
          default: 'single',
        },
      ],
    },
  ];
}

/**
 * Kubernetes questionnaire steps (local fallback)
 */
function getKubernetesSteps() {
  return [
    {
      id: 'workload',
      title: 'Workload Type',
      description: 'Configure your Kubernetes workload',
      questions: [
        {
          id: 'workload_type',
          type: 'select' as const,
          label: 'What type of workload?',
          options: [
            { value: 'deployment', label: 'Deployment', description: 'Standard stateless workload' },
            { value: 'statefulset', label: 'StatefulSet', description: 'Stateful workload with persistent storage' },
            { value: 'daemonset', label: 'DaemonSet', description: 'Run on every node' },
            { value: 'cronjob', label: 'CronJob', description: 'Scheduled job' },
          ],
          default: 'deployment',
        },
        {
          id: 'name',
          type: 'text' as const,
          label: 'Workload name',
          default: 'my-app',
        },
        {
          id: 'namespace',
          type: 'text' as const,
          label: 'Namespace',
          default: 'default',
        },
      ],
    },
    {
      id: 'container',
      title: 'Container Configuration',
      questions: [
        {
          id: 'image',
          type: 'text' as const,
          label: 'Container image',
          default: 'nginx:latest',
        },
        {
          id: 'replicas',
          type: 'number' as const,
          label: 'Number of replicas',
          default: 3,
        },
        {
          id: 'port',
          type: 'number' as const,
          label: 'Container port',
          default: 80,
        },
      ],
    },
    {
      id: 'service',
      title: 'Service Configuration',
      questions: [
        {
          id: 'service_type',
          type: 'select' as const,
          label: 'Service type',
          options: [
            { value: 'ClusterIP', label: 'ClusterIP', description: 'Internal only' },
            { value: 'NodePort', label: 'NodePort', description: 'External via node port' },
            { value: 'LoadBalancer', label: 'LoadBalancer', description: 'External load balancer' },
          ],
          default: 'ClusterIP',
        },
        {
          id: 'create_ingress',
          type: 'confirm' as const,
          label: 'Create Ingress?',
          default: false,
        },
      ],
    },
    {
      id: 'resources',
      title: 'Resource Limits',
      questions: [
        {
          id: 'cpu_request',
          type: 'text' as const,
          label: 'CPU request',
          default: '100m',
        },
        {
          id: 'cpu_limit',
          type: 'text' as const,
          label: 'CPU limit',
          default: '500m',
        },
        {
          id: 'memory_request',
          type: 'text' as const,
          label: 'Memory request',
          default: '128Mi',
        },
        {
          id: 'memory_limit',
          type: 'text' as const,
          label: 'Memory limit',
          default: '512Mi',
        },
      ],
    },
  ];
}

/**
 * Helm questionnaire steps (local fallback)
 */
function getHelmSteps() {
  return [
    {
      id: 'chart',
      title: 'Chart Information',
      description: 'Basic Helm chart configuration',
      questions: [
        {
          id: 'chart_name',
          type: 'text' as const,
          label: 'Chart name',
          default: 'my-chart',
        },
        {
          id: 'chart_version',
          type: 'text' as const,
          label: 'Chart version',
          default: '0.1.0',
        },
        {
          id: 'app_version',
          type: 'text' as const,
          label: 'Application version',
          default: '1.0.0',
        },
        {
          id: 'description',
          type: 'text' as const,
          label: 'Chart description',
          default: 'A Helm chart for my application',
        },
      ],
    },
    {
      id: 'deployment',
      title: 'Deployment Configuration',
      questions: [
        {
          id: 'image_repository',
          type: 'text' as const,
          label: 'Image repository',
          default: 'nginx',
        },
        {
          id: 'image_tag',
          type: 'text' as const,
          label: 'Image tag',
          default: 'latest',
        },
        {
          id: 'replica_count',
          type: 'number' as const,
          label: 'Replica count',
          default: 1,
        },
      ],
    },
    {
      id: 'service',
      title: 'Service Configuration',
      questions: [
        {
          id: 'service_type',
          type: 'select' as const,
          label: 'Service type',
          options: [
            { value: 'ClusterIP', label: 'ClusterIP' },
            { value: 'NodePort', label: 'NodePort' },
            { value: 'LoadBalancer', label: 'LoadBalancer' },
          ],
          default: 'ClusterIP',
        },
        {
          id: 'service_port',
          type: 'number' as const,
          label: 'Service port',
          default: 80,
        },
      ],
    },
    {
      id: 'ingress',
      title: 'Ingress Configuration',
      questions: [
        {
          id: 'ingress_enabled',
          type: 'confirm' as const,
          label: 'Enable Ingress?',
          default: false,
        },
        {
          id: 'ingress_host',
          type: 'text' as const,
          label: 'Ingress hostname',
          default: 'chart.local',
          dependsOn: { questionId: 'ingress_enabled', value: true },
        },
      ],
    },
  ];
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Export as default
export default questionnaireCommand;
