/**
 * VPC Scanner
 *
 * Discovers GCP VPC networks, subnets, and routes
 */

import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

const computeLib = require('@google-cloud/compute');

/**
 * VPC Scanner
 */
export class VPCScanner extends BaseScanner {
  readonly serviceName = 'VPC';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const [networks, subnets] = await Promise.all([
      this.scanNetworks(context),
      this.scanSubnets(context),
    ]);

    resources.push(...networks, ...subnets);

    logger.debug(`VPC scanner found ${resources.length} resources`, {
      region: context.region,
      networks: networks.length,
      subnets: subnets.length,
    });

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'compute.googleapis.com/Network',
      'compute.googleapis.com/Subnetwork',
    ];
  }

  private async scanNetworks(context: ScannerContext): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      const networksClient = new computeLib.NetworksClient();
      const [networks] = await networksClient.list({
        project: context.projectId,
      });

      for (const network of networks || []) {
        if (!network.id || !network.name) continue;

        resources.push(this.createResource({
          id: String(network.id),
          selfLink: network.selfLink || '',
          gcpType: 'compute.googleapis.com/Network',
          region: 'global',
          name: network.name,
          labels: {},
          properties: {
            description: network.description,
            autoCreateSubnetworks: network.autoCreateSubnetworks,
            routingMode: network.routingConfig?.routingMode,
            subnetworks: network.subnetworks || [],
            peerings: (network.peerings || []).map((p: any) => ({
              name: p.name,
              network: p.network,
              state: p.state,
              autoCreateRoutes: p.autoCreateRoutes,
              exportCustomRoutes: p.exportCustomRoutes,
              importCustomRoutes: p.importCustomRoutes,
            })),
            mtu: network.mtu,
            firewallPolicy: network.firewallPolicy,
          },
          createdAt: network.creationTimestamp ? new Date(network.creationTimestamp) : undefined,
        }));
      }
    } catch (error: any) {
      this.recordError('listNetworks', error.message, context.region, error.code);
    }

    return resources;
  }

  private async scanSubnets(context: ScannerContext): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      const subnetworksClient = new computeLib.SubnetworksClient();
      const [subnets] = await subnetworksClient.list({
        project: context.projectId,
        region: context.region,
      });

      for (const subnet of subnets || []) {
        if (!subnet.id || !subnet.name) continue;

        const relationships: ResourceRelationship[] = [];
        if (subnet.network) {
          relationships.push({
            type: 'contains',
            targetSelfLink: subnet.network,
            targetType: 'google_compute_network',
          });
        }

        resources.push(this.createResource({
          id: String(subnet.id),
          selfLink: subnet.selfLink || '',
          gcpType: 'compute.googleapis.com/Subnetwork',
          region: context.region,
          name: subnet.name,
          labels: {},
          properties: {
            description: subnet.description,
            network: subnet.network?.split('/').pop(),
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
          },
          relationships,
          createdAt: subnet.creationTimestamp ? new Date(subnet.creationTimestamp) : undefined,
          status: subnet.state,
        }));
      }
    } catch (error: any) {
      this.recordError('listSubnets', error.message, context.region, error.code);
    }

    return resources;
  }
}
