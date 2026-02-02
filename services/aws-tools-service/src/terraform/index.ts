/**
 * Terraform Generation Module
 *
 * Provides functionality to generate Terraform configurations
 * from discovered AWS resources
 */

// Export types
export * from './types';

// Export formatter
export { HCLFormatter } from './formatter';

// Export mappers
export {
  BaseResourceMapper,
  MapperRegistry,
  createMapperRegistry,
  getAllMappers,
  getServiceForTerraformType,
  getTerraformTypeForAwsType,
  getSupportedAwsTypes,
  isAwsTypeSupported,
  TERRAFORM_TYPE_TO_SERVICE,
  AWS_TYPE_TO_TERRAFORM_TYPE,
} from './mappers';

// Export generator
export {
  TerraformGenerator,
  createTerraformGenerator,
  type GeneratedFiles,
  type GenerationSummary,
} from './generator';
