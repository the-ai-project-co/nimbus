/**
 * Azure AKS Scanner
 *
 * Discovers Azure Kubernetes Service (AKS) clusters
 */

import { ContainerServiceClient } from '@azure/arm-containerservice';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

export class AKSScanner extends BaseScanner {
  readonly serviceName = 'AKS';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new ContainerServiceClient(
      context.credential,
      context.subscriptionId
    );

    try {
      for await (const cluster of client.managedClusters.list()) {
        if (!cluster.id || !cluster.location) continue;
        if (cluster.location.toLowerCase().replace(/\s/g, '') !== context.region.toLowerCase().replace(/\s/g, '')) continue;

        const relationships: ResourceRelationship[] = [];

        // Add VNet references from agent pool profiles
        if (cluster.agentPoolProfiles) {
          for (const pool of cluster.agentPoolProfiles) {
            if (pool.vnetSubnetID) {
              relationships.push({
                type: 'references',
                targetResourceId: pool.vnetSubnetID,
                targetType: 'azurerm_subnet',
              });
            }
          }
        }

        resources.push(
          this.createResource({
            id: cluster.name || '',
            resourceId: cluster.id,
            azureType: 'Microsoft.ContainerService/managedClusters',
            region: cluster.location,
            resourceGroup: this.extractResourceGroup(cluster.id),
            name: cluster.name,
            tags: this.tagsToRecord(cluster.tags),
            properties: {
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
              agentPoolProfiles: cluster.agentPoolProfiles?.map(pool => ({
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
                vnetSubnetID: pool.vnetSubnetID,
              })),
              identity: cluster.identity
                ? {
                    type: cluster.identity.type,
                    principalId: cluster.identity.principalId,
                    tenantId: cluster.identity.tenantId,
                  }
                : undefined,
              addonProfiles: cluster.addonProfiles
                ? Object.fromEntries(
                    Object.entries(cluster.addonProfiles).map(([key, val]) => [
                      key,
                      { enabled: val.enabled },
                    ])
                  )
                : undefined,
              autoScalerProfile: cluster.autoScalerProfile,
              apiServerAccessProfile: cluster.apiServerAccessProfile
                ? {
                    authorizedIPRanges:
                      cluster.apiServerAccessProfile.authorizedIPRanges,
                    enablePrivateCluster:
                      cluster.apiServerAccessProfile.enablePrivateCluster,
                  }
                : undefined,
            },
            relationships,
            status: cluster.provisioningState,
          })
        );
      }
    } catch (error: any) {
      this.recordError(
        'listManagedClusters',
        error.message,
        context.region,
        error.code
      );
    }

    logger.debug(`AKS scanner found ${resources.length} resources`, {
      region: context.region,
    });

    return { resources, errors: this.errors };
  }

  getResourceTypes(): string[] {
    return ['Microsoft.ContainerService/managedClusters'];
  }
}
