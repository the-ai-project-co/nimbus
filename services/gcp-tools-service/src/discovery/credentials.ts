/**
 * GCP Credential Manager
 *
 * Handles GCP credential management using Application Default Credentials (ADC)
 */

import { logger } from '@nimbus/shared-utils';
import type { GCPCredentialInfo, CredentialValidationResult } from './types';

export interface CredentialManagerConfig {
  projectId?: string;
}

/**
 * Manages GCP credentials and authentication
 */
export class CredentialManager {
  private projectId: string;

  constructor(config: CredentialManagerConfig = {}) {
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  }

  /**
   * Validate GCP credentials using Application Default Credentials
   */
  async validateCredentials(projectId?: string): Promise<CredentialValidationResult> {
    try {
      const effectiveProject = projectId || this.projectId;

      if (!effectiveProject) {
        return {
          valid: false,
          error: 'No project specified. Set GOOGLE_CLOUD_PROJECT environment variable or pass projectId.',
        };
      }

      // Attempt to use ADC by making a simple API call
      const { GoogleAuth } = require('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        projectId: effectiveProject,
      });

      const client = await auth.getClient();
      const credentials = await client.getAccessToken();

      if (!credentials || !credentials.token) {
        return {
          valid: false,
          error: 'Could not obtain access token. Ensure Application Default Credentials are configured.',
        };
      }

      // Try to get the service account email
      let serviceAccountEmail: string | undefined;
      try {
        const clientEmail = (client as any).email || (client as any).credentials?.client_email;
        if (clientEmail) {
          serviceAccountEmail = clientEmail;
        }
      } catch {
        // Service account email is optional
      }

      const credentialInfo: GCPCredentialInfo = {
        projectId: effectiveProject,
        serviceAccountEmail,
        authenticated: true,
      };

      logger.info(`Validated GCP credentials for project ${effectiveProject}`);

      return {
        valid: true,
        credential: credentialInfo,
      };
    } catch (error: any) {
      logger.error('GCP credential validation failed', error);

      return {
        valid: false,
        error: error.message || 'Failed to validate GCP credentials',
      };
    }
  }

  /**
   * Get the default project ID
   */
  getDefaultProject(): string {
    return this.projectId;
  }

  /**
   * Check if credentials are configured
   */
  async isConfigured(): Promise<boolean> {
    // Check if GOOGLE_APPLICATION_CREDENTIALS is set or ADC is available
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return true;
    }

    // Check for gcloud default credentials
    try {
      const { GoogleAuth } = require('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      await auth.getClient();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get credential information without full validation
   */
  getCredentialInfo(): GCPCredentialInfo {
    return {
      projectId: this.projectId,
      authenticated: false,
    };
  }
}
