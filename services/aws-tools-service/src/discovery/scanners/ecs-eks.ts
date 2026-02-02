/**
 * ECS and EKS Scanner
 *
 * Discovers container orchestration resources including
 * ECS clusters, services, task definitions, and EKS clusters with node groups
 */

import {
  ECSClient,
  ListClustersCommand,
  DescribeClustersCommand,
  ListServicesCommand,
  DescribeServicesCommand,
  ListTaskDefinitionsCommand,
  DescribeTaskDefinitionCommand,
  ListTagsForResourceCommand as ECSListTagsCommand,
  type Cluster as ECSCluster,
  type Service as ECSService,
  type TaskDefinition,
} from '@aws-sdk/client-ecs';
import {
  EKSClient,
  ListClustersCommand as EKSListClustersCommand,
  DescribeClusterCommand,
  ListNodegroupsCommand,
  DescribeNodegroupCommand,
  type Cluster as EKSCluster,
  type Nodegroup,
} from '@aws-sdk/client-eks';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

/**
 * ECS/EKS Scanner - discovers container orchestration resources
 */
export class ECSEKSScanner extends BaseScanner {
  readonly serviceName = 'ECS';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    // Scan ECS and EKS in parallel
    const [ecsResources, eksResources] = await Promise.all([
      this.scanECS(context),
      this.scanEKS(context),
    ]);

    resources.push(...ecsResources, ...eksResources);

    logger.debug(`ECS/EKS scanner found ${resources.length} resources`, {
      region: context.region,
      ecsResources: ecsResources.length,
      eksResources: eksResources.length,
    });

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'AWS::ECS::Cluster',
      'AWS::ECS::Service',
      'AWS::ECS::TaskDefinition',
      'AWS::EKS::Cluster',
      'AWS::EKS::Nodegroup',
    ];
  }

  /**
   * Scan all ECS resources
   */
  private async scanECS(context: ScannerContext): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    const client = new ECSClient({
      region: context.region,
      credentials: context.credentials,
    });

    // Get clusters first, then services and task definitions
    const clusters = await this.scanECSClusters(client, context);
    resources.push(...clusters);

    // Get services for each cluster
    for (const cluster of clusters) {
      const services = await this.scanECSServices(client, cluster.arn, context);
      resources.push(...services);
    }

    // Get task definitions
    const taskDefinitions = await this.scanTaskDefinitions(client, context);
    resources.push(...taskDefinitions);

    return resources;
  }

  /**
   * Scan ECS clusters
   */
  private async scanECSClusters(
    client: ECSClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;
      const clusterArns: string[] = [];

      // List all cluster ARNs
      do {
        const listCommand = new ListClustersCommand({
          nextToken,
          maxResults: 100,
        });

        const listResponse = await this.withRateLimit(context, () => client.send(listCommand));

        if (listResponse.clusterArns) {
          clusterArns.push(...listResponse.clusterArns);
        }

        nextToken = listResponse.nextToken;
      } while (nextToken);

      // Describe clusters in batches of 100
      for (let i = 0; i < clusterArns.length; i += 100) {
        const batch = clusterArns.slice(i, i + 100);

        const describeCommand = new DescribeClustersCommand({
          clusters: batch,
          include: ['ATTACHMENTS', 'SETTINGS', 'CONFIGURATIONS', 'STATISTICS', 'TAGS'],
        });

        const describeResponse = await this.withRateLimit(context, () => client.send(describeCommand));

        if (describeResponse.clusters) {
          for (const cluster of describeResponse.clusters) {
            const resource = this.mapECSCluster(cluster, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }
      }
    } catch (error: any) {
      this.recordError('ListClusters', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan ECS services for a cluster
   */
  private async scanECSServices(
    client: ECSClient,
    clusterArn: string,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;
      const serviceArns: string[] = [];

      // List all service ARNs for the cluster
      do {
        const listCommand = new ListServicesCommand({
          cluster: clusterArn,
          nextToken,
          maxResults: 100,
        });

        const listResponse = await this.withRateLimit(context, () => client.send(listCommand));

        if (listResponse.serviceArns) {
          serviceArns.push(...listResponse.serviceArns);
        }

        nextToken = listResponse.nextToken;
      } while (nextToken);

      // Describe services in batches of 10
      for (let i = 0; i < serviceArns.length; i += 10) {
        const batch = serviceArns.slice(i, i + 10);

        const describeCommand = new DescribeServicesCommand({
          cluster: clusterArn,
          services: batch,
          include: ['TAGS'],
        });

        const describeResponse = await this.withRateLimit(context, () => client.send(describeCommand));

        if (describeResponse.services) {
          for (const service of describeResponse.services) {
            const resource = this.mapECSService(service, clusterArn, context);
            if (resource) {
              resources.push(resource);
            }
          }
        }
      }
    } catch (error: any) {
      this.recordError('ListServices', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan ECS task definitions
   */
  private async scanTaskDefinitions(
    client: ECSClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;
      const taskDefArns: string[] = [];

      // List active task definitions
      do {
        const listCommand = new ListTaskDefinitionsCommand({
          status: 'ACTIVE',
          nextToken,
          maxResults: 100,
        });

        const listResponse = await this.withRateLimit(context, () => client.send(listCommand));

        if (listResponse.taskDefinitionArns) {
          taskDefArns.push(...listResponse.taskDefinitionArns);
        }

        nextToken = listResponse.nextToken;
      } while (nextToken);

      // Describe each task definition
      for (const taskDefArn of taskDefArns) {
        try {
          const describeCommand = new DescribeTaskDefinitionCommand({
            taskDefinition: taskDefArn,
            include: ['TAGS'],
          });

          const describeResponse = await this.withRateLimit(context, () => client.send(describeCommand));

          if (describeResponse.taskDefinition) {
            const resource = this.mapTaskDefinition(
              describeResponse.taskDefinition,
              describeResponse.tags,
              context
            );
            if (resource) {
              resources.push(resource);
            }
          }
        } catch {
          // Skip task definitions that fail to describe
        }
      }
    } catch (error: any) {
      this.recordError('ListTaskDefinitions', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan all EKS resources
   */
  private async scanEKS(context: ScannerContext): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    const client = new EKSClient({
      region: context.region,
      credentials: context.credentials,
    });

    // Get clusters
    const clusters = await this.scanEKSClusters(client, context);
    resources.push(...clusters);

    // Get node groups for each cluster
    for (const cluster of clusters) {
      const nodeGroups = await this.scanNodeGroups(client, cluster.name || '', context);
      resources.push(...nodeGroups);
    }

    return resources;
  }

  /**
   * Scan EKS clusters
   */
  private async scanEKSClusters(
    client: EKSClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;
      const clusterNames: string[] = [];

      // List cluster names
      do {
        const listCommand = new EKSListClustersCommand({
          nextToken,
          maxResults: 100,
        });

        const listResponse = await this.withRateLimit(context, () => client.send(listCommand));

        if (listResponse.clusters) {
          clusterNames.push(...listResponse.clusters);
        }

        nextToken = listResponse.nextToken;
      } while (nextToken);

      // Describe each cluster
      for (const clusterName of clusterNames) {
        try {
          const describeCommand = new DescribeClusterCommand({
            name: clusterName,
          });

          const describeResponse = await this.withRateLimit(context, () => client.send(describeCommand));

          if (describeResponse.cluster) {
            const resource = this.mapEKSCluster(describeResponse.cluster, context);
            if (resource) {
              resources.push(resource);
            }
          }
        } catch {
          // Skip clusters that fail to describe
        }
      }
    } catch (error: any) {
      this.recordError('ListClusters', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Scan EKS node groups for a cluster
   */
  private async scanNodeGroups(
    client: EKSClient,
    clusterName: string,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      let nextToken: string | undefined;
      const nodeGroupNames: string[] = [];

      // List node group names
      do {
        const listCommand = new ListNodegroupsCommand({
          clusterName,
          nextToken,
          maxResults: 100,
        });

        const listResponse = await this.withRateLimit(context, () => client.send(listCommand));

        if (listResponse.nodegroups) {
          nodeGroupNames.push(...listResponse.nodegroups);
        }

        nextToken = listResponse.nextToken;
      } while (nextToken);

      // Describe each node group
      for (const nodeGroupName of nodeGroupNames) {
        try {
          const describeCommand = new DescribeNodegroupCommand({
            clusterName,
            nodegroupName: nodeGroupName,
          });

          const describeResponse = await this.withRateLimit(context, () => client.send(describeCommand));

          if (describeResponse.nodegroup) {
            const resource = this.mapNodeGroup(describeResponse.nodegroup, clusterName, context);
            if (resource) {
              resources.push(resource);
            }
          }
        } catch {
          // Skip node groups that fail to describe
        }
      }
    } catch (error: any) {
      this.recordError('ListNodegroups', error.message, context.region, error.code);
    }

    return resources;
  }

  /**
   * Map an ECS cluster to a DiscoveredResource
   */
  private mapECSCluster(cluster: ECSCluster, context: ScannerContext): DiscoveredResource | null {
    if (!cluster.clusterName || !cluster.clusterArn) return null;

    return this.createResource({
      id: cluster.clusterName,
      arn: cluster.clusterArn,
      awsType: 'AWS::ECS::Cluster',
      region: context.region,
      name: cluster.clusterName,
      tags: this.tagsToRecord(cluster.tags),
      properties: {
        status: cluster.status,
        registeredContainerInstancesCount: cluster.registeredContainerInstancesCount,
        runningTasksCount: cluster.runningTasksCount,
        pendingTasksCount: cluster.pendingTasksCount,
        activeServicesCount: cluster.activeServicesCount,
        capacityProviders: cluster.capacityProviders,
        defaultCapacityProviderStrategy: cluster.defaultCapacityProviderStrategy,
        settings: cluster.settings?.map(s => ({
          name: s.name,
          value: s.value,
        })),
        configuration: cluster.configuration
          ? {
              executeCommandConfiguration: cluster.configuration.executeCommandConfiguration,
            }
          : undefined,
        statistics: cluster.statistics?.map(s => ({
          name: s.name,
          value: s.value,
        })),
      },
      relationships: [],
      status: cluster.status,
    });
  }

  /**
   * Map an ECS service to a DiscoveredResource
   */
  private mapECSService(
    service: ECSService,
    clusterArn: string,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!service.serviceName || !service.serviceArn) return null;

    const relationships: ResourceRelationship[] = [];

    // Add cluster relationship
    relationships.push({
      type: 'contains',
      targetArn: clusterArn,
      targetType: 'aws_ecs_cluster',
    });

    // Add task definition relationship
    if (service.taskDefinition) {
      relationships.push({
        type: 'references',
        targetArn: service.taskDefinition,
        targetType: 'aws_ecs_task_definition',
      });
    }

    // Add IAM role relationship
    if (service.roleArn) {
      relationships.push({
        type: 'references',
        targetArn: service.roleArn,
        targetType: 'aws_iam_role',
      });
    }

    // Add load balancer relationships
    if (service.loadBalancers) {
      for (const lb of service.loadBalancers) {
        if (lb.targetGroupArn) {
          relationships.push({
            type: 'references',
            targetArn: lb.targetGroupArn,
            targetType: 'aws_lb_target_group',
          });
        }
      }
    }

    return this.createResource({
      id: service.serviceName,
      arn: service.serviceArn,
      awsType: 'AWS::ECS::Service',
      region: context.region,
      name: service.serviceName,
      tags: this.tagsToRecord(service.tags),
      properties: {
        clusterArn,
        taskDefinition: service.taskDefinition,
        desiredCount: service.desiredCount,
        runningCount: service.runningCount,
        pendingCount: service.pendingCount,
        launchType: service.launchType,
        capacityProviderStrategy: service.capacityProviderStrategy,
        platformVersion: service.platformVersion,
        platformFamily: service.platformFamily,
        deploymentConfiguration: service.deploymentConfiguration,
        loadBalancers: service.loadBalancers?.map(lb => ({
          targetGroupArn: lb.targetGroupArn,
          loadBalancerName: lb.loadBalancerName,
          containerName: lb.containerName,
          containerPort: lb.containerPort,
        })),
        serviceRegistries: service.serviceRegistries,
        schedulingStrategy: service.schedulingStrategy,
        networkConfiguration: service.networkConfiguration
          ? {
              awsvpcConfiguration: service.networkConfiguration.awsvpcConfiguration
                ? {
                    subnets: service.networkConfiguration.awsvpcConfiguration.subnets,
                    securityGroups: service.networkConfiguration.awsvpcConfiguration.securityGroups,
                    assignPublicIp: service.networkConfiguration.awsvpcConfiguration.assignPublicIp,
                  }
                : undefined,
            }
          : undefined,
        healthCheckGracePeriodSeconds: service.healthCheckGracePeriodSeconds,
        enableExecuteCommand: service.enableExecuteCommand,
        enableECSManagedTags: service.enableECSManagedTags,
        propagateTags: service.propagateTags,
        roleArn: service.roleArn,
      },
      relationships,
      createdAt: service.createdAt,
      status: service.status,
    });
  }

  /**
   * Map an ECS task definition to a DiscoveredResource
   */
  private mapTaskDefinition(
    taskDef: TaskDefinition,
    tags: Array<{ key?: string; value?: string }> | undefined,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!taskDef.taskDefinitionArn) return null;

    const relationships: ResourceRelationship[] = [];

    // Add execution role relationship
    if (taskDef.executionRoleArn) {
      relationships.push({
        type: 'references',
        targetArn: taskDef.executionRoleArn,
        targetType: 'aws_iam_role',
      });
    }

    // Add task role relationship
    if (taskDef.taskRoleArn) {
      relationships.push({
        type: 'references',
        targetArn: taskDef.taskRoleArn,
        targetType: 'aws_iam_role',
      });
    }

    const tagRecord = tags
      ? tags.reduce((acc, tag) => {
          if (tag.key) {
            acc[tag.key] = tag.value || '';
          }
          return acc;
        }, {} as Record<string, string>)
      : {};

    return this.createResource({
      id: `${taskDef.family}:${taskDef.revision}`,
      arn: taskDef.taskDefinitionArn,
      awsType: 'AWS::ECS::TaskDefinition',
      region: context.region,
      name: taskDef.family,
      tags: tagRecord,
      properties: {
        family: taskDef.family,
        revision: taskDef.revision,
        taskRoleArn: taskDef.taskRoleArn,
        executionRoleArn: taskDef.executionRoleArn,
        networkMode: taskDef.networkMode,
        requiresCompatibilities: taskDef.requiresCompatibilities,
        cpu: taskDef.cpu,
        memory: taskDef.memory,
        containerDefinitions: taskDef.containerDefinitions?.map(cd => ({
          name: cd.name,
          image: cd.image,
          cpu: cd.cpu,
          memory: cd.memory,
          memoryReservation: cd.memoryReservation,
          essential: cd.essential,
          portMappings: cd.portMappings?.map(pm => ({
            containerPort: pm.containerPort,
            hostPort: pm.hostPort,
            protocol: pm.protocol,
          })),
          environment: cd.environment?.map(e => ({
            name: e.name,
            value: e.value,
          })),
          secrets: cd.secrets?.map(s => ({
            name: s.name,
            valueFrom: s.valueFrom,
          })),
          logConfiguration: cd.logConfiguration
            ? {
                logDriver: cd.logConfiguration.logDriver,
                options: cd.logConfiguration.options,
              }
            : undefined,
          healthCheck: cd.healthCheck,
        })),
        volumes: taskDef.volumes?.map(v => ({
          name: v.name,
          host: v.host,
          efsVolumeConfiguration: v.efsVolumeConfiguration,
        })),
        placementConstraints: taskDef.placementConstraints,
        runtimePlatform: taskDef.runtimePlatform,
        ipcMode: taskDef.ipcMode,
        pidMode: taskDef.pidMode,
        proxyConfiguration: taskDef.proxyConfiguration,
        ephemeralStorage: taskDef.ephemeralStorage,
      },
      relationships,
      createdAt: taskDef.registeredAt,
      status: taskDef.status,
    });
  }

  /**
   * Map an EKS cluster to a DiscoveredResource
   */
  private mapEKSCluster(cluster: EKSCluster, context: ScannerContext): DiscoveredResource | null {
    if (!cluster.name || !cluster.arn) return null;

    const relationships: ResourceRelationship[] = [];

    // Add IAM role relationship
    if (cluster.roleArn) {
      relationships.push({
        type: 'references',
        targetArn: cluster.roleArn,
        targetType: 'aws_iam_role',
      });
    }

    // Add VPC relationships
    if (cluster.resourcesVpcConfig?.vpcId) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'vpc',
          resource: cluster.resourcesVpcConfig.vpcId,
        }),
        targetType: 'aws_vpc',
      });
    }

    // Add subnet relationships
    if (cluster.resourcesVpcConfig?.subnetIds) {
      for (const subnetId of cluster.resourcesVpcConfig.subnetIds) {
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
    if (cluster.resourcesVpcConfig?.securityGroupIds) {
      for (const sgId of cluster.resourcesVpcConfig.securityGroupIds) {
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

    return this.createResource({
      id: cluster.name,
      arn: cluster.arn,
      awsType: 'AWS::EKS::Cluster',
      region: context.region,
      name: cluster.name,
      tags: cluster.tags || {},
      properties: {
        version: cluster.version,
        roleArn: cluster.roleArn,
        endpoint: cluster.endpoint,
        certificateAuthority: cluster.certificateAuthority?.data ? '***REDACTED***' : undefined,
        resourcesVpcConfig: cluster.resourcesVpcConfig
          ? {
              vpcId: cluster.resourcesVpcConfig.vpcId,
              subnetIds: cluster.resourcesVpcConfig.subnetIds,
              securityGroupIds: cluster.resourcesVpcConfig.securityGroupIds,
              clusterSecurityGroupId: cluster.resourcesVpcConfig.clusterSecurityGroupId,
              endpointPublicAccess: cluster.resourcesVpcConfig.endpointPublicAccess,
              endpointPrivateAccess: cluster.resourcesVpcConfig.endpointPrivateAccess,
              publicAccessCidrs: cluster.resourcesVpcConfig.publicAccessCidrs,
            }
          : undefined,
        kubernetesNetworkConfig: cluster.kubernetesNetworkConfig
          ? {
              serviceIpv4Cidr: cluster.kubernetesNetworkConfig.serviceIpv4Cidr,
              serviceIpv6Cidr: cluster.kubernetesNetworkConfig.serviceIpv6Cidr,
              ipFamily: cluster.kubernetesNetworkConfig.ipFamily,
            }
          : undefined,
        logging: cluster.logging,
        identity: cluster.identity?.oidc?.issuer ? { oidcIssuer: cluster.identity.oidc.issuer } : undefined,
        platformVersion: cluster.platformVersion,
        encryptionConfig: cluster.encryptionConfig,
        connectorConfig: cluster.connectorConfig,
        health: cluster.health,
        accessConfig: cluster.accessConfig,
        upgradePolicy: cluster.upgradePolicy,
      },
      relationships,
      createdAt: cluster.createdAt,
      status: cluster.status,
    });
  }

  /**
   * Map an EKS node group to a DiscoveredResource
   */
  private mapNodeGroup(
    nodeGroup: Nodegroup,
    clusterName: string,
    context: ScannerContext
  ): DiscoveredResource | null {
    if (!nodeGroup.nodegroupName || !nodeGroup.nodegroupArn) return null;

    const relationships: ResourceRelationship[] = [];

    // Add cluster relationship
    if (nodeGroup.clusterName) {
      relationships.push({
        type: 'contains',
        targetArn: this.buildArn({
          service: 'eks',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'cluster',
          resource: nodeGroup.clusterName,
        }),
        targetType: 'aws_eks_cluster',
      });
    }

    // Add node role relationship
    if (nodeGroup.nodeRole) {
      relationships.push({
        type: 'references',
        targetArn: nodeGroup.nodeRole,
        targetType: 'aws_iam_role',
      });
    }

    // Add subnet relationships
    if (nodeGroup.subnets) {
      for (const subnetId of nodeGroup.subnets) {
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

    // Add launch template relationship
    if (nodeGroup.launchTemplate?.id) {
      relationships.push({
        type: 'references',
        targetArn: this.buildArn({
          service: 'ec2',
          region: context.region,
          accountId: context.accountId,
          resourceType: 'launch-template',
          resource: nodeGroup.launchTemplate.id,
        }),
        targetType: 'aws_launch_template',
      });
    }

    return this.createResource({
      id: nodeGroup.nodegroupName,
      arn: nodeGroup.nodegroupArn,
      awsType: 'AWS::EKS::Nodegroup',
      region: context.region,
      name: nodeGroup.nodegroupName,
      tags: nodeGroup.tags || {},
      properties: {
        clusterName: nodeGroup.clusterName,
        version: nodeGroup.version,
        releaseVersion: nodeGroup.releaseVersion,
        nodeRole: nodeGroup.nodeRole,
        subnets: nodeGroup.subnets,
        scalingConfig: nodeGroup.scalingConfig
          ? {
              minSize: nodeGroup.scalingConfig.minSize,
              maxSize: nodeGroup.scalingConfig.maxSize,
              desiredSize: nodeGroup.scalingConfig.desiredSize,
            }
          : undefined,
        instanceTypes: nodeGroup.instanceTypes,
        amiType: nodeGroup.amiType,
        diskSize: nodeGroup.diskSize,
        capacityType: nodeGroup.capacityType,
        labels: nodeGroup.labels,
        taints: nodeGroup.taints?.map(t => ({
          key: t.key,
          value: t.value,
          effect: t.effect,
        })),
        remoteAccess: nodeGroup.remoteAccess
          ? {
              ec2SshKey: nodeGroup.remoteAccess.ec2SshKey,
              sourceSecurityGroups: nodeGroup.remoteAccess.sourceSecurityGroups,
            }
          : undefined,
        launchTemplate: nodeGroup.launchTemplate
          ? {
              id: nodeGroup.launchTemplate.id,
              name: nodeGroup.launchTemplate.name,
              version: nodeGroup.launchTemplate.version,
            }
          : undefined,
        updateConfig: nodeGroup.updateConfig,
        health: nodeGroup.health,
      },
      relationships,
      createdAt: nodeGroup.createdAt,
      status: nodeGroup.status,
    });
  }
}
