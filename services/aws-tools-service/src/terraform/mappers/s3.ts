/**
 * S3 Resource Mappers
 *
 * Maps S3 resources to Terraform configuration
 */

import type { DiscoveredResource } from '../../discovery/types';
import type {
  MappingContext,
  TerraformResource,
  TerraformOutput,
  TerraformValue,
} from '../types';
import { BaseResourceMapper } from './base';

/**
 * S3 Bucket Mapper
 */
export class S3BucketMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::S3::Bucket';
  readonly terraformType = 'aws_s3_bucket';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const name = this.generateResourceName(resource);

    const attributes: Record<string, TerraformValue> = {};

    // Bucket name
    attributes.bucket = resource.id;

    // Tags
    const tags = this.mapTags(resource.tags);
    if (Object.keys(tags).length > 0) {
      attributes.tags = tags;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }

  getSuggestedOutputs(resource: DiscoveredResource): TerraformOutput[] {
    const name = this.generateResourceName(resource);
    return [
      {
        name: `${name}_id`,
        value: `aws_s3_bucket.${name}.id`,
        description: `ID of S3 bucket ${resource.id}`,
      },
      {
        name: `${name}_arn`,
        value: `aws_s3_bucket.${name}.arn`,
        description: `ARN of S3 bucket ${resource.id}`,
      },
      {
        name: `${name}_domain_name`,
        value: `aws_s3_bucket.${name}.bucket_domain_name`,
        description: `Domain name of S3 bucket ${resource.id}`,
      },
    ];
  }
}

/**
 * S3 Bucket Versioning Mapper
 * Creates a separate aws_s3_bucket_versioning resource
 */
export class S3BucketVersioningMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::S3::Bucket::Versioning';
  readonly terraformType = 'aws_s3_bucket_versioning';

  // This is generated from the S3 bucket, not discovered directly
  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const versioning = props.versioning as { status?: string } | undefined;

    if (!versioning || !versioning.status) {
      return null;
    }

    const bucketName = this.generateResourceName(resource);
    const name = `${bucketName}_versioning`;

    const attributes: Record<string, TerraformValue> = {
      bucket: this.createReference(`aws_s3_bucket.${bucketName}.id`),
    };

    attributes.versioning_configuration = this.createBlock({
      status: versioning.status === 'Enabled' ? 'Enabled' : 'Suspended',
    });

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
      dependsOn: [`aws_s3_bucket.${bucketName}`],
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * S3 Bucket Server Side Encryption Mapper
 */
export class S3BucketEncryptionMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::S3::Bucket::Encryption';
  readonly terraformType = 'aws_s3_bucket_server_side_encryption_configuration';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const encryption = props.encryption as { algorithm?: string; kmsKeyId?: string } | undefined;

    if (!encryption) {
      return null;
    }

    const bucketName = this.generateResourceName(resource);
    const name = `${bucketName}_encryption`;

    const attributes: Record<string, TerraformValue> = {
      bucket: this.createReference(`aws_s3_bucket.${bucketName}.id`),
    };

    const ruleAttrs: Record<string, TerraformValue> = {};
    const applyAttrs: Record<string, TerraformValue> = {
      sse_algorithm: encryption.algorithm || 'AES256',
    };

    if (encryption.kmsKeyId) {
      applyAttrs.kms_master_key_id = encryption.kmsKeyId;
    }

    ruleAttrs.apply_server_side_encryption_by_default = this.createBlock(applyAttrs);
    attributes.rule = [this.createBlock(ruleAttrs)];

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
      dependsOn: [`aws_s3_bucket.${bucketName}`],
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * S3 Bucket Public Access Block Mapper
 */
export class S3BucketPublicAccessBlockMapper extends BaseResourceMapper {
  readonly awsType = 'AWS::S3::Bucket::PublicAccessBlock';
  readonly terraformType = 'aws_s3_bucket_public_access_block';

  map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null {
    const props = resource.properties;
    const pab = props.publicAccessBlock as {
      blockPublicAcls?: boolean;
      ignorePublicAcls?: boolean;
      blockPublicPolicy?: boolean;
      restrictPublicBuckets?: boolean;
    } | undefined;

    if (!pab) {
      return null;
    }

    const bucketName = this.generateResourceName(resource);
    const name = `${bucketName}_public_access_block`;

    const attributes: Record<string, TerraformValue> = {
      bucket: this.createReference(`aws_s3_bucket.${bucketName}.id`),
    };

    if (pab.blockPublicAcls !== undefined) {
      attributes.block_public_acls = pab.blockPublicAcls;
    }
    if (pab.ignorePublicAcls !== undefined) {
      attributes.ignore_public_acls = pab.ignorePublicAcls;
    }
    if (pab.blockPublicPolicy !== undefined) {
      attributes.block_public_policy = pab.blockPublicPolicy;
    }
    if (pab.restrictPublicBuckets !== undefined) {
      attributes.restrict_public_buckets = pab.restrictPublicBuckets;
    }

    return {
      type: this.terraformType,
      name,
      attributes,
      sourceResource: resource,
      dependsOn: [`aws_s3_bucket.${bucketName}`],
    };
  }

  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }
}

/**
 * Get all S3 mappers
 */
export function getS3Mappers(): BaseResourceMapper[] {
  return [
    new S3BucketMapper(),
  ];
}

/**
 * Get additional S3 resource mappers (versioning, encryption, etc.)
 * These generate supplementary resources from S3 bucket properties
 */
export function getS3SupplementaryMappers(): BaseResourceMapper[] {
  return [
    new S3BucketVersioningMapper(),
    new S3BucketEncryptionMapper(),
    new S3BucketPublicAccessBlockMapper(),
  ];
}
