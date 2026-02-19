/**
 * Azure Compute Scanner
 *
 * Discovers Azure Virtual Machines, Managed Disks, and related compute resources
 */

import { ComputeManagementClient } from '@azure/arm-compute';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

export class ComputeScanner extends BaseScanner {
  readonly serviceName = 'Compute';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new ComputeManagementClient(
      context.credential,
      context.subscriptionId
    );

    const [vms, disks] = await Promise.all([
      this.scanVMs(client, context),
      this.scanDisks(client, context),
    ]);

    resources.push(...vms, ...disks);

    logger.debug(`Compute scanner found ${resources.length} resources`, {
      region: context.region,
      vms: vms.length,
      disks: disks.length,
    });

    return { resources, errors: this.errors };
  }

  getResourceTypes(): string[] {
    return [
      'Microsoft.Compute/virtualMachines',
      'Microsoft.Compute/disks',
    ];
  }

  private async scanVMs(
    client: ComputeManagementClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      for await (const vm of client.virtualMachines.listAll()) {
        if (!vm.id || !vm.location) continue;
        if (vm.location.toLowerCase().replace(/\s/g, '') !== context.region.toLowerCase().replace(/\s/g, '')) continue;

        const relationships: ResourceRelationship[] = [];

        if (vm.networkProfile?.networkInterfaces) {
          for (const nic of vm.networkProfile.networkInterfaces) {
            if (nic.id) {
              relationships.push({
                type: 'references',
                targetResourceId: nic.id,
                targetType: 'azurerm_network_interface',
              });
            }
          }
        }

        if (vm.storageProfile?.osDisk?.managedDisk?.id) {
          relationships.push({
            type: 'attached_to',
            targetResourceId: vm.storageProfile.osDisk.managedDisk.id,
            targetType: 'azurerm_managed_disk',
          });
        }

        resources.push(
          this.createResource({
            id: vm.vmId || vm.name || '',
            resourceId: vm.id,
            azureType: 'Microsoft.Compute/virtualMachines',
            region: vm.location,
            resourceGroup: this.extractResourceGroup(vm.id),
            name: vm.name,
            tags: this.tagsToRecord(vm.tags),
            properties: {
              vmSize: vm.hardwareProfile?.vmSize,
              osType: vm.storageProfile?.osDisk?.osType,
              imageReference: vm.storageProfile?.imageReference
                ? {
                    publisher: vm.storageProfile.imageReference.publisher,
                    offer: vm.storageProfile.imageReference.offer,
                    sku: vm.storageProfile.imageReference.sku,
                    version: vm.storageProfile.imageReference.version,
                  }
                : undefined,
              osDisk: vm.storageProfile?.osDisk
                ? {
                    osType: vm.storageProfile.osDisk.osType,
                    createOption: vm.storageProfile.osDisk.createOption,
                    diskSizeGB: vm.storageProfile.osDisk.diskSizeGB,
                    managedDiskId: vm.storageProfile.osDisk.managedDisk?.id,
                    caching: vm.storageProfile.osDisk.caching,
                  }
                : undefined,
              dataDisks: vm.storageProfile?.dataDisks?.map(d => ({
                lun: d.lun,
                name: d.name,
                diskSizeGB: d.diskSizeGB,
                createOption: d.createOption,
                caching: d.caching,
                managedDiskId: d.managedDisk?.id,
              })),
              networkInterfaces: vm.networkProfile?.networkInterfaces?.map(
                nic => ({
                  id: nic.id,
                  primary: nic.primary,
                })
              ),
              zones: vm.zones,
              provisioningState: vm.provisioningState,
              priority: vm.priority,
              evictionPolicy: vm.evictionPolicy,
              licenseType: vm.licenseType,
            },
            relationships,
            status: vm.provisioningState,
          })
        );
      }
    } catch (error: any) {
      this.recordError(
        'listVirtualMachines',
        error.message,
        context.region,
        error.code
      );
    }

    return resources;
  }

  private async scanDisks(
    client: ComputeManagementClient,
    context: ScannerContext
  ): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      for await (const disk of client.disks.list()) {
        if (!disk.id || !disk.location) continue;
        if (disk.location.toLowerCase().replace(/\s/g, '') !== context.region.toLowerCase().replace(/\s/g, '')) continue;

        resources.push(
          this.createResource({
            id: disk.uniqueId || disk.name || '',
            resourceId: disk.id,
            azureType: 'Microsoft.Compute/disks',
            region: disk.location,
            resourceGroup: this.extractResourceGroup(disk.id),
            name: disk.name,
            tags: this.tagsToRecord(disk.tags),
            properties: {
              sku: disk.sku ? { name: disk.sku.name, tier: disk.sku.tier } : undefined,
              diskSizeGB: disk.diskSizeGB,
              diskState: disk.diskState,
              osType: disk.osType,
              creationData: disk.creationData
                ? {
                    createOption: disk.creationData.createOption,
                    sourceResourceId: disk.creationData.sourceResourceId,
                    imageReference: disk.creationData.imageReference
                      ? { id: disk.creationData.imageReference.id }
                      : undefined,
                  }
                : undefined,
              encryption: disk.encryption
                ? {
                    diskEncryptionSetId: disk.encryption.diskEncryptionSetId,
                    type: disk.encryption.type,
                  }
                : undefined,
              networkAccessPolicy: disk.networkAccessPolicy,
              publicNetworkAccess: disk.publicNetworkAccess,
              tier: disk.tier,
              zones: disk.zones,
              maxShares: disk.maxShares,
            },
            status: disk.diskState,
            createdAt: disk.timeCreated,
          })
        );
      }
    } catch (error: any) {
      this.recordError('listDisks', error.message, context.region, error.code);
    }

    return resources;
  }
}
