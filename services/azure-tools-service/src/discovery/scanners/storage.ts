/**
 * Azure Storage Scanner
 *
 * Discovers Azure Storage Accounts and their configurations
 */

import { StorageManagementClient } from '@azure/arm-storage';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource } from '../types';

export class StorageScanner extends BaseScanner {
  readonly serviceName = 'Storage';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const client = new StorageManagementClient(
      context.credential,
      context.subscriptionId
    );

    try {
      for await (const account of client.storageAccounts.list()) {
        if (!account.id || !account.location) continue;
        if (account.location.toLowerCase().replace(/\s/g, '') !== context.region.toLowerCase().replace(/\s/g, '')) continue;

        resources.push(
          this.createResource({
            id: account.name || '',
            resourceId: account.id,
            azureType: 'Microsoft.Storage/storageAccounts',
            region: account.location,
            resourceGroup: this.extractResourceGroup(account.id),
            name: account.name,
            tags: this.tagsToRecord(account.tags),
            properties: {
              kind: account.kind,
              sku: account.sku
                ? { name: account.sku.name, tier: account.sku.tier }
                : undefined,
              provisioningState: account.provisioningState,
              primaryEndpoints: account.primaryEndpoints,
              primaryLocation: account.primaryLocation,
              secondaryLocation: account.secondaryLocation,
              creationTime: account.creationTime,
              accessTier: account.accessTier,
              enableHttpsTrafficOnly: account.enableHttpsTrafficOnly,
              minimumTlsVersion: account.minimumTlsVersion,
              allowBlobPublicAccess: account.allowBlobPublicAccess,
              allowSharedKeyAccess: account.allowSharedKeyAccess,
              isHnsEnabled: account.isHnsEnabled,
              networkRuleSet: account.networkRuleSet
                ? {
                    defaultAction: account.networkRuleSet.defaultAction,
                    bypass: account.networkRuleSet.bypass,
                    virtualNetworkRules:
                      account.networkRuleSet.virtualNetworkRules?.map(r => ({
                        id: r.virtualNetworkResourceId,
                        action: r.action,
                        state: r.state,
                      })),
                    ipRules: account.networkRuleSet.ipRules?.map(r => ({
                      value: r.iPAddressOrRange,
                      action: r.action,
                    })),
                  }
                : undefined,
              encryption: account.encryption
                ? {
                    services: account.encryption.services
                      ? {
                          blob: account.encryption.services.blob?.enabled,
                          file: account.encryption.services.file?.enabled,
                          table: account.encryption.services.table?.enabled,
                          queue: account.encryption.services.queue?.enabled,
                        }
                      : undefined,
                    keySource: account.encryption.keySource,
                  }
                : undefined,
              statusOfPrimary: account.statusOfPrimary,
              statusOfSecondary: account.statusOfSecondary,
              supportsHttpsTrafficOnly: account.enableHttpsTrafficOnly,
              largeFileSharesState: account.largeFileSharesState,
            },
            status: account.provisioningState,
            createdAt: account.creationTime,
          })
        );
      }
    } catch (error: any) {
      this.recordError(
        'listStorageAccounts',
        error.message,
        context.region,
        error.code
      );
    }

    logger.debug(`Storage scanner found ${resources.length} resources`, {
      region: context.region,
    });

    return { resources, errors: this.errors };
  }

  getResourceTypes(): string[] {
    return ['Microsoft.Storage/storageAccounts'];
  }
}
