/**
 * Terraform Project Generator
 *
 * Generates complete Terraform project structures with environment separation,
 * module scaffolding, and post-generation validation pipeline.
 *
 * Addresses:
 * - Gap #9:  Post-generation validation pipeline
 * - Gap #10: Environment separation (dev/staging/prod tfvars)
 * - Gap #11: Full project structure generation
 * - Gap #12: tflint-style checks
 * - Gap #16: .gitignore in scaffolded projects
 */

import { logger } from '@nimbus/shared-utils';

// ==========================================
// Types
// ==========================================

/** Configuration for generating a Terraform project. */
export interface TerraformProjectConfig {
  /** Name of the project used for resource naming and tagging. */
  projectName: string;
  /** Cloud provider target. */
  provider: 'aws' | 'gcp' | 'azure';
  /** Cloud provider region. */
  region: string;
  /** Default environment. */
  environment?: string;
  /** Infrastructure components to include (e.g. vpc, eks, rds, s3, ecs, kms). */
  components: string[];
  /** Remote state backend configuration. */
  backendConfig?: {
    bucket: string;
    dynamodbTable?: string;
    key?: string;
  };
  /** Common resource tags. */
  tags?: Record<string, string>;
}

/** A single generated file with its relative path and content. */
export interface GeneratedFile {
  path: string;
  content: string;
}

/** A single item from the validation pipeline. */
export interface ValidationItem {
  severity: 'error' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  rule?: string;
}

/** Aggregated validation report for a generated project. */
export interface ValidationReport {
  valid: boolean;
  items: ValidationItem[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

/** Result from running a subprocess command (terraform fmt, validate, tflint). */
export interface SubprocessResult {
  /** Whether the command exited with code 0. */
  success: boolean;
  /** Standard output from the command. */
  stdout: string;
  /** Standard error from the command. */
  stderr: string;
}

/** Aggregated results from all subprocess validation steps. */
export interface SubprocessValidation {
  /** Result of `terraform fmt -check -diff`. */
  fmtCheck: SubprocessResult;
  /** Result of `terraform init -backend=false` followed by `terraform validate`. */
  terraformValidate: SubprocessResult;
  /** Result of `tflint` if installed, null otherwise. */
  tflint: SubprocessResult | null;
  /** Result of `checkov` if installed, null otherwise. */
  checkov: SubprocessResult | null;
}

/** The complete output of the project generator. */
export interface GeneratedProject {
  files: GeneratedFile[];
  validation: ValidationReport;
  /** Subprocess-based validation results (best-effort; omitted when terraform CLI is unavailable). */
  subprocessValidation?: SubprocessValidation;
}

// ==========================================
// Generator
// ==========================================

/**
 * Generates a complete Terraform project structure including:
 * - Root configuration files (main.tf, variables.tf, outputs.tf, versions.tf, backend.tf)
 * - Environment-specific tfvars (dev, staging, prod)
 * - Component modules with main, variables, and outputs
 * - .gitignore for Terraform projects
 * - Post-generation validation pipeline
 */
export class TerraformProjectGenerator {
  /**
   * Generate a full Terraform project from the given configuration.
   */
  async generate(config: TerraformProjectConfig): Promise<GeneratedProject> {
    logger.info(`Generating Terraform project: ${config.projectName}`);

    const files: GeneratedFile[] = [];

    // 1. Root configuration files
    files.push(this.generateMainTf(config));
    files.push(this.generateVariablesTf(config));
    files.push(this.generateOutputsTf(config));
    files.push(this.generateVersionsTf(config));
    files.push(this.generateBackendTf(config));

    // 2. Example tfvars
    files.push(this.generateTfvarsExample(config));

    // 3. README
    files.push(this.generateReadme(config));

    // 4. Environment-specific tfvars (Gap #10)
    files.push(this.generateEnvTfvars(config, 'dev'));
    files.push(this.generateEnvTfvars(config, 'staging'));
    files.push(this.generateEnvTfvars(config, 'prod'));

    // 5. Module files for each component (Gap #11)
    for (const component of config.components) {
      files.push(...this.generateModuleFiles(config, component));
    }

    // 6. .gitignore for Terraform projects (Gap #16)
    files.push(this.generateGitignore());

    // 7. Run validation pipeline (Gap #9 + #12)
    const validation = this.validateProject(files, config);

    // Subprocess validation (D1) is available via validateWithSubprocess()
    // but is NOT auto-run here because terraform init can be slow (downloads providers).
    // Callers should invoke validateWithSubprocess() separately when needed.
    return { files, validation };
  }

  // ===== File Generators =====

  /**
   * Generate a standard Terraform .gitignore file.
   * Excludes state files, provider caches, variable overrides,
   * and other files that should not be committed to version control.
   */
  generateGitignore(): GeneratedFile {
    return {
      path: '.gitignore',
      content: `# Terraform
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl
crash.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json
*.tfvars
*.tfvars.json
.terraformrc
terraform.rc
`,
    };
  }

  private generateMainTf(config: TerraformProjectConfig): GeneratedFile {
    const providerBlock = this.getProviderBlock(config);
    const moduleBlocks = config.components
      .map(c => this.getModuleBlock(config, c))
      .join('\n\n');

    return {
      path: 'main.tf',
      content: `# ${config.projectName} - Main Configuration
# Generated by Nimbus

${providerBlock}

${moduleBlocks}
`,
    };
  }

  private generateVariablesTf(config: TerraformProjectConfig): GeneratedFile {
    const vars: string[] = [
      `# ${config.projectName} - Variables`,
      '# Generated by Nimbus',
      '',
      'variable "project_name" {',
      '  description = "Name of the project"',
      '  type        = string',
      `  default     = "${config.projectName}"`,
      '}',
      '',
      'variable "environment" {',
      '  description = "Environment (dev, staging, prod)"',
      '  type        = string',
      `  default     = "${config.environment || 'dev'}"`,
      '',
      '  validation {',
      '    condition     = contains(["dev", "staging", "prod"], var.environment)',
      '    error_message = "Environment must be dev, staging, or prod."',
      '  }',
      '}',
      '',
      'variable "region" {',
      '  description = "Cloud provider region"',
      '  type        = string',
      `  default     = "${config.region}"`,
      '}',
      '',
      'variable "tags" {',
      '  description = "Common tags for all resources"',
      '  type        = map(string)',
      '  default = {',
      `    Project     = "${config.projectName}"`,
      '    ManagedBy   = "terraform"',
      '    Environment = "dev"',
      '  }',
      '}',
    ];

    // Add component-specific variables
    if (config.components.includes('vpc')) {
      vars.push(
        '',
        'variable "vpc_cidr" {',
        '  description = "VPC CIDR block"',
        '  type        = string',
        '  default     = "10.0.0.0/16"',
        '}',
      );
      vars.push(
        '',
        'variable "availability_zones" {',
        '  description = "List of availability zones"',
        '  type        = list(string)',
        `  default     = ["${config.region}a", "${config.region}b"]`,
        '}',
      );
    }

    if (config.components.includes('eks')) {
      vars.push(
        '',
        'variable "cluster_version" {',
        '  description = "EKS cluster version"',
        '  type        = string',
        '  default     = "1.28"',
        '}',
      );
      vars.push(
        '',
        'variable "node_instance_type" {',
        '  description = "EKS node instance type"',
        '  type        = string',
        '  default     = "t3.medium"',
        '}',
      );
      vars.push(
        '',
        'variable "node_count" {',
        '  description = "Number of EKS worker nodes"',
        '  type        = number',
        '  default     = 2',
        '}',
      );
    }

    if (config.components.includes('rds')) {
      vars.push(
        '',
        'variable "db_instance_class" {',
        '  description = "RDS instance class"',
        '  type        = string',
        '  default     = "db.t3.micro"',
        '}',
      );
      vars.push(
        '',
        'variable "db_engine" {',
        '  description = "Database engine"',
        '  type        = string',
        '  default     = "postgres"',
        '}',
      );
      vars.push(
        '',
        'variable "db_storage_size" {',
        '  description = "Database storage size in GB"',
        '  type        = number',
        '  default     = 20',
        '}',
      );
    }

    if (config.components.includes('s3')) {
      vars.push(
        '',
        'variable "bucket_name" {',
        '  description = "S3 bucket name"',
        '  type        = string',
        `  default     = "${config.projectName}-storage"`,
        '}',
      );
    }

    if (config.components.includes('ecs')) {
      vars.push(
        '',
        'variable "container_image" {',
        '  description = "Docker image for the ECS task"',
        '  type        = string',
        `  default     = "${config.projectName}:latest"`,
        '}',
      );
      vars.push(
        '',
        'variable "container_port" {',
        '  description = "Port exposed by the container"',
        '  type        = number',
        '  default     = 8080',
        '}',
      );
      vars.push(
        '',
        'variable "ecs_cpu" {',
        '  description = "Fargate task CPU units (256, 512, 1024, 2048, 4096)"',
        '  type        = number',
        '  default     = 256',
        '}',
      );
      vars.push(
        '',
        'variable "ecs_memory" {',
        '  description = "Fargate task memory in MiB"',
        '  type        = number',
        '  default     = 512',
        '}',
      );
      vars.push(
        '',
        'variable "desired_count" {',
        '  description = "Number of ECS tasks to run"',
        '  type        = number',
        '  default     = 2',
        '}',
      );
    }

    if (config.components.includes('kms')) {
      vars.push(
        '',
        'variable "kms_key_alias" {',
        '  description = "Alias for the KMS key"',
        '  type        = string',
        `  default     = "${config.projectName}-key"`,
        '}',
      );
      vars.push(
        '',
        'variable "kms_deletion_window" {',
        '  description = "Number of days before KMS key is deleted after destruction"',
        '  type        = number',
        '  default     = 30',
        '}',
      );
    }

    return { path: 'variables.tf', content: vars.join('\n') + '\n' };
  }

  private generateOutputsTf(config: TerraformProjectConfig): GeneratedFile {
    const outputs: string[] = [
      `# ${config.projectName} - Outputs`,
      '# Generated by Nimbus',
      '',
    ];

    if (config.components.includes('vpc')) {
      outputs.push(
        'output "vpc_id" {',
        '  description = "VPC ID"',
        '  value       = module.vpc.vpc_id',
        '}',
        '',
      );
    }

    if (config.components.includes('eks')) {
      outputs.push(
        'output "eks_cluster_endpoint" {',
        '  description = "EKS cluster endpoint"',
        '  value       = module.eks.cluster_endpoint',
        '}',
        '',
      );
      outputs.push(
        'output "eks_cluster_name" {',
        '  description = "EKS cluster name"',
        '  value       = module.eks.cluster_name',
        '}',
        '',
      );
    }

    if (config.components.includes('rds')) {
      outputs.push(
        'output "rds_endpoint" {',
        '  description = "RDS endpoint"',
        '  value       = module.rds.endpoint',
        '  sensitive   = true',
        '}',
        '',
      );
    }

    if (config.components.includes('s3')) {
      outputs.push(
        'output "s3_bucket_arn" {',
        '  description = "S3 bucket ARN"',
        '  value       = module.s3.bucket_arn',
        '}',
        '',
      );
    }

    if (config.components.includes('ecs')) {
      outputs.push(
        'output "ecs_cluster_name" {',
        '  description = "ECS cluster name"',
        '  value       = module.ecs.cluster_name',
        '}',
        '',
      );
      outputs.push(
        'output "ecs_service_name" {',
        '  description = "ECS service name"',
        '  value       = module.ecs.service_name',
        '}',
        '',
      );
      outputs.push(
        'output "alb_dns_name" {',
        '  description = "ALB DNS name"',
        '  value       = module.ecs.alb_dns_name',
        '}',
        '',
      );
    }

    if (config.components.includes('kms')) {
      outputs.push(
        'output "kms_key_arn" {',
        '  description = "KMS key ARN"',
        '  value       = module.kms.key_arn',
        '}',
        '',
      );
      outputs.push(
        'output "kms_key_id" {',
        '  description = "KMS key ID"',
        '  value       = module.kms.key_id',
        '}',
        '',
      );
    }

    return { path: 'outputs.tf', content: outputs.join('\n') };
  }

  private generateVersionsTf(config: TerraformProjectConfig): GeneratedFile {
    const providerSource =
      config.provider === 'aws'
        ? 'hashicorp/aws'
        : config.provider === 'gcp'
          ? 'hashicorp/google'
          : 'hashicorp/azurerm';

    const providerVersion =
      config.provider === 'aws'
        ? '~> 5.0'
        : config.provider === 'gcp'
          ? '~> 5.0'
          : '~> 3.0';

    const providerName =
      config.provider === 'gcp' ? 'google' : config.provider;

    return {
      path: 'versions.tf',
      content: `# Terraform and Provider Versions
# Generated by Nimbus

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    ${providerName} = {
      source  = "${providerSource}"
      version = "${providerVersion}"
    }
  }
}
`,
    };
  }

  private generateBackendTf(config: TerraformProjectConfig): GeneratedFile {
    const bucket =
      config.backendConfig?.bucket || `${config.projectName}-tfstate`;
    const key =
      config.backendConfig?.key || `${config.projectName}/terraform.tfstate`;
    const dynamodbTable =
      config.backendConfig?.dynamodbTable || `${config.projectName}-tflock`;

    if (config.provider === 'aws') {
      return {
        path: 'backend.tf',
        content: `# Remote State Configuration
# Generated by Nimbus

terraform {
  backend "s3" {
    bucket         = "${bucket}"
    key            = "${key}"
    region         = "${config.region}"
    dynamodb_table = "${dynamodbTable}"
    encrypt        = true
  }
}
`,
      };
    }

    // GCP/Azure backends
    return {
      path: 'backend.tf',
      content: `# Remote State Configuration
# Generated by Nimbus
# Configure your backend before running terraform init

# terraform {
#   backend "${config.provider === 'gcp' ? 'gcs' : 'azurerm'}" {
#     # Configure your backend settings
#   }
# }
`,
    };
  }

  private generateTfvarsExample(config: TerraformProjectConfig): GeneratedFile {
    const lines = [
      `# ${config.projectName} - Example Variables`,
      '# Copy this file and customize for your environment',
      '# Generated by Nimbus',
      '',
      `project_name = "${config.projectName}"`,
      'environment  = "dev"',
      `region       = "${config.region}"`,
      '',
    ];

    if (config.components.includes('vpc')) {
      lines.push('vpc_cidr = "10.0.0.0/16"');
    }
    if (config.components.includes('eks')) {
      lines.push('node_instance_type = "t3.medium"');
      lines.push('node_count         = 2');
    }
    if (config.components.includes('rds')) {
      lines.push('db_instance_class = "db.t3.micro"');
    }
    if (config.components.includes('ecs')) {
      lines.push('container_image = "nginx:latest"');
      lines.push('container_port  = 8080');
      lines.push('ecs_cpu         = 256');
      lines.push('ecs_memory      = 512');
      lines.push('desired_count   = 2');
    }
    if (config.components.includes('kms')) {
      lines.push(`kms_key_alias       = "${config.projectName}-key"`);
      lines.push('kms_deletion_window = 30');
    }

    return { path: 'terraform.tfvars.example', content: lines.join('\n') + '\n' };
  }

  private generateReadme(config: TerraformProjectConfig): GeneratedFile {
    return {
      path: 'README.md',
      content: `# ${config.projectName}

Infrastructure as Code managed by Terraform. Generated by Nimbus.

## Components
${config.components.map(c => `- ${c.toUpperCase()}`).join('\n')}

## Environments
- \`dev\` - Development environment
- \`staging\` - Staging environment
- \`prod\` - Production environment

## Usage

\`\`\`bash
# Initialize
terraform init

# Plan with environment-specific vars
terraform plan -var-file="environments/dev/terraform.tfvars"

# Apply
terraform apply -var-file="environments/dev/terraform.tfvars"
\`\`\`

## Structure
\`\`\`
.
├── main.tf                          # Main configuration
├── variables.tf                     # Variable definitions
├── outputs.tf                       # Output definitions
├── versions.tf                      # Terraform and provider versions
├── backend.tf                       # Remote state configuration
├── terraform.tfvars.example         # Example variable values
├── .gitignore                       # Git ignore rules
├── environments/
│   ├── dev/terraform.tfvars         # Dev environment values
│   ├── staging/terraform.tfvars     # Staging environment values
│   └── prod/terraform.tfvars        # Production environment values
└── modules/                         # Component modules
${config.components.map(c => `    └── ${c}/`).join('\n')}
\`\`\`
`,
    };
  }

  private generateEnvTfvars(
    config: TerraformProjectConfig,
    env: 'dev' | 'staging' | 'prod',
  ): GeneratedFile {
    const envConfigs = {
      dev: {
        instanceType: 't3.small',
        nodeCount: 1,
        dbClass: 'db.t3.micro',
        dbStorage: 20,
        azCount: 2,
        cidr: '10.0.0.0/16',
        ecsCpu: 256,
        ecsMemory: 512,
        ecsDesiredCount: 1,
      },
      staging: {
        instanceType: 't3.medium',
        nodeCount: 2,
        dbClass: 'db.t3.small',
        dbStorage: 50,
        azCount: 2,
        cidr: '10.1.0.0/16',
        ecsCpu: 512,
        ecsMemory: 1024,
        ecsDesiredCount: 2,
      },
      prod: {
        instanceType: 't3.large',
        nodeCount: 3,
        dbClass: 'db.r6g.large',
        dbStorage: 100,
        azCount: 3,
        cidr: '10.2.0.0/16',
        ecsCpu: 1024,
        ecsMemory: 2048,
        ecsDesiredCount: 3,
      },
    };

    const c = envConfigs[env];
    const azs = Array.from(
      { length: c.azCount },
      (_, i) => `"${config.region}${String.fromCharCode(97 + i)}"`,
    );

    const lines = [
      `# ${config.projectName} - ${env.charAt(0).toUpperCase() + env.slice(1)} Environment`,
      '# Generated by Nimbus',
      '',
      `project_name = "${config.projectName}"`,
      `environment  = "${env}"`,
      `region       = "${config.region}"`,
      '',
      'tags = {',
      `  Project     = "${config.projectName}"`,
      `  Environment = "${env}"`,
      '  ManagedBy   = "terraform"',
      '}',
      '',
    ];

    if (config.components.includes('vpc')) {
      lines.push(`vpc_cidr           = "${c.cidr}"`);
      lines.push(`availability_zones = [${azs.join(', ')}]`);
      lines.push('');
    }

    if (config.components.includes('eks')) {
      lines.push(`node_instance_type = "${c.instanceType}"`);
      lines.push(`node_count         = ${c.nodeCount}`);
      lines.push('');
    }

    if (config.components.includes('rds')) {
      lines.push(`db_instance_class = "${c.dbClass}"`);
      lines.push(`db_storage_size   = ${c.dbStorage}`);
      lines.push('');
    }

    if (config.components.includes('ecs')) {
      lines.push(`ecs_cpu       = ${c.ecsCpu}`);
      lines.push(`ecs_memory    = ${c.ecsMemory}`);
      lines.push(`desired_count = ${c.ecsDesiredCount}`);
      lines.push('');
    }

    if (config.components.includes('kms')) {
      lines.push(`kms_key_alias       = "${config.projectName}-key"`);
      lines.push(`kms_deletion_window = ${env === 'prod' ? 30 : 7}`);
      lines.push('');
    }

    return {
      path: `environments/${env}/terraform.tfvars`,
      content: lines.join('\n'),
    };
  }

  private generateModuleFiles(
    config: TerraformProjectConfig,
    component: string,
  ): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    files.push({
      path: `modules/${component}/main.tf`,
      content: this.getModuleMainTf(config, component),
    });

    files.push({
      path: `modules/${component}/variables.tf`,
      content: this.getModuleVariablesTf(component),
    });

    files.push({
      path: `modules/${component}/outputs.tf`,
      content: this.getModuleOutputsTf(component),
    });

    return files;
  }

  // ===== Validation Pipeline (Gap #9 + #12) =====

  /**
   * Validate a set of generated Terraform files.
   * Runs structural, syntactic, and best-practice checks similar to tflint.
   */
  validateProject(
    files: GeneratedFile[],
    _config?: TerraformProjectConfig,
  ): ValidationReport {
    const items: ValidationItem[] = [];

    // 1. Check required files are present
    items.push(...this.checkRequiredFiles(files));

    // 2. Basic HCL syntax validation
    items.push(...this.checkHclSyntax(files));

    // 3. Check for anti-patterns (tflint-style)
    items.push(...this.checkAntiPatterns(files));

    // 4. Check for missing tags on resources
    items.push(...this.checkMissingTags(files));

    const errors = items.filter(i => i.severity === 'error').length;
    const warnings = items.filter(i => i.severity === 'warning').length;
    const info = items.filter(i => i.severity === 'info').length;

    return {
      valid: errors === 0,
      items,
      summary: { errors, warnings, info },
    };
  }

  private checkRequiredFiles(files: GeneratedFile[]): ValidationItem[] {
    const items: ValidationItem[] = [];
    const requiredFiles = [
      'main.tf',
      'variables.tf',
      'outputs.tf',
      'versions.tf',
      'backend.tf',
    ];
    const filePaths = files.map(f => f.path);

    for (const required of requiredFiles) {
      if (!filePaths.includes(required)) {
        items.push({
          severity: 'error',
          message: `Required file missing: ${required}`,
          rule: 'required-files',
        });
      }
    }

    // Check environment files
    for (const env of ['dev', 'staging', 'prod']) {
      if (!filePaths.includes(`environments/${env}/terraform.tfvars`)) {
        items.push({
          severity: 'warning',
          message: `Missing environment tfvars: environments/${env}/terraform.tfvars`,
          rule: 'env-separation',
        });
      }
    }

    return items;
  }

  private checkHclSyntax(files: GeneratedFile[]): ValidationItem[] {
    const items: ValidationItem[] = [];

    for (const file of files) {
      if (!file.path.endsWith('.tf')) continue;

      // Check matching braces
      const openBraces = (file.content.match(/\{/g) || []).length;
      const closeBraces = (file.content.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        items.push({
          severity: 'error',
          message: `Mismatched braces: ${openBraces} open, ${closeBraces} close`,
          file: file.path,
          rule: 'hcl-syntax',
        });
      }

      // Check matching quotes
      const quoteCount = (file.content.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0) {
        items.push({
          severity: 'error',
          message: 'Unmatched quotes detected',
          file: file.path,
          rule: 'hcl-syntax',
        });
      }

      // Check for valid resource/module/variable declarations
      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (
          line.startsWith('resource ') ||
          line.startsWith('module ') ||
          line.startsWith('variable ')
        ) {
          if (!line.includes('{') && !line.includes('"')) {
            items.push({
              severity: 'warning',
              message: `Potentially malformed declaration: ${line.substring(0, 60)}`,
              file: file.path,
              line: i + 1,
              rule: 'hcl-syntax',
            });
          }
        }
      }
    }

    return items;
  }

  private checkAntiPatterns(files: GeneratedFile[]): ValidationItem[] {
    const items: ValidationItem[] = [];

    for (const file of files) {
      if (!file.path.endsWith('.tf')) continue;

      const lines = file.content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Check for hardcoded AWS account IDs (12-digit numbers)
        if (/\d{12}/.test(line) && !line.trim().startsWith('#')) {
          items.push({
            severity: 'warning',
            message: 'Possible hardcoded AWS account ID',
            file: file.path,
            line: i + 1,
            rule: 'no-hardcoded-values',
          });
        }

        // Check for hardcoded secrets/passwords
        if (
          /password\s*=\s*"[^"]*[^v][^a][^r]/.test(line.toLowerCase()) &&
          !line.trim().startsWith('#')
        ) {
          items.push({
            severity: 'error',
            message: 'Possible hardcoded password',
            file: file.path,
            line: i + 1,
            rule: 'no-hardcoded-secrets',
          });
        }

        // Check for publicly accessible resources
        if (/publicly_accessible\s*=\s*true/.test(line) && !line.trim().startsWith('#')) {
          items.push({
            severity: 'warning',
            message: 'Resource is publicly accessible',
            file: file.path,
            line: i + 1,
            rule: 'no-public-access',
          });
        }
      }
    }

    return items;
  }

  private checkMissingTags(files: GeneratedFile[]): ValidationItem[] {
    const items: ValidationItem[] = [];

    for (const file of files) {
      if (
        !file.path.endsWith('.tf') ||
        file.path.includes('variables') ||
        file.path.includes('outputs') ||
        file.path.includes('versions')
      )
        continue;

      // Check if resource blocks have tags
      const hasResources = /resource\s+"/.test(file.content);
      const hasTags =
        /tags\s*=/.test(file.content) || /tags\s*\{/.test(file.content);

      if (hasResources && !hasTags) {
        items.push({
          severity: 'warning',
          message: 'Resource blocks without tags attribute',
          file: file.path,
          rule: 'require-tags',
        });
      }
    }

    return items;
  }

  // ===== Subprocess Validation (D1) =====

  /**
   * Validate generated Terraform files by writing them to a temp directory and
   * running real CLI tools: `terraform fmt`, `terraform validate`, and optionally `tflint`.
   *
   * This is a best-effort operation. If the terraform binary is not installed, the
   * individual SubprocessResult entries will contain the error in stderr and
   * success will be false. The caller (generate()) catches any top-level throw
   * so that subprocess validation never blocks project generation.
   */
  async validateWithSubprocess(files: GeneratedFile[]): Promise<SubprocessValidation> {
    const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const tmpDir = mkdtempSync(join(tmpdir(), 'nimbus-tf-validate-'));

    try {
      // Write all generated files into the temp directory
      for (const file of files) {
        const filePath = join(tmpDir, file.path);
        const dir = dirname(filePath);
        mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, file.content, 'utf-8');
      }

      // 1. terraform fmt -check -diff
      const fmtCheck = await this.runCommand('terraform', ['fmt', '-check', '-diff', tmpDir]);

      // 2. terraform init -backend=false + terraform validate
      let terraformValidate: SubprocessResult;
      const initResult = await this.runCommand('terraform', [
        `-chdir=${tmpDir}`,
        'init',
        '-backend=false',
      ]);

      if (initResult.success) {
        terraformValidate = await this.runCommand('terraform', [
          `-chdir=${tmpDir}`,
          'validate',
        ]);
      } else {
        terraformValidate = {
          success: false,
          stdout: '',
          stderr: `init failed: ${initResult.stderr}`,
        };
      }

      // 3. tflint (optional — skip gracefully if not installed)
      let tflint: SubprocessResult | null = null;
      try {
        tflint = await this.runCommand('tflint', [`--chdir=${tmpDir}`]);
      } catch {
        // tflint not installed, leave null
      }

      // 4. checkov (optional — skip gracefully if not installed)
      let checkov: SubprocessResult | null = null;
      try {
        checkov = await this.runCommand('checkov', [
          '-d', tmpDir,
          '--framework', 'terraform',
          '--quiet',
          '--compact',
        ]);
      } catch {
        // checkov not installed, leave null
      }

      return { fmtCheck, terraformValidate, tflint, checkov };
    } finally {
      // Always clean up the temp directory
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }

  /**
   * Run an external command and capture its stdout, stderr, and exit code.
   * Uses Bun.spawn for subprocess execution with a configurable timeout
   * (default 10 seconds) to prevent blocking on slow network operations
   * such as `terraform init` downloading providers.
   */
  private async runCommand(
    cmd: string,
    args: string[],
    timeoutMs: number = 3_000,
  ): Promise<SubprocessResult> {
    try {
      const proc = Bun.spawn([cmd, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      // Race the process against a timeout
      const result = await Promise.race([
        (async () => {
          const stdout = await new Response(proc.stdout).text();
          const stderr = await new Response(proc.stderr).text();
          const exitCode = await proc.exited;
          return { success: exitCode === 0, stdout, stderr };
        })(),
        new Promise<SubprocessResult>((resolve) =>
          setTimeout(() => {
            try { proc.kill(); } catch { /* already exited */ }
            resolve({
              success: false,
              stdout: '',
              stderr: `Command timed out after ${timeoutMs}ms`,
            });
          }, timeoutMs),
        ),
      ]);

      return result;
    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: (error as Error).message,
      };
    }
  }

  /**
   * Check if a command exists on PATH by running `which`.
   */
  private async commandExists(cmd: string): Promise<boolean> {
    try {
      const proc = Bun.spawn(['which', cmd], { stdout: 'pipe', stderr: 'pipe' });
      const exitCode = await proc.exited;
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  // ===== Helper Methods =====

  private getProviderBlock(config: TerraformProjectConfig): string {
    if (config.provider === 'aws') {
      return `provider "aws" {
  region = var.region

  default_tags {
    tags = var.tags
  }
}`;
    }

    if (config.provider === 'gcp') {
      return `provider "google" {
  region  = var.region
  project = var.project_name
}`;
    }

    return `provider "azurerm" {
  features {}
}`;
  }

  private getModuleBlock(
    config: TerraformProjectConfig,
    component: string,
  ): string {
    const commonVars = `  project_name = var.project_name
  environment  = var.environment
  tags         = var.tags`;

    switch (component) {
      case 'vpc':
        return `module "vpc" {
  source = "./modules/vpc"

${commonVars}
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
}`;

      case 'eks':
        return `module "eks" {
  source = "./modules/eks"

${commonVars}
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  cluster_version    = var.cluster_version
  node_instance_type = var.node_instance_type
  node_count         = var.node_count

  depends_on = [module.vpc]
}`;

      case 'rds':
        return `module "rds" {
  source = "./modules/rds"

${commonVars}
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  instance_class  = var.db_instance_class
  engine          = var.db_engine
  storage_size    = var.db_storage_size

  depends_on = [module.vpc]
}`;

      case 's3':
        return `module "s3" {
  source = "./modules/s3"

${commonVars}
  bucket_name = var.bucket_name
}`;

      case 'ecs':
        return `module "ecs" {
  source = "./modules/ecs"

${commonVars}
  vpc_id             = module.vpc.vpc_id
  public_subnet_ids  = module.vpc.public_subnet_ids
  private_subnet_ids = module.vpc.private_subnet_ids
  container_image    = var.container_image
  container_port     = var.container_port
  cpu                = var.ecs_cpu
  memory             = var.ecs_memory
  desired_count      = var.desired_count

  depends_on = [module.vpc]
}`;

      case 'kms':
        return `module "kms" {
  source = "./modules/kms"

${commonVars}
  key_alias              = var.kms_key_alias
  deletion_window_in_days = var.kms_deletion_window
}`;

      default:
        return `module "${component}" {
  source = "./modules/${component}"

${commonVars}
}`;
    }
  }

  private getModuleMainTf(
    _config: TerraformProjectConfig,
    component: string,
  ): string {
    switch (component) {
      case 'vpc':
        return `# VPC Module
# Generated by Nimbus

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name = "\${var.project_name}-\${var.environment}-vpc"
  })
}

resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "\${var.project_name}-\${var.environment}-private-\${count.index}"
    Type = "private"
  })
}

resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index + length(var.availability_zones))
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "\${var.project_name}-\${var.environment}-public-\${count.index}"
    Type = "public"
  })
}
`;

      case 'eks':
        return `# EKS Module
# Generated by Nimbus

resource "aws_eks_cluster" "main" {
  name     = "\${var.project_name}-\${var.environment}"
  role_arn = aws_iam_role.cluster.arn
  version  = var.cluster_version

  vpc_config {
    subnet_ids              = var.subnet_ids
    endpoint_private_access = true
    endpoint_public_access  = false
  }

  encryption_config {
    resources = ["secrets"]
    provider {
      key_arn = aws_kms_key.eks.arn
    }
  }

  tags = var.tags
}
`;

      case 'rds':
        return `# RDS Module
# Generated by Nimbus

resource "aws_db_instance" "main" {
  identifier     = "\${var.project_name}-\${var.environment}"
  instance_class = var.instance_class
  engine         = var.engine
  allocated_storage = var.storage_size

  storage_encrypted       = true
  backup_retention_period = 7
  publicly_accessible     = false
  multi_az               = var.environment == "prod" ? true : false

  db_subnet_group_name = aws_db_subnet_group.main.name

  tags = var.tags
}

resource "aws_db_subnet_group" "main" {
  name       = "\${var.project_name}-\${var.environment}"
  subnet_ids = var.subnet_ids

  tags = var.tags
}
`;

      case 's3':
        return `# S3 Module
# Generated by Nimbus

resource "aws_s3_bucket" "main" {
  bucket = "\${var.bucket_name}-\${var.environment}"

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "main" {
  bucket = aws_s3_bucket.main.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "main" {
  bucket = aws_s3_bucket.main.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "main" {
  bucket = aws_s3_bucket.main.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
`;

      case 'ecs':
        return `# ECS Fargate Module
# Generated by Nimbus

resource "aws_ecs_cluster" "main" {
  name = "\${var.project_name}-\${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = var.tags
}

resource "aws_ecs_task_definition" "main" {
  family                   = "\${var.project_name}-\${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = var.project_name
      image     = var.container_image
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  tags = var.tags
}

resource "aws_ecs_service" "main" {
  name            = "\${var.project_name}-\${var.environment}"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = var.project_name
    container_port   = var.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = var.tags
}

resource "aws_lb" "main" {
  name               = "\${var.project_name}-\${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  tags = var.tags
}

resource "aws_lb_target_group" "main" {
  name        = "\${var.project_name}-\${var.environment}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path     = "/health"
    port     = "traffic-port"
    protocol = "HTTP"
  }

  tags = var.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}

resource "aws_security_group" "alb" {
  name        = "\${var.project_name}-\${var.environment}-alb-sg"
  description = "ALB security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "aws_security_group" "ecs_tasks" {
  name        = "\${var.project_name}-\${var.environment}-ecs-tasks-sg"
  description = "ECS tasks security group"
  vpc_id      = var.vpc_id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

resource "aws_iam_role" "ecs_task_execution" {
  name = "\${var.project_name}-\${var.environment}-ecs-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  name = "\${var.project_name}-\${var.environment}-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/\${var.project_name}-\${var.environment}"
  retention_in_days = 30

  tags = var.tags
}

data "aws_region" "current" {}
`;

      case 'kms':
        return `# KMS Module
# Generated by Nimbus

data "aws_caller_identity" "current" {}

resource "aws_kms_key" "main" {
  description             = "KMS key for \${var.project_name} \${var.environment}"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::\${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })

  tags = var.tags
}

resource "aws_kms_alias" "main" {
  name          = "alias/\${var.key_alias}"
  target_key_id = aws_kms_key.main.key_id
}
`;

      default:
        return `# ${component} Module\n# Generated by Nimbus\n`;
    }
  }

  private getModuleVariablesTf(component: string): string {
    const common = `variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
`;

    switch (component) {
      case 'vpc':
        return `${common}
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "availability_zones" {
  type = list(string)
}
`;

      case 'eks':
        return `${common}
variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "cluster_version" {
  type    = string
  default = "1.28"
}

variable "node_instance_type" {
  type    = string
  default = "t3.medium"
}

variable "node_count" {
  type    = number
  default = 2
}
`;

      case 'rds':
        return `${common}
variable "vpc_id" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "engine" {
  type    = string
  default = "postgres"
}

variable "storage_size" {
  type    = number
  default = 20
}
`;

      case 's3':
        return `${common}
variable "bucket_name" {
  type = string
}
`;

      case 'ecs':
        return `${common}
variable "vpc_id" {
  description = "VPC ID for the ECS service"
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs for the ALB"
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the ECS tasks"
  type        = list(string)
}

variable "container_image" {
  description = "Docker image for the ECS task"
  type        = string
}

variable "container_port" {
  description = "Port exposed by the container"
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Fargate task memory in MiB"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of ECS tasks to run"
  type        = number
  default     = 2
}
`;

      case 'kms':
        return `${common}
variable "key_alias" {
  description = "Alias for the KMS key"
  type        = string
}

variable "deletion_window_in_days" {
  description = "Number of days before the key is permanently deleted"
  type        = number
  default     = 30
}
`;

      default:
        return common;
    }
  }

  private getModuleOutputsTf(component: string): string {
    switch (component) {
      case 'vpc':
        return `output "vpc_id" {
  value = aws_vpc.main.id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}
`;

      case 'eks':
        return `output "cluster_endpoint" {
  value = aws_eks_cluster.main.endpoint
}

output "cluster_name" {
  value = aws_eks_cluster.main.name
}
`;

      case 'rds':
        return `output "endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}
`;

      case 's3':
        return `output "bucket_arn" {
  value = aws_s3_bucket.main.arn
}

output "bucket_name" {
  value = aws_s3_bucket.main.id
}
`;

      case 'ecs':
        return `output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.main.name
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "task_definition_arn" {
  description = "Task definition ARN"
  value       = aws_ecs_task_definition.main.arn
}
`;

      case 'kms':
        return `output "key_id" {
  description = "KMS key ID"
  value       = aws_kms_key.main.key_id
}

output "key_arn" {
  description = "KMS key ARN"
  value       = aws_kms_key.main.arn
}

output "alias_arn" {
  description = "KMS alias ARN"
  value       = aws_kms_alias.main.arn
}
`;

      default:
        return '';
    }
  }
}
