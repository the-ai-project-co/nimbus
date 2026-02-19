/**
 * Type definitions for GCP Terraform Generation
 */

import type { DiscoveredResource } from '../discovery/types';

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
  /** Whether to organize files by service (compute.tf, storage.tf) or single main.tf */
  organizeByService?: boolean;
  /** Terraform version constraint */
  terraformVersion?: string;
  /** Google provider version constraint */
  googleProviderVersion?: string;
  /** Default GCP project */
  defaultProject?: string;
  /** Default GCP region */
  defaultRegion?: string;
}

/**
 * Represents a Terraform resource block
 */
export interface TerraformResource {
  /** Resource type (e.g., 'google_compute_instance') */
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
  /** Original GCP resource for reference */
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
  | TerraformReference
  | { [key: string]: TerraformValue };

/**
 * Reference to another Terraform resource or data source
 */
export interface TerraformReference {
  _type: 'reference';
  value: string;
}

/**
 * Terraform lifecycle block
 */
export interface TerraformLifecycle {
  createBeforeDestroy?: boolean;
  preventDestroy?: boolean;
  ignoreChanges?: string[] | 'all';
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
}

/**
 * Terraform output definition
 */
export interface TerraformOutput {
  name: string;
  value: string;
  description?: string;
  sensitive?: boolean;
}

/**
 * Terraform import block (Terraform 1.5+)
 */
export interface TerraformImport {
  /** Resource address (e.g., 'google_compute_instance.my_instance') */
  to: string;
  /** GCP resource ID to import */
  id: string;
  /** Provider alias if using multiple providers */
  provider?: string;
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
 * Mapping from Terraform google_ types to GCP service category
 */
export const TERRAFORM_TYPE_TO_SERVICE: Record<string, string> = {
  google_compute_instance: 'compute',
  google_compute_disk: 'compute',
  google_compute_firewall: 'compute',
  google_compute_address: 'compute',
  google_compute_network: 'vpc',
  google_compute_subnetwork: 'vpc',
  google_compute_router: 'vpc',
  google_compute_route: 'vpc',
  google_storage_bucket: 'storage',
  google_container_cluster: 'gke',
  google_container_node_pool: 'gke',
  google_service_account: 'iam',
  google_project_iam_custom_role: 'iam',
  google_cloudfunctions2_function: 'functions',
};

/**
 * Get the service category for a Terraform resource type
 */
export function getServiceForTerraformType(terraformType: string): string {
  return TERRAFORM_TYPE_TO_SERVICE[terraformType] || 'misc';
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
