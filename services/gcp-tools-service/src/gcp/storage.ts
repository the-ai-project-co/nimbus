/**
 * GCP Cloud Storage Operations
 *
 * Provides operations for managing Cloud Storage buckets and objects
 */

import { Storage } from '@google-cloud/storage';
import { logger } from '@nimbus/shared-utils';

export interface StorageConfig {
  projectId?: string;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Cloud Storage operations using Google Cloud SDK
 */
export class StorageOperations {
  private storage: Storage;
  private projectId: string;

  constructor(config: StorageConfig = {}) {
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
    this.storage = new Storage({
      projectId: this.projectId || undefined,
    });
  }

  /**
   * List Cloud Storage buckets
   */
  async listBuckets(project?: string): Promise<OperationResult> {
    try {
      const effectiveProject = project || this.projectId;
      if (!effectiveProject) {
        return { success: false, error: 'No project specified. Set GOOGLE_CLOUD_PROJECT or pass project parameter.' };
      }

      const [buckets] = await this.storage.getBuckets({
        project: effectiveProject,
      });

      const mappedBuckets = buckets.map((bucket) => ({
        name: bucket.name,
        selfLink: bucket.metadata?.selfLink,
        location: bucket.metadata?.location,
        storageClass: bucket.metadata?.storageClass,
        timeCreated: bucket.metadata?.timeCreated,
        updated: bucket.metadata?.updated,
        versioning: bucket.metadata?.versioning?.enabled || false,
        labels: bucket.metadata?.labels || {},
        iamConfiguration: {
          uniformBucketLevelAccess: bucket.metadata?.iamConfiguration?.uniformBucketLevelAccess?.enabled || false,
        },
        lifecycle: bucket.metadata?.lifecycle?.rule || [],
        encryption: bucket.metadata?.encryption || null,
        retentionPolicy: bucket.metadata?.retentionPolicy || null,
      }));

      return {
        success: true,
        data: { buckets: mappedBuckets },
      };
    } catch (error: any) {
      logger.error('Failed to list buckets', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List objects in a Cloud Storage bucket
   */
  async listObjects(
    bucket: string,
    options: { prefix?: string; maxResults?: number } = {}
  ): Promise<OperationResult> {
    try {
      if (!bucket) {
        return { success: false, error: 'Missing required parameter: bucket' };
      }

      const queryOptions: any = {};
      if (options.prefix) {
        queryOptions.prefix = options.prefix;
      }
      if (options.maxResults) {
        queryOptions.maxResults = options.maxResults;
      }

      const [files] = await this.storage.bucket(bucket).getFiles(queryOptions);

      const objects = files.map((file) => ({
        name: file.name,
        selfLink: file.metadata?.selfLink,
        bucket: file.metadata?.bucket,
        size: file.metadata?.size,
        contentType: file.metadata?.contentType,
        timeCreated: file.metadata?.timeCreated,
        updated: file.metadata?.updated,
        storageClass: file.metadata?.storageClass,
        md5Hash: file.metadata?.md5Hash,
        crc32c: file.metadata?.crc32c,
        metadata: file.metadata?.metadata || {},
      }));

      return {
        success: true,
        data: { objects, bucket },
      };
    } catch (error: any) {
      logger.error('Failed to list objects', error);
      return { success: false, error: error.message };
    }
  }
}
