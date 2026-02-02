/**
 * ECS/EKS Resource Mappers
 *
 * Maps ECS and EKS resources to Terraform configuration
 */

import type { DiscoveredResource } from '../../discovery/types';
import type {
  MappingContext,
  TerraformResource,
  TerraformOutput,
  TerraformValue,
} from '../types';
import { BaseResourceMapper } from './base';

// ============================================================================
// ECS Mappers
// ============================================================================

/**
 * ECS Cluster Mapper
 */
export class ECSClusterMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::ECS::Cluster';
  readonly terraformType = 'aws_ecs_cluster';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Cluster name
    if (props.clusterName) {
      attributes.name = props.clusterName as string;
    }

    // Capacity providers
    if (props.capacityProviders && Array.isArray(props.capacityProviders)) {
      // Note: Capacity provider associations are managed separately in newer TF
    }

    // Settings (Container Insights)
    if (props.settings && Array.isArray(props.settings)) {
      const containerInsights = (props.settings as Array<{ name?: string; value?: string }>)
        .find(s => s.name === 'containerInsights');
      if (containerInsights?.value) {
        attributes.setting = this.createBlock({
          name: 'containerInsights',
          value: containerInsights.value,
        });
      }
    }

    // Configuration
    if (props.configuration && typeof props.configuration === 'object') {
      const config = props.configuration as {
        executeCommandConfiguration?: {
          kmsKeyId?: string;
          logging?: string;
          logConfiguration?: {
            cloudWatchLogGroupName?: string;
            s3BucketName?: string;
            s3KeyPrefix?: string;
          };
        };
      };

      if (config.executeCommandConfiguration) {
        const execConfig = config.executeCommandConfiguration;
        const execAttrs: Record<string, TerraformValue> = {};

        if (execConfig.kmsKeyId) {
          execAttrs.kms_key_id = execConfig.kmsKeyId;
        }
        if (execConfig.logging) {
          execAttrs.logging = execConfig.logging;
        }
        if (execConfig.logConfiguration) {
          const logAttrs: Record<string, TerraformValue> = {};
          if (execConfig.logConfiguration.cloudWatchLogGroupName) {
            logAttrs.cloud_watch_log_group_name = execConfig.logConfiguration.cloudWatchLogGroupName;
          }
          if (execConfig.logConfiguration.s3BucketName) {
            logAttrs.s3_bucket_name = execConfig.logConfiguration.s3BucketName;
          }
          if (execConfig.logConfiguration.s3KeyPrefix) {
            logAttrs.s3_key_prefix = execConfig.logConfiguration.s3KeyPrefix;
          }
          if (Object.keys(logAttrs).length > 0) {
            execAttrs.log_configuration = this.createBlock(logAttrs);
          }
        }

        if (Object.keys(execAttrs).length > 0) {
          attributes.configuration = this.createBlock({
            execute_command_configuration: this.createBlock(execAttrs),
          });
        }
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
    return (resource.properties.clusterName as string) || resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_arn`,
        value: `aws_ecs_cluster.${name}.arn`,
        description: `ARN of ECS cluster ${resource.properties.clusterName || resource.id}`,
      },
      {
        name: `${name}_id`,
        value: `aws_ecs_cluster.${name}.id`,
        description: `ID of ECS cluster ${resource.properties.clusterName || resource.id}`,
      },
    ];
  }
}

/**
 * ECS Service Mapper
 */
export class ECSServiceMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::ECS::Service';
  readonly terraformType = 'aws_ecs_service';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Service name
    if (props.serviceName) {
      attributes.name = props.serviceName as string;
    }

    // Cluster
    if (props.clusterArn) {
      attributes.cluster = props.clusterArn as string;
    }

    // Task definition
    if (props.taskDefinition) {
      attributes.task_definition = props.taskDefinition as string;
    }

    // Desired count
    if (props.desiredCount !== undefined) {
      attributes.desired_count = props.desiredCount as number;
    }

    // Launch type
    if (props.launchType) {
      attributes.launch_type = props.launchType as string;
    }

    // Platform version (for Fargate)
    if (props.platformVersion) {
      attributes.platform_version = props.platformVersion as string;
    }

    // Scheduling strategy
    if (props.schedulingStrategy) {
      attributes.scheduling_strategy = props.schedulingStrategy as string;
    }

    // Network configuration
    if (props.networkConfiguration && typeof props.networkConfiguration === 'object') {
      const netConfig = props.networkConfiguration as {
        awsvpcConfiguration?: {
          subnets?: string[];
          securityGroups?: string[];
          assignPublicIp?: string;
        };
      };

      if (netConfig.awsvpcConfiguration) {
        const awsvpc = netConfig.awsvpcConfiguration;
        const netAttrs: Record<string, TerraformValue> = {};

        if (awsvpc.subnets) {
          netAttrs.subnets = awsvpc.subnets;
        }
        if (awsvpc.securityGroups) {
          netAttrs.security_groups = awsvpc.securityGroups;
        }
        if (awsvpc.assignPublicIp) {
          netAttrs.assign_public_ip = awsvpc.assignPublicIp === 'ENABLED';
        }

        attributes.network_configuration = this.createBlock(netAttrs);
      }
    }

    // Load balancers
    if (props.loadBalancers && Array.isArray(props.loadBalancers)) {
      const lbBlocks: TerraformValue[] = [];
      for (const lb of props.loadBalancers as Array<{
        targetGroupArn?: string;
        containerName?: string;
        containerPort?: number;
      }>) {
        const lbAttrs: Record<string, TerraformValue> = {};
        if (lb.targetGroupArn) {
          lbAttrs.target_group_arn = lb.targetGroupArn;
        }
        if (lb.containerName) {
          lbAttrs.container_name = lb.containerName;
        }
        if (lb.containerPort !== undefined) {
          lbAttrs.container_port = lb.containerPort;
        }
        if (Object.keys(lbAttrs).length > 0) {
          lbBlocks.push(this.createBlock(lbAttrs));
        }
      }
      if (lbBlocks.length > 0) {
        attributes.load_balancer = lbBlocks;
      }
    }

    // Service registries (Cloud Map)
    if (props.serviceRegistries && Array.isArray(props.serviceRegistries)) {
      const regBlocks: TerraformValue[] = [];
      for (const reg of props.serviceRegistries as Array<{
        registryArn?: string;
        port?: number;
        containerName?: string;
        containerPort?: number;
      }>) {
        const regAttrs: Record<string, TerraformValue> = {};
        if (reg.registryArn) {
          regAttrs.registry_arn = reg.registryArn;
        }
        if (reg.port !== undefined) {
          regAttrs.port = reg.port;
        }
        if (reg.containerName) {
          regAttrs.container_name = reg.containerName;
        }
        if (reg.containerPort !== undefined) {
          regAttrs.container_port = reg.containerPort;
        }
        if (Object.keys(regAttrs).length > 0) {
          regBlocks.push(this.createBlock(regAttrs));
        }
      }
      if (regBlocks.length > 0) {
        attributes.service_registries = regBlocks;
      }
    }

    // Deployment configuration
    if (props.deploymentConfiguration && typeof props.deploymentConfiguration === 'object') {
      const deploy = props.deploymentConfiguration as {
        maximumPercent?: number;
        minimumHealthyPercent?: number;
      };
      const deployAttrs: Record<string, TerraformValue> = {};
      if (deploy.maximumPercent !== undefined) {
        deployAttrs.maximum_percent = deploy.maximumPercent;
      }
      if (deploy.minimumHealthyPercent !== undefined) {
        deployAttrs.minimum_healthy_percent = deploy.minimumHealthyPercent;
      }
      if (Object.keys(deployAttrs).length > 0) {
        attributes.deployment_configuration = this.createBlock(deployAttrs);
      }
    }

    // Enable execute command
    if (props.enableExecuteCommand !== undefined) {
      attributes.enable_execute_command = props.enableExecuteCommand as boolean;
    }

    // Health check grace period
    if (props.healthCheckGracePeriodSeconds !== undefined) {
      attributes.health_check_grace_period_seconds = props.healthCheckGracePeriodSeconds as number;
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
        ignoreChanges: ['task_definition'],
      },
    };
  }

  getImportId(resource: DiscoveredResource): string {
    // ECS service import format: cluster/service
    const clusterArn = resource.properties.clusterArn as string;
    const clusterName = clusterArn?.split('/').pop() || 'default';
    const serviceName = resource.properties.serviceName as string;
    return `${clusterName}/${serviceName}`;
  }
}

/**
 * ECS Task Definition Mapper
 */
export class ECSTaskDefinitionMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::ECS::TaskDefinition';
  readonly terraformType = 'aws_ecs_task_definition';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Family
    if (props.family) {
      attributes.family = props.family as string;
    }

    // Task role ARN
    if (props.taskRoleArn) {
      attributes.task_role_arn = props.taskRoleArn as string;
    }

    // Execution role ARN
    if (props.executionRoleArn) {
      attributes.execution_role_arn = props.executionRoleArn as string;
    }

    // Network mode
    if (props.networkMode) {
      attributes.network_mode = props.networkMode as string;
    }

    // Requires compatibilities
    if (props.requiresCompatibilities && Array.isArray(props.requiresCompatibilities)) {
      attributes.requires_compatibilities = props.requiresCompatibilities as string[];
    }

    // CPU and memory (for Fargate)
    if (props.cpu) {
      attributes.cpu = props.cpu as string;
    }

    if (props.memory) {
      attributes.memory = props.memory as string;
    }

    // Container definitions - stored as JSON
    if (props.containerDefinitions && Array.isArray(props.containerDefinitions)) {
      attributes.container_definitions = JSON.stringify(props.containerDefinitions, null, 2);
    }

    // Volumes
    if (props.volumes && Array.isArray(props.volumes)) {
      const volumeBlocks: TerraformValue[] = [];
      for (const vol of props.volumes as Array<{
        name?: string;
        host?: { sourcePath?: string };
        efsVolumeConfiguration?: {
          fileSystemId?: string;
          rootDirectory?: string;
          transitEncryption?: string;
        };
      }>) {
        const volAttrs: Record<string, TerraformValue> = {};
        if (vol.name) {
          volAttrs.name = vol.name;
        }
        if (vol.host?.sourcePath) {
          volAttrs.host_path = vol.host.sourcePath;
        }
        if (vol.efsVolumeConfiguration) {
          const efsAttrs: Record<string, TerraformValue> = {};
          if (vol.efsVolumeConfiguration.fileSystemId) {
            efsAttrs.file_system_id = vol.efsVolumeConfiguration.fileSystemId;
          }
          if (vol.efsVolumeConfiguration.rootDirectory) {
            efsAttrs.root_directory = vol.efsVolumeConfiguration.rootDirectory;
          }
          if (vol.efsVolumeConfiguration.transitEncryption) {
            efsAttrs.transit_encryption = vol.efsVolumeConfiguration.transitEncryption;
          }
          volAttrs.efs_volume_configuration = this.createBlock(efsAttrs);
        }
        if (Object.keys(volAttrs).length > 0) {
          volumeBlocks.push(this.createBlock(volAttrs));
        }
      }
      if (volumeBlocks.length > 0) {
        attributes.volume = volumeBlocks;
      }
    }

    // Runtime platform
    if (props.runtimePlatform && typeof props.runtimePlatform === 'object') {
      const runtime = props.runtimePlatform as {
        cpuArchitecture?: string;
        operatingSystemFamily?: string;
      };
      const runtimeAttrs: Record<string, TerraformValue> = {};
      if (runtime.cpuArchitecture) {
        runtimeAttrs.cpu_architecture = runtime.cpuArchitecture;
      }
      if (runtime.operatingSystemFamily) {
        runtimeAttrs.operating_system_family = runtime.operatingSystemFamily;
      }
      if (Object.keys(runtimeAttrs).length > 0) {
        attributes.runtime_platform = this.createBlock(runtimeAttrs);
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
    return resource.arn || resource.id;
  }
}

// ============================================================================
// EKS Mappers
// ============================================================================

/**
 * EKS Cluster Mapper
 */
export class EKSClusterMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EKS::Cluster';
  readonly terraformType = 'aws_eks_cluster';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Cluster name
    if (props.name) {
      attributes.name = props.name as string;
    }

    // Role ARN
    if (props.roleArn) {
      attributes.role_arn = props.roleArn as string;
    }

    // Version
    if (props.version) {
      attributes.version = props.version as string;
    }

    // VPC config
    if (props.resourcesVpcConfig && typeof props.resourcesVpcConfig === 'object') {
      const vpcConfig = props.resourcesVpcConfig as {
        subnetIds?: string[];
        securityGroupIds?: string[];
        endpointPublicAccess?: boolean;
        endpointPrivateAccess?: boolean;
        publicAccessCidrs?: string[];
      };

      const vpcAttrs: Record<string, TerraformValue> = {};
      if (vpcConfig.subnetIds) {
        vpcAttrs.subnet_ids = vpcConfig.subnetIds;
      }
      if (vpcConfig.securityGroupIds) {
        vpcAttrs.security_group_ids = vpcConfig.securityGroupIds;
      }
      if (vpcConfig.endpointPublicAccess !== undefined) {
        vpcAttrs.endpoint_public_access = vpcConfig.endpointPublicAccess;
      }
      if (vpcConfig.endpointPrivateAccess !== undefined) {
        vpcAttrs.endpoint_private_access = vpcConfig.endpointPrivateAccess;
      }
      if (vpcConfig.publicAccessCidrs) {
        vpcAttrs.public_access_cidrs = vpcConfig.publicAccessCidrs;
      }

      attributes.vpc_config = this.createBlock(vpcAttrs);
    }

    // Encryption config
    if (props.encryptionConfig && Array.isArray(props.encryptionConfig)) {
      const encConfig = (props.encryptionConfig as Array<{
        provider?: { keyArn?: string };
        resources?: string[];
      }>)[0];

      if (encConfig) {
        const encAttrs: Record<string, TerraformValue> = {};
        if (encConfig.provider?.keyArn) {
          encAttrs.provider = this.createBlock({
            key_arn: encConfig.provider.keyArn,
          });
        }
        if (encConfig.resources) {
          encAttrs.resources = encConfig.resources;
        }
        if (Object.keys(encAttrs).length > 0) {
          attributes.encryption_config = this.createBlock(encAttrs);
        }
      }
    }

    // Kubernetes network config
    if (props.kubernetesNetworkConfig && typeof props.kubernetesNetworkConfig === 'object') {
      const k8sNet = props.kubernetesNetworkConfig as {
        serviceIpv4Cidr?: string;
        ipFamily?: string;
      };

      const k8sNetAttrs: Record<string, TerraformValue> = {};
      if (k8sNet.serviceIpv4Cidr) {
        k8sNetAttrs.service_ipv4_cidr = k8sNet.serviceIpv4Cidr;
      }
      if (k8sNet.ipFamily) {
        k8sNetAttrs.ip_family = k8sNet.ipFamily;
      }
      if (Object.keys(k8sNetAttrs).length > 0) {
        attributes.kubernetes_network_config = this.createBlock(k8sNetAttrs);
      }
    }

    // Logging
    if (props.logging && typeof props.logging === 'object') {
      const logging = props.logging as {
        clusterLogging?: Array<{ types?: string[]; enabled?: boolean }>;
      };

      if (logging.clusterLogging) {
        const enabledTypes = logging.clusterLogging
          .filter(l => l.enabled)
          .flatMap(l => l.types || []);

        if (enabledTypes.length > 0) {
          attributes.enabled_cluster_log_types = enabledTypes;
        }
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
    return (resource.properties.name as string) || resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_endpoint`,
        value: `aws_eks_cluster.${name}.endpoint`,
        description: `Endpoint of EKS cluster ${resource.properties.name || resource.id}`,
      },
      {
        name: `${name}_arn`,
        value: `aws_eks_cluster.${name}.arn`,
        description: `ARN of EKS cluster ${resource.properties.name || resource.id}`,
      },
      {
        name: `${name}_certificate_authority`,
        value: `aws_eks_cluster.${name}.certificate_authority[0].data`,
        description: `Certificate authority data of EKS cluster ${resource.properties.name || resource.id}`,
      },
    ];
  }
}

/**
 * EKS Node Group Mapper
 */
export class EKSNodeGroupMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::EKS::Nodegroup';
  readonly terraformType = 'aws_eks_node_group';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Cluster name
    if (props.clusterName) {
      attributes.cluster_name = props.clusterName as string;
    }

    // Node group name
    if (props.nodegroupName) {
      attributes.node_group_name = props.nodegroupName as string;
    }

    // Node role ARN
    if (props.nodeRole) {
      attributes.node_role_arn = props.nodeRole as string;
    }

    // Subnets
    if (props.subnets && Array.isArray(props.subnets)) {
      attributes.subnet_ids = props.subnets as string[];
    }

    // Scaling config
    if (props.scalingConfig && typeof props.scalingConfig === 'object') {
      const scaling = props.scalingConfig as {
        minSize?: number;
        maxSize?: number;
        desiredSize?: number;
      };

      const scalingAttrs: Record<string, TerraformValue> = {};
      if (scaling.minSize !== undefined) {
        scalingAttrs.min_size = scaling.minSize;
      }
      if (scaling.maxSize !== undefined) {
        scalingAttrs.max_size = scaling.maxSize;
      }
      if (scaling.desiredSize !== undefined) {
        scalingAttrs.desired_size = scaling.desiredSize;
      }

      attributes.scaling_config = this.createBlock(scalingAttrs);
    }

    // Instance types
    if (props.instanceTypes && Array.isArray(props.instanceTypes)) {
      attributes.instance_types = props.instanceTypes as string[];
    }

    // AMI type
    if (props.amiType) {
      attributes.ami_type = props.amiType as string;
    }

    // Capacity type
    if (props.capacityType) {
      attributes.capacity_type = props.capacityType as string;
    }

    // Disk size
    if (props.diskSize) {
      attributes.disk_size = props.diskSize as number;
    }

    // Labels
    if (props.labels && typeof props.labels === 'object') {
      attributes.labels = props.labels as Record<string, string>;
    }

    // Taints
    if (props.taints && Array.isArray(props.taints)) {
      const taintBlocks: TerraformValue[] = [];
      for (const taint of props.taints as Array<{
        key?: string;
        value?: string;
        effect?: string;
      }>) {
        const taintAttrs: Record<string, TerraformValue> = {};
        if (taint.key) {
          taintAttrs.key = taint.key;
        }
        if (taint.value) {
          taintAttrs.value = taint.value;
        }
        if (taint.effect) {
          taintAttrs.effect = taint.effect;
        }
        if (Object.keys(taintAttrs).length > 0) {
          taintBlocks.push(this.createBlock(taintAttrs));
        }
      }
      if (taintBlocks.length > 0) {
        attributes.taint = taintBlocks;
      }
    }

    // Remote access
    if (props.remoteAccess && typeof props.remoteAccess === 'object') {
      const remote = props.remoteAccess as {
        ec2SshKey?: string;
        sourceSecurityGroups?: string[];
      };

      const remoteAttrs: Record<string, TerraformValue> = {};
      if (remote.ec2SshKey) {
        remoteAttrs.ec2_ssh_key = remote.ec2SshKey;
      }
      if (remote.sourceSecurityGroups) {
        remoteAttrs.source_security_group_ids = remote.sourceSecurityGroups;
      }
      if (Object.keys(remoteAttrs).length > 0) {
        attributes.remote_access = this.createBlock(remoteAttrs);
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
    const clusterName = resource.properties.clusterName as string;
    const nodeGroupName = resource.properties.nodegroupName as string;
    return `${clusterName}:${nodeGroupName}`;
  }
}

/**
 * Get all ECS mappers
 */
export function getECSMappers(): BaseResourceMapper[] {
  return [
    new ECSClusterMapper(),
    new ECSServiceMapper(),
    new ECSTaskDefinitionMapper(),
  ];
}

/**
 * Get all EKS mappers
 */
export function getEKSMappers(): BaseResourceMapper[] {
  return [
    new EKSClusterMapper(),
    new EKSNodeGroupMapper(),
  ];
}
