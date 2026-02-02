/**
 * Lambda Scanner
 *
 * Discovers Lambda functions, layers, and event source mappings
 */

import {
  LambdaClient,
  ListFunctionsCommand,
  GetFunctionCommand,
  ListLayersCommand,
  ListEventSourceMappingsCommand,
  ListTagsCommand,
  type FunctionConfiguration,
  type LayersListItem,
  type EventSourceMappingConfiguration,
} from '@aws-sdk/client-lambda';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

/**
 * Lambda Scanner - discovers Lambda functions, layers, and event source mappings
 */
export class LambdaScanner extends BaseScanner {
  readonly serviceName = 'Lambda';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new LambdaClient({
      region: context.region,
      credentials: context.credentials,
    });

    // Scan all Lambda resource types in parallel
    const [functions, layers, eventSourceMappings] = await Promise.all([
      this.scanFunctions(client, context),
      this.scanLayers(client, context),
      this.scanEventSourceMappings(client, context),
    ]);

    resources.push(...functions, ...layers, ...eventSourceMappings);

    logger.debug(`Lambda scanner found ${resources.length} resources`, {
      region: context.region,
      functions: functions.length,
      layers: layers.length,
      eventSourceMappings: eventSourceMappings.length,
    });

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'AWS::Lambda::Function',
      'AWS::Lambda::LayerVersion',
      'AWS::Lambda::EventSourceMapping',
    ];
  }

  /**
   * Scan Lambda functions
   */
  private async scanFunctions(
    client: LambdaClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new ListFunctionsCommand({
          Marker: marker,
          MaxItems: 50,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Functions) {
          // Get detailed info and tags for each function
          const functionPromises = response.Functions.map(fn =>
            this.processFunction(fn, client, context)
          );

          const results = await Promise.allSettled(functionPromises);

          for (const result of results) {
            if (result.status === 'fulfilled' && result.value) {
              resources.push(result.value);
            }
          }
        }

        marker = response.NextMarker;
      } while (marker);
    } catch (error: any) {
      this.recordError('ListFunctions', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Process a single Lambda function
   */
  private async processFunction(
    fn: FunctionConfiguration,
    client: LambdaClient,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    if (!fn.FunctionName || !fn.FunctionArn) return null;

    const relationships: ResourceRelationship[] = [];

    // Get additional function details
    let functionDetails: FunctionConfiguration | undefined;
    try {
      const getCommand = new GetFunctionCommand({ FunctionName: fn.FunctionName });
      const detailResponse = await this.withRateLimit(context, () => client.send(getCommand));
      functionDetails = detailResponse.Configuration;
    } catch {
      // Use basic info if detailed fetch fails
      functionDetails = fn;
    }

    // Get tags
    let tags: Record<string, string> = {};
    try {
      const tagsCommand = new ListTagsCommand({ Resource: fn.FunctionArn });
      const tagsResponse = await this.withRateLimit(context, () => client.send(tagsCommand));
      tags = tagsResponse.Tags || {};
    } catch {
      // Continue without tags
    }

    const config = functionDetails || fn;

    // Add IAM role relationship
    if (config.Role) {
      relationships.push({
        type: 'references',
        targetArn: config.Role,
        targetType: 'aws_iam_role',
      });
    }

    // Add VPC relationships
    if (config.VpcConfig?.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'vpc',
          resource: config.VpcConfig.VpcId,
        }),
        targetType: 'aws_vpc',
      });

      // Add subnet relationships
      if (config.VpcConfig.SubnetIds) {
        for (const subnetId of config.VpcConfig.SubnetIds) {
          relationships.push({
            type: 'contains',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'subnet',
              resource: subnetId,
            }),
            targetType: 'aws_subnet',
          });
        }
      }

      // Add security group relationships
      if (config.VpcConfig.SecurityGroupIds) {
        for (const sgId of config.VpcConfig.SecurityGroupIds) {
          relationships.push({
            type: 'references',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'security-group',
              resource: sgId,
            }),
            targetType: 'aws_security_group',
          });
        }
      }
    }

    // Add layer relationships
    if (config.Layers) {
      for (const layer of config.Layers) {
        if (layer.Arn) {
          relationships.push({
            type: 'references',
            targetArn: layer.Arn,
            targetType: 'aws_lambda_layer_version',
          });
        }
      }
    }

    // Add KMS key relationship
    if (config.KMSKeyArn) {
      relationships.push({
        type: 'references',
        targetArn: config.KMSKeyArn,
        targetType: 'aws_kms_key',
      });
    }

    // Add dead letter queue relationship
    if (config.DeadLetterConfig?.TargetArn) {
      const targetArn = config.DeadLetterConfig.TargetArn;
      const targetType = targetArn.includes(':sqs:') ? 'aws_sqs_queue' : 'aws_sns_topic';
      relationships.push({
        type: 'references',
        targetArn,
        targetType,
      });
    }

    return this.createResource({
      id: fn.FunctionName,
      arn: fn.FunctionArn,
      awsType: 'AWS::Lambda::Function',
      region: context.region,
      name: fn.FunctionName,
      tags,
      properties: {
        runtime: config.Runtime,
        handler: config.Handler,
        role: config.Role,
        codeSize: config.CodeSize,
        description: config.Description,
        timeout: config.Timeout,
        memorySize: config.MemorySize,
        lastModified: config.LastModified,
        codeSha256: config.CodeSha256,
        version: config.Version,
        environment: config.Environment?.Variables,
        tracingConfig: config.TracingConfig?.Mode,
        vpcConfig: config.VpcConfig
          ? {
              vpcId: config.VpcConfig.VpcId,
              subnetIds: config.VpcConfig.SubnetIds,
              securityGroupIds: config.VpcConfig.SecurityGroupIds,
            }
          : undefined,
        deadLetterConfig: config.DeadLetterConfig?.TargetArn,
        kmsKeyArn: config.KMSKeyArn,
        layers: config.Layers?.map(l => ({
          arn: l.Arn,
          codeSize: l.CodeSize,
        })),
        ephemeralStorage: config.EphemeralStorage?.Size,
        architectures: config.Architectures,
        packageType: config.PackageType,
        imageUri: config.ImageConfigResponse?.ImageConfig?.Command,
        snapStart: config.SnapStart
          ? {
              applyOn: config.SnapStart.ApplyOn,
              optimizationStatus: config.SnapStart.OptimizationStatus,
            }
          : undefined,
        loggingConfig: config.LoggingConfig
          ? {
              logFormat: config.LoggingConfig.LogFormat,
              applicationLogLevel: config.LoggingConfig.ApplicationLogLevel,
              systemLogLevel: config.LoggingConfig.SystemLogLevel,
              logGroup: config.LoggingConfig.LogGroup,
            }
          : undefined,
      },
      relationships,
      status: config.State,
    });
  }

  /**
   * Scan Lambda layers
   */
  private async scanLayers(
    client: LambdaClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new ListLayersCommand({
          Marker: marker,
          MaxItems: 50,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.Layers) {
          for (const layer of response.Layers) {
            const resource = this.mapLayer(layer, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        marker = response.NextMarker;
      } while (marker);
    } catch (error: any) {
      this.recordError('ListLayers', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan event source mappings
   */
  private async scanEventSourceMappings(
    client: LambdaClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new ListEventSourceMappingsCommand({
          Marker: marker,
          MaxItems: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.EventSourceMappings) {
          for (const mapping of response.EventSourceMappings) {
            const resource = this.mapEventSourceMapping(mapping, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        marker = response.NextMarker;
      } while (marker);
    } catch (error: any) {
      this.recordError('ListEventSourceMappings', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Map a Lambda layer to a DiscoveredResource
   */
  private mapLayer(layer: LayersListItem, context: ScannerContext): DiscoveredResource | null {
    if (!layer.LayerName || !layer.LayerArn) return null;

    const latestVersion = layer.LatestMatchingVersion;

    return this.createResource({
      id: layer.LayerName,
      arn: layer.LayerArn,
      awsType: 'AWS::Lambda::LayerVersion',
      region: context.region,
      name: layer.LayerName,
      tags: {},
      properties: {
        description: latestVersion?.Description,
        version: latestVersion?.Version,
        compatibleRuntimes: latestVersion?.CompatibleRuntimes,
        compatibleArchitectures: latestVersion?.CompatibleArchitectures,
        licenseInfo: latestVersion?.LicenseInfo,
        layerVersionArn: latestVersion?.LayerVersionArn,
        codeSize: latestVersion?.CodeSize,
      },
      relationships: [],
      createdAt: latestVersion?.CreatedDate ? new Date(latestVersion.CreatedDate) : undefined,
    });
  }

  /**
   * Map an event source mapping to a DiscoveredResource
   */
  private mapEventSourceMapping(
    mapping: EventSourceMappingConfiguration,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!mapping.UUID) return null;

    const relationships: ResourceRelationship[] = [];

    // Add function relationship
    if (mapping.FunctionArn) {
      relationships.push({
        type: 'references',
        targetArn: mapping.FunctionArn,
        targetType: 'aws_lambda_function',
      });
    }

    // Add event source relationship
    if (mapping.EventSourceArn) {
      let targetType = 'unknown';
      if (mapping.EventSourceArn.includes(':sqs:')) {
        targetType = 'aws_sqs_queue';
      } else if (mapping.EventSourceArn.includes(':kinesis:')) {
        targetType = 'aws_kinesis_stream';
      } else if (mapping.EventSourceArn.includes(':dynamodb:')) {
        targetType = 'aws_dynamodb_table';
      } else if (mapping.EventSourceArn.includes(':kafka:')) {
        targetType = 'aws_msk_cluster';
      }

      relationships.push({
        type: 'references',
        targetArn: mapping.EventSourceArn,
        targetType,
      });
    }

    return this.createResource({
      id: mapping.UUID,
      arn: this.buildArn({
        service: 'lambda',
        region: context.region,
        accountId: context.accountId,
        resourceType: 'event-source-mapping',
        resource: mapping.UUID,
      }),
      awsType: 'AWS::Lambda::EventSourceMapping',
      region: context.region,
      name: mapping.UUID,
      tags: {},
      properties: {
        functionArn: mapping.FunctionArn,
        eventSourceArn: mapping.EventSourceArn,
        batchSize: mapping.BatchSize,
        maximumBatchingWindowInSeconds: mapping.MaximumBatchingWindowInSeconds,
        parallelizationFactor: mapping.ParallelizationFactor,
        startingPosition: mapping.StartingPosition,
        startingPositionTimestamp: mapping.StartingPositionTimestamp,
        maximumRecordAgeInSeconds: mapping.MaximumRecordAgeInSeconds,
        bisectBatchOnFunctionError: mapping.BisectBatchOnFunctionError,
        maximumRetryAttempts: mapping.MaximumRetryAttempts,
        tumblingWindowInSeconds: mapping.TumblingWindowInSeconds,
        functionResponseTypes: mapping.FunctionResponseTypes,
        filterCriteria: mapping.FilterCriteria,
        destinationConfig: mapping.DestinationConfig,
        lastProcessingResult: mapping.LastProcessingResult,
      },
      relationships,
      createdAt: mapping.LastModified,
      status: mapping.State,
    });
  }
}
