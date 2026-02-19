/**
 * GCP Terraform Generation Module
 *
 * Provides functionality to generate Terraform configurations
 * from discovered GCP resources
 */

// Export types
export * from './types';

// Export generator
export {
  GCPTerraformGenerator,
  createGCPTerraformGenerator,
} from './generator';
