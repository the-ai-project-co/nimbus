/**
 * S3 Scanner
 *
 * Discovers S3 buckets and their configurations including
 * versioning, encryption, lifecycle policies, and access settings
 */

import {
  S3Client,
  ListBucketsCommand,
  GetBucketLocationCommand,
  GetBucketVersioningCommand,
  GetBucketEncryptionCommand,
  GetBucketPolicyCommand,
  GetBucketTaggingCommand,
  GetBucketLifecycleConfigurationCommand,
  GetBucketLoggingCommand,
  GetPublicAccessBlockCommand,
  type Bucket,
} from '@aws-sdk/client-s3';
import { logger } from '@nimbus/shared-utils';
import { BaseScanner, type ScannerContext, type ScanResult } from './base';
import type { DiscoveredResource, ResourceRelationship } from '../types';

/**
 * S3 Scanner - discovers S3 buckets and their configurations
 */
export class S3Scanner extends BaseScanner {
  readonly serviceName = 'S3';
  readonly isGlobal = true; // S3 ListBuckets is global

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();
    const resources: DiscoveredResource[] = [];

    // S3 ListBuckets is a global operation - only run from us-east-1
    if (context.region !== 'us-east-1') {
      return { resources: [], errors: [] };
    }

    const client = new S3Client({
      region: context.region,
      credentials: context.credentials,
    });

    try {
      const listCommand = new ListBucketsCommand({});
      const response = await this.withRateLimit(context, () => client.send(listCommand));

      if (response.Buckets) {
        // Process buckets in batches to respect rate limits
        const bucketPromises = response.Buckets.map(bucket =>
          this.processBucket(bucket, context)
        );

        const results = await Promise.allSettled(bucketPromises);

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            resources.push(result.value);
          }
        }
      }

      logger.debug(`S3 scanner found ${resources.length} buckets`, {
        region: context.region,
      });
    } catch (error: any) {
      this.recordError('ListBuckets', error.message, context.region, error.code);
    }

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return ['AWS::S3::Bucket'];
  }

  /**
   * Process a single bucket and retrieve its configuration
   */
  private async processBucket(
    bucket: Bucket,
    context: ScannerContext
  ): Promise<DiscoveredResource | null> {
    if (!bucket.Name) return null;

    const bucketName = bucket.Name;

    // Create a client for each bucket based on its region
    const bucketRegion = await this.getBucketRegion(bucket.Name, context);
    const bucketClient = new S3Client({
      region: bucketRegion || 'us-east-1',
      credentials: context.credentials,
    });

    const relationships: ResourceRelationship[] = [];
    const properties: Record<string, unknown> = {
      creationDate: bucket.CreationDate,
    };

    // Get bucket configurations in parallel
    const [versioning, encryption, policy, tags, lifecycle, logging, publicAccess] =
      await Promise.allSettled([
        this.getBucketVersioning(bucketClient, bucketName, context),
        this.getBucketEncryption(bucketClient, bucketName, context),
        this.getBucketPolicy(bucketClient, bucketName, context),
        this.getBucketTags(bucketClient, bucketName, context),
        this.getBucketLifecycle(bucketClient, bucketName, context),
        this.getBucketLogging(bucketClient, bucketName, context),
        this.getPublicAccessBlock(bucketClient, bucketName, context),
      ]);

    // Process versioning
    if (versioning.status === 'fulfilled') {
      properties.versioning = versioning.value;
    }

    // Process encryption
    if (encryption.status === 'fulfilled' && encryption.value) {
      properties.encryption = encryption.value;
      // Add KMS key relationship if present
      if (encryption.value.kmsKeyId) {
        relationships.push({
          type: 'references',
          targetArn: encryption.value.kmsKeyId,
          targetType: 'aws_kms_key',
        });
      }
    }

    // Process policy
    if (policy.status === 'fulfilled' && policy.value) {
      properties.policy = policy.value;
    }

    // Process lifecycle
    if (lifecycle.status === 'fulfilled' && lifecycle.value) {
      properties.lifecycleRules = lifecycle.value;
    }

    // Process logging
    if (logging.status === 'fulfilled' && logging.value) {
      properties.logging = logging.value;
      // Add target bucket relationship
      if (logging.value.targetBucket) {
        relationships.push({
          type: 'references',
          targetArn: `arn:aws:s3:::${logging.value.targetBucket}`,
          targetType: 'aws_s3_bucket',
        });
      }
    }

    // Process public access block
    if (publicAccess.status === 'fulfilled' && publicAccess.value) {
      properties.publicAccessBlock = publicAccess.value;
    }

    // Get tags
    let tagRecord: Record<string, string> = {};
    if (tags.status === 'fulfilled' && tags.value) {
      tagRecord = tags.value;
    }

    return this.createResource({
      id: bucketName,
      arn: `arn:aws:s3:::${bucketName}`,
      awsType: 'AWS::S3::Bucket',
      region: bucketRegion || 'us-east-1',
      name: bucketName,
      tags: tagRecord,
      properties,
      relationships,
      createdAt: bucket.CreationDate,
    });
  }

  /**
   * Get the region where a bucket is located
   */
  private async getBucketRegion(
    bucketName: string,
    context: ScannerContext
  ): Promise<string | null> {
    const client = new S3Client({
      region: 'us-east-1',
      credentials: context.credentials,
    });

    try {
      const command = new GetBucketLocationCommand({ Bucket: bucketName });
      const response = await this.withRateLimit(context, () => client.send(command));

      // null/empty LocationConstraint means us-east-1
      return response.LocationConstraint || 'us-east-1';
    } catch (error: any) {
      this.recordError('GetBucketLocation', error.message, 'us-east-1', error.code);
      return null;
    }
  }

  /**
   * Get bucket versioning configuration
   */
  private async getBucketVersioning(
    client: S3Client,
    bucketName: string,
    context: ScannerContext
  ): Promise<{ status?: string; mfaDelete?: string }> {
    try {
      const command = new GetBucketVersioningCommand({ Bucket: bucketName });
      const response = await this.withRateLimit(context, () => client.send(command));

      return {
        status: response.Status,
        mfaDelete: response.MFADelete,
      };
    } catch (error: any) {
      // Versioning not configured is not an error
      return {};
    }
  }

  /**
   * Get bucket encryption configuration
   */
  private async getBucketEncryption(
    client: S3Client,
    bucketName: string,
    context: ScannerContext
  ): Promise<{ algorithm?: string; kmsKeyId?: string } | null> {
    try {
      const command = new GetBucketEncryptionCommand({ Bucket: bucketName });
      const response = await this.withRateLimit(context, () => client.send(command));

      const rule = response.ServerSideEncryptionConfiguration?.Rules?.[0];
      if (rule?.ApplyServerSideEncryptionByDefault) {
        return {
          algorithm: rule.ApplyServerSideEncryptionByDefault.SSEAlgorithm,
          kmsKeyId: rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID,
        };
      }

      return null;
    } catch (error: any) {
      // ServerSideEncryptionConfigurationNotFoundError means no encryption
      if (error.name === 'ServerSideEncryptionConfigurationNotFoundError') {
        return null;
      }
      return null;
    }
  }

  /**
   * Get bucket policy
   */
  private async getBucketPolicy(
    client: S3Client,
    bucketName: string,
    context: ScannerContext
  ): Promise<unknown | null> {
    try {
      const command = new GetBucketPolicyCommand({ Bucket: bucketName });
      const response = await this.withRateLimit(context, () => client.send(command));

      if (response.Policy) {
        return JSON.parse(response.Policy);
      }
      return null;
    } catch (error: any) {
      // NoSuchBucketPolicy means no policy configured
      if (error.name === 'NoSuchBucketPolicy') {
        return null;
      }
      return null;
    }
  }

  /**
   * Get bucket tags
   */
  private async getBucketTags(
    client: S3Client,
    bucketName: string,
    context: ScannerContext
  ): Promise<Record<string, string> | null> {
    try {
      const command = new GetBucketTaggingCommand({ Bucket: bucketName });
      const response = await this.withRateLimit(context, () => client.send(command));

      if (response.TagSet) {
        return response.TagSet.reduce((acc, tag) => {
          if (tag.Key) {
            acc[tag.Key] = tag.Value || '';
          }
          return acc;
        }, {} as Record<string, string>);
      }
      return null;
    } catch (error: any) {
      // NoSuchTagSet means no tags
      if (error.name === 'NoSuchTagSet') {
        return null;
      }
      return null;
    }
  }

  /**
   * Get bucket lifecycle configuration
   */
  private async getBucketLifecycle(
    client: S3Client,
    bucketName: string,
    context: ScannerContext
  ): Promise<unknown[] | null> {
    try {
      const command = new GetBucketLifecycleConfigurationCommand({ Bucket: bucketName });
      const response = await this.withRateLimit(context, () => client.send(command));

      if (response.Rules) {
        return response.Rules.map(rule => ({
          id: rule.ID,
          status: rule.Status,
          prefix: rule.Prefix,
          filter: rule.Filter,
          transitions: rule.Transitions,
          expiration: rule.Expiration,
          noncurrentVersionTransitions: rule.NoncurrentVersionTransitions,
          noncurrentVersionExpiration: rule.NoncurrentVersionExpiration,
          abortIncompleteMultipartUpload: rule.AbortIncompleteMultipartUpload,
        }));
      }
      return null;
    } catch (error: any) {
      // NoSuchLifecycleConfiguration means no lifecycle rules
      if (error.name === 'NoSuchLifecycleConfiguration') {
        return null;
      }
      return null;
    }
  }

  /**
   * Get bucket logging configuration
   */
  private async getBucketLogging(
    client: S3Client,
    bucketName: string,
    context: ScannerContext
  ): Promise<{ targetBucket?: string; targetPrefix?: string } | null> {
    try {
      const command = new GetBucketLoggingCommand({ Bucket: bucketName });
      const response = await this.withRateLimit(context, () => client.send(command));

      if (response.LoggingEnabled) {
        return {
          targetBucket: response.LoggingEnabled.TargetBucket,
          targetPrefix: response.LoggingEnabled.TargetPrefix,
        };
      }
      return null;
    } catch (error: any) {
      return null;
    }
  }

  /**
   * Get public access block configuration
   */
  private async getPublicAccessBlock(
    client: S3Client,
    bucketName: string,
    context: ScannerContext
  ): Promise<{
    blockPublicAcls?: boolean;
    ignorePublicAcls?: boolean;
    blockPublicPolicy?: boolean;
    restrictPublicBuckets?: boolean;
  } | null> {
    try {
      const command = new GetPublicAccessBlockCommand({ Bucket: bucketName });
      const response = await this.withRateLimit(context, () => client.send(command));

      if (response.PublicAccessBlockConfiguration) {
        return {
          blockPublicAcls: response.PublicAccessBlockConfiguration.BlockPublicAcls,
          ignorePublicAcls: response.PublicAccessBlockConfiguration.IgnorePublicAcls,
          blockPublicPolicy: response.PublicAccessBlockConfiguration.BlockPublicPolicy,
          restrictPublicBuckets: response.PublicAccessBlockConfiguration.RestrictPublicBuckets,
        };
      }
      return null;
    } catch (error: any) {
      // NoSuchPublicAccessBlockConfiguration means not configured
      if (error.name === 'NoSuchPublicAccessBlockConfiguration') {
        return null;
      }
      return null;
    }
  }
}
