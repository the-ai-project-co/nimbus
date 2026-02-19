/**
 * Cloud Storage Scanner
 *
 * Discovers GCP Cloud Storage buckets
 */

import { Storage } from '@google-cloud/storage';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource } from '../types';

/**
 * Cloud Storage Scanner
 */
export class StorageScanner extends BaseScanner {
  readonly serviceName = 'Storage';
  readonly isGlobal = true;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    try {
      const storage = new Storage({ projectId: context.projectId });
      const [buckets] = await storage.getBuckets({ project: context.projectId });

      for (const bucket of buckets) {
        const metadata = bucket.metadata || {};

        resources.push(this.createResource({
          id: bucket.name || '',
          selfLink: metadata.selfLink || `https://storage.googleapis.com/storage/v1/b/${bucket.name}`,
          gcpType: 'storage.googleapis.com/Bucket',
          region: (metadata.location || 'US').toLowerCase(),
          name: bucket.name,
          labels: this.labelsToRecord(metadata.labels),
          properties: {
            location: metadata.location,
            storageClass: metadata.storageClass,
            versioning: metadata.versioning?.enabled || false,
            uniformBucketLevelAccess: metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled || false,
            publicAccessPrevention: metadata.iamConfiguration?.publicAccessPrevention,
            lifecycle: metadata.lifecycle?.rule || [],
            cors: metadata.cors || [],
            logging: metadata.logging || null,
            website: metadata.website || null,
            encryption: metadata.encryption || null,
            retentionPolicy: metadata.retentionPolicy || null,
            defaultEventBasedHold: metadata.defaultEventBasedHold || false,
            autoclass: metadata.autoclass || null,
          },
          createdAt: metadata.timeCreated ? new Date(metadata.timeCreated) : undefined,
        }));
      }

      logger.debug(`Storage scanner found ${resources.length} buckets`, {
        projectId: context.projectId,
      });
    } catch (error: any) {
      this.recordError('listBuckets', error.message, context.region, error.code);
    }

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return ['storage.googleapis.com/Bucket'];
  }
}
