/**
 * Azure Networking Operations
 *
 * Provides operations for managing Azure Virtual Networks and Subnets
 * using @azure/arm-network
 */

import { NetworkManagementClient } from '@azure/arm-network';
import { DefaultAzureCredential } from '@azure/identity';
import { logger } from '@nimbus/shared-utils';
import type { AzureOperationResult } from './compute';

export interface NetworkOperationsConfig {
  subscriptionId?: string;
}

/**
 * Azure Network Operations
 */
export class NetworkOperations {
  private subscriptionId: string;
  private credential: DefaultAzureCredential;
  private client: NetworkManagementClient;

  constructor(config: NetworkOperationsConfig = {}) {
    this.subscriptionId = config.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.credential = new DefaultAzureCredential();
    this.client = new NetworkManagementClient(this.credential, this.subscriptionId);
  }

  /**
   * List virtual networks, optionally filtered by resource group
   */
  async listVNets(
    subscriptionId?: string,
    resourceGroup?: string
  ): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const client = subscriptionId
        ? new NetworkManagementClient(this.credential, subId)
        : this.client;

      const vnets: any[] = [];

      if (resourceGroup) {
        for await (const vnet of client.virtualNetworks.list(resourceGroup)) {
          vnets.push(this.mapVNet(vnet));
        }
      } else {
        for await (const vnet of client.virtualNetworks.listAll()) {
          vnets.push(this.mapVNet(vnet));
        }
      }

      logger.debug(`Listed ${vnets.length} virtual networks`, { resourceGroup });
      return { success: true, data: { vnets, count: vnets.length } };
    } catch (error: any) {
      logger.error('Failed to list virtual networks', error);
      return { success: false, error: error.message || 'Failed to list virtual networks' };
    }
  }

  /**
   * List subnets for a virtual network
   */
  async listSubnets(
    subscriptionId: string,
    resourceGroup: string,
    vnetName: string
  ): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const client = subscriptionId
        ? new NetworkManagementClient(this.credential, subId)
        : this.client;

      const subnets: any[] = [];

      for await (const subnet of client.subnets.list(resourceGroup, vnetName)) {
        subnets.push({
          id: subnet.id,
          name: subnet.name,
          type: subnet.type,
          addressPrefix: subnet.addressPrefix,
          addressPrefixes: subnet.addressPrefixes,
          provisioningState: subnet.provisioningState,
          privateEndpointNetworkPolicies: subnet.privateEndpointNetworkPolicies,
          privateLinkServiceNetworkPolicies: subnet.privateLinkServiceNetworkPolicies,
          networkSecurityGroup: subnet.networkSecurityGroup
            ? { id: subnet.networkSecurityGroup.id }
            : undefined,
          routeTable: subnet.routeTable
            ? { id: subnet.routeTable.id }
            : undefined,
          serviceEndpoints: subnet.serviceEndpoints?.map((se: any) => ({
            service: se.service,
            locations: se.locations,
            provisioningState: se.provisioningState,
          })),
          delegations: subnet.delegations?.map((d: any) => ({
            name: d.name,
            serviceName: d.serviceName,
            provisioningState: d.provisioningState,
          })),
          ipAllocations: subnet.ipAllocations?.map((ip: any) => ({ id: ip.id })),
        });
      }

      logger.debug(`Listed ${subnets.length} subnets for VNet ${vnetName}`);
      return { success: true, data: { subnets, count: subnets.length } };
    } catch (error: any) {
      logger.error('Failed to list subnets', { vnetName, error });
      return { success: false, error: error.message || 'Failed to list subnets' };
    }
  }

  /**
   * Map a VNet to a normalized response format
   */
  private mapVNet(vnet: any): any {
    return {
      id: vnet.id,
      name: vnet.name,
      location: vnet.location,
      type: vnet.type,
      provisioningState: vnet.provisioningState,
      addressSpace: vnet.addressSpace?.addressPrefixes,
      dhcpOptions: vnet.dhcpOptions?.dnsServers,
      enableDdosProtection: vnet.enableDdosProtection,
      enableVmProtection: vnet.enableVmProtection,
      subnets: vnet.subnets?.map((s: any) => ({
        id: s.id,
        name: s.name,
        addressPrefix: s.addressPrefix,
        provisioningState: s.provisioningState,
      })),
      virtualNetworkPeerings: vnet.virtualNetworkPeerings?.map((p: any) => ({
        id: p.id,
        name: p.name,
        peeringState: p.peeringState,
        remoteVirtualNetwork: p.remoteVirtualNetwork?.id,
      })),
      tags: vnet.tags || {},
    };
  }
}
