/**
 * Type definitions for Azure Terraform Generation
 */

import type { DiscoveredResource, InfrastructureInventory } from '../discovery/types';

/**
 * Configuration for Azure Terraform generation
 */
export interface TerraformGeneratorConfig {
  /** Output directory for generated files */
  outputDir: string;
  /** Whether to generate import blocks (Terraform 1.5+) */
  generateImportBlocks?: boolean;
  /** Whether to generate import shell script */
  generateImportScript?: boolean;
  /** Whether to organize files by service (compute.tf, storage.tf) or single main.tf */
  organizeByService?: boolean;
  /** Terraform version constraint */
  terraformVersion?: string;
  /** AzureRM provider version constraint */
  azurermProviderVersion?: string;
  /** Default Azure region */
  defaultRegion?: string;
  /** Default Azure subscription ID */
  defaultSubscriptionId?: string;
  /** Backend configuration */
  backend?: TerraformBackendConfig;
}

/**
 * Backend configuration for Terraform state
 */
export interface TerraformBackendConfig {
  type: 'azurerm' | 'local' | 'remote' | 's3' | 'gcs';
  config: Record<string, unknown>;
}

/**
 * Represents a Terraform resource block
 */
export interface TerraformResource {
  /** Resource type (e.g., 'azurerm_virtual_machine') */
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
  /** Original Azure resource for reference */
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
  | TerraformExpression
  | { [key: string]: TerraformValue };

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
  /** Resource address (e.g., 'azurerm_virtual_machine.my_vm') */
  to: string;
  /** Azure resource ID to import */
  id: string;
  /** Provider alias if using multiple providers */
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
 * Generated Terraform files
 */
export interface GeneratedFiles {
  /** Map of filename to content */
  files: Map<string, string>;
  /** List of resources that could not be mapped */
  unmappedResources: DiscoveredResource[];
  /** Variables that need to be provided */
  variables: TerraformVariable[];
  /** Suggested outputs */
  outputs: TerraformOutput[];
  /** Import blocks for Terraform 1.5+ */
  imports: TerraformImport[];
  /** Import script for older Terraform versions */
  importScript: string;
  /** Summary statistics */
  summary: GenerationSummary;
}

/**
 * Summary of the generation process
 */
export interface GenerationSummary {
  totalResources: number;
  mappedResources: number;
  unmappedResources: number;
  resourcesByService: Record<string, number>;
  variablesGenerated: number;
  outputsGenerated: number;
}

/**
 * Fields that should be excluded from Terraform output (read-only or computed)
 */
export const EXCLUDED_FIELDS = [
  'id',
  'resourceId',
  'provisioningState',
  'etag',
  'creationTime',
  'lastModifiedTime',
  'status',
  'state',
];

/**
 * Check if a field should be excluded from Terraform
 */
export function isExcludedField(fieldName: string): boolean {
  return EXCLUDED_FIELDS.includes(fieldName);
}

/**
 * Convert a string to a valid Terraform identifier
 */
export function toTerraformIdentifier(input: string): string {
  let result = input.replace(/[^a-zA-Z0-9_]/g, '_');

  if (/^[0-9]/.test(result)) {
    result = '_' + result;
  }

  result = result.replace(/_+/g, '_');
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
