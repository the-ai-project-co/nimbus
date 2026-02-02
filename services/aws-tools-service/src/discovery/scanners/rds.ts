/**
 * RDS Scanner
 *
 * Discovers RDS resources including DB instances, clusters,
 * subnet groups, parameter groups, and option groups
 */

import {
  RDSClient,
  DescribeDBInstancesCommand,
  DescribeDBClustersCommand,
  DescribeDBSubnetGroupsCommand,
  DescribeDBParameterGroupsCommand,
  ListTagsForResourceCommand,
  type DBInstance,
  type DBCluster,
  type DBSubnetGroup,
  type DBParameterGroup,
} from '@aws-sdk/client-rds';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

/**
 * RDS Scanner - discovers RDS instances, clusters, and related resources
 */
export class RDSScanner extends BaseScanner {
  readonly serviceName = 'RDS';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new RDSClient({
      region: context.region,
      credentials: context.credentials,
    });

    // Scan all RDS resource types in parallel
    const [instances, clusters, subnetGroups, parameterGroups] = await Promise.all([
      this.scanDBInstances(client, context),
      this.scanDBClusters(client, context),
      this.scanDBSubnetGroups(client, context),
      this.scanDBParameterGroups(client, context),
    ]);

    resources.push(...instances, ...clusters, ...subnetGroups, ...parameterGroups);

    logger.debug(`RDS scanner found ${resources.length} resources`, {
      region: context.region,
      instances: instances.length,
      clusters: clusters.length,
      subnetGroups: subnetGroups.length,
      parameterGroups: parameterGroups.length,
    });

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'AWS::RDS::DBInstance',
      'AWS::RDS::DBCluster',
      'AWS::RDS::DBSubnetGroup',
      'AWS::RDS::DBParameterGroup',
    ];
  }

  /**
   * Scan RDS DB instances
   */
  private async scanDBInstances(
    client: RDSClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new DescribeDBInstancesCommand({
          Marker: marker,
          MaxRecords: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.DBInstances) {
          for (const instance of response.DBInstances) {
            const resource = await this.mapDBInstance(instance, client, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        marker = response.Marker;
      } while (marker);
    } catch (error: any) {
      this.recordError('DescribeDBInstances', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan RDS DB clusters (Aurora)
   */
  private async scanDBClusters(
    client: RDSClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new DescribeDBClustersCommand({
          Marker: marker,
          MaxRecords: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.DBClusters) {
          for (const cluster of response.DBClusters) {
            const resource = await this.mapDBCluster(cluster, client, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        marker = response.Marker;
      } while (marker);
    } catch (error: any) {
      this.recordError('DescribeDBClusters', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan DB subnet groups
   */
  private async scanDBSubnetGroups(
    client: RDSClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new DescribeDBSubnetGroupsCommand({
          Marker: marker,
          MaxRecords: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.DBSubnetGroups) {
          for (const subnetGroup of response.DBSubnetGroups) {
            const resource = this.mapDBSubnetGroup(subnetGroup, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        marker = response.Marker;
      } while (marker);
    } catch (error: any) {
      this.recordError('DescribeDBSubnetGroups', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan DB parameter groups
   */
  private async scanDBParameterGroups(
    client: RDSClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let marker: string | undefined;

      do {
        const command = new DescribeDBParameterGroupsCommand({
          Marker: marker,
          MaxRecords: 100,
        });

        const response = await this.withRateLimit(context, () => client.send(command));

        if (response.DBParameterGroups) {
          for (const paramGroup of response.DBParameterGroups) {
            const resource = this.mapDBParameterGroup(paramGroup, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }

        marker = response.Marker;
      } while (marker);
    } catch (error: any) {
      this.recordError('DescribeDBParameterGroups', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Get tags for an RDS resource
   */
  private async getResourceTags(
    client: RDSClient,
    resourceArn: string,
    context: ScannerContext
  ): Promise<Record<string, string>> {
    try {
      const command = new ListTagsForResourceCommand({ ResourceName: resourceArn });
      const response = await this.withRateLimit(context, () => client.send(command));

      if (response.TagList) {
        return response.TagList.reduce((acc, tag) => {
          if (tag.Key) {
            acc[tag.Key] = tag.Value || '';
          }
          return acc;
        }, {} as Record<string, string>);
      }
      return {};
    } catch (error: any) {
      return {};
    }
  }

  /**
   * Map a DB instance to a DiscoveredResource
   */
  private async mapDBInstance(
    instance: DBInstance,
    client: RDSClient,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    if (!instance.DBInstanceIdentifier || !instance.DBInstanceArn) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationship
    if (instance.DBSubnetGroup?.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'vpc',
          resource: instance.DBSubnetGroup.VpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    // Add subnet group relationship
    if (instance.DBSubnetGroup?.DBSubnetGroupArn) {
      relationships.push({
        type: 'references',
        targetArn: instance.DBSubnetGroup.DBSubnetGroupArn,
        targetType: 'aws_db_subnet_group',
      });
    }

    // Add security group relationships
    if (instance.VpcSecurityGroups) {
      for (const sg of instance.VpcSecurityGroups) {
        if (sg.VpcSecurityGroupId) {
          relationships.push({
            type: 'references',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'security-group',
              resource: sg.VpcSecurityGroupId,
            }),
            targetType: 'aws_security_group',
          });
        }
      }
    }

    // Add KMS key relationship
    if (instance.KmsKeyId) {
      relationships.push({
        type: 'references',
        targetArn: instance.KmsKeyId,
        targetType: 'aws_kms_key',
      });
    }

    // Add cluster relationship
    if (instance.DBClusterIdentifier) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'rds',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'cluster',
          resource: instance.DBClusterIdentifier,
        }),
        targetType: 'aws_rds_cluster',
      });
    }

    // Get tags
    const tags = await this.getResourceTags(client, instance.DBInstanceArn, context);

    return this.createResource({
      id: instance.DBInstanceIdentifier,
      arn: instance.DBInstanceArn,
      awsType: 'AWS::RDS::DBInstance',
      region: context.region,
      name: instance.DBInstanceIdentifier,
      tags,
      properties: {
        dbInstanceClass: instance.DBInstanceClass,
        engine: instance.Engine,
        engineVersion: instance.EngineVersion,
        allocatedStorage: instance.AllocatedStorage,
        storageType: instance.StorageType,
        storageEncrypted: instance.StorageEncrypted,
        kmsKeyId: instance.KmsKeyId,
        multiAZ: instance.MultiAZ,
        availabilityZone: instance.AvailabilityZone,
        masterUsername: instance.MasterUsername,
        dbName: instance.DBName,
        endpoint: instance.Endpoint
          ? {
              address: instance.Endpoint.Address,
              port: instance.Endpoint.Port,
              hostedZoneId: instance.Endpoint.HostedZoneId,
            }
          : undefined,
        publiclyAccessible: instance.PubliclyAccessible,
        autoMinorVersionUpgrade: instance.AutoMinorVersionUpgrade,
        licenseModel: instance.LicenseModel,
        iops: instance.Iops,
        dbParameterGroups: instance.DBParameterGroups?.map(pg => ({
          name: pg.DBParameterGroupName,
          status: pg.ParameterApplyStatus,
        })),
        optionGroupMemberships: instance.OptionGroupMemberships?.map(og => ({
          name: og.OptionGroupName,
          status: og.Status,
        })),
        backupRetentionPeriod: instance.BackupRetentionPeriod,
        preferredBackupWindow: instance.PreferredBackupWindow,
        preferredMaintenanceWindow: instance.PreferredMaintenanceWindow,
        latestRestorableTime: instance.LatestRestorableTime,
        copyTagsToSnapshot: instance.CopyTagsToSnapshot,
        monitoringInterval: instance.MonitoringInterval,
        enhancedMonitoringResourceArn: instance.EnhancedMonitoringResourceArn,
        performanceInsightsEnabled: instance.PerformanceInsightsEnabled,
        performanceInsightsKMSKeyId: instance.PerformanceInsightsKMSKeyId,
        deletionProtection: instance.DeletionProtection,
        maxAllocatedStorage: instance.MaxAllocatedStorage,
        iamDatabaseAuthenticationEnabled: instance.IAMDatabaseAuthenticationEnabled,
        caCertificateIdentifier: instance.CACertificateIdentifier,
        dbSubnetGroup: instance.DBSubnetGroup
          ? {
              name: instance.DBSubnetGroup.DBSubnetGroupName,
              vpcId: instance.DBSubnetGroup.VpcId,
              status: instance.DBSubnetGroup.SubnetGroupStatus,
            }
          : undefined,
        vpcSecurityGroups: instance.VpcSecurityGroups?.map(sg => ({
          id: sg.VpcSecurityGroupId,
          status: sg.Status,
        })),
      },
      relationships,
      createdAt: instance.InstanceCreateTime,
      status: instance.DBInstanceStatus,
    });
  }

  /**
   * Map a DB cluster to a DiscoveredResource
   */
  private async mapDBCluster(
    cluster: DBCluster,
    client: RDSClient,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    if (!cluster.DBClusterIdentifier || !cluster.DBClusterArn) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC security group relationships
    if (cluster.VpcSecurityGroups) {
      for (const sg of cluster.VpcSecurityGroups) {
        if (sg.VpcSecurityGroupId) {
          relationships.push({
            type: 'references',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'security-group',
              resource: sg.VpcSecurityGroupId,
            }),
            targetType: 'aws_security_group',
          });
        }
      }
    }

    // Add KMS key relationship
    if (cluster.KmsKeyId) {
      relationships.push({
        type: 'references',
        targetArn: cluster.KmsKeyId,
        targetType: 'aws_kms_key',
      });
    }

    // Add cluster member relationships
    if (cluster.DBClusterMembers) {
      for (const member of cluster.DBClusterMembers) {
        if (member.DBInstanceIdentifier) {
          relationships.push({
            type: 'contains',
            targetArn: this.buildArn({
              service: 'rds',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'db',
              resource: member.DBInstanceIdentifier,
            }),
            targetType: 'aws_db_instance',
          });
        }
      }
    }

    // Get tags
    const tags = await this.getResourceTags(client, cluster.DBClusterArn, context);

    return this.createResource({
      id: cluster.DBClusterIdentifier,
      arn: cluster.DBClusterArn,
      awsType: 'AWS::RDS::DBCluster',
      region: context.region,
      name: cluster.DBClusterIdentifier,
      tags,
      properties: {
        engine: cluster.Engine,
        engineVersion: cluster.EngineVersion,
        engineMode: cluster.EngineMode,
        masterUsername: cluster.MasterUsername,
        databaseName: cluster.DatabaseName,
        endpoint: cluster.Endpoint,
        readerEndpoint: cluster.ReaderEndpoint,
        port: cluster.Port,
        allocatedStorage: cluster.AllocatedStorage,
        storageEncrypted: cluster.StorageEncrypted,
        kmsKeyId: cluster.KmsKeyId,
        availabilityZones: cluster.AvailabilityZones,
        backupRetentionPeriod: cluster.BackupRetentionPeriod,
        preferredBackupWindow: cluster.PreferredBackupWindow,
        preferredMaintenanceWindow: cluster.PreferredMaintenanceWindow,
        multiAZ: cluster.MultiAZ,
        iamDatabaseAuthenticationEnabled: cluster.IAMDatabaseAuthenticationEnabled,
        deletionProtection: cluster.DeletionProtection,
        httpEndpointEnabled: cluster.HttpEndpointEnabled,
        copyTagsToSnapshot: cluster.CopyTagsToSnapshot,
        globalWriteForwardingRequested: cluster.GlobalWriteForwardingRequested,
        serverlessV2ScalingConfiguration: cluster.ServerlessV2ScalingConfiguration
          ? {
              minCapacity: cluster.ServerlessV2ScalingConfiguration.MinCapacity,
              maxCapacity: cluster.ServerlessV2ScalingConfiguration.MaxCapacity,
            }
          : undefined,
        dbClusterMembers: cluster.DBClusterMembers?.map(member => ({
          instanceIdentifier: member.DBInstanceIdentifier,
          isWriter: member.IsClusterWriter,
          promotionTier: member.PromotionTier,
        })),
        vpcSecurityGroups: cluster.VpcSecurityGroups?.map(sg => ({
          id: sg.VpcSecurityGroupId,
          status: sg.Status,
        })),
        dbSubnetGroup: cluster.DBSubnetGroup,
      },
      relationships,
      createdAt: cluster.ClusterCreateTime,
      status: cluster.Status,
    });
  }

  /**
   * Map a DB subnet group to a DiscoveredResource
   */
  private mapDBSubnetGroup(
    subnetGroup: DBSubnetGroup,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!subnetGroup.DBSubnetGroupName || !subnetGroup.DBSubnetGroupArn) return null;

    const relationships: ResourceRelationship[] = [];

    // Add VPC relationship
    if (subnetGroup.VpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'vpc',
          resource: subnetGroup.VpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    // Add subnet relationships
    if (subnetGroup.Subnets) {
      for (const subnet of subnetGroup.Subnets) {
        if (subnet.SubnetIdentifier) {
          relationships.push({
            type: 'contains',
            targetArn: this.buildArn({
              service: 'ec2',
              region: context.region,
              accountId: context.accountId,
              resourceType: 'subnet',
              resource: subnet.SubnetIdentifier,
            }),
            targetType: 'aws_subnet',
          });
        }
      }
    }

    return this.createResource({
      id: subnetGroup.DBSubnetGroupName,
      arn: subnetGroup.DBSubnetGroupArn,
      awsType: 'AWS::RDS::DBSubnetGroup',
      region: context.region,
      name: subnetGroup.DBSubnetGroupName,
      tags: {},
      properties: {
        description: subnetGroup.DBSubnetGroupDescription,
        vpcId: subnetGroup.VpcId,
        subnets: subnetGroup.Subnets?.map(s => ({
          identifier: s.SubnetIdentifier,
          availabilityZone: s.SubnetAvailabilityZone?.Name,
          status: s.SubnetStatus,
        })),
        supportedNetworkTypes: subnetGroup.SupportedNetworkTypes,
      },
      relationships,
      status: subnetGroup.SubnetGroupStatus,
    });
  }

  /**
   * Map a DB parameter group to a DiscoveredResource
   */
  private mapDBParameterGroup(
    paramGroup: DBParameterGroup,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!paramGroup.DBParameterGroupName || !paramGroup.DBParameterGroupArn) return null;

    return this.createResource({
      id: paramGroup.DBParameterGroupName,
      arn: paramGroup.DBParameterGroupArn,
      awsType: 'AWS::RDS::DBParameterGroup',
      region: context.region,
      name: paramGroup.DBParameterGroupName,
      tags: {},
      properties: {
        family: paramGroup.DBParameterGroupFamily,
        description: paramGroup.Description,
      },
      relationships: [],
    });
  }
}
