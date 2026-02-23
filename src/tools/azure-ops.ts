/**
 * Azure Operations — Embedded tool (stripped HTTP wrappers)
 *
 * Merged from services/azure-tools-service/src/azure/compute.ts, storage.ts, aks.ts, iam.ts, network.ts
 * Uses lazy imports for Azure SDK to keep binary size small.
 */

import { logger } from '../utils';

// ==========================================
// Shared Types
// ==========================================

export interface AzureOperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AzureConfig {
  subscriptionId?: string;
}

/**
 * Unified Azure Operations class merging Compute, Storage, AKS, IAM, and Network operations.
 * All Azure SDK imports are lazy to minimize binary size.
 */
export class AzureOperations {
  private subscriptionId: string;

  constructor(config: AzureConfig = {}) {
    this.subscriptionId = config.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '';
  }

  /**
   * Lazily create an Azure credential
   */
  private async getCredential(): Promise<any> {
    const { DefaultAzureCredential } = await import('@azure/identity');
    return new DefaultAzureCredential();
  }

  // ==========================================
  // Compute (VM) Operations
  // ==========================================

  /**
   * List virtual machines, optionally filtered by resource group
   */
  async listVMs(subscriptionId?: string, resourceGroup?: string): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const { ComputeManagementClient } = await import('@azure/arm-compute');
      const credential = await this.getCredential();
      const client = new ComputeManagementClient(credential, subId);

      const vms: any[] = [];

      if (resourceGroup) {
        for await (const vm of client.virtualMachines.list(resourceGroup)) {
          vms.push(this.mapVM(vm));
        }
      } else {
        for await (const vm of client.virtualMachines.listAll()) {
          vms.push(this.mapVM(vm));
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

      const { ComputeManagementClient } = await import('@azure/arm-compute');
      const credential = await this.getCredential();
      const client = new ComputeManagementClient(credential, subId);

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

      const { ComputeManagementClient } = await import('@azure/arm-compute');
      const credential = await this.getCredential();
      const client = new ComputeManagementClient(credential, subId);

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

  /**
   * Map a VM to normalized format
   */
  private mapVM(vm: any): any {
    return {
      id: vm.id,
      name: vm.name,
      location: vm.location,
      type: vm.type,
      vmSize: vm.hardwareProfile?.vmSize,
      osType: vm.storageProfile?.osDisk?.osType,
      provisioningState: vm.provisioningState,
      vmId: vm.vmId,
      tags: vm.tags || {},
      networkInterfaces: vm.networkProfile?.networkInterfaces?.map((nic: any) => ({
        id: nic.id,
        primary: nic.primary,
      })),
      availabilitySet: vm.availabilitySet?.id,
      zones: vm.zones,
    };
  }

  // ==========================================
  // Storage Operations
  // ==========================================

  /**
   * List storage accounts, optionally filtered by resource group
   */
  async listStorageAccounts(
    subscriptionId?: string,
    resourceGroup?: string
  ): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const { StorageManagementClient } = await import('@azure/arm-storage');
      const credential = await this.getCredential();
      const client = new StorageManagementClient(credential, subId);

      const accounts: any[] = [];

      if (resourceGroup) {
        for await (const account of client.storageAccounts.listByResourceGroup(resourceGroup)) {
          accounts.push(this.mapStorageAccount(account));
        }
      } else {
        for await (const account of client.storageAccounts.list()) {
          accounts.push(this.mapStorageAccount(account));
        }
      }

      logger.debug(`Listed ${accounts.length} storage accounts`, { resourceGroup });
      return { success: true, data: { accounts, count: accounts.length } };
    } catch (error: any) {
      logger.error('Failed to list storage accounts', error);
      return { success: false, error: error.message || 'Failed to list storage accounts' };
    }
  }

  /**
   * List blob containers for a storage account
   */
  async listContainers(
    subscriptionId: string,
    resourceGroup: string,
    accountName: string
  ): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const { StorageManagementClient } = await import('@azure/arm-storage');
      const credential = await this.getCredential();
      const client = new StorageManagementClient(credential, subId);

      const containers: any[] = [];

      for await (const container of client.blobContainers.list(resourceGroup, accountName)) {
        containers.push({
          id: container.id,
          name: container.name,
          type: container.type,
          publicAccess: container.publicAccess,
          leaseState: container.leaseState,
          leaseStatus: container.leaseStatus,
          lastModifiedTime: container.lastModifiedTime,
          hasImmutabilityPolicy: container.hasImmutabilityPolicy,
          hasLegalHold: container.hasLegalHold,
          defaultEncryptionScope: container.defaultEncryptionScope,
        });
      }

      logger.debug(`Listed ${containers.length} containers for ${accountName}`);
      return { success: true, data: { containers, count: containers.length } };
    } catch (error: any) {
      logger.error('Failed to list containers', { accountName, error });
      return { success: false, error: error.message || 'Failed to list containers' };
    }
  }

  /**
   * Map a storage account to normalized format
   */
  private mapStorageAccount(account: any): any {
    return {
      id: account.id,
      name: account.name,
      location: account.location,
      type: account.type,
      kind: account.kind,
      sku: account.sku ? { name: account.sku.name, tier: account.sku.tier } : undefined,
      provisioningState: account.provisioningState,
      primaryEndpoints: account.primaryEndpoints,
      creationTime: account.creationTime,
      accessTier: account.accessTier,
      enableHttpsTrafficOnly: account.enableHttpsTrafficOnly,
      minimumTlsVersion: account.minimumTlsVersion,
      allowBlobPublicAccess: account.allowBlobPublicAccess,
      networkRuleSet: account.networkRuleSet
        ? {
            defaultAction: account.networkRuleSet.defaultAction,
            bypass: account.networkRuleSet.bypass,
          }
        : undefined,
      tags: account.tags || {},
    };
  }

  // ==========================================
  // AKS (Azure Kubernetes Service) Operations
  // ==========================================

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

      const { ContainerServiceClient } = await import('@azure/arm-containerservice');
      const credential = await this.getCredential();
      const client = new ContainerServiceClient(credential, subId);

      const clusters: any[] = [];

      if (resourceGroup) {
        for await (const cluster of client.managedClusters.listByResourceGroup(resourceGroup)) {
          clusters.push(this.mapAKSCluster(cluster));
        }
      } else {
        for await (const cluster of client.managedClusters.list()) {
          clusters.push(this.mapAKSCluster(cluster));
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

      const { ContainerServiceClient } = await import('@azure/arm-containerservice');
      const credential = await this.getCredential();
      const client = new ContainerServiceClient(credential, subId);

      const cluster = await client.managedClusters.get(resourceGroup, clusterName);

      logger.debug(`Described AKS cluster ${clusterName}`);
      return { success: true, data: this.mapAKSCluster(cluster) };
    } catch (error: any) {
      logger.error('Failed to describe AKS cluster', { clusterName, error });
      return { success: false, error: error.message || 'Failed to describe AKS cluster' };
    }
  }

  /**
   * Map an AKS cluster to a normalized response format
   */
  private mapAKSCluster(cluster: any): any {
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

  // ==========================================
  // IAM (Role Assignments) Operations
  // ==========================================

  /**
   * List role assignments for a subscription
   */
  async listRoleAssignments(subscriptionId?: string): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const credential = await this.getCredential();
      const token = await credential.getToken('https://management.azure.com/.default');
      if (!token) {
        return { success: false, error: 'Failed to acquire authentication token' };
      }

      const url = `https://management.azure.com/subscriptions/${subId}/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Azure API error: ${response.status} - ${errorText}` };
      }

      const data = await response.json() as any;
      const roleAssignments = (data.value || []).map((ra: any) => ({
        id: ra.id,
        name: ra.name,
        type: ra.type,
        principalId: ra.properties?.principalId,
        principalType: ra.properties?.principalType,
        roleDefinitionId: ra.properties?.roleDefinitionId,
        scope: ra.properties?.scope,
        createdOn: ra.properties?.createdOn,
        updatedOn: ra.properties?.updatedOn,
        createdBy: ra.properties?.createdBy,
        description: ra.properties?.description,
      }));

      logger.debug(`Listed ${roleAssignments.length} role assignments`);
      return { success: true, data: { roleAssignments, count: roleAssignments.length } };
    } catch (error: any) {
      logger.error('Failed to list role assignments', error);
      return { success: false, error: error.message || 'Failed to list role assignments' };
    }
  }

  // ==========================================
  // Network (VNet) Operations
  // ==========================================

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

      const { NetworkManagementClient } = await import('@azure/arm-network');
      const credential = await this.getCredential();
      const client = new NetworkManagementClient(credential, subId);

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

      const { NetworkManagementClient } = await import('@azure/arm-network');
      const credential = await this.getCredential();
      const client = new NetworkManagementClient(credential, subId);

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
