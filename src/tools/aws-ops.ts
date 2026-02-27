/**
 * AWS Operations — Embedded tool (stripped HTTP wrappers)
 *
 * Merged from services/aws-tools-service/src/aws/ec2.ts, s3.ts, iam.ts
 * Uses lazy imports for AWS SDK to keep binary size small.
 */

import { logger } from '../utils';

// ==========================================
// Shared Types
// ==========================================

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AwsConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

// ==========================================
// EC2 Types
// ==========================================

export interface ListInstancesOptions {
  instanceIds?: string[];
  filters?: Record<string, string[]>;
  maxResults?: number;
  nextToken?: string;
}

export interface RunInstanceOptions {
  imageId: string;
  instanceType: string;
  minCount?: number;
  maxCount?: number;
  keyName?: string;
  securityGroupIds?: string[];
  subnetId?: string;
  userData?: string;
  tags?: Record<string, string>;
  ebsOptimized?: boolean;
  monitoring?: boolean;
}

// ==========================================
// S3 Types
// ==========================================

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

// ==========================================
// IAM Types
// ==========================================

export interface IAMListOptions {
  maxItems?: number;
  marker?: string;
  pathPrefix?: string;
}

export interface CreateRoleOptions {
  roleName: string;
  assumeRolePolicyDocument: string;
  description?: string;
  path?: string;
  maxSessionDuration?: number;
  tags?: Record<string, string>;
}

export interface CreatePolicyOptions {
  policyName: string;
  policyDocument: string;
  description?: string;
  path?: string;
  tags?: Record<string, string>;
}

/**
 * Unified AWS Operations class merging EC2, S3, and IAM operations.
 * All AWS SDK imports are lazy to minimize binary size.
 */
export class AwsOperations {
  private config: AwsConfig;

  constructor(config: AwsConfig = {}) {
    this.config = {
      region: config.region || process.env.AWS_REGION || 'us-east-1',
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    };
  }

  /**
   * Build common client config
   */
  private getClientConfig(): Record<string, any> {
    const clientConfig: Record<string, any> = {
      region: this.config.region,
    };

    if (this.config.accessKeyId && this.config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
        sessionToken: this.config.sessionToken,
      };
    }

    return clientConfig;
  }

  // ==========================================
  // EC2 Operations
  // ==========================================

  /**
   * List EC2 instances
   */
  async listInstances(options: ListInstancesOptions = {}): Promise<OperationResult> {
    try {
      const { EC2Client, DescribeInstancesCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const input: any = {};

      if (options.instanceIds && options.instanceIds.length > 0) {
        input.InstanceIds = options.instanceIds;
      }

      if (options.filters) {
        input.Filters = Object.entries(options.filters).map(([name, values]) => ({
          Name: name,
          Values: values,
        }));
      }

      if (options.maxResults) {
        input.MaxResults = options.maxResults;
      }

      if (options.nextToken) {
        input.NextToken = options.nextToken;
      }

      const command = new DescribeInstancesCommand(input);
      const response = await client.send(command);

      const instances = response.Reservations?.flatMap(
        (r: any) =>
          r.Instances?.map((i: any) => ({
            instanceId: i.InstanceId,
            instanceType: i.InstanceType,
            state: i.State?.Name,
            publicIpAddress: i.PublicIpAddress,
            privateIpAddress: i.PrivateIpAddress,
            launchTime: i.LaunchTime,
            availabilityZone: i.Placement?.AvailabilityZone,
            vpcId: i.VpcId,
            subnetId: i.SubnetId,
            imageId: i.ImageId,
            keyName: i.KeyName,
            tags: i.Tags?.reduce(
              (acc: any, tag: any) => {
                if (tag.Key) {
                  acc[tag.Key] = tag.Value || '';
                }
                return acc;
              },
              {} as Record<string, string>
            ),
          })) || []
      );

      return {
        success: true,
        data: {
          instances: instances || [],
          nextToken: response.NextToken,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list instances', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start EC2 instances
   */
  async startInstances(instanceIds: string[]): Promise<OperationResult> {
    try {
      const { EC2Client, StartInstancesCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const command = new StartInstancesCommand({ InstanceIds: instanceIds });
      const response = await client.send(command);

      const results = response.StartingInstances?.map((i: any) => ({
        instanceId: i.InstanceId,
        previousState: i.PreviousState?.Name,
        currentState: i.CurrentState?.Name,
      }));

      return { success: true, data: { instances: results || [] } };
    } catch (error: any) {
      logger.error('Failed to start instances', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start a single instance (convenience wrapper)
   */
  async startInstance(instanceId: string): Promise<OperationResult> {
    return this.startInstances([instanceId]);
  }

  /**
   * Stop EC2 instances
   */
  async stopInstances(instanceIds: string[], force?: boolean): Promise<OperationResult> {
    try {
      const { EC2Client, StopInstancesCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const command = new StopInstancesCommand({ InstanceIds: instanceIds, Force: force });
      const response = await client.send(command);

      const results = response.StoppingInstances?.map((i: any) => ({
        instanceId: i.InstanceId,
        previousState: i.PreviousState?.Name,
        currentState: i.CurrentState?.Name,
      }));

      return { success: true, data: { instances: results || [] } };
    } catch (error: any) {
      logger.error('Failed to stop instances', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop a single instance (convenience wrapper)
   */
  async stopInstance(instanceId: string, force?: boolean): Promise<OperationResult> {
    return this.stopInstances([instanceId], force);
  }

  /**
   * Reboot EC2 instances
   */
  async rebootInstances(instanceIds: string[]): Promise<OperationResult> {
    try {
      const { EC2Client, RebootInstancesCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const command = new RebootInstancesCommand({ InstanceIds: instanceIds });
      await client.send(command);

      return {
        success: true,
        data: { message: `Reboot initiated for instances: ${instanceIds.join(', ')}` },
      };
    } catch (error: any) {
      logger.error('Failed to reboot instances', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Terminate EC2 instances
   */
  async terminateInstances(instanceIds: string[]): Promise<OperationResult> {
    try {
      const { EC2Client, TerminateInstancesCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const command = new TerminateInstancesCommand({ InstanceIds: instanceIds });
      const response = await client.send(command);

      const results = response.TerminatingInstances?.map((i: any) => ({
        instanceId: i.InstanceId,
        previousState: i.PreviousState?.Name,
        currentState: i.CurrentState?.Name,
      }));

      return { success: true, data: { instances: results || [] } };
    } catch (error: any) {
      logger.error('Failed to terminate instances', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Terminate a single instance (convenience wrapper)
   */
  async terminateInstance(instanceId: string): Promise<OperationResult> {
    return this.terminateInstances([instanceId]);
  }

  /**
   * Describe instance status
   */
  async getInstanceStatus(instanceIds: string[]): Promise<OperationResult> {
    try {
      const { EC2Client, DescribeInstanceStatusCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const command = new DescribeInstanceStatusCommand({
        InstanceIds: instanceIds,
        IncludeAllInstances: true,
      });
      const response = await client.send(command);

      const statuses = response.InstanceStatuses?.map((s: any) => ({
        instanceId: s.InstanceId,
        instanceState: s.InstanceState?.Name,
        instanceStatus: s.InstanceStatus?.Status,
        systemStatus: s.SystemStatus?.Status,
        availabilityZone: s.AvailabilityZone,
      }));

      return { success: true, data: { statuses: statuses || [] } };
    } catch (error: any) {
      logger.error('Failed to get instance status', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List VPCs
   */
  async listVpcs(): Promise<OperationResult> {
    try {
      const { EC2Client, DescribeVpcsCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const command = new DescribeVpcsCommand({});
      const response = await client.send(command);

      const vpcs = response.Vpcs?.map((v: any) => ({
        vpcId: v.VpcId,
        cidrBlock: v.CidrBlock,
        state: v.State,
        isDefault: v.IsDefault,
        tags: v.Tags?.reduce(
          (acc: any, tag: any) => {
            if (tag.Key) {
              acc[tag.Key] = tag.Value || '';
            }
            return acc;
          },
          {} as Record<string, string>
        ),
      }));

      return { success: true, data: { vpcs: vpcs || [] } };
    } catch (error: any) {
      logger.error('Failed to list VPCs', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List subnets
   */
  async listSubnets(vpcId?: string): Promise<OperationResult> {
    try {
      const { EC2Client, DescribeSubnetsCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const input: any = {};
      if (vpcId) {
        input.Filters = [{ Name: 'vpc-id', Values: [vpcId] }];
      }

      const command = new DescribeSubnetsCommand(input);
      const response = await client.send(command);

      const subnets = response.Subnets?.map((s: any) => ({
        subnetId: s.SubnetId,
        vpcId: s.VpcId,
        cidrBlock: s.CidrBlock,
        availabilityZone: s.AvailabilityZone,
        availableIpAddressCount: s.AvailableIpAddressCount,
        defaultForAz: s.DefaultForAz,
        tags: s.Tags?.reduce(
          (acc: any, tag: any) => {
            if (tag.Key) {
              acc[tag.Key] = tag.Value || '';
            }
            return acc;
          },
          {} as Record<string, string>
        ),
      }));

      return { success: true, data: { subnets: subnets || [] } };
    } catch (error: any) {
      logger.error('Failed to list subnets', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List security groups
   */
  async listSecurityGroups(vpcId?: string): Promise<OperationResult> {
    try {
      const { EC2Client, DescribeSecurityGroupsCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const input: any = {};
      if (vpcId) {
        input.Filters = [{ Name: 'vpc-id', Values: [vpcId] }];
      }

      const command = new DescribeSecurityGroupsCommand(input);
      const response = await client.send(command);

      const groups = response.SecurityGroups?.map((g: any) => ({
        groupId: g.GroupId,
        groupName: g.GroupName,
        description: g.Description,
        vpcId: g.VpcId,
      }));

      return { success: true, data: { securityGroups: groups || [] } };
    } catch (error: any) {
      logger.error('Failed to list security groups', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List regions
   */
  async listRegions(): Promise<OperationResult> {
    try {
      const { EC2Client, DescribeRegionsCommand } = await import('@aws-sdk/client-ec2');
      const client = new EC2Client(this.getClientConfig());

      const command = new DescribeRegionsCommand({});
      const response = await client.send(command);

      const regions = response.Regions?.map((r: any) => ({
        regionName: r.RegionName,
        endpoint: r.Endpoint,
      }));

      return { success: true, data: { regions: regions || [] } };
    } catch (error: any) {
      logger.error('Failed to list regions', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // S3 Operations
  // ==========================================

  /**
   * List all S3 buckets
   */
  async listBuckets(): Promise<OperationResult> {
    try {
      const { S3Client, ListBucketsCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client(this.getClientConfig());

      const command = new ListBucketsCommand({});
      const response = await client.send(command);

      const buckets = response.Buckets?.map((b: any) => ({
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
      return { success: false, error: error.message };
    }
  }

  /**
   * List objects in a bucket
   */
  async listObjects(options: ListObjectsOptions): Promise<OperationResult> {
    try {
      const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
      const client = new S3Client(this.getClientConfig());

      const input: any = { Bucket: options.bucket };

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
      const response = await client.send(command);

      const objects = response.Contents?.map((o: any) => ({
        key: o.Key,
        size: o.Size,
        lastModified: o.LastModified,
        etag: o.ETag,
        storageClass: o.StorageClass,
      }));

      const commonPrefixes = response.CommonPrefixes?.map((p: any) => p.Prefix);

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
      return { success: false, error: error.message };
    }
  }

  /**
   * Get object from bucket
   */
  async getObject(bucket: string, key: string): Promise<OperationResult> {
    try {
      const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client(this.getClientConfig());

      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await client.send(command);

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
      return { success: false, error: error.message };
    }
  }

  /**
   * Put object to bucket
   */
  async putObject(options: PutObjectOptions): Promise<OperationResult> {
    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client(this.getClientConfig());

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

      const response = await client.send(command);

      return {
        success: true,
        data: { etag: response.ETag, versionId: response.VersionId },
      };
    } catch (error: any) {
      logger.error('Failed to put object', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete object from bucket
   */
  async deleteObject(bucket: string, key: string): Promise<OperationResult> {
    try {
      const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client(this.getClientConfig());

      const command = new DeleteObjectCommand({ Bucket: bucket, Key: key });
      const response = await client.send(command);

      return {
        success: true,
        data: { deleteMarker: response.DeleteMarker, versionId: response.VersionId },
      };
    } catch (error: any) {
      logger.error('Failed to delete object', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a bucket
   */
  async createBucket(bucket: string, region?: string): Promise<OperationResult> {
    try {
      const { S3Client, CreateBucketCommand } = await import('@aws-sdk/client-s3');
      const targetRegion = region || this.config.region || 'us-east-1';
      const client = new S3Client({ ...this.getClientConfig(), region: targetRegion });

      const command = new CreateBucketCommand({
        Bucket: bucket,
        CreateBucketConfiguration:
          targetRegion !== 'us-east-1' ? { LocationConstraint: targetRegion as any } : undefined,
      });

      await client.send(command);

      return { success: true, data: { bucket, region: targetRegion } };
    } catch (error: any) {
      logger.error('Failed to create bucket', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a bucket
   */
  async deleteBucket(bucket: string): Promise<OperationResult> {
    try {
      const { S3Client, DeleteBucketCommand } = await import('@aws-sdk/client-s3');
      const client = new S3Client(this.getClientConfig());

      const command = new DeleteBucketCommand({ Bucket: bucket });
      await client.send(command);

      return { success: true, data: { message: `Bucket ${bucket} deleted` } };
    } catch (error: any) {
      logger.error('Failed to delete bucket', error);
      return { success: false, error: error.message };
    }
  }

  // ==========================================
  // IAM Operations
  // ==========================================

  /**
   * List IAM users
   */
  async listUsers(options: IAMListOptions = {}): Promise<OperationResult> {
    try {
      const { IAMClient, ListUsersCommand } = await import('@aws-sdk/client-iam');
      const client = new IAMClient(this.getClientConfig());

      const input: any = {};
      if (options.maxItems) {
        input.MaxItems = options.maxItems;
      }
      if (options.marker) {
        input.Marker = options.marker;
      }
      if (options.pathPrefix) {
        input.PathPrefix = options.pathPrefix;
      }

      const command = new ListUsersCommand(input);
      const response = await client.send(command);

      const users = response.Users?.map((u: any) => ({
        userName: u.UserName,
        userId: u.UserId,
        arn: u.Arn,
        path: u.Path,
        createDate: u.CreateDate,
        passwordLastUsed: u.PasswordLastUsed,
      }));

      return {
        success: true,
        data: {
          users: users || [],
          isTruncated: response.IsTruncated,
          marker: response.Marker,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list users', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List IAM roles
   */
  async listRoles(options: IAMListOptions = {}): Promise<OperationResult> {
    try {
      const { IAMClient, ListRolesCommand } = await import('@aws-sdk/client-iam');
      const client = new IAMClient(this.getClientConfig());

      const input: any = {};
      if (options.maxItems) {
        input.MaxItems = options.maxItems;
      }
      if (options.marker) {
        input.Marker = options.marker;
      }
      if (options.pathPrefix) {
        input.PathPrefix = options.pathPrefix;
      }

      const command = new ListRolesCommand(input);
      const response = await client.send(command);

      const roles = response.Roles?.map((r: any) => ({
        roleName: r.RoleName,
        roleId: r.RoleId,
        arn: r.Arn,
        path: r.Path,
        createDate: r.CreateDate,
        description: r.Description,
        maxSessionDuration: r.MaxSessionDuration,
      }));

      return {
        success: true,
        data: {
          roles: roles || [],
          isTruncated: response.IsTruncated,
          marker: response.Marker,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list roles', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List IAM policies
   */
  async listPolicies(
    options: IAMListOptions & { scope?: 'All' | 'AWS' | 'Local'; onlyAttached?: boolean } = {}
  ): Promise<OperationResult> {
    try {
      const { IAMClient, ListPoliciesCommand } = await import('@aws-sdk/client-iam');
      const client = new IAMClient(this.getClientConfig());

      const command = new ListPoliciesCommand({
        MaxItems: options.maxItems,
        Marker: options.marker,
        PathPrefix: options.pathPrefix,
        Scope: options.scope,
        OnlyAttached: options.onlyAttached,
      });

      const response = await client.send(command);

      const policies = response.Policies?.map((p: any) => ({
        policyName: p.PolicyName,
        policyId: p.PolicyId,
        arn: p.Arn,
        path: p.Path,
        createDate: p.CreateDate,
        updateDate: p.UpdateDate,
        attachmentCount: p.AttachmentCount,
        isAttachable: p.IsAttachable,
        description: p.Description,
      }));

      return {
        success: true,
        data: {
          policies: policies || [],
          isTruncated: response.IsTruncated,
          marker: response.Marker,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list policies', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List IAM groups
   */
  async listGroups(options: IAMListOptions = {}): Promise<OperationResult> {
    try {
      const { IAMClient, ListGroupsCommand } = await import('@aws-sdk/client-iam');
      const client = new IAMClient(this.getClientConfig());

      const command = new ListGroupsCommand({
        MaxItems: options.maxItems,
        Marker: options.marker,
        PathPrefix: options.pathPrefix,
      });

      const response = await client.send(command);

      const groups = response.Groups?.map((g: any) => ({
        groupName: g.GroupName,
        groupId: g.GroupId,
        arn: g.Arn,
        path: g.Path,
        createDate: g.CreateDate,
      }));

      return {
        success: true,
        data: {
          groups: groups || [],
          isTruncated: response.IsTruncated,
          marker: response.Marker,
        },
      };
    } catch (error: any) {
      logger.error('Failed to list groups', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get IAM user details
   */
  async getUser(userName?: string): Promise<OperationResult> {
    try {
      const { IAMClient, GetUserCommand } = await import('@aws-sdk/client-iam');
      const client = new IAMClient(this.getClientConfig());

      const command = new GetUserCommand(userName ? { UserName: userName } : {});
      const response = await client.send(command);

      const user = response.User;

      return {
        success: true,
        data: {
          userName: user?.UserName,
          userId: user?.UserId,
          arn: user?.Arn,
          path: user?.Path,
          createDate: user?.CreateDate,
          passwordLastUsed: user?.PasswordLastUsed,
        },
      };
    } catch (error: any) {
      logger.error('Failed to get user', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Attach policy to role
   */
  async attachRolePolicy(roleName: string, policyArn: string): Promise<OperationResult> {
    try {
      const { IAMClient, AttachRolePolicyCommand } = await import('@aws-sdk/client-iam');
      const client = new IAMClient(this.getClientConfig());

      const command = new AttachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn });
      await client.send(command);

      return {
        success: true,
        data: { message: `Policy ${policyArn} attached to role ${roleName}` },
      };
    } catch (error: any) {
      logger.error('Failed to attach role policy', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Detach policy from role
   */
  async detachRolePolicy(roleName: string, policyArn: string): Promise<OperationResult> {
    try {
      const { IAMClient, DetachRolePolicyCommand } = await import('@aws-sdk/client-iam');
      const client = new IAMClient(this.getClientConfig());

      const command = new DetachRolePolicyCommand({ RoleName: roleName, PolicyArn: policyArn });
      await client.send(command);

      return {
        success: true,
        data: { message: `Policy ${policyArn} detached from role ${roleName}` },
      };
    } catch (error: any) {
      logger.error('Failed to detach role policy', error);
      return { success: false, error: error.message };
    }
  }
}
