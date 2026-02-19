/**
 * GCP VPC Operations
 *
 * Provides operations for managing VPC networks and subnets
 */

import { logger } from '@nimbus/shared-utils';

const compute = require('@google-cloud/compute');

export interface VPCConfig {
  projectId?: string;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * VPC operations using Google Cloud SDK
 */
export class VPCOperations {
  private projectId: string;

  constructor(config: VPCConfig = {}) {
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  }

  /**
   * List VPC networks
   */
  async listNetworks(project?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.' };
      }

      const networksClient = new compute.NetworksClient();
      const [networks] = await networksClient.list({
        project: effectiveProject,
      });

      const mappedNetworks = (networks || []).map((network: any) => ({
        id: network.id,
        name: network.name,
        selfLink: network.selfLink,
        description: network.description,
        autoCreateSubnetworks: network.autoCreateSubnetworks,
        routingConfig: network.routingConfig ? {
          routingMode: network.routingConfig.routingMode,
        } : null,
        subnetworks: network.subnetworks || [],
        peerings: (network.peerings || []).map((peering: any) => ({
          name: peering.name,
          network: peering.network,
          state: peering.state,
          autoCreateRoutes: peering.autoCreateRoutes,
          exportCustomRoutes: peering.exportCustomRoutes,
          importCustomRoutes: peering.importCustomRoutes,
        })),
        mtu: network.mtu,
        creationTimestamp: network.creationTimestamp,
      }));

      return {
        success: true,
        data: { networks: mappedNetworks },
      };
    } catch (error: any) {
      logger.error('Failed to list VPC networks', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List VPC subnetworks
   */
  async listSubnets(project?: string, region?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.' };
      }

      const subnetworksClient = new compute.SubnetworksClient();
      const subnets: any[] = [];

      if (region) {
        const [response] = await subnetworksClient.list({
          project: effectiveProject,
          region,
        });
        for (const subnet of response || []) {
          subnets.push(this.mapSubnet(subnet));
        }
      } else {
        const aggListRequest = subnetworksClient.aggregatedListAsync({
          project: effectiveProject,
        });
        for await (const [regionKey, scopedList] of aggListRequest) {
          if (scopedList.subnetworks) {
            for (const subnet of scopedList.subnetworks) {
              subnets.push(this.mapSubnet(subnet));
            }
          }
        }
      }

      return {
        success: true,
        data: { subnets },
      };
    } catch (error: any) {
      logger.error('Failed to list subnets', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Map a subnet to a clean object
   */
  private mapSubnet(subnet: any): Record<string, unknown> {
    return {
      id: subnet.id,
      name: subnet.name,
      selfLink: subnet.selfLink,
      description: subnet.description,
      network: subnet.network?.split('/').pop(),
      region: subnet.region?.split('/').pop(),
      ipCidrRange: subnet.ipCidrRange,
      gatewayAddress: subnet.gatewayAddress,
      privateIpGoogleAccess: subnet.privateIpGoogleAccess,
      purpose: subnet.purpose,
      role: subnet.role,
      state: subnet.state,
      logConfig: subnet.logConfig || null,
      secondaryIpRanges: (subnet.secondaryIpRanges || []).map((range: any) => ({
        rangeName: range.rangeName,
        ipCidrRange: range.ipCidrRange,
      })),
      stackType: subnet.stackType,
      creationTimestamp: subnet.creationTimestamp,
    };
  }
}
