/**
 * DynamoDB Scanner
 *
 * Discovers DynamoDB tables and their configurations including
 * indexes, capacity, encryption, and stream settings
 */

import {
  DynamoDBClient,
  ListTablesCommand,
  DescribeTableCommand,
  ListTagsOfResourceCommand,
  DescribeContinuousBackupsCommand,
  type TableDescription,
} from '@aws-sdk/client-dynamodb';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

/**
 * DynamoDB Scanner - discovers DynamoDB tables and their configurations
 */
export class DynamoDBScanner extends BaseScanner {
  readonly serviceName = 'DynamoDB';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new DynamoDBClient({
      region: context.region,
      credentials: context.credentials,
    });

    try {
      let lastEvaluatedTableName: string | undefined;
      const tableNames: string[] = [];

      // List all table names
      do {
        const listCommand = new ListTablesCommand({
          ExclusiveStartTableName: lastEvaluatedTableName,
          Limit: 100,
        });

        const listResponse = await this.withRateLimit(context, () => client.send(listCommand));

        if (listResponse.TableNames) {
          tableNames.push(...listResponse.TableNames);
        }

        lastEvaluatedTableName = listResponse.LastEvaluatedTableName;
      } while (lastEvaluatedTableName);

      // Describe each table
      const tablePromises = tableNames.map(tableName =>
        this.processTable(tableName, client, context)
      );

      const results = await Promise.allSettled(tablePromises);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          resources.push(result.value);
        }
      }

      logger.debug(`DynamoDB scanner found ${resources.length} tables`, {
        region: context.region,
      });
    } catch (error: any) {
      this.recordError('ListTables', error.message, context.region, error.code);
    }

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return ['AWS::DynamoDB::Table'];
  }

  /**
   * Process a single DynamoDB table
   */
  private async processTable(
    tableName: string,
    client: DynamoDBClient,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    try {
      // Get table details
      const describeCommand = new DescribeTableCommand({
        TableName: tableName,
      });
      const describeResponse = await this.withRateLimit(context, () => client.send(describeCommand));

      const table = describeResponse.Table;
      if (!table || !table.TableArn) return null;

      // Get tags
      let tags: Record<string, string> = {};
      try {
        const tagsCommand = new ListTagsOfResourceCommand({
          ResourceArn: table.TableArn,
        });
        const tagsResponse = await this.withRateLimit(context, () => client.send(tagsCommand));

        if (tagsResponse.Tags) {
          tags = tagsResponse.Tags.reduce((acc, tag) => {
            if (tag.Key) {
              acc[tag.Key] = tag.Value || '';
            }
            return acc;
          }, {} as Record<string, string>);
        }
      } catch {
        // Continue without tags
      }

      // Get continuous backups (PITR) status
      let continuousBackups: {
        pointInTimeRecoveryEnabled?: boolean;
        earliestRestorableDateTime?: Date;
        latestRestorableDateTime?: Date;
      } | undefined;
      try {
        const backupsCommand = new DescribeContinuousBackupsCommand({
          TableName: tableName,
        });
        const backupsResponse = await this.withRateLimit(context, () => client.send(backupsCommand));

        if (backupsResponse.ContinuousBackupsDescription?.PointInTimeRecoveryDescription) {
          const pitr = backupsResponse.ContinuousBackupsDescription.PointInTimeRecoveryDescription;
          continuousBackups = {
            pointInTimeRecoveryEnabled: pitr.PointInTimeRecoveryStatus === 'ENABLED',
            earliestRestorableDateTime: pitr.EarliestRestorableDateTime,
            latestRestorableDateTime: pitr.LatestRestorableDateTime,
          };
        }
      } catch {
        // Continue without backup info
      }

      return this.mapTable(table, tags, continuousBackups, context);
    } catch (error: any) {
      this.recordError('DescribeTable', error.message, context.region, error.code);
      return null;
    }
  }

  /**
   * Map a DynamoDB table to a DiscoveredResource
   */
  private mapTable(
    table: TableDescription,
    tags: Record<string, string>,
    continuousBackups:
      | {
          pointInTimeRecoveryEnabled?: boolean;
          earliestRestorableDateTime?: Date;
          latestRestorableDateTime?: Date;
        }
      | undefined,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!table.TableName || !table.TableArn) return null;

    const relationships: ResourceRelationship[] = [];

    // Add KMS key relationship if encrypted with CMK
    if (table.SSEDescription?.KMSMasterKeyArn) {
      relationships.push({
        type: 'references',
        targetArn: table.SSEDescription.KMSMasterKeyArn,
        targetType: 'aws_kms_key',
      });
    }

    // Add stream relationship
    if (table.LatestStreamArn) {
      relationships.push({
        type: 'references',
        targetArn: table.LatestStreamArn,
        targetType: 'aws_dynamodb_stream',
      });
    }

    // Add global table replica relationships
    if (table.Replicas) {
      for (const replica of table.Replicas) {
        if (replica.RegionName && replica.RegionName !== context.region) {
          relationships.push({
            type: 'references',
            targetArn: `arn:aws:dynamodb:${replica.RegionName}:${context.accountId}:table/${table.TableName}`,
            targetType: 'aws_dynamodb_table',
          });
        }
      }
    }

    return this.createResource({
      id: table.TableName,
      arn: table.TableArn,
      awsType: 'AWS::DynamoDB::Table',
      region: context.region,
      name: table.TableName,
      tags,
      properties: {
        tableId: table.TableId,
        tableStatus: table.TableStatus,
        tableSizeBytes: table.TableSizeBytes,
        itemCount: table.ItemCount,
        keySchema: table.KeySchema?.map(k => ({
          attributeName: k.AttributeName,
          keyType: k.KeyType,
        })),
        attributeDefinitions: table.AttributeDefinitions?.map(a => ({
          attributeName: a.AttributeName,
          attributeType: a.AttributeType,
        })),
        billingMode: table.BillingModeSummary?.BillingMode || 'PROVISIONED',
        provisionedThroughput: table.ProvisionedThroughput
          ? {
              readCapacityUnits: table.ProvisionedThroughput.ReadCapacityUnits,
              writeCapacityUnits: table.ProvisionedThroughput.WriteCapacityUnits,
              lastDecreaseDateTime: table.ProvisionedThroughput.LastDecreaseDateTime,
              lastIncreaseDateTime: table.ProvisionedThroughput.LastIncreaseDateTime,
              numberOfDecreasesToday: table.ProvisionedThroughput.NumberOfDecreasesToday,
            }
          : undefined,
        globalSecondaryIndexes: table.GlobalSecondaryIndexes?.map(gsi => ({
          indexName: gsi.IndexName,
          indexStatus: gsi.IndexStatus,
          keySchema: gsi.KeySchema?.map(k => ({
            attributeName: k.AttributeName,
            keyType: k.KeyType,
          })),
          projection: gsi.Projection
            ? {
                projectionType: gsi.Projection.ProjectionType,
                nonKeyAttributes: gsi.Projection.NonKeyAttributes,
              }
            : undefined,
          provisionedThroughput: gsi.ProvisionedThroughput
            ? {
                readCapacityUnits: gsi.ProvisionedThroughput.ReadCapacityUnits,
                writeCapacityUnits: gsi.ProvisionedThroughput.WriteCapacityUnits,
              }
            : undefined,
          indexSizeBytes: gsi.IndexSizeBytes,
          itemCount: gsi.ItemCount,
          indexArn: gsi.IndexArn,
        })),
        localSecondaryIndexes: table.LocalSecondaryIndexes?.map(lsi => ({
          indexName: lsi.IndexName,
          keySchema: lsi.KeySchema?.map(k => ({
            attributeName: k.AttributeName,
            keyType: k.KeyType,
          })),
          projection: lsi.Projection
            ? {
                projectionType: lsi.Projection.ProjectionType,
                nonKeyAttributes: lsi.Projection.NonKeyAttributes,
              }
            : undefined,
          indexSizeBytes: lsi.IndexSizeBytes,
          itemCount: lsi.ItemCount,
          indexArn: lsi.IndexArn,
        })),
        streamSpecification: table.StreamSpecification
          ? {
              streamEnabled: table.StreamSpecification.StreamEnabled,
              streamViewType: table.StreamSpecification.StreamViewType,
            }
          : undefined,
        latestStreamArn: table.LatestStreamArn,
        latestStreamLabel: table.LatestStreamLabel,
        globalTableVersion: table.GlobalTableVersion,
        replicas: table.Replicas?.map(r => ({
          regionName: r.RegionName,
          replicaStatus: r.ReplicaStatus,
          replicaStatusDescription: r.ReplicaStatusDescription,
          kmsMasterKeyId: r.KMSMasterKeyId,
          globalSecondaryIndexes: r.GlobalSecondaryIndexes?.map(gsi => ({
            indexName: gsi.IndexName,
            provisionedThroughputOverride: gsi.ProvisionedThroughputOverride,
          })),
        })),
        restoreSummary: table.RestoreSummary
          ? {
              sourceTableArn: table.RestoreSummary.SourceTableArn,
              sourceBackupArn: table.RestoreSummary.SourceBackupArn,
              restoreDateTime: table.RestoreSummary.RestoreDateTime,
              restoreInProgress: table.RestoreSummary.RestoreInProgress,
            }
          : undefined,
        sseDescription: table.SSEDescription
          ? {
              status: table.SSEDescription.Status,
              sseType: table.SSEDescription.SSEType,
              kmsMasterKeyArn: table.SSEDescription.KMSMasterKeyArn,
            }
          : undefined,
        archivalSummary: table.ArchivalSummary
          ? {
              archivalDateTime: table.ArchivalSummary.ArchivalDateTime,
              archivalReason: table.ArchivalSummary.ArchivalReason,
              archivalBackupArn: table.ArchivalSummary.ArchivalBackupArn,
            }
          : undefined,
        tableClassSummary: table.TableClassSummary
          ? {
              tableClass: table.TableClassSummary.TableClass,
              lastUpdateDateTime: table.TableClassSummary.LastUpdateDateTime,
            }
          : undefined,
        deletionProtectionEnabled: table.DeletionProtectionEnabled,
        continuousBackups,
      },
      relationships,
      createdAt: table.CreationDateTime,
      status: table.TableStatus,
    });
  }
}
