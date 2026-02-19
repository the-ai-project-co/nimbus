/**
 * Azure Storage Operations
 *
 * Provides operations for managing Azure Storage Accounts and Blob Containers
 * using @azure/arm-storage
 */

import { StorageManagementClient } from '@azure/arm-storage';
import { DefaultAzureCredential } from '@azure/identity';
import { logger } from '@nimbus/shared-utils';
import type { AzureOperationResult } from './compute';

export interface StorageOperationsConfig {
  subscriptionId?: string;
}

/**
 * Azure Storage Operations
 */
export class StorageOperations {
  private subscriptionId: string;
  private credential: DefaultAzureCredential;
  private client: StorageManagementClient;

  constructor(config: StorageOperationsConfig = {}) {
    this.subscriptionId = config.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.credential = new DefaultAzureCredential();
    this.client = new StorageManagementClient(this.credential, this.subscriptionId);
  }

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

      const client = subscriptionId
        ? new StorageManagementClient(this.credential, subId)
        : this.client;

      const accounts: any[] = [];

      if (resourceGroup) {
        for await (const account of client.storageAccounts.listByResourceGroup(resourceGroup)) {
          accounts.push({
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
          });
        }
      } else {
        for await (const account of client.storageAccounts.list()) {
          accounts.push({
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
          });
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

      const client = subscriptionId
        ? new StorageManagementClient(this.credential, subId)
        : this.client;

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
}
