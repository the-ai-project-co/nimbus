/**
 * DynamoDB Resource Mappers
 *
 * Maps DynamoDB resources to Terraform configuration
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
 * DynamoDB Table Mapper
 */
export class DynamoDBTableMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::DynamoDB::Table';
  readonly terraformType = 'aws_dynamodb_table';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Table name
    if (props.tableName) {
      attributes.name = props.tableName as string;
    }

    // Billing mode
    if (props.billingModeSummary && typeof props.billingModeSummary === 'object') {
      const billing = props.billingModeSummary as { billingMode?: string };
      if (billing.billingMode) {
        attributes.billing_mode = billing.billingMode;
      }
    }

    // Provisioned throughput (only for PROVISIONED billing mode)
    if (props.provisionedThroughput && typeof props.provisionedThroughput === 'object') {
      const throughput = props.provisionedThroughput as {
        readCapacityUnits?: number;
        writeCapacityUnits?: number;
      };
      if (throughput.readCapacityUnits !== undefined) {
        attributes.read_capacity = throughput.readCapacityUnits;
      }
      if (throughput.writeCapacityUnits !== undefined) {
        attributes.write_capacity = throughput.writeCapacityUnits;
      }
    }

    // Key schema (hash key and range key)
    if (props.keySchema && Array.isArray(props.keySchema)) {
      for (const key of props.keySchema as Array<{ attributeName?: string; keyType?: string }>) {
        if (key.keyType === 'HASH' && key.attributeName) {
          attributes.hash_key = key.attributeName;
        }
        if (key.keyType === 'RANGE' && key.attributeName) {
          attributes.range_key = key.attributeName;
        }
      }
    }

    // Attribute definitions
    if (props.attributeDefinitions && Array.isArray(props.attributeDefinitions)) {
      const attrBlocks: TerraformValue[] = [];
      for (const attr of props.attributeDefinitions as Array<{
        attributeName?: string;
        attributeType?: string;
      }>) {
        if (attr.attributeName && attr.attributeType) {
          attrBlocks.push(this.createBlock({
            name: attr.attributeName,
            type: attr.attributeType,
          }));
        }
      }
      if (attrBlocks.length > 0) {
        attributes.attribute = attrBlocks;
      }
    }

    // Global secondary indexes
    if (props.globalSecondaryIndexes && Array.isArray(props.globalSecondaryIndexes)) {
      const gsiBlocks: TerraformValue[] = [];
      for (const gsi of props.globalSecondaryIndexes as Array<{
        indexName?: string;
        keySchema?: Array<{ attributeName?: string; keyType?: string }>;
        projection?: { projectionType?: string; nonKeyAttributes?: string[] };
        provisionedThroughput?: { readCapacityUnits?: number; writeCapacityUnits?: number };
      }>) {
        const gsiAttrs: Record<string, TerraformValue> = {};

        if (gsi.indexName) {
          gsiAttrs.name = gsi.indexName;
        }

        if (gsi.keySchema) {
          for (const key of gsi.keySchema) {
            if (key.keyType === 'HASH' && key.attributeName) {
              gsiAttrs.hash_key = key.attributeName;
            }
            if (key.keyType === 'RANGE' && key.attributeName) {
              gsiAttrs.range_key = key.attributeName;
            }
          }
        }

        if (gsi.projection) {
          gsiAttrs.projection_type = gsi.projection.projectionType || 'ALL';
          if (gsi.projection.nonKeyAttributes) {
            gsiAttrs.non_key_attributes = gsi.projection.nonKeyAttributes;
          }
        }

        if (gsi.provisionedThroughput) {
          if (gsi.provisionedThroughput.readCapacityUnits !== undefined) {
            gsiAttrs.read_capacity = gsi.provisionedThroughput.readCapacityUnits;
          }
          if (gsi.provisionedThroughput.writeCapacityUnits !== undefined) {
            gsiAttrs.write_capacity = gsi.provisionedThroughput.writeCapacityUnits;
          }
        }

        if (Object.keys(gsiAttrs).length > 0) {
          gsiBlocks.push(this.createBlock(gsiAttrs));
        }
      }
      if (gsiBlocks.length > 0) {
        attributes.global_secondary_index = gsiBlocks;
      }
    }

    // Local secondary indexes
    if (props.localSecondaryIndexes && Array.isArray(props.localSecondaryIndexes)) {
      const lsiBlocks: TerraformValue[] = [];
      for (const lsi of props.localSecondaryIndexes as Array<{
        indexName?: string;
        keySchema?: Array<{ attributeName?: string; keyType?: string }>;
        projection?: { projectionType?: string; nonKeyAttributes?: string[] };
      }>) {
        const lsiAttrs: Record<string, TerraformValue> = {};

        if (lsi.indexName) {
          lsiAttrs.name = lsi.indexName;
        }

        if (lsi.keySchema) {
          for (const key of lsi.keySchema) {
            if (key.keyType === 'RANGE' && key.attributeName) {
              lsiAttrs.range_key = key.attributeName;
            }
          }
        }

        if (lsi.projection) {
          lsiAttrs.projection_type = lsi.projection.projectionType || 'ALL';
          if (lsi.projection.nonKeyAttributes) {
            lsiAttrs.non_key_attributes = lsi.projection.nonKeyAttributes;
          }
        }

        if (Object.keys(lsiAttrs).length > 0) {
          lsiBlocks.push(this.createBlock(lsiAttrs));
        }
      }
      if (lsiBlocks.length > 0) {
        attributes.local_secondary_index = lsiBlocks;
      }
    }

    // TTL
    if (props.timeToLiveDescription && typeof props.timeToLiveDescription === 'object') {
      const ttl = props.timeToLiveDescription as {
        timeToLiveStatus?: string;
        attributeName?: string;
      };
      if (ttl.timeToLiveStatus === 'ENABLED' && ttl.attributeName) {
        attributes.ttl = this.createBlock({
          enabled: true,
          attribute_name: ttl.attributeName,
        });
      }
    }

    // Stream specification
    if (props.streamSpecification && typeof props.streamSpecification === 'object') {
      const stream = props.streamSpecification as {
        streamEnabled?: boolean;
        streamViewType?: string;
      };
      if (stream.streamEnabled) {
        attributes.stream_enabled = true;
        if (stream.streamViewType) {
          attributes.stream_view_type = stream.streamViewType;
        }
      }
    }

    // Server-side encryption
    if (props.sseDescription && typeof props.sseDescription === 'object') {
      const sse = props.sseDescription as {
        status?: string;
        sseType?: string;
        kmsMasterKeyArn?: string;
      };
      if (sse.status === 'ENABLED') {
        const sseAttrs: Record<string, TerraformValue> = {
          enabled: true,
        };
        if (sse.kmsMasterKeyArn) {
          sseAttrs.kms_key_arn = sse.kmsMasterKeyArn;
        }
        attributes.server_side_encryption = this.createBlock(sseAttrs);
      }
    }

    // Point-in-time recovery
    if (props.pointInTimeRecoveryDescription && typeof props.pointInTimeRecoveryDescription === 'object') {
      const pitr = props.pointInTimeRecoveryDescription as {
        pointInTimeRecoveryStatus?: string;
      };
      if (pitr.pointInTimeRecoveryStatus === 'ENABLED') {
        attributes.point_in_time_recovery = this.createBlock({
          enabled: true,
        });
      }
    }

    // Replica settings (Global Tables)
    if (props.replicas && Array.isArray(props.replicas)) {
      const replicaBlocks: TerraformValue[] = [];
      for (const replica of props.replicas as Array<{
        regionName?: string;
        kmsKeyArn?: string;
      }>) {
        const replicaAttrs: Record<string, TerraformValue> = {};
        if (replica.regionName) {
          replicaAttrs.region_name = replica.regionName;
        }
        if (replica.kmsKeyArn) {
          replicaAttrs.kms_key_arn = replica.kmsKeyArn;
        }
        if (Object.keys(replicaAttrs).length > 0) {
          replicaBlocks.push(this.createBlock(replicaAttrs));
        }
      }
      if (replicaBlocks.length > 0) {
        attributes.replica = replicaBlocks;
      }
    }

    // Table class
    if (props.tableClass) {
      attributes.table_class = props.tableClass as string;
    }

    // Deletion protection
    if (props.deletionProtectionEnabled !== undefined) {
      attributes.deletion_protection_enabled = props.deletionProtectionEnabled as boolean;
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
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return (resource.properties.tableName as string) || resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_arn`,
        value: `aws_dynamodb_table.${name}.arn`,
        description: `ARN of DynamoDB table ${resource.properties.tableName || resource.id}`,
      },
      {
        name: `${name}_stream_arn`,
        value: `aws_dynamodb_table.${name}.stream_arn`,
        description: `Stream ARN of DynamoDB table ${resource.properties.tableName || resource.id}`,
      },
    ];
  }
}

/**
 * DynamoDB Global Table Mapper
 * Note: This is for DynamoDB Global Tables v2 (2019.11.21)
 */
export class DynamoDBGlobalTableMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::DynamoDB::GlobalTable';
  readonly terraformType = 'aws_dynamodb_table';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    // Global tables are essentially regular tables with replicas
    // The DynamoDBTableMapper handles the replica configuration
    // This mapper exists for AWS type compatibility

    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    if (props.tableName) {
      attributes.name = props.tableName as string;
    }

    // Most properties are same as regular table
    // Adding a note that this came from a global table
    attributes.billing_mode = 'PAY_PER_REQUEST';

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
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return (resource.properties.tableName as string) || resource.id;
  }
}

/**
 * Get all DynamoDB mappers
 */
export function getDynamoDBMappers(): BaseResourceMapper[] {
  return [
    new DynamoDBTableMapper(),
    new DynamoDBGlobalTableMapper(),
  ];
}
