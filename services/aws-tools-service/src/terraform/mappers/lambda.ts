/**
 * Lambda Resource Mappers
 *
 * Maps Lambda resources to Terraform configuration
 */

import type { DiscoveredResource } from '../../discovery/types';
import type {
  MappingContext,
  TerraformResource,
  TerraformOutput,
  TerraformValue,
} from '../types';
import { BaseResourceMapper } from './base';

/**
 * Lambda Function Mapper
 */
export class LambdaFunctionMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::Lambda::Function';
  readonly terraformType = 'aws_lambda_function';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Function name
    if (props.functionName) {
      attributes.function_name = props.functionName as string;
    }

    // Runtime
    if (props.runtime) {
      attributes.runtime = props.runtime as string;
    }

    // Handler
    if (props.handler) {
      attributes.handler = props.handler as string;
    }

    // Role
    if (props.role) {
      attributes.role = props.role as string;
    }

    // Memory and timeout
    if (props.memorySize) {
      attributes.memory_size = props.memorySize as number;
    }

    if (props.timeout) {
      attributes.timeout = props.timeout as number;
    }

    // Description
    if (props.description) {
      attributes.description = props.description as string;
    }

    // Code location - create placeholder for deployment
    // The actual code needs to be managed separately
    const codeVar = context.addVariable({
      name: `lambda_${name}_filename`,
      type: 'string',
      description: `Path to deployment package for Lambda function ${name}`,
      default: 'placeholder.zip',
    });
    attributes.filename = this.createReference(`var.${codeVar}`);

    // Package type
    if (props.packageType) {
      attributes.package_type = props.packageType as string;
    }

    // Architectures
    if (props.architectures && Array.isArray(props.architectures)) {
      attributes.architectures = props.architectures as string[];
    }

    // Environment variables
    if (props.environment && typeof props.environment === 'object') {
      const env = props.environment as { variables?: Record<string, string> };
      if (env.variables && Object.keys(env.variables).length > 0) {
        attributes.environment = this.createBlock({
          variables: env.variables,
        });
      }
    }

    // VPC config
    if (props.vpcConfig && typeof props.vpcConfig === 'object') {
      const vpc = props.vpcConfig as {
        subnetIds?: string[];
        securityGroupIds?: string[];
      };
      if ((vpc.subnetIds && vpc.subnetIds.length > 0) ||
          (vpc.securityGroupIds && vpc.securityGroupIds.length > 0)) {
        const vpcAttrs: Record<string, TerraformValue> = {};
        if (vpc.subnetIds) {
          vpcAttrs.subnet_ids = vpc.subnetIds;
        }
        if (vpc.securityGroupIds) {
          vpcAttrs.security_group_ids = vpc.securityGroupIds;
        }
        attributes.vpc_config = this.createBlock(vpcAttrs);
      }
    }

    // Dead letter config
    if (props.deadLetterConfig && typeof props.deadLetterConfig === 'object') {
      const dlc = props.deadLetterConfig as { targetArn?: string };
      if (dlc.targetArn) {
        attributes.dead_letter_config = this.createBlock({
          target_arn: dlc.targetArn,
        });
      }
    }

    // Tracing config
    if (props.tracingConfig && typeof props.tracingConfig === 'object') {
      const tracing = props.tracingConfig as { mode?: string };
      if (tracing.mode) {
        attributes.tracing_config = this.createBlock({
          mode: tracing.mode,
        });
      }
    }

    // Layers
    if (props.layers && Array.isArray(props.layers)) {
      attributes.layers = props.layers as string[];
    }

    // Reserved concurrency
    if (props.reservedConcurrentExecutions !== undefined) {
      attributes.reserved_concurrent_executions = props.reservedConcurrentExecutions as number;
    }

    // Ephemeral storage
    if (props.ephemeralStorage && typeof props.ephemeralStorage === 'object') {
      const storage = props.ephemeralStorage as { size?: number };
      if (storage.size) {
        attributes.ephemeral_storage = this.createBlock({
          size: storage.size,
        });
      }
    }

    // Tags
    const tags = this.mapTags(resource.tags);
    if (Object.keys(tags).length > 0) {
      attributes.tags = tags;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
      lifecycle: {
        ignoreChanges: ['filename', 'source_code_hash'],
      },
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return (resource.properties.functionName as string) || resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_arn`,
        value: `aws_lambda_function.${name}.arn`,
        description: `ARN of Lambda function ${resource.properties.functionName || resource.id}`,
      },
      {
        name: `${name}_invoke_arn`,
        value: `aws_lambda_function.${name}.invoke_arn`,
        description: `Invoke ARN of Lambda function ${resource.properties.functionName || resource.id}`,
      },
    ];
  }
}

/**
 * Lambda Layer Mapper
 */
export class LambdaLayerMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::Lambda::LayerVersion';
  readonly terraformType = 'aws_lambda_layer_version';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Layer name
    if (props.layerName) {
      attributes.layer_name = props.layerName as string;
    }

    // Description
    if (props.description) {
      attributes.description = props.description as string;
    }

    // Compatible runtimes
    if (props.compatibleRuntimes && Array.isArray(props.compatibleRuntimes)) {
      attributes.compatible_runtimes = props.compatibleRuntimes as string[];
    }

    // Compatible architectures
    if (props.compatibleArchitectures && Array.isArray(props.compatibleArchitectures)) {
      attributes.compatible_architectures = props.compatibleArchitectures as string[];
    }

    // License
    if (props.licenseInfo) {
      attributes.license_info = props.licenseInfo as string;
    }

    // Code - create placeholder
    const codeVar = context.addVariable({
      name: `layer_${name}_filename`,
      type: 'string',
      description: `Path to deployment package for Lambda layer ${name}`,
      default: 'layer_placeholder.zip',
    });
    attributes.filename = this.createReference(`var.${codeVar}`);

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
      lifecycle: {
        ignoreChanges: ['filename', 'source_code_hash'],
      },
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.arn || resource.id;
  }
}

/**
 * Lambda Event Source Mapping Mapper
 */
export class LambdaEventSourceMappingMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::Lambda::EventSourceMapping';
  readonly terraformType = 'aws_lambda_event_source_mapping';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Event source ARN
    if (props.eventSourceArn) {
      attributes.event_source_arn = props.eventSourceArn as string;
    }

    // Function name/ARN
    if (props.functionArn) {
      attributes.function_name = props.functionArn as string;
    }

    // Enabled
    if (props.state) {
      attributes.enabled = (props.state as string) === 'Enabled';
    }

    // Batch size
    if (props.batchSize) {
      attributes.batch_size = props.batchSize as number;
    }

    // Maximum batching window
    if (props.maximumBatchingWindowInSeconds) {
      attributes.maximum_batching_window_in_seconds = props.maximumBatchingWindowInSeconds as number;
    }

    // Starting position
    if (props.startingPosition) {
      attributes.starting_position = props.startingPosition as string;
    }

    // Parallelization factor
    if (props.parallelizationFactor) {
      attributes.parallelization_factor = props.parallelizationFactor as number;
    }

    // Maximum record age
    if (props.maximumRecordAgeInSeconds) {
      attributes.maximum_record_age_in_seconds = props.maximumRecordAgeInSeconds as number;
    }

    // Maximum retry attempts
    if (props.maximumRetryAttempts !== undefined) {
      attributes.maximum_retry_attempts = props.maximumRetryAttempts as number;
    }

    // Bisect batch on error
    if (props.bisectBatchOnFunctionError !== undefined) {
      attributes.bisect_batch_on_function_error = props.bisectBatchOnFunctionError as boolean;
    }

    // Destination config
    if (props.destinationConfig && typeof props.destinationConfig === 'object') {
      const destConfig = props.destinationConfig as {
        onFailure?: { destination?: string };
      };
      if (destConfig.onFailure?.destination) {
        attributes.destination_config = this.createBlock({
          on_failure: this.createBlock({
            destination_arn: destConfig.onFailure.destination,
          }),
        });
      }
    }

    // Filter criteria
    if (props.filterCriteria && typeof props.filterCriteria === 'object') {
      const filters = props.filterCriteria as { filters?: Array<{ pattern?: string }> };
      if (filters.filters && filters.filters.length > 0) {
        const filterBlocks = filters.filters
          .filter(f => f.pattern)
          .map(f => this.createBlock({ pattern: f.pattern as string }));
        if (filterBlocks.length > 0) {
          attributes.filter_criteria = this.createBlock({
            filter: filterBlocks,
          });
        }
      }
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * Lambda Permission Mapper
 */
export class LambdaPermissionMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::Lambda::Permission';
  readonly terraformType = 'aws_lambda_permission';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Statement ID
    if (props.statementId) {
      attributes.statement_id = props.statementId as string;
    }

    // Action
    if (props.action) {
      attributes.action = props.action as string;
    }

    // Function name
    if (props.functionName) {
      attributes.function_name = props.functionName as string;
    }

    // Principal
    if (props.principal) {
      attributes.principal = props.principal as string;
    }

    // Source ARN
    if (props.sourceArn) {
      attributes.source_arn = props.sourceArn as string;
    }

    // Source account
    if (props.sourceAccount) {
      attributes.source_account = props.sourceAccount as string;
    }

    // Qualifier (alias or version)
    if (props.qualifier) {
      attributes.qualifier = props.qualifier as string;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    const funcName = resource.properties.functionName as string;
    const statementId = resource.properties.statementId as string;
    return `${funcName}/${statementId}`;
  }
}

/**
 * Get all Lambda mappers
 */
export function getLambdaMappers(): BaseResourceMapper[] {
  return [
    new LambdaFunctionMapper(),
    new LambdaLayerMapper(),
    new LambdaEventSourceMappingMapper(),
    new LambdaPermissionMapper(),
  ];
}
