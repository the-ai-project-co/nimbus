/**
 * RDS Resource Mappers
 *
 * Maps RDS resources to Terraform configuration
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
 * RDS DB Instance Mapper
 */
export class RDSInstanceMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::RDS::DBInstance';
  readonly terraformType = 'aws_db_instance';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Identifier
    if (props.dbInstanceIdentifier) {
      attributes.identifier = props.dbInstanceIdentifier as string;
    }

    // Instance class
    if (props.dbInstanceClass) {
      attributes.instance_class = props.dbInstanceClass as string;
    }

    // Engine
    if (props.engine) {
      attributes.engine = props.engine as string;
    }

    if (props.engineVersion) {
      attributes.engine_version = props.engineVersion as string;
    }

    // Storage
    if (props.allocatedStorage) {
      attributes.allocated_storage = props.allocatedStorage as number;
    }

    if (props.storageType) {
      attributes.storage_type = props.storageType as string;
    }

    if (props.iops) {
      attributes.iops = props.iops as number;
    }

    if (props.storageEncrypted) {
      attributes.storage_encrypted = props.storageEncrypted as boolean;
    }

    if (props.kmsKeyId) {
      attributes.kms_key_id = props.kmsKeyId as string;
    }

    // Network
    if (props.dbSubnetGroupName) {
      attributes.db_subnet_group_name = props.dbSubnetGroupName as string;
    }

    if (props.vpcSecurityGroups && Array.isArray(props.vpcSecurityGroups)) {
      const sgIds = (props.vpcSecurityGroups as Array<{ vpcSecurityGroupId?: string }>)
        .map(sg => sg.vpcSecurityGroupId)
        .filter((id): id is string => !!id);
      if (sgIds.length > 0) {
        attributes.vpc_security_group_ids = sgIds;
      }
    }

    if (props.publiclyAccessible !== undefined) {
      attributes.publicly_accessible = props.publiclyAccessible as boolean;
    }

    if (props.port) {
      attributes.port = props.port as number;
    }

    // Database
    if (props.dbName) {
      attributes.db_name = props.dbName as string;
    }

    // Username - create variable for sensitive data
    if (props.masterUsername) {
      const varName = context.addVariable({
        name: `db_${name}_username`,
        type: 'string',
        description: `Master username for RDS instance ${name}`,
        sensitive: false,
      });
      attributes.username = this.createReference(`var.${varName}`);
    }

    // Password placeholder
    const passwordVar = context.addVariable({
      name: `db_${name}_password`,
      type: 'string',
      description: `Master password for RDS instance ${name}`,
      sensitive: true,
    });
    attributes.password = this.createReference(`var.${passwordVar}`);

    // Parameter group
    if (props.dbParameterGroupName) {
      attributes.parameter_group_name = props.dbParameterGroupName as string;
    }

    // Option group
    if (props.optionGroupName) {
      attributes.option_group_name = props.optionGroupName as string;
    }

    // Backup
    if (props.backupRetentionPeriod !== undefined) {
      attributes.backup_retention_period = props.backupRetentionPeriod as number;
    }

    if (props.preferredBackupWindow) {
      attributes.backup_window = props.preferredBackupWindow as string;
    }

    // Maintenance
    if (props.preferredMaintenanceWindow) {
      attributes.maintenance_window = props.preferredMaintenanceWindow as string;
    }

    // Multi-AZ
    if (props.multiAZ !== undefined) {
      attributes.multi_az = props.multiAZ as boolean;
    }

    // Auto minor version upgrade
    if (props.autoMinorVersionUpgrade !== undefined) {
      attributes.auto_minor_version_upgrade = props.autoMinorVersionUpgrade as boolean;
    }

    // Performance Insights
    if (props.performanceInsightsEnabled) {
      attributes.performance_insights_enabled = props.performanceInsightsEnabled as boolean;
    }

    if (props.performanceInsightsKMSKeyId) {
      attributes.performance_insights_kms_key_id = props.performanceInsightsKMSKeyId as string;
    }

    if (props.performanceInsightsRetentionPeriod) {
      attributes.performance_insights_retention_period = props.performanceInsightsRetentionPeriod as number;
    }

    // Enhanced monitoring
    if (props.monitoringInterval) {
      attributes.monitoring_interval = props.monitoringInterval as number;
    }

    if (props.monitoringRoleArn) {
      attributes.monitoring_role_arn = props.monitoringRoleArn as string;
    }

    // Deletion protection
    if (props.deletionProtection !== undefined) {
      attributes.deletion_protection = props.deletionProtection as boolean;
    }

    // Skip final snapshot for managed instances
    attributes.skip_final_snapshot = true;

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
        ignoreChanges: ['password'],
      },
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return (resource.properties.dbInstanceIdentifier as string) || resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_endpoint`,
        value: `aws_db_instance.${name}.endpoint`,
        description: `Endpoint of RDS instance ${resource.properties.dbInstanceIdentifier || resource.id}`,
      },
      {
        name: `${name}_arn`,
        value: `aws_db_instance.${name}.arn`,
        description: `ARN of RDS instance ${resource.properties.dbInstanceIdentifier || resource.id}`,
      },
    ];
  }
}

/**
 * RDS DB Cluster Mapper (Aurora)
 */
export class RDSClusterMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::RDS::DBCluster';
  readonly terraformType = 'aws_rds_cluster';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Cluster identifier
    if (props.dbClusterIdentifier) {
      attributes.cluster_identifier = props.dbClusterIdentifier as string;
    }

    // Engine
    if (props.engine) {
      attributes.engine = props.engine as string;
    }

    if (props.engineVersion) {
      attributes.engine_version = props.engineVersion as string;
    }

    if (props.engineMode) {
      attributes.engine_mode = props.engineMode as string;
    }

    // Database
    if (props.databaseName) {
      attributes.database_name = props.databaseName as string;
    }

    // Credentials - create variables
    if (props.masterUsername) {
      const varName = context.addVariable({
        name: `cluster_${name}_username`,
        type: 'string',
        description: `Master username for Aurora cluster ${name}`,
        sensitive: false,
      });
      attributes.master_username = this.createReference(`var.${varName}`);
    }

    const passwordVar = context.addVariable({
      name: `cluster_${name}_password`,
      type: 'string',
      description: `Master password for Aurora cluster ${name}`,
      sensitive: true,
    });
    attributes.master_password = this.createReference(`var.${passwordVar}`);

    // Network
    if (props.dbSubnetGroupName) {
      attributes.db_subnet_group_name = props.dbSubnetGroupName as string;
    }

    if (props.vpcSecurityGroupIds && Array.isArray(props.vpcSecurityGroupIds)) {
      attributes.vpc_security_group_ids = props.vpcSecurityGroupIds as string[];
    }

    if (props.port) {
      attributes.port = props.port as number;
    }

    // Parameter group
    if (props.dbClusterParameterGroupName) {
      attributes.db_cluster_parameter_group_name = props.dbClusterParameterGroupName as string;
    }

    // Storage
    if (props.storageEncrypted) {
      attributes.storage_encrypted = props.storageEncrypted as boolean;
    }

    if (props.kmsKeyId) {
      attributes.kms_key_id = props.kmsKeyId as string;
    }

    // Backup
    if (props.backupRetentionPeriod !== undefined) {
      attributes.backup_retention_period = props.backupRetentionPeriod as number;
    }

    if (props.preferredBackupWindow) {
      attributes.preferred_backup_window = props.preferredBackupWindow as string;
    }

    // Maintenance
    if (props.preferredMaintenanceWindow) {
      attributes.preferred_maintenance_window = props.preferredMaintenanceWindow as string;
    }

    // Deletion protection
    if (props.deletionProtection !== undefined) {
      attributes.deletion_protection = props.deletionProtection as boolean;
    }

    // IAM auth
    if (props.iamDatabaseAuthenticationEnabled !== undefined) {
      attributes.iam_database_authentication_enabled = props.iamDatabaseAuthenticationEnabled as boolean;
    }

    // Skip final snapshot
    attributes.skip_final_snapshot = true;

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
        ignoreChanges: ['master_password'],
      },
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return (resource.properties.dbClusterIdentifier as string) || resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_endpoint`,
        value: `aws_rds_cluster.${name}.endpoint`,
        description: `Writer endpoint of Aurora cluster ${resource.properties.dbClusterIdentifier || resource.id}`,
      },
      {
        name: `${name}_reader_endpoint`,
        value: `aws_rds_cluster.${name}.reader_endpoint`,
        description: `Reader endpoint of Aurora cluster ${resource.properties.dbClusterIdentifier || resource.id}`,
      },
    ];
  }
}

/**
 * RDS DB Subnet Group Mapper
 */
export class RDSSubnetGroupMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::RDS::DBSubnetGroup';
  readonly terraformType = 'aws_db_subnet_group';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Name
    if (props.dbSubnetGroupName) {
      attributes.name = props.dbSubnetGroupName as string;
    }

    // Description
    if (props.dbSubnetGroupDescription) {
      attributes.description = props.dbSubnetGroupDescription as string;
    }

    // Subnet IDs
    if (props.subnets && Array.isArray(props.subnets)) {
      const subnetIds = (props.subnets as Array<{ subnetIdentifier?: string }>)
        .map(s => s.subnetIdentifier)
        .filter((id): id is string => !!id);
      if (subnetIds.length > 0) {
        attributes.subnet_ids = subnetIds;
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
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return (resource.properties.dbSubnetGroupName as string) || resource.id;
  }
}

/**
 * RDS DB Parameter Group Mapper
 */
export class RDSParameterGroupMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::RDS::DBParameterGroup';
  readonly terraformType = 'aws_db_parameter_group';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Name
    if (props.dbParameterGroupName) {
      attributes.name = props.dbParameterGroupName as string;
    }

    // Family
    if (props.dbParameterGroupFamily) {
      attributes.family = props.dbParameterGroupFamily as string;
    }

    // Description
    if (props.description) {
      attributes.description = props.description as string;
    }

    // Parameters
    if (props.parameters && Array.isArray(props.parameters)) {
      const paramBlocks: TerraformValue[] = [];
      for (const param of props.parameters as Array<{ parameterName?: string; parameterValue?: string; applyMethod?: string }>) {
        if (param.parameterName && param.parameterValue !== undefined) {
          const paramAttrs: Record<string, TerraformValue> = {
            name: param.parameterName,
            value: param.parameterValue,
          };
          if (param.applyMethod) {
            paramAttrs.apply_method = param.applyMethod;
          }
          paramBlocks.push(this.createBlock(paramAttrs));
        }
      }
      if (paramBlocks.length > 0) {
        attributes.parameter = paramBlocks;
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
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return (resource.properties.dbParameterGroupName as string) || resource.id;
  }
}

/**
 * Get all RDS mappers
 */
export function getRDSMappers(): BaseResourceMapper[] {
  return [
    new RDSInstanceMapper(),
    new RDSClusterMapper(),
    new RDSSubnetGroupMapper(),
    new RDSParameterGroupMapper(),
  ];
}
