/**
 * SSO Device Flow
 * Enterprise SSO authentication using device code flow
 */

import { authClient } from '../clients/enterprise-client';
import type { DeviceCodeResponse } from '@nimbus/shared-types';

/**
 * SSO Device Flow for enterprise authentication
 * Uses the auth-service for device code management
 */
export class SSODeviceFlow {
  private deviceCode: string | null = null;
  private interval: number = 5;
  private expiresAt: number = 0;

  /**
   * Initiate device code flow
   * Returns device code and user code for the client
   */
  async initiate(): Promise<DeviceCodeResponse> {
    const response = await authClient.initiateDeviceFlow();

    this.deviceCode = response.deviceCode;
    this.interval = response.interval || 5;
    this.expiresAt = Date.now() + response.expiresIn * 1000;

    return response;
  }

  /**
   * Poll for authorization
   * Returns access token when user authorizes, null if pending
   */
  async poll(): Promise<string | null> {
    if (!this.deviceCode) {
      throw new Error('Device code not initiated. Call initiate() first.');
    }

    if (Date.now() > this.expiresAt) {
      throw new Error('Device code expired. Please start the login process again.');
    }

    const response = await authClient.pollDeviceCode(this.deviceCode);

    if (response.accessToken) {
      return response.accessToken;
    }

    if (response.error === 'authorization_pending') {
      return null;
    }

    if (response.error === 'slow_down') {
      this.interval += 5;
      return null;
    }

    if (response.error === 'expired_token') {
      throw new Error('Device code expired. Please start the login process again.');
    }

    if (response.error === 'access_denied') {
      throw new Error('Authorization was denied.');
    }

    throw new Error(response.errorDescription || response.error || 'Unknown error');
  }

  /**
   * Get polling interval in milliseconds
   */
  getPollingInterval(): number {
    return this.interval * 1000;
  }

  /**
   * Wait for authorization by polling
   * Returns access token when user completes authorization
   */
  async waitForAuthorization(
    onPoll?: () => void,
    abortSignal?: AbortSignal
  ): Promise<string> {
    while (true) {
      if (abortSignal?.aborted) {
        throw new Error('Authorization cancelled');
      }

      const token = await this.poll();

      if (token) {
        return token;
      }

      onPoll?.();
      await this.sleep(this.getPollingInterval());
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Validate an SSO access token
 */
export async function validateSSOToken(accessToken: string): Promise<{
  valid: boolean;
  userId?: string;
  teamId?: string;
}> {
  return authClient.validateToken(accessToken);
}
