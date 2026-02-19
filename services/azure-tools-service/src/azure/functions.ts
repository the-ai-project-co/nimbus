/**
 * Azure Functions Operations
 *
 * Provides operations for listing Azure Function Apps using the
 * Azure Resource Manager Web Apps API
 */

import { DefaultAzureCredential } from '@azure/identity';
import { logger } from '@nimbus/shared-utils';
import type { AzureOperationResult } from './compute';

export interface FunctionsOperationsConfig {
  subscriptionId?: string;
}

/**
 * Azure Functions Operations
 */
export class FunctionsOperations {
  private subscriptionId: string;
  private credential: DefaultAzureCredential;

  constructor(config: FunctionsOperationsConfig = {}) {
    this.subscriptionId = config.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.credential = new DefaultAzureCredential();
  }

  /**
   * List Azure Function Apps, optionally filtered by resource group
   */
  async listFunctionApps(
    subscriptionId?: string,
    resourceGroup?: string
  ): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const token = await this.credential.getToken('https://management.azure.com/.default');
      if (!token) {
        return { success: false, error: 'Failed to acquire authentication token' };
      }

      let url: string;
      if (resourceGroup) {
        url = `https://management.azure.com/subscriptions/${subId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/sites?api-version=2023-01-01`;
      } else {
        url = `https://management.azure.com/subscriptions/${subId}/providers/Microsoft.Web/sites?api-version=2023-01-01`;
      }

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

      // Filter to only function apps (kind contains 'functionapp')
      const functionApps = (data.value || [])
        .filter((app: any) => app.kind && app.kind.toLowerCase().includes('functionapp'))
        .map((app: any) => ({
          id: app.id,
          name: app.name,
          location: app.location,
          type: app.type,
          kind: app.kind,
          state: app.properties?.state,
          hostNames: app.properties?.hostNames,
          defaultHostName: app.properties?.defaultHostName,
          resourceGroup: app.properties?.resourceGroup,
          serverFarmId: app.properties?.serverFarmId,
          isDefaultContainer: app.properties?.isDefaultContainer,
          httpsOnly: app.properties?.httpsOnly,
          redundancyMode: app.properties?.redundancyMode,
          usageState: app.properties?.usageState,
          enabled: app.properties?.enabled,
          availabilityState: app.properties?.availabilityState,
          lastModifiedTimeUtc: app.properties?.lastModifiedTimeUtc,
          tags: app.tags || {},
        }));

      logger.debug(`Listed ${functionApps.length} function apps`, { resourceGroup });
      return { success: true, data: { functionApps, count: functionApps.length } };
    } catch (error: any) {
      logger.error('Failed to list function apps', error);
      return { success: false, error: error.message || 'Failed to list function apps' };
    }
  }
}
