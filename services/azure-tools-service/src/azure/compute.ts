/**
 * Azure Compute (VM) Operations
 *
 * Provides operations for managing Azure Virtual Machines using @azure/arm-compute
 */

import { ComputeManagementClient } from '@azure/arm-compute';
import { DefaultAzureCredential } from '@azure/identity';
import { logger } from '@nimbus/shared-utils';

export interface AzureOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ComputeOperationsConfig {
  subscriptionId?: string;
}

/**
 * Azure Virtual Machine Operations
 */
export class ComputeOperations {
  private subscriptionId: string;
  private credential: DefaultAzureCredential;
  private client: ComputeManagementClient;

  constructor(config: ComputeOperationsConfig = {}) {
    this.subscriptionId = config.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.credential = new DefaultAzureCredential();
    this.client = new ComputeManagementClient(this.credential, this.subscriptionId);
  }

  /**
   * List virtual machines, optionally filtered by resource group
   */
  async listVMs(subscriptionId?: string, resourceGroup?: string): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const client = subscriptionId
        ? new ComputeManagementClient(this.credential, subId)
        : this.client;

      const vms: any[] = [];

      if (resourceGroup) {
        for await (const vm of client.virtualMachines.list(resourceGroup)) {
          vms.push({
            id: vm.id,
            name: vm.name,
            location: vm.location,
            type: vm.type,
            vmSize: vm.hardwareProfile?.vmSize,
            osType: vm.storageProfile?.osDisk?.osType,
            provisioningState: vm.provisioningState,
            vmId: vm.vmId,
            tags: vm.tags || {},
            networkInterfaces: vm.networkProfile?.networkInterfaces?.map(nic => ({
              id: nic.id,
              primary: nic.primary,
            })),
            availabilitySet: vm.availabilitySet?.id,
            zones: vm.zones,
          });
        }
      } else {
        for await (const vm of client.virtualMachines.listAll()) {
          vms.push({
            id: vm.id,
            name: vm.name,
            location: vm.location,
            type: vm.type,
            vmSize: vm.hardwareProfile?.vmSize,
            osType: vm.storageProfile?.osDisk?.osType,
            provisioningState: vm.provisioningState,
            vmId: vm.vmId,
            tags: vm.tags || {},
            networkInterfaces: vm.networkProfile?.networkInterfaces?.map(nic => ({
              id: nic.id,
              primary: nic.primary,
            })),
            availabilitySet: vm.availabilitySet?.id,
            zones: vm.zones,
          });
        }
      }

      logger.debug(`Listed ${vms.length} VMs`, { resourceGroup });
      return { success: true, data: { vms, count: vms.length } };
    } catch (error: any) {
      logger.error('Failed to list VMs', error);
      return { success: false, error: error.message || 'Failed to list VMs' };
    }
  }

  /**
   * Start a virtual machine
   */
  async startVM(
    subscriptionId: string,
    resourceGroup: string,
    vmName: string
  ): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const client = subscriptionId
        ? new ComputeManagementClient(this.credential, subId)
        : this.client;

      const poller = await client.virtualMachines.beginStart(resourceGroup, vmName);
      await poller.pollUntilDone();

      logger.info(`Started VM ${vmName} in ${resourceGroup}`);
      return {
        success: true,
        data: { vmName, resourceGroup, action: 'start', status: 'succeeded' },
      };
    } catch (error: any) {
      logger.error('Failed to start VM', { vmName, resourceGroup, error });
      return { success: false, error: error.message || 'Failed to start VM' };
    }
  }

  /**
   * Stop (deallocate) a virtual machine
   */
  async stopVM(
    subscriptionId: string,
    resourceGroup: string,
    vmName: string
  ): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const client = subscriptionId
        ? new ComputeManagementClient(this.credential, subId)
        : this.client;

      const poller = await client.virtualMachines.beginDeallocate(resourceGroup, vmName);
      await poller.pollUntilDone();

      logger.info(`Stopped VM ${vmName} in ${resourceGroup}`);
      return {
        success: true,
        data: { vmName, resourceGroup, action: 'stop', status: 'succeeded' },
      };
    } catch (error: any) {
      logger.error('Failed to stop VM', { vmName, resourceGroup, error });
      return { success: false, error: error.message || 'Failed to stop VM' };
    }
  }
}
