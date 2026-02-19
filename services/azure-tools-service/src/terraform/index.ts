/**
 * Azure Terraform Generation Module
 *
 * Provides functionality to generate Terraform configurations
 * from discovered Azure resources
 */

// Export types
export * from './types';

// Export generator
export {
  AzureTerraformGenerator,
  createAzureTerraformGenerator,
} from './generator';
