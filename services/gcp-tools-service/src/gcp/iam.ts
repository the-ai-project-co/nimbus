/**
 * GCP IAM Operations
 *
 * Provides operations for managing IAM service accounts and roles
 */

import { logger } from '@nimbus/shared-utils';

const iam = require('@google-cloud/iam');

export interface IAMConfig {
  projectId?: string;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * IAM operations using Google Cloud SDK
 */
export class IAMOperations {
  private projectId: string;

  constructor(config: IAMConfig = {}) {
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  }

  /**
   * List IAM service accounts for a project
   */
  async listServiceAccounts(project: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.' };
      }

      const iamClient = new iam.IAMClient();
      const request = {
        name: `projects/${effectiveProject}`,
      };

      const serviceAccounts: any[] = [];
      const iterable = iamClient.listServiceAccountsAsync(request);

      for await (const account of iterable) {
        serviceAccounts.push({
          name: account.name,
          email: account.email,
          uniqueId: account.uniqueId,
          displayName: account.displayName,
          description: account.description,
          disabled: account.disabled || false,
          projectId: account.projectId,
          oauth2ClientId: account.oauth2ClientId,
        });
      }

      return {
        success: true,
        data: { serviceAccounts },
      };
    } catch (error: any) {
      logger.error('Failed to list service accounts', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List IAM roles
   */
  async listRoles(project?: string): Promise<OperationResult> {
    try {
      const iamClient = new iam.IAMClient();
      const roles: any[] = [];

      if (project || this.projectId) {
        const effectiveProject = project || this.projectId;
        const request = {
          parent: `projects/${effectiveProject}`,
          view: 'BASIC',
        };

        const iterable = iamClient.listRolesAsync(request);
        for await (const role of iterable) {
          roles.push({
            name: role.name,
            title: role.title,
            description: role.description,
            stage: role.stage,
            deleted: role.deleted || false,
            includedPermissions: role.includedPermissions || [],
            etag: role.etag,
          });
        }
      } else {
        const request = {
          view: 'BASIC',
        };

        const iterable = iamClient.listRolesAsync(request);
        for await (const role of iterable) {
          roles.push({
            name: role.name,
            title: role.title,
            description: role.description,
            stage: role.stage,
            deleted: role.deleted || false,
          });
        }
      }

      return {
        success: true,
        data: { roles },
      };
    } catch (error: any) {
      logger.error('Failed to list roles', error);
      return { success: false, error: error.message };
    }
  }
}
