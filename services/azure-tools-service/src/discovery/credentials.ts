/**
 * Azure Credential Manager
 *
 * Handles Azure credential management using DefaultAzureCredential
 * which supports environment variables, managed identity, Azure CLI,
 * VS Code credentials, and more.
 */

import { DefaultAzureCredential } from '@azure/identity';
import { SubscriptionClient } from '@azure/arm-subscriptions';
import { logger } from '@nimbus/shared-utils';
import type {
  AzureCredentialInfo,
  CredentialValidationResult,
  AzureSubscription,
} from './types';

export interface CredentialManagerConfig {
  defaultSubscriptionId?: string;
}

/**
 * Manages Azure credentials and authentication
 */
export class AzureCredentialManager {
  private defaultSubscriptionId: string;
  private credential: DefaultAzureCredential;

  constructor(config: CredentialManagerConfig = {}) {
    this.defaultSubscriptionId =
      config.defaultSubscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.credential = new DefaultAzureCredential();
  }

  /**
   * Get the DefaultAzureCredential instance
   */
  getCredential(): DefaultAzureCredential {
    return this.credential;
  }

  /**
   * Get the default subscription ID
   */
  getDefaultSubscriptionId(): string {
    return this.defaultSubscriptionId;
  }

  /**
   * Validate credentials by attempting to list subscriptions
   */
  async validateCredentials(): Promise<CredentialValidationResult> {
    try {
      const token = await this.credential.getToken('https://management.azure.com/.default');

      if (!token) {
        return {
          valid: false,
          error: 'Failed to acquire authentication token',
        };
      }

      // Try to get subscription info to fully validate
      const subscriptionClient = new SubscriptionClient(this.credential);
      const subscriptions: AzureSubscription[] = [];

      for await (const sub of subscriptionClient.subscriptions.list()) {
        subscriptions.push({
          subscriptionId: sub.subscriptionId || '',
          displayName: sub.displayName || '',
          state: sub.state || '',
          tenantId: sub.tenantId,
        });
      }

      if (subscriptions.length === 0) {
        return {
          valid: false,
          error: 'No subscriptions found for the authenticated identity',
        };
      }

      const activeSubId = this.defaultSubscriptionId || subscriptions[0].subscriptionId;
      const activeSub = subscriptions.find(s => s.subscriptionId === activeSubId) || subscriptions[0];

      logger.info(`Validated Azure credentials for subscription ${activeSub.displayName} (${activeSub.subscriptionId})`);

      return {
        valid: true,
        credential: {
          subscriptionId: activeSub.subscriptionId,
          tenantId: activeSub.tenantId,
          authenticated: true,
        },
      };
    } catch (error: any) {
      logger.error('Azure credential validation failed', error);

      return {
        valid: false,
        error: error.message || 'Failed to validate Azure credentials',
      };
    }
  }

  /**
   * List all available subscriptions
   */
  async listSubscriptions(): Promise<AzureSubscription[]> {
    try {
      const subscriptionClient = new SubscriptionClient(this.credential);
      const subscriptions: AzureSubscription[] = [];

      for await (const sub of subscriptionClient.subscriptions.list()) {
        subscriptions.push({
          subscriptionId: sub.subscriptionId || '',
          displayName: sub.displayName || '',
          state: sub.state || '',
          tenantId: sub.tenantId,
        });
      }

      return subscriptions;
    } catch (error: any) {
      logger.error('Failed to list subscriptions', error);
      return [];
    }
  }
}
