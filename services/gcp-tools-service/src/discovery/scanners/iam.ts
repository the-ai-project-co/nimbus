/**
 * IAM Scanner
 *
 * Discovers GCP IAM service accounts and custom roles
 */

import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource } from '../types';

const iam = require('@google-cloud/iam');

/**
 * IAM Scanner
 */
export class IAMScanner extends BaseScanner {
  readonly serviceName = 'IAM';
  readonly isGlobal = true;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    const [serviceAccounts, customRoles] = await Promise.all([
      this.scanServiceAccounts(context),
      this.scanCustomRoles(context),
    ]);

    resources.push(...serviceAccounts, ...customRoles);

    logger.debug(`IAM scanner found ${resources.length} resources`, {
      projectId: context.projectId,
      serviceAccounts: serviceAccounts.length,
      customRoles: customRoles.length,
    });

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return [
      'iam.googleapis.com/ServiceAccount',
      'iam.googleapis.com/Role',
    ];
  }

  private async scanServiceAccounts(context: ScannerContext): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      const iamClient = new iam.IAMClient();
      const request = {
        name: `projects/${context.projectId}`,
      };

      const iterable = iamClient.listServiceAccountsAsync(request);

      for await (const account of iterable) {
        if (!account.email) continue;

        resources.push(this.createResource({
          id: account.uniqueId || account.email,
          selfLink: account.name || `projects/${context.projectId}/serviceAccounts/${account.email}`,
          gcpType: 'iam.googleapis.com/ServiceAccount',
          region: 'global',
          name: account.email,
          labels: {},
          properties: {
            email: account.email,
            displayName: account.displayName,
            description: account.description,
            disabled: account.disabled || false,
            projectId: account.projectId,
            uniqueId: account.uniqueId,
            oauth2ClientId: account.oauth2ClientId,
          },
        }));
      }
    } catch (error: any) {
      this.recordError('listServiceAccounts', error.message, context.region, error.code);
    }

    return resources;
  }

  private async scanCustomRoles(context: ScannerContext): Promise<DiscoveredResource[]> {
    const resources: DiscoveredResource[] = [];

    try {
      const iamClient = new iam.IAMClient();
      const request = {
        parent: `projects/${context.projectId}`,
        view: 'BASIC',
      };

      const iterable = iamClient.listRolesAsync(request);

      for await (const role of iterable) {
        if (!role.name) continue;

        // Extract role ID from the full name
        const roleId = role.name.split('/').pop() || role.name;

        resources.push(this.createResource({
          id: roleId,
          selfLink: role.name,
          gcpType: 'iam.googleapis.com/Role',
          region: 'global',
          name: role.title || roleId,
          labels: {},
          properties: {
            title: role.title,
            description: role.description,
            stage: role.stage,
            deleted: role.deleted || false,
            includedPermissions: role.includedPermissions || [],
            etag: role.etag,
          },
        }));
      }
    } catch (error: any) {
      this.recordError('listRoles', error.message, context.region, error.code);
    }

    return resources;
  }
}
