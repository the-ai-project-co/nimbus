/**
 * Azure Kubernetes Service (AKS) Operations
 *
 * Provides operations for managing AKS clusters using @azure/arm-containerservice
 */

import { ContainerServiceClient } from '@azure/arm-containerservice';
import { DefaultAzureCredential } from '@azure/identity';
import { logger } from '@nimbus/shared-utils';
import type { AzureOperationResult } from './compute';

export interface AKSOperationsConfig {
  subscriptionId?: string;
}

/**
 * Azure AKS Operations
 */
export class AKSOperations {
  private subscriptionId: string;
  private credential: DefaultAzureCredential;
  private client: ContainerServiceClient;

  constructor(config: AKSOperationsConfig = {}) {
    this.subscriptionId = config.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.credential = new DefaultAzureCredential();
    this.client = new ContainerServiceClient(this.credential, this.subscriptionId);
  }

  /**
   * List AKS clusters, optionally filtered by resource group
   */
  async listClusters(
    subscriptionId?: string,
    resourceGroup?: string
  ): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const client = subscriptionId
        ? new ContainerServiceClient(this.credential, subId)
        : this.client;

      const clusters: any[] = [];

      if (resourceGroup) {
        for await (const cluster of client.managedClusters.listByResourceGroup(resourceGroup)) {
          clusters.push(this.mapCluster(cluster));
        }
      } else {
        for await (const cluster of client.managedClusters.list()) {
          clusters.push(this.mapCluster(cluster));
        }
      }

      logger.debug(`Listed ${clusters.length} AKS clusters`, { resourceGroup });
      return { success: true, data: { clusters, count: clusters.length } };
    } catch (error: any) {
      logger.error('Failed to list AKS clusters', error);
      return { success: false, error: error.message || 'Failed to list AKS clusters' };
    }
  }

  /**
   * Get detailed information about a specific AKS cluster
   */
  async describeCluster(
    subscriptionId: string,
    resourceGroup: string,
    clusterName: string
  ): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const client = subscriptionId
        ? new ContainerServiceClient(this.credential, subId)
        : this.client;

      const cluster = await client.managedClusters.get(resourceGroup, clusterName);

      logger.debug(`Described AKS cluster ${clusterName}`);
      return { success: true, data: this.mapCluster(cluster) };
    } catch (error: any) {
      logger.error('Failed to describe AKS cluster', { clusterName, error });
      return { success: false, error: error.message || 'Failed to describe AKS cluster' };
    }
  }

  /**
   * Map an AKS cluster to a normalized response format
   */
  private mapCluster(cluster: any): any {
    return {
      id: cluster.id,
      name: cluster.name,
      location: cluster.location,
      type: cluster.type,
      kubernetesVersion: cluster.kubernetesVersion,
      dnsPrefix: cluster.dnsPrefix,
      fqdn: cluster.fqdn,
      provisioningState: cluster.provisioningState,
      powerState: cluster.powerState?.code,
      nodeResourceGroup: cluster.nodeResourceGroup,
      enableRBAC: cluster.enableRBAC,
      networkProfile: cluster.networkProfile
        ? {
            networkPlugin: cluster.networkProfile.networkPlugin,
            networkPolicy: cluster.networkProfile.networkPolicy,
            podCidr: cluster.networkProfile.podCidr,
            serviceCidr: cluster.networkProfile.serviceCidr,
            dnsServiceIP: cluster.networkProfile.dnsServiceIP,
            loadBalancerSku: cluster.networkProfile.loadBalancerSku,
          }
        : undefined,
      agentPoolProfiles: cluster.agentPoolProfiles?.map((pool: any) => ({
        name: pool.name,
        count: pool.count,
        vmSize: pool.vmSize,
        osType: pool.osType,
        osDiskSizeGB: pool.osDiskSizeGB,
        mode: pool.mode,
        maxPods: pool.maxPods,
        enableAutoScaling: pool.enableAutoScaling,
        minCount: pool.minCount,
        maxCount: pool.maxCount,
        availabilityZones: pool.availabilityZones,
        provisioningState: pool.provisioningState,
      })),
      identity: cluster.identity
        ? {
            type: cluster.identity.type,
            principalId: cluster.identity.principalId,
            tenantId: cluster.identity.tenantId,
          }
        : undefined,
      tags: cluster.tags || {},
    };
  }
}
