/**
 * Requirement to Template Variable Mapper
 *
 * Maps InfrastructureStack from conversation to template variables
 */

import type { InfrastructureRequirements } from './types';

/**
 * Template variables for all components
 */
export interface TemplateVariables {
  // Common
  project_name: string;
  environment: string;
  region: string;
  tags: Record<string, string>;

  // VPC
  vpc_cidr: string;
  enable_dns_hostnames: boolean;
  enable_dns_support: boolean;
  create_nat_gateway: boolean;
  nat_gateway_count: number;
  public_subnet_count: number;
  private_subnet_count: number;
  single_nat_gateway: boolean;
  enable_flow_logs: boolean;
  flow_logs_retention_days: number;

  // EKS
  cluster_version: string;
  node_instance_types: string[];
  node_min_size: number;
  node_max_size: number;
  node_desired_size: number;

  // RDS
  engine: string;
  engine_version: string;
  instance_class: string;
  allocated_storage: number;
  multi_az: boolean;

  // S3
  bucket_name: string;
  versioning_enabled: boolean;
  encryption_enabled: boolean;
}

/**
 * Infrastructure stack from conversation
 */
export interface InfrastructureStack {
  provider?: string;
  components?: string[];
  environment?: string;
  region?: string;
  name?: string;
  requirements?: Partial<InfrastructureRequirements>;
}

/**
 * Default template values based on environment
 */
function getEnvironmentDefaults(env: string): Partial<TemplateVariables> {
  const isProduction = env === 'production';
  const isStaging = env === 'staging';

  return {
    // VPC
    create_nat_gateway: isProduction || isStaging,
    nat_gateway_count: isProduction ? 3 : 1,
    single_nat_gateway: !isProduction,
    enable_flow_logs: isProduction,
    flow_logs_retention_days: isProduction ? 90 : 30,

    // EKS
    node_max_size: isProduction ? 10 : 3,
    node_desired_size: isProduction ? 3 : 1,

    // RDS
    instance_class: isProduction ? 'db.r6g.large' : 'db.t3.micro',
    multi_az: isProduction,
  };
}

/**
 * Extract component-specific variables from requirements
 */
function extractComponentVariables(
  requirements: Partial<InfrastructureRequirements>
): Partial<TemplateVariables> {
  const vars: Partial<TemplateVariables> = {};

  // VPC config
  if (requirements.vpc_config) {
    if (requirements.vpc_config.cidr) {
      vars.vpc_cidr = requirements.vpc_config.cidr;
    }
    if (requirements.vpc_config.subnet_count) {
      vars.public_subnet_count = requirements.vpc_config.subnet_count;
      vars.private_subnet_count = requirements.vpc_config.subnet_count;
    }
  }

  // EKS config
  if (requirements.eks_config) {
    if (requirements.eks_config.version) {
      vars.cluster_version = requirements.eks_config.version;
    }
    if (requirements.eks_config.node_count) {
      vars.node_desired_size = requirements.eks_config.node_count;
      vars.node_min_size = 1;
      vars.node_max_size = Math.max(requirements.eks_config.node_count * 2, 3);
    }
    if (requirements.eks_config.instance_type) {
      vars.node_instance_types = [requirements.eks_config.instance_type];
    }
  }

  // RDS config
  if (requirements.rds_config) {
    if (requirements.rds_config.engine) {
      vars.engine = requirements.rds_config.engine;
    }
    if (requirements.rds_config.instance_class) {
      vars.instance_class = requirements.rds_config.instance_class;
    }
    if (requirements.rds_config.storage) {
      vars.allocated_storage = requirements.rds_config.storage;
    }
  }

  // S3 config
  if (requirements.s3_config) {
    if (requirements.s3_config.versioning !== undefined) {
      vars.versioning_enabled = requirements.s3_config.versioning;
    }
    if (requirements.s3_config.encryption !== undefined) {
      vars.encryption_enabled = requirements.s3_config.encryption;
    }
  }

  return vars;
}

/**
 * Map infrastructure stack from conversation to template variables
 */
export function mapStackToVariables(
  stack: InfrastructureStack,
  defaults: Partial<TemplateVariables> = {}
): TemplateVariables {
  const projectName = stack.name || 'nimbus-project';
  const env = stack.environment || 'development';
  const region = stack.region || 'us-east-1';

  // Get environment-specific defaults
  const envDefaults = getEnvironmentDefaults(env);

  // Extract component-specific variables from requirements
  const componentVars = stack.requirements
    ? extractComponentVariables(stack.requirements)
    : {};

  // Build base template variables with defaults
  const baseVars: TemplateVariables = {
    // Common
    project_name: projectName,
    environment: env,
    region: region,
    tags: {
      Project: projectName,
      Environment: env,
      ManagedBy: 'Nimbus',
      ...(stack.requirements?.tags || {}),
    },

    // VPC defaults
    vpc_cidr: '10.0.0.0/16',
    enable_dns_hostnames: true,
    enable_dns_support: true,
    create_nat_gateway: false,
    nat_gateway_count: 1,
    public_subnet_count: 3,
    private_subnet_count: 3,
    single_nat_gateway: true,
    enable_flow_logs: false,
    flow_logs_retention_days: 30,

    // EKS defaults
    cluster_version: '1.28',
    node_instance_types: ['t3.medium'],
    node_min_size: 1,
    node_max_size: 3,
    node_desired_size: 1,

    // RDS defaults
    engine: 'postgres',
    engine_version: '15.4',
    instance_class: 'db.t3.micro',
    allocated_storage: 20,
    multi_az: false,

    // S3 defaults
    bucket_name: `${projectName}-${env}-bucket`,
    versioning_enabled: true,
    encryption_enabled: true,
  };

  // Merge in order: base -> env defaults -> component vars -> user defaults
  return {
    ...baseVars,
    ...envDefaults,
    ...componentVars,
    ...defaults,
  };
}

/**
 * Get template ID for a component
 */
export function getTemplateId(
  type: string,
  provider: string,
  component: string
): string {
  return `${type}/${provider}/${component}`;
}

/**
 * Get the list of template IDs needed for a stack
 */
export function getRequiredTemplates(
  stack: InfrastructureStack,
  type: string = 'terraform'
): string[] {
  const provider = stack.provider || 'aws';
  const components = stack.components || [];

  return components.map((component) =>
    getTemplateId(type, provider, component)
  );
}

/**
 * Validate that all required templates exist
 */
export function validateTemplateRequirements(
  stack: InfrastructureStack,
  availableTemplates: string[]
): { valid: boolean; missing: string[] } {
  const required = getRequiredTemplates(stack);
  const missing = required.filter((t) => !availableTemplates.includes(t));

  return {
    valid: missing.length === 0,
    missing,
  };
}
