/**
 * Azure IAM (Role Assignments) Operations
 *
 * Provides operations for listing Azure role assignments using the
 * Azure Resource Manager authorization API via @azure/arm-resources
 */

import { DefaultAzureCredential } from '@azure/identity';
import { logger } from '@nimbus/shared-utils';
import type { AzureOperationResult } from './compute';

export interface IAMOperationsConfig {
  subscriptionId?: string;
}

/**
 * Azure IAM Operations
 */
export class IAMOperations {
  private subscriptionId: string;
  private credential: DefaultAzureCredential;

  constructor(config: IAMOperationsConfig = {}) {
    this.subscriptionId = config.subscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.credential = new DefaultAzureCredential();
  }

  /**
   * List role assignments for a subscription
   */
  async listRoleAssignments(subscriptionId?: string): Promise<AzureOperationResult> {
    try {
      const subId = subscriptionId || this.subscriptionId;
      if (!subId) {
        return { success: false, error: 'No subscription ID provided' };
      }

      const token = await this.credential.getToken('https://management.azure.com/.default');
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
        condition: ra.properties?.condition,
        conditionVersion: ra.properties?.conditionVersion,
      }));

      logger.debug(`Listed ${roleAssignments.length} role assignments`);
      return { success: true, data: { roleAssignments, count: roleAssignments.length } };
    } catch (error: any) {
      logger.error('Failed to list role assignments', error);
      return { success: false, error: error.message || 'Failed to list role assignments' };
    }
  }
}
