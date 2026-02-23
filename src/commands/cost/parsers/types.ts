/**
 * Types for Terraform resource parsing
 */

export interface TerraformResource {
  /** Resource type, e.g. "aws_instance", "google_compute_instance", "azurerm_virtual_machine" */
  type: string;
  /** Resource name as declared in HCL */
  name: string;
  /** Detected cloud provider */
  provider: 'aws' | 'gcp' | 'azure' | 'unknown';
  /** Parsed attributes from the resource block */
  attributes: Record<string, any>;
}

export interface TerraformBlock {
  /** Block type: "resource", "data", "module", "variable", etc. */
  blockType: string;
  /** Block labels, e.g. ["aws_instance", "web"] */
  labels: string[];
  /** Flat key-value attributes parsed from the block */
  attributes: Record<string, any>;
  /** Nested sub-blocks */
  blocks: TerraformBlock[];
}
