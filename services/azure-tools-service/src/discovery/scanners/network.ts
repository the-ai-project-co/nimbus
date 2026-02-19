/**
 * Azure Network Scanner
 *
 * Discovers Azure Virtual Networks, Subnets, NSGs, and related networking resources
 */

import { NetworkManagementClient } from '@azure/arm-network';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

export class NetworkScanner extends BaseScanner {
  readonly serviceName = 'Network';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new NetworkManagementClient(
      context.credential,
      context.subscriptionId
    );

    const [vnets, nsgs, publicIps] = await Promise.all([
      this.scanVNets(client, context),
      this.scanNSGs(client, context),
      this.scanPublicIPs(client, context),
    ]);

    resources.push(...vnets, ...nsgs, ...publicIps);

    logger.debug(`Network scanner found ${resources.length} resources`, {
      region: context.region,
      vnets: vnets.length,
      nsgs: nsgs.length,
      publicIps: publicIps.length,
    });

    return { resources, errors: this.errors };
  }

  getResourceTypes(): string[] {
    return [
      'Microsoft.Network/virtualNetworks',
      'Microsoft.Network/networkSecurityGroups',
      'Microsoft.Network/publicIPAddresses',
    ];
  }

  private async scanVNets(
    client: NetworkManagementClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      for await (const vnet of client.virtualNetworks.listAll()) {
        if (!vnet.id || !vnet.location) continue;
        if (vnet.location.toLowerCase().replace(/\s/g, '') !== context.region.toLowerCase().replace(/\s/g, '')) continue;

        const relationships: ResourceRelationship[] = [];

        if (vnet.subnets) {
          for (const subnet of vnet.subnets) {
            if (subnet.networkSecurityGroup?.id) {
              relationships.push({
                type: 'references',
                targetResourceId: subnet.networkSecurityGroup.id,
                targetType: 'azurerm_network_security_group',
              });
            }
            if (subnet.routeTable?.id) {
              relationships.push({
                type: 'references',
                targetResourceId: subnet.routeTable.id,
                targetType: 'azurerm_route_table',
              });
            }
          }
        }

        resources.push(
          this.createResource({
            id: vnet.name || '',
            resourceId: vnet.id,
            azureType: 'Microsoft.Network/virtualNetworks',
            region: vnet.location,
            resourceGroup: this.extractResourceGroup(vnet.id),
            name: vnet.name,
            tags: this.tagsToRecord(vnet.tags),
            properties: {
              addressSpace: vnet.addressSpace?.addressPrefixes,
              dhcpOptions: vnet.dhcpOptions?.dnsServers,
              enableDdosProtection: vnet.enableDdosProtection,
              enableVmProtection: vnet.enableVmProtection,
              provisioningState: vnet.provisioningState,
              subnets: vnet.subnets?.map(s => ({
                id: s.id,
                name: s.name,
                addressPrefix: s.addressPrefix,
                provisioningState: s.provisioningState,
                networkSecurityGroupId: s.networkSecurityGroup?.id,
                routeTableId: s.routeTable?.id,
                serviceEndpoints: s.serviceEndpoints?.map(se => ({
                  service: se.service,
                  locations: se.locations,
                })),
                delegations: s.delegations?.map(d => ({
                  name: d.name,
                  serviceName: d.serviceName,
                })),
              })),
              virtualNetworkPeerings: vnet.virtualNetworkPeerings?.map(p => ({
                id: p.id,
                name: p.name,
                peeringState: p.peeringState,
                remoteVirtualNetworkId: p.remoteVirtualNetwork?.id,
                allowVirtualNetworkAccess: p.allowVirtualNetworkAccess,
                allowForwardedTraffic: p.allowForwardedTraffic,
                allowGatewayTransit: p.allowGatewayTransit,
                useRemoteGateways: p.useRemoteGateways,
              })),
            },
            relationships,
            status: vnet.provisioningState,
          })
        );
      }
    } catch (error: any) {
      this.recordError(
        'listVirtualNetworks',
        error.message,
        context.region,
        error.code
      );
    }

    return resources;
  }

  private async scanNSGs(
    client: NetworkManagementClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      for await (const nsg of client.networkSecurityGroups.listAll()) {
        if (!nsg.id || !nsg.location) continue;
        if (nsg.location.toLowerCase().replace(/\s/g, '') !== context.region.toLowerCase().replace(/\s/g, '')) continue;

        resources.push(
          this.createResource({
            id: nsg.name || '',
            resourceId: nsg.id,
            azureType: 'Microsoft.Network/networkSecurityGroups',
            region: nsg.location,
            resourceGroup: this.extractResourceGroup(nsg.id),
            name: nsg.name,
            tags: this.tagsToRecord(nsg.tags),
            properties: {
              provisioningState: nsg.provisioningState,
              securityRules: nsg.securityRules?.map(rule => ({
                name: rule.name,
                protocol: rule.protocol,
                sourcePortRange: rule.sourcePortRange,
                destinationPortRange: rule.destinationPortRange,
                sourceAddressPrefix: rule.sourceAddressPrefix,
                destinationAddressPrefix: rule.destinationAddressPrefix,
                access: rule.access,
                priority: rule.priority,
                direction: rule.direction,
                sourcePortRanges: rule.sourcePortRanges,
                destinationPortRanges: rule.destinationPortRanges,
                sourceAddressPrefixes: rule.sourceAddressPrefixes,
                destinationAddressPrefixes: rule.destinationAddressPrefixes,
              })),
              defaultSecurityRules: nsg.defaultSecurityRules?.map(rule => ({
                name: rule.name,
                protocol: rule.protocol,
                access: rule.access,
                priority: rule.priority,
                direction: rule.direction,
              })),
              subnets: nsg.subnets?.map(s => ({ id: s.id })),
              networkInterfaces: nsg.networkInterfaces?.map(nic => ({
                id: nic.id,
              })),
            },
            relationships: [],
            status: nsg.provisioningState,
          })
        );
      }
    } catch (error: any) {
      this.recordError(
        'listNetworkSecurityGroups',
        error.message,
        context.region,
        error.code
      );
    }

    return resources;
  }

  private async scanPublicIPs(
    client: NetworkManagementClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      for await (const pip of client.publicIPAddresses.listAll()) {
        if (!pip.id || !pip.location) continue;
        if (pip.location.toLowerCase().replace(/\s/g, '') !== context.region.toLowerCase().replace(/\s/g, '')) continue;

        resources.push(
          this.createResource({
            id: pip.name || '',
            resourceId: pip.id,
            azureType: 'Microsoft.Network/publicIPAddresses',
            region: pip.location,
            resourceGroup: this.extractResourceGroup(pip.id),
            name: pip.name,
            tags: this.tagsToRecord(pip.tags),
            properties: {
              publicIPAllocationMethod: pip.publicIPAllocationMethod,
              publicIPAddressVersion: pip.publicIPAddressVersion,
              ipAddress: pip.ipAddress,
              dnsSettings: pip.dnsSettings
                ? {
                    domainNameLabel: pip.dnsSettings.domainNameLabel,
                    fqdn: pip.dnsSettings.fqdn,
                  }
                : undefined,
              sku: pip.sku
                ? { name: pip.sku.name, tier: pip.sku.tier }
                : undefined,
              zones: pip.zones,
              provisioningState: pip.provisioningState,
              ipConfiguration: pip.ipConfiguration?.id,
            },
            relationships: [],
            status: pip.provisioningState,
          })
        );
      }
    } catch (error: any) {
      this.recordError(
        'listPublicIPAddresses',
        error.message,
        context.region,
        error.code
      );
    }

    return resources;
  }
}
