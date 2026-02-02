import {
  S3Client,
  ListBucketsCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  GetBucketLocationCommand,
  PutBucketTaggingCommand,
  GetBucketTaggingCommand,
  type ListObjectsV2CommandInput,
} from '@aws-sdk/client-s3';
import { logger } from '@nimbus/shared-utils';

export interface S3Config {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface ListObjectsOptions {
  bucket: string;
  prefix?: string;
  delimiter?: string;
  maxKeys?: number;
  continuationToken?: string;
}

export interface PutObjectOptions {
  bucket: string;
  key: string;
  body: string | Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
}

export interface CopyObjectOptions {
  sourceBucket: string;
  sourceKey: string;
  destinationBucket: string;
  destinationKey: string;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * S3 operations using AWS SDK
 */
export class S3Operations {
  private client: S3Client;
  private region: string;

  constructor(config: S3Config = {}) {
    this.region = config.region || process.env.AWS_REGION || 'us-east-1';

    const clientConfig: any = {
      region: this.region,
    };

    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        sessionToken: config.sessionToken,
      };
    }

    this.client = new S3Client(clientConfig);
  }

  /**
   * List all buckets
   */
  async listBuckets(): Promise<OperationResult> {
    try {
      const command = new ListBucketsCommand({});
      const response = await this.client.send(command);

      const buckets = response.Buckets?.map((b) => ({
        name: b.Name,
        creationDate: b.CreationDate,
      }));

      return {
        success: true,
        data: {
          buckets: buckets || [],
          owner: {
            id: response.Owner?.ID,
            displayName: response.Owner?.DisplayName,
          },
        },
      };
    } catch (error: any) {
      logger.error('Failed to list buckets', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List objects in a bucket
   */
  async listObjects(options: ListObjectsOptions): Promise<OperationResult> {
    try {
      const input: ListObjectsV2CommandInput = {
        Bucket: options.bucket,
      };

      if (options.prefix) {
        input.Prefix = options.prefix;
      }

      if (options.delimiter) {
        input.Delimiter = options.delimiter;
      }

      if (options.maxKeys) {
        input.MaxKeys = options.maxKeys;
      }

      if (options.continuationToken) {
        input.ContinuationToken = options.continuationToken;
      }

      const command = new ListObjectsV2Command(input);
      const response = await this.client.send(command);

      const objects = response.Contents?.map((o) => ({
        key: o.Key,
        size: o.Size,
        lastModified: o.LastModified,
        etag: o.ETag,
        storageClass: o.StorageClass,
      }));

      const commonPrefixes = response.CommonPrefixes?.map((p) => p.Prefix);

      return {
        success: true,
        data: {
          objects: objects || [],
          commonPrefixes: commonPrefixes || [],
          isTruncated: response.IsTruncated,
          nextContinuationToken: response.NextContinuationToken,
          keyCount: response.KeyCount,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list objects', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get object from bucket
   */
  async getObject(bucket: string, key: string): Promise<OperationResult> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      // Convert stream to string for small objects
      const body = await response.Body?.transformToString();

      return {
        success: true,
        data: {
          body,
          contentType: response.ContentType,
          contentLength: response.ContentLength,
          lastModified: response.LastModified,
          etag: response.ETag,
          metadata: response.Metadata,
        },
      };
    } catch (error: any) {
      logger.error('Failed to get object', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get object metadata (head object)
   */
  async headObject(bucket: string, key: string): Promise<OperationResult> {
    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          contentType: response.ContentType,
          contentLength: response.ContentLength,
          lastModified: response.LastModified,
          etag: response.ETag,
          metadata: response.Metadata,
          storageClass: response.StorageClass,
        },
      };
    } catch (error: any) {
      logger.error('Failed to head object', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Put object to bucket
   */
  async putObject(options: PutObjectOptions): Promise<OperationResult> {
    try {
      const command = new PutObjectCommand({
        Bucket: options.bucket,
        Key: options.key,
        Body: options.body,
        ContentType: options.contentType,
        Metadata: options.metadata,
        Tagging: options.tags
          ? Object.entries(options.tags)
              .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
              .join('&')
          : undefined,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          etag: response.ETag,
          versionId: response.VersionId,
        },
      };
    } catch (error: any) {
      logger.error('Failed to put object', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete object from bucket
   */
  async deleteObject(bucket: string, key: string): Promise<OperationResult> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          deleteMarker: response.DeleteMarker,
          versionId: response.VersionId,
        },
      };
    } catch (error: any) {
      logger.error('Failed to delete object', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete multiple objects from bucket
   */
  async deleteObjects(bucket: string, keys: string[]): Promise<OperationResult> {
    try {
      const command = new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keys.map((key) => ({ Key: key })),
        },
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          deleted: response.Deleted?.map((d) => d.Key),
          errors: response.Errors?.map((e) => ({
            key: e.Key,
            code: e.Code,
            message: e.Message,
          })),
        },
      };
    } catch (error: any) {
      logger.error('Failed to delete objects', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Copy object
   */
  async copyObject(options: CopyObjectOptions): Promise<OperationResult> {
    try {
      const command = new CopyObjectCommand({
        Bucket: options.destinationBucket,
        Key: options.destinationKey,
        CopySource: `${options.sourceBucket}/${options.sourceKey}`,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          etag: response.CopyObjectResult?.ETag,
          lastModified: response.CopyObjectResult?.LastModified,
        },
      };
    } catch (error: any) {
      logger.error('Failed to copy object', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a bucket
   */
  async createBucket(bucket: string, region?: string): Promise<OperationResult> {
    try {
      const targetRegion = region || this.region;

      const command = new CreateBucketCommand({
        Bucket: bucket,
        CreateBucketConfiguration:
          targetRegion !== 'us-east-1'
            ? { LocationConstraint: targetRegion as any }
            : undefined,
      });

      await this.client.send(command);

      return {
        success: true,
        data: {
          bucket,
          region: targetRegion,
        },
      };
    } catch (error: any) {
      logger.error('Failed to create bucket', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete a bucket
   */
  async deleteBucket(bucket: string): Promise<OperationResult> {
    try {
      const command = new DeleteBucketCommand({
        Bucket: bucket,
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Bucket ${bucket} deleted` },
      };
    } catch (error: any) {
      logger.error('Failed to delete bucket', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get bucket location
   */
  async getBucketLocation(bucket: string): Promise<OperationResult> {
    try {
      const command = new GetBucketLocationCommand({
        Bucket: bucket,
      });

      const response = await this.client.send(command);

      return {
        success: true,
        data: {
          location: response.LocationConstraint || 'us-east-1',
        },
      };
    } catch (error: any) {
      logger.error('Failed to get bucket location', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Set bucket tags
   */
  async setBucketTags(bucket: string, tags: Record<string, string>): Promise<OperationResult> {
    try {
      const command = new PutBucketTaggingCommand({
        Bucket: bucket,
        Tagging: {
          TagSet: Object.entries(tags).map(([Key, Value]) => ({ Key, Value })),
        },
      });

      await this.client.send(command);

      return {
        success: true,
        data: { message: `Tags set for bucket ${bucket}` },
      };
    } catch (error: any) {
      logger.error('Failed to set bucket tags', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get bucket tags
   */
  async getBucketTags(bucket: string): Promise<OperationResult> {
    try {
      const command = new GetBucketTaggingCommand({
        Bucket: bucket,
      });

      const response = await this.client.send(command);

      const tags = response.TagSet?.reduce(
        (acc, tag) => {
          if (tag.Key) acc[tag.Key] = tag.Value || '';
          return acc;
        },
        {} as Record<string, string>
      );

      return {
        success: true,
        data: { tags: tags || {} },
      };
    } catch (error: any) {
      if (error.name === 'NoSuchTagSet') {
        return {
          success: true,
          data: { tags: {} },
        };
      }
      logger.error('Failed to get bucket tags', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
