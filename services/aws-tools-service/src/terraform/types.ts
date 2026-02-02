/**
 * Type definitions for Terraform Generation
 */

import type { DiscoveredResource, InfrastructureInventory } from '../discovery/types';

/**
 * Configuration for Terraform generation
 */
export interface TerraformGeneratorConfig {
  /** Output directory for generated files */
  outputDir: string;
  /** Whether to generate import blocks (Terraform 1.5+) */
  generateImportBlocks?: boolean;
  /** Whether to generate import shell script */
  generateImportScript?: boolean;
  /** Whether to organize files by service (ec2.tf, s3.tf) or single main.tf */
  organizeByService?: boolean;
  /** Whether to include comments in generated code */
  includeComments?: boolean;
  /** Terraform version constraint */
  terraformVersion?: string;
  /** AWS provider version constraint */
  awsProviderVersion?: string;
  /** Default AWS region */
  defaultRegion?: string;
  /** Backend configuration */
  backend?: TerraformBackendConfig;
  /** Variable prefix for sensitive values */
  sensitiveVarPrefix?: string;
  /** Whether to generate data sources for existing resources */
  generateDataSources?: boolean;
}

/**
 * Backend configuration for Terraform state
 */
export interface TerraformBackendConfig {
  type: 's3' | 'local' | 'remote' | 'gcs' | 'azurerm';
  config: Record<string, unknown>;
}

/**
 * Represents a Terraform resource block
 */
export interface TerraformResource {
  /** Resource type (e.g., 'aws_instance') */
  type: string;
  /** Resource name/identifier in Terraform */
  name: string;
  /** Resource attributes */
  attributes: Record<string, TerraformValue>;
  /** Dependencies on other resources */
  dependsOn?: string[];
  /** Lifecycle configuration */
  lifecycle?: TerraformLifecycle;
  /** Provider alias if using multiple providers */
  provider?: string;
  /** Count or for_each if applicable */
  count?: number;
  forEach?: string;
  /** Original AWS resource for reference */
  sourceResource?: DiscoveredResource;
}

/**
 * Terraform value types
 */
export type TerraformValue =
  | string
  | number
  | boolean
  | null
  | TerraformValue[]
  | TerraformBlock
  | TerraformReference
  | TerraformExpression;

/**
 * Terraform block (nested configuration)
 */
export interface TerraformBlock {
  _type: 'block';
  _blockType?: string;
  attributes: Record<string, TerraformValue>;
}

/**
 * Reference to another Terraform resource or data source
 */
export interface TerraformReference {
  _type: 'reference';
  value: string;
}

/**
 * Terraform expression (e.g., function calls, interpolation)
 */
export interface TerraformExpression {
  _type: 'expression';
  value: string;
}

/**
 * Terraform lifecycle block
 */
export interface TerraformLifecycle {
  createBeforeDestroy?: boolean;
  preventDestroy?: boolean;
  ignoreChanges?: string[] | 'all';
  replaceTriggeredBy?: string[];
}

/**
 * Terraform variable definition
 */
export interface TerraformVariable {
  name: string;
  type?: string;
  description?: string;
  default?: TerraformValue;
  sensitive?: boolean;
  nullable?: boolean;
  validation?: TerraformValidation[];
}

/**
 * Terraform variable validation
 */
export interface TerraformValidation {
  condition: string;
  errorMessage: string;
}

/**
 * Terraform output definition
 */
export interface TerraformOutput {
  name: string;
  value: string;
  description?: string;
  sensitive?: boolean;
  dependsOn?: string[];
}

/**
 * Terraform import block (Terraform 1.5+)
 */
export interface TerraformImport {
  /** Resource address (e.g., 'aws_instance.my_instance') */
  to: string;
  /** AWS resource ID to import */
  id: string;
  /** Provider alias if using multiple providers */
  provider?: string;
}

/**
 * Terraform data source
 */
export interface TerraformDataSource {
  type: string;
  name: string;
  attributes: Record<string, TerraformValue>;
  provider?: string;
}

/**
 * Terraform provider configuration
 */
export interface TerraformProvider {
  name: string;
  alias?: string;
  version?: string;
  attributes: Record<string, TerraformValue>;
}

/**
 * Terraform locals block
 */
export interface TerraformLocals {
  [key: string]: TerraformValue;
}

/**
 * Complete Terraform configuration for a file
 */
export interface TerraformFileContent {
  fileName: string;
  terraform?: TerraformBlock;
  providers?: TerraformProvider[];
  variables?: TerraformVariable[];
  locals?: TerraformLocals;
  dataSources?: TerraformDataSource[];
  resources?: TerraformResource[];
  outputs?: TerraformOutput[];
  imports?: TerraformImport[];
}

/**
 * Result of Terraform generation
 */
export interface TerraformGenerationResult {
  /** Generated files */
  files: TerraformFileContent[];
  /** Import script content */
  importScript?: string;
  /** Summary of what was generated */
  summary: TerraformGenerationSummary;
  /** Any warnings during generation */
  warnings: string[];
  /** Resources that couldn't be mapped */
  unmappedResources: DiscoveredResource[];
}

/**
 * Summary of Terraform generation
 */
export interface TerraformGenerationSummary {
  totalResources: number;
  mappedResources: number;
  unmappedResources: number;
  filesGenerated: number;
  variablesCreated: number;
  outputsCreated: number;
  importsGenerated: number;
  serviceBreakdown: Record<string, number>;
}

/**
 * Resource mapper interface
 */
export interface ResourceMapper {
  /** AWS resource type this mapper handles */
  awsType: string;
  /** Terraform resource type */
  terraformType: string;
  /** Map an AWS resource to Terraform configuration */
  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null;
  /** Get import ID for a resource */
  getImportId(resource: DiscoveredResource): string;
  /** Get suggested outputs for this resource type */
  getSuggestedOutputs?(resource: DiscoveredResource): TerraformOutput[];
}

/**
 * Context for resource mapping
 */
export interface MappingContext {
  /** All discovered resources (for relationship resolution) */
  inventory: InfrastructureInventory;
  /** Map of ARN to Terraform resource name */
  arnToResourceName: Map<string, string>;
  /** Variables that have been created */
  variables: Map<string, TerraformVariable>;
  /** Configuration options */
  config: TerraformGeneratorConfig;
  /** Add a variable */
  addVariable(variable: TerraformVariable): string;
  /** Get reference to another resource */
  getResourceReference(arn: string): TerraformReference | null;
  /** Mark a value as sensitive (creates a variable) */
  markSensitive(name: string, value: unknown, description?: string): TerraformReference;
}

/**
 * Sensitive field patterns
 */
export const SENSITIVE_PATTERNS = [
  /password/i,
  /secret/i,
  /key/i,
  /token/i,
  /credential/i,
  /api_key/i,
  /private/i,
  /auth/i,
];

/**
 * Fields that should be excluded from Terraform (read-only or computed)
 */
export const EXCLUDED_FIELDS = [
  'arn',
  'id',
  'owner_id',
  'create_time',
  'creation_date',
  'last_modified',
  'status',
  'state',
];

/**
 * Check if a field name is sensitive
 */
export function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(fieldName));
}

/**
 * Check if a field should be excluded from Terraform
 */
export function isExcludedField(fieldName: string): boolean {
  return EXCLUDED_FIELDS.includes(fieldName.toLowerCase());
}

/**
 * Convert a string to a valid Terraform identifier
 */
export function toTerraformIdentifier(input: string): string {
  // Replace non-alphanumeric characters with underscores
  let result = input.replace(/[^a-zA-Z0-9_]/g, '_');

  // Ensure it starts with a letter or underscore
  if (/^[0-9]/.test(result)) {
    result = '_' + result;
  }

  // Remove consecutive underscores
  result = result.replace(/_+/g, '_');

  // Remove trailing underscores
  result = result.replace(/_+$/, '');

  return result.toLowerCase();
}

/**
 * Convert camelCase to snake_case
 */
export function toSnakeCase(input: string): string {
  return input
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/_+/g, '_');
}
