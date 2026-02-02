import { EC2Operations } from './aws/ec2';
import { S3Operations } from './aws/s3';
import { IAMOperations } from './aws/iam';
import { logger } from '@nimbus/shared-utils';
import {
  CredentialManager,
  RegionManager,
  InfrastructureScanner,
  type DiscoveryConfig,
} from './discovery';
import {
  TerraformGenerator,
  createTerraformGenerator,
  getSupportedAwsTypes,
  type GeneratedFiles,
  type TerraformGeneratorConfig,
} from './terraform';

// Discovery singleton instances
const credentialManager = new CredentialManager();
const regionManager = new RegionManager();
const infrastructureScanner = new InfrastructureScanner({
  credentialManager,
  regionManager,
});

// Terraform generation cache - stores generated files by session ID
const terraformCache = new Map<string, {
  files: GeneratedFiles;
  createdAt: Date;
  sessionId: string;
}>();

// Clean up old cache entries every 30 minutes
setInterval(() => {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
  for (const [key, value] of terraformCache.entries()) {
    if (value.createdAt < thirtyMinutesAgo) {
      terraformCache.delete(key);
    }
  }
}, 30 * 60 * 1000);

interface RouteContext {
  req: Request;
  url: URL;
  path: string;
  method: string;
}

/**
 * Parse JSON body from request
 */
async function parseBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

/**
 * Create success response
 */
function success(data: any, status: number = 200): Response {
  return Response.json({ success: true, data }, { status });
}

/**
 * Create error response
 */
function error(message: string, status: number = 500): Response {
  return Response.json({ success: false, error: message }, { status });
}

/**
 * Health check handler
 */
export function healthHandler(): Response {
  return Response.json({
    status: 'healthy',
    service: 'aws-tools-service',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

// ==================== EC2 Handlers ====================

/**
 * GET /api/aws/ec2/instances - List EC2 instances
 */
async function handleListInstances(ctx: RouteContext): Promise<Response> {
  try {
    const instanceIds = ctx.url.searchParams.get('instanceIds')?.split(',').filter(Boolean);
    const maxResults = ctx.url.searchParams.get('maxResults');
    const nextToken = ctx.url.searchParams.get('nextToken') || undefined;
    const region = ctx.url.searchParams.get('region') || undefined;

    const ec2 = new EC2Operations({ region });
    const result = await ec2.listInstances({
      instanceIds,
      maxResults: maxResults ? parseInt(maxResults) : undefined,
      nextToken,
    });

    if (!result.success) {
      return error(result.error || 'Failed to list instances', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List instances failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/ec2/instances/start - Start EC2 instances
 */
async function handleStartInstances(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ instanceIds: string[]; region?: string }>(ctx.req);

    if (!body.instanceIds || body.instanceIds.length === 0) {
      return error('Missing required field: instanceIds', 400);
    }

    const ec2 = new EC2Operations({ region: body.region });
    const result = await ec2.startInstances(body.instanceIds);

    if (!result.success) {
      return error(result.error || 'Failed to start instances', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Start instances failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/ec2/instances/stop - Stop EC2 instances
 */
async function handleStopInstances(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ instanceIds: string[]; force?: boolean; region?: string }>(ctx.req);

    if (!body.instanceIds || body.instanceIds.length === 0) {
      return error('Missing required field: instanceIds', 400);
    }

    const ec2 = new EC2Operations({ region: body.region });
    const result = await ec2.stopInstances(body.instanceIds, body.force);

    if (!result.success) {
      return error(result.error || 'Failed to stop instances', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Stop instances failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/ec2/instances/reboot - Reboot EC2 instances
 */
async function handleRebootInstances(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ instanceIds: string[]; region?: string }>(ctx.req);

    if (!body.instanceIds || body.instanceIds.length === 0) {
      return error('Missing required field: instanceIds', 400);
    }

    const ec2 = new EC2Operations({ region: body.region });
    const result = await ec2.rebootInstances(body.instanceIds);

    if (!result.success) {
      return error(result.error || 'Failed to reboot instances', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Reboot instances failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/ec2/instances/terminate - Terminate EC2 instances
 */
async function handleTerminateInstances(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ instanceIds: string[]; region?: string }>(ctx.req);

    if (!body.instanceIds || body.instanceIds.length === 0) {
      return error('Missing required field: instanceIds', 400);
    }

    const ec2 = new EC2Operations({ region: body.region });
    const result = await ec2.terminateInstances(body.instanceIds);

    if (!result.success) {
      return error(result.error || 'Failed to terminate instances', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Terminate instances failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/ec2/instances/run - Run new EC2 instances
 */
async function handleRunInstances(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      imageId: string;
      instanceType: string;
      minCount?: number;
      maxCount?: number;
      keyName?: string;
      securityGroupIds?: string[];
      subnetId?: string;
      userData?: string;
      tags?: Record<string, string>;
      region?: string;
    }>(ctx.req);

    if (!body.imageId) {
      return error('Missing required field: imageId', 400);
    }

    if (!body.instanceType) {
      return error('Missing required field: instanceType', 400);
    }

    const ec2 = new EC2Operations({ region: body.region });
    const result = await ec2.runInstances(body);

    if (!result.success) {
      return error(result.error || 'Failed to run instances', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Run instances failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/ec2/regions - List EC2 regions
 */
async function handleListRegions(ctx: RouteContext): Promise<Response> {
  try {
    const region = ctx.url.searchParams.get('region') || undefined;
    const ec2 = new EC2Operations({ region });
    const result = await ec2.listRegions();

    if (!result.success) {
      return error(result.error || 'Failed to list regions', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List regions failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/ec2/vpcs - List VPCs
 */
async function handleListVpcs(ctx: RouteContext): Promise<Response> {
  try {
    const region = ctx.url.searchParams.get('region') || undefined;
    const ec2 = new EC2Operations({ region });
    const result = await ec2.listVpcs();

    if (!result.success) {
      return error(result.error || 'Failed to list VPCs', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List VPCs failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/ec2/subnets - List subnets
 */
async function handleListSubnets(ctx: RouteContext): Promise<Response> {
  try {
    const vpcId = ctx.url.searchParams.get('vpcId') || undefined;
    const region = ctx.url.searchParams.get('region') || undefined;
    const ec2 = new EC2Operations({ region });
    const result = await ec2.listSubnets(vpcId);

    if (!result.success) {
      return error(result.error || 'Failed to list subnets', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List subnets failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/ec2/security-groups - List security groups
 */
async function handleListSecurityGroups(ctx: RouteContext): Promise<Response> {
  try {
    const vpcId = ctx.url.searchParams.get('vpcId') || undefined;
    const region = ctx.url.searchParams.get('region') || undefined;
    const ec2 = new EC2Operations({ region });
    const result = await ec2.listSecurityGroups(vpcId);

    if (!result.success) {
      return error(result.error || 'Failed to list security groups', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List security groups failed', err);
    return error(err.message);
  }
}

// ==================== S3 Handlers ====================

/**
 * GET /api/aws/s3/buckets - List S3 buckets
 */
async function handleListBuckets(ctx: RouteContext): Promise<Response> {
  try {
    const region = ctx.url.searchParams.get('region') || undefined;
    const s3 = new S3Operations({ region });
    const result = await s3.listBuckets();

    if (!result.success) {
      return error(result.error || 'Failed to list buckets', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List buckets failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/s3/objects - List S3 objects
 */
async function handleListObjects(ctx: RouteContext): Promise<Response> {
  try {
    const bucket = ctx.url.searchParams.get('bucket');
    const prefix = ctx.url.searchParams.get('prefix') || undefined;
    const delimiter = ctx.url.searchParams.get('delimiter') || undefined;
    const maxKeys = ctx.url.searchParams.get('maxKeys');
    const continuationToken = ctx.url.searchParams.get('continuationToken') || undefined;
    const region = ctx.url.searchParams.get('region') || undefined;

    if (!bucket) {
      return error('Missing required query parameter: bucket', 400);
    }

    const s3 = new S3Operations({ region });
    const result = await s3.listObjects({
      bucket,
      prefix,
      delimiter,
      maxKeys: maxKeys ? parseInt(maxKeys) : undefined,
      continuationToken,
    });

    if (!result.success) {
      return error(result.error || 'Failed to list objects', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List objects failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/s3/object - Get S3 object
 */
async function handleGetObject(ctx: RouteContext): Promise<Response> {
  try {
    const bucket = ctx.url.searchParams.get('bucket');
    const key = ctx.url.searchParams.get('key');
    const region = ctx.url.searchParams.get('region') || undefined;

    if (!bucket) {
      return error('Missing required query parameter: bucket', 400);
    }

    if (!key) {
      return error('Missing required query parameter: key', 400);
    }

    const s3 = new S3Operations({ region });
    const result = await s3.getObject(bucket, key);

    if (!result.success) {
      return error(result.error || 'Failed to get object', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Get object failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/s3/object - Put S3 object
 */
async function handlePutObject(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      bucket: string;
      key: string;
      body: string;
      contentType?: string;
      metadata?: Record<string, string>;
      tags?: Record<string, string>;
      region?: string;
    }>(ctx.req);

    if (!body.bucket) {
      return error('Missing required field: bucket', 400);
    }

    if (!body.key) {
      return error('Missing required field: key', 400);
    }

    if (!body.body) {
      return error('Missing required field: body', 400);
    }

    const s3 = new S3Operations({ region: body.region });
    const result = await s3.putObject({
      bucket: body.bucket,
      key: body.key,
      body: body.body,
      contentType: body.contentType,
      metadata: body.metadata,
      tags: body.tags,
    });

    if (!result.success) {
      return error(result.error || 'Failed to put object', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Put object failed', err);
    return error(err.message);
  }
}

/**
 * DELETE /api/aws/s3/object - Delete S3 object
 */
async function handleDeleteObject(ctx: RouteContext): Promise<Response> {
  try {
    const bucket = ctx.url.searchParams.get('bucket');
    const key = ctx.url.searchParams.get('key');
    const region = ctx.url.searchParams.get('region') || undefined;

    if (!bucket) {
      return error('Missing required query parameter: bucket', 400);
    }

    if (!key) {
      return error('Missing required query parameter: key', 400);
    }

    const s3 = new S3Operations({ region });
    const result = await s3.deleteObject(bucket, key);

    if (!result.success) {
      return error(result.error || 'Failed to delete object', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Delete object failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/s3/bucket - Create S3 bucket
 */
async function handleCreateBucket(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ bucket: string; region?: string }>(ctx.req);

    if (!body.bucket) {
      return error('Missing required field: bucket', 400);
    }

    const s3 = new S3Operations({ region: body.region });
    const result = await s3.createBucket(body.bucket, body.region);

    if (!result.success) {
      return error(result.error || 'Failed to create bucket', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Create bucket failed', err);
    return error(err.message);
  }
}

/**
 * DELETE /api/aws/s3/bucket - Delete S3 bucket
 */
async function handleDeleteBucket(ctx: RouteContext): Promise<Response> {
  try {
    const bucket = ctx.url.searchParams.get('bucket');
    const region = ctx.url.searchParams.get('region') || undefined;

    if (!bucket) {
      return error('Missing required query parameter: bucket', 400);
    }

    const s3 = new S3Operations({ region });
    const result = await s3.deleteBucket(bucket);

    if (!result.success) {
      return error(result.error || 'Failed to delete bucket', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Delete bucket failed', err);
    return error(err.message);
  }
}

// ==================== IAM Handlers ====================

/**
 * GET /api/aws/iam/users - List IAM users
 */
async function handleListUsers(ctx: RouteContext): Promise<Response> {
  try {
    const maxItems = ctx.url.searchParams.get('maxItems');
    const marker = ctx.url.searchParams.get('marker') || undefined;
    const pathPrefix = ctx.url.searchParams.get('pathPrefix') || undefined;
    const region = ctx.url.searchParams.get('region') || undefined;

    const iam = new IAMOperations({ region });
    const result = await iam.listUsers({
      maxItems: maxItems ? parseInt(maxItems) : undefined,
      marker,
      pathPrefix,
    });

    if (!result.success) {
      return error(result.error || 'Failed to list users', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List users failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/iam/user - Get IAM user
 */
async function handleGetUser(ctx: RouteContext): Promise<Response> {
  try {
    const userName = ctx.url.searchParams.get('userName');
    const region = ctx.url.searchParams.get('region') || undefined;

    if (!userName) {
      return error('Missing required query parameter: userName', 400);
    }

    const iam = new IAMOperations({ region });
    const result = await iam.getUser(userName);

    if (!result.success) {
      return error(result.error || 'Failed to get user', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Get user failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/iam/user - Create IAM user
 */
async function handleCreateUser(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      userName: string;
      path?: string;
      tags?: Record<string, string>;
      region?: string;
    }>(ctx.req);

    if (!body.userName) {
      return error('Missing required field: userName', 400);
    }

    const iam = new IAMOperations({ region: body.region });
    const result = await iam.createUser(body.userName, body.path, body.tags);

    if (!result.success) {
      return error(result.error || 'Failed to create user', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Create user failed', err);
    return error(err.message);
  }
}

/**
 * DELETE /api/aws/iam/user - Delete IAM user
 */
async function handleDeleteUser(ctx: RouteContext): Promise<Response> {
  try {
    const userName = ctx.url.searchParams.get('userName');
    const region = ctx.url.searchParams.get('region') || undefined;

    if (!userName) {
      return error('Missing required query parameter: userName', 400);
    }

    const iam = new IAMOperations({ region });
    const result = await iam.deleteUser(userName);

    if (!result.success) {
      return error(result.error || 'Failed to delete user', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Delete user failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/iam/roles - List IAM roles
 */
async function handleListRoles(ctx: RouteContext): Promise<Response> {
  try {
    const maxItems = ctx.url.searchParams.get('maxItems');
    const marker = ctx.url.searchParams.get('marker') || undefined;
    const pathPrefix = ctx.url.searchParams.get('pathPrefix') || undefined;
    const region = ctx.url.searchParams.get('region') || undefined;

    const iam = new IAMOperations({ region });
    const result = await iam.listRoles({
      maxItems: maxItems ? parseInt(maxItems) : undefined,
      marker,
      pathPrefix,
    });

    if (!result.success) {
      return error(result.error || 'Failed to list roles', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List roles failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/iam/role - Get IAM role
 */
async function handleGetRole(ctx: RouteContext): Promise<Response> {
  try {
    const roleName = ctx.url.searchParams.get('roleName');
    const region = ctx.url.searchParams.get('region') || undefined;

    if (!roleName) {
      return error('Missing required query parameter: roleName', 400);
    }

    const iam = new IAMOperations({ region });
    const result = await iam.getRole(roleName);

    if (!result.success) {
      return error(result.error || 'Failed to get role', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Get role failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/iam/policies - List IAM policies
 */
async function handleListPolicies(ctx: RouteContext): Promise<Response> {
  try {
    const maxItems = ctx.url.searchParams.get('maxItems');
    const marker = ctx.url.searchParams.get('marker') || undefined;
    const scope = ctx.url.searchParams.get('scope') as 'All' | 'AWS' | 'Local' | null;
    const onlyAttached = ctx.url.searchParams.get('onlyAttached') === 'true';
    const region = ctx.url.searchParams.get('region') || undefined;

    const iam = new IAMOperations({ region });
    const result = await iam.listPolicies({
      maxItems: maxItems ? parseInt(maxItems) : undefined,
      marker,
      scope: scope || undefined,
      onlyAttached,
    });

    if (!result.success) {
      return error(result.error || 'Failed to list policies', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List policies failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/iam/groups - List IAM groups
 */
async function handleListGroups(ctx: RouteContext): Promise<Response> {
  try {
    const maxItems = ctx.url.searchParams.get('maxItems');
    const marker = ctx.url.searchParams.get('marker') || undefined;
    const pathPrefix = ctx.url.searchParams.get('pathPrefix') || undefined;
    const region = ctx.url.searchParams.get('region') || undefined;

    const iam = new IAMOperations({ region });
    const result = await iam.listGroups({
      maxItems: maxItems ? parseInt(maxItems) : undefined,
      marker,
      pathPrefix,
    });

    if (!result.success) {
      return error(result.error || 'Failed to list groups', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List groups failed', err);
    return error(err.message);
  }
}

// ==================== Terraform Generation Handlers ====================

/**
 * GET /api/aws/terraform/supported-types - Get supported AWS resource types
 */
async function handleGetSupportedTypes(ctx: RouteContext): Promise<Response> {
  try {
    const supportedTypes = getSupportedAwsTypes();

    return success({
      types: supportedTypes,
      total: supportedTypes.length,
    });
  } catch (err: any) {
    logger.error('Get supported types failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/terraform/generate - Generate Terraform from discovery session
 */
async function handleGenerateTerraform(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      sessionId: string;
      options?: {
        outputDir?: string;
        generateImportBlocks?: boolean;
        generateImportScript?: boolean;
        organizeByService?: boolean;
        terraformVersion?: string;
        awsProviderVersion?: string;
      };
    }>(ctx.req);

    if (!body.sessionId) {
      return error('Missing required field: sessionId', 400);
    }

    // Get the discovery session
    const session = infrastructureScanner.getSession(body.sessionId);
    if (!session) {
      return error('Discovery session not found', 404);
    }

    if (session.progress.status !== 'completed') {
      return error(`Discovery is not complete. Current status: ${session.progress.status}`, 400);
    }

    if (!session.inventory || session.inventory.resources.length === 0) {
      return error('No resources found in discovery session', 400);
    }

    // Create Terraform generator config
    const config: TerraformGeneratorConfig = {
      outputDir: body.options?.outputDir || '/tmp/terraform',
      generateImportBlocks: body.options?.generateImportBlocks ?? true,
      generateImportScript: body.options?.generateImportScript ?? true,
      organizeByService: body.options?.organizeByService ?? true,
      terraformVersion: body.options?.terraformVersion || '1.5.0',
      awsProviderVersion: body.options?.awsProviderVersion || '~> 5.0',
      defaultRegion: session.inventory.resources[0]?.region || 'us-east-1',
    };

    // Generate Terraform configuration
    const generator = createTerraformGenerator(config);
    const generatedFiles = generator.generate(session.inventory.resources);

    // Cache the generated files
    const terraformSessionId = `tf-${body.sessionId}`;
    terraformCache.set(terraformSessionId, {
      files: generatedFiles,
      createdAt: new Date(),
      sessionId: body.sessionId,
    });

    // Convert Map to object for JSON response
    const filesObject: Record<string, string> = {};
    for (const [filename, content] of generatedFiles.files) {
      filesObject[filename] = content;
    }

    return success({
      terraformSessionId,
      summary: generatedFiles.summary,
      files: Object.keys(filesObject),
      unmappedResources: generatedFiles.unmappedResources.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
      })),
      variables: generatedFiles.variables.map(v => ({
        name: v.name,
        type: v.type,
        sensitive: v.sensitive,
        description: v.description,
      })),
      outputs: generatedFiles.outputs.map(o => ({
        name: o.name,
        description: o.description,
      })),
      importsCount: generatedFiles.imports.length,
    });
  } catch (err: any) {
    logger.error('Generate Terraform failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/terraform/:terraformSessionId/files - List generated files
 */
async function handleListTerraformFiles(ctx: RouteContext): Promise<Response> {
  try {
    const terraformSessionId = ctx.path.split('/')[4];
    if (!terraformSessionId) {
      return error('Missing terraform session ID', 400);
    }

    const cached = terraformCache.get(terraformSessionId);
    if (!cached) {
      return error('Terraform session not found', 404);
    }

    const filesList = Array.from(cached.files.files.keys()).map(filename => ({
      name: filename,
      size: cached.files.files.get(filename)?.length || 0,
    }));

    return success({
      terraformSessionId,
      files: filesList,
      total: filesList.length,
    });
  } catch (err: any) {
    logger.error('List Terraform files failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/terraform/:terraformSessionId/file/:filename - Get specific file content
 */
async function handleGetTerraformFile(ctx: RouteContext): Promise<Response> {
  try {
    const pathParts = ctx.path.split('/');
    const terraformSessionId = pathParts[4];
    const filename = pathParts.slice(6).join('/'); // Handle nested paths

    if (!terraformSessionId) {
      return error('Missing terraform session ID', 400);
    }

    if (!filename) {
      return error('Missing filename', 400);
    }

    const cached = terraformCache.get(terraformSessionId);
    if (!cached) {
      return error('Terraform session not found', 404);
    }

    const content = cached.files.files.get(filename);
    if (content === undefined) {
      return error('File not found', 404);
    }

    return success({
      filename,
      content,
      size: content.length,
    });
  } catch (err: any) {
    logger.error('Get Terraform file failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/terraform/:terraformSessionId/download - Download all files as JSON bundle
 */
async function handleDownloadTerraformFiles(ctx: RouteContext): Promise<Response> {
  try {
    const terraformSessionId = ctx.path.split('/')[4];
    if (!terraformSessionId) {
      return error('Missing terraform session ID', 400);
    }

    const cached = terraformCache.get(terraformSessionId);
    if (!cached) {
      return error('Terraform session not found', 404);
    }

    // Convert Map to object
    const filesObject: Record<string, string> = {};
    for (const [filename, content] of cached.files.files) {
      filesObject[filename] = content;
    }

    return success({
      terraformSessionId,
      discoverySessionId: cached.sessionId,
      files: filesObject,
      summary: cached.files.summary,
      importScript: cached.files.importScript,
      variables: cached.files.variables,
      outputs: cached.files.outputs,
    });
  } catch (err: any) {
    logger.error('Download Terraform files failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/terraform/:terraformSessionId/import-script - Get import script
 */
async function handleGetImportScript(ctx: RouteContext): Promise<Response> {
  try {
    const terraformSessionId = ctx.path.split('/')[4];
    if (!terraformSessionId) {
      return error('Missing terraform session ID', 400);
    }

    const cached = terraformCache.get(terraformSessionId);
    if (!cached) {
      return error('Terraform session not found', 404);
    }

    return success({
      script: cached.files.importScript,
      importsCount: cached.files.imports.length,
    });
  } catch (err: any) {
    logger.error('Get import script failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/terraform/generate-direct - Generate Terraform from provided resources
 */
async function handleGenerateTerraformDirect(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      resources: Array<{
        id: string;
        type: string;
        arn?: string;
        region: string;
        name?: string;
        tags?: Record<string, string>;
        properties: Record<string, unknown>;
      }>;
      options?: {
        outputDir?: string;
        generateImportBlocks?: boolean;
        generateImportScript?: boolean;
        organizeByService?: boolean;
        terraformVersion?: string;
        awsProviderVersion?: string;
        defaultRegion?: string;
      };
    }>(ctx.req);

    if (!body.resources || body.resources.length === 0) {
      return error('Missing required field: resources', 400);
    }

    // Validate resources have required fields
    for (let i = 0; i < body.resources.length; i++) {
      const r = body.resources[i];
      if (!r.id) {
        return error(`Resource at index ${i} is missing required field: id`, 400);
      }
      if (!r.type) {
        return error(`Resource at index ${i} is missing required field: type`, 400);
      }
      if (!r.region) {
        return error(`Resource at index ${i} is missing required field: region`, 400);
      }
    }

    // Create Terraform generator config
    const config: TerraformGeneratorConfig = {
      outputDir: body.options?.outputDir || '/tmp/terraform',
      generateImportBlocks: body.options?.generateImportBlocks ?? true,
      generateImportScript: body.options?.generateImportScript ?? true,
      organizeByService: body.options?.organizeByService ?? true,
      terraformVersion: body.options?.terraformVersion || '1.5.0',
      awsProviderVersion: body.options?.awsProviderVersion || '~> 5.0',
      defaultRegion: body.options?.defaultRegion || body.resources[0]?.region || 'us-east-1',
    };

    // Convert input resources to DiscoveredResource format
    const discoveredResources = body.resources.map(r => ({
      id: r.id,
      type: r.type,
      arn: r.arn || `arn:aws:unknown:${r.region}:000000000000:${r.type.toLowerCase()}/${r.id}`,
      region: r.region,
      name: r.name || r.id,
      tags: r.tags || {},
      properties: r.properties,
      relationships: [],
      discoveredAt: new Date().toISOString(),
    }));

    // Generate Terraform configuration
    const generator = createTerraformGenerator(config);
    const generatedFiles = generator.generate(discoveredResources);

    // Generate a unique session ID
    const terraformSessionId = `tf-direct-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    terraformCache.set(terraformSessionId, {
      files: generatedFiles,
      createdAt: new Date(),
      sessionId: 'direct',
    });

    // Convert Map to object for JSON response
    const filesObject: Record<string, string> = {};
    for (const [filename, content] of generatedFiles.files) {
      filesObject[filename] = content;
    }

    return success({
      terraformSessionId,
      summary: generatedFiles.summary,
      files: filesObject,
      unmappedResources: generatedFiles.unmappedResources.map(r => ({
        id: r.id,
        type: r.type,
        name: r.name,
      })),
      variables: generatedFiles.variables,
      outputs: generatedFiles.outputs,
      imports: generatedFiles.imports,
      importScript: generatedFiles.importScript,
    });
  } catch (err: any) {
    logger.error('Generate Terraform direct failed', err);
    return error(err.message);
  }
}

/**
 * Handle all Terraform-related routes
 */
async function handleTerraformRoutes(ctx: RouteContext): Promise<Response> {
  const { path, method } = ctx;

  // GET /api/aws/terraform/supported-types
  if (path === '/api/aws/terraform/supported-types' && method === 'GET') {
    return handleGetSupportedTypes(ctx);
  }

  // POST /api/aws/terraform/generate
  if (path === '/api/aws/terraform/generate' && method === 'POST') {
    return handleGenerateTerraform(ctx);
  }

  // POST /api/aws/terraform/generate-direct
  if (path === '/api/aws/terraform/generate-direct' && method === 'POST') {
    return handleGenerateTerraformDirect(ctx);
  }

  // GET /api/aws/terraform/:sessionId/files
  if (path.match(/^\/api\/aws\/terraform\/[\w-]+\/files$/) && method === 'GET') {
    return handleListTerraformFiles(ctx);
  }

  // GET /api/aws/terraform/:sessionId/file/:filename
  if (path.match(/^\/api\/aws\/terraform\/[\w-]+\/file\/.+$/) && method === 'GET') {
    return handleGetTerraformFile(ctx);
  }

  // GET /api/aws/terraform/:sessionId/download
  if (path.match(/^\/api\/aws\/terraform\/[\w-]+\/download$/) && method === 'GET') {
    return handleDownloadTerraformFiles(ctx);
  }

  // GET /api/aws/terraform/:sessionId/import-script
  if (path.match(/^\/api\/aws\/terraform\/[\w-]+\/import-script$/) && method === 'GET') {
    return handleGetImportScript(ctx);
  }

  return new Response('Not Found', { status: 404 });
}

/**
 * Main router function
 */
export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  const ctx: RouteContext = { req, url, path, method };

  // Health check
  if (path === '/health') {
    return healthHandler();
  }

  // EC2 routes
  if (path.startsWith('/api/aws/ec2')) {
    const route = path.replace('/api/aws/ec2', '');

    if (method === 'GET') {
      switch (route) {
        case '/instances':
          return handleListInstances(ctx);
        case '/regions':
          return handleListRegions(ctx);
        case '/vpcs':
          return handleListVpcs(ctx);
        case '/subnets':
          return handleListSubnets(ctx);
        case '/security-groups':
          return handleListSecurityGroups(ctx);
      }
    }

    if (method === 'POST') {
      switch (route) {
        case '/instances/start':
          return handleStartInstances(ctx);
        case '/instances/stop':
          return handleStopInstances(ctx);
        case '/instances/reboot':
          return handleRebootInstances(ctx);
        case '/instances/terminate':
          return handleTerminateInstances(ctx);
        case '/instances/run':
          return handleRunInstances(ctx);
      }
    }
  }

  // S3 routes
  if (path.startsWith('/api/aws/s3')) {
    const route = path.replace('/api/aws/s3', '');

    if (method === 'GET') {
      switch (route) {
        case '/buckets':
          return handleListBuckets(ctx);
        case '/objects':
          return handleListObjects(ctx);
        case '/object':
          return handleGetObject(ctx);
      }
    }

    if (method === 'POST') {
      switch (route) {
        case '/object':
          return handlePutObject(ctx);
        case '/bucket':
          return handleCreateBucket(ctx);
      }
    }

    if (method === 'DELETE') {
      switch (route) {
        case '/object':
          return handleDeleteObject(ctx);
        case '/bucket':
          return handleDeleteBucket(ctx);
      }
    }
  }

  // IAM routes
  if (path.startsWith('/api/aws/iam')) {
    const route = path.replace('/api/aws/iam', '');

    if (method === 'GET') {
      switch (route) {
        case '/users':
          return handleListUsers(ctx);
        case '/user':
          return handleGetUser(ctx);
        case '/roles':
          return handleListRoles(ctx);
        case '/role':
          return handleGetRole(ctx);
        case '/policies':
          return handleListPolicies(ctx);
        case '/groups':
          return handleListGroups(ctx);
      }
    }

    if (method === 'POST') {
      switch (route) {
        case '/user':
          return handleCreateUser(ctx);
      }
    }

    if (method === 'DELETE') {
      switch (route) {
        case '/user':
          return handleDeleteUser(ctx);
      }
    }
  }

  // Discovery routes
  if (path.startsWith('/api/aws/discover') || path.startsWith('/api/aws/profiles') || path.startsWith('/api/aws/regions')) {
    return handleDiscoveryRoutes(ctx);
  }

  // Terraform routes
  if (path.startsWith('/api/aws/terraform')) {
    return handleTerraformRoutes(ctx);
  }

  return new Response('Not Found', { status: 404 });
}

// ==================== Discovery Handlers ====================

/**
 * Handle all discovery-related routes
 */
async function handleDiscoveryRoutes(ctx: RouteContext): Promise<Response> {
  const { path, method } = ctx;

  // Profile routes
  if (path === '/api/aws/profiles' && method === 'GET') {
    return handleListProfiles(ctx);
  }

  if (path === '/api/aws/profiles/validate' && method === 'POST') {
    return handleValidateProfile(ctx);
  }

  // Region routes
  if (path === '/api/aws/regions' && method === 'GET') {
    return handleListDiscoveryRegions(ctx);
  }

  if (path === '/api/aws/regions/validate' && method === 'POST') {
    return handleValidateRegions(ctx);
  }

  // Discovery routes
  if (path === '/api/aws/discover' && method === 'POST') {
    return handleStartDiscovery(ctx);
  }

  if (path.match(/^\/api\/aws\/discover\/[\w-]+$/) && method === 'GET') {
    return handleGetDiscoveryStatus(ctx);
  }

  if (path.match(/^\/api\/aws\/discover\/[\w-]+\/cancel$/) && method === 'POST') {
    return handleCancelDiscovery(ctx);
  }

  return new Response('Not Found', { status: 404 });
}

/**
 * GET /api/aws/profiles - List available AWS profiles
 */
async function handleListProfiles(ctx: RouteContext): Promise<Response> {
  try {
    const profiles = await credentialManager.listProfiles();

    return success({
      profiles: profiles.map(p => ({
        name: p.name,
        source: p.source,
        region: p.region,
        isSSO: p.source === 'sso',
      })),
    });
  } catch (err: any) {
    logger.error('List profiles failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/profiles/validate - Validate credentials for a profile
 */
async function handleValidateProfile(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ profile?: string }>(ctx.req);
    const result = await credentialManager.validateCredentials(body.profile);

    if (!result.valid) {
      return success({
        valid: false,
        error: result.error,
      });
    }

    return success({
      valid: true,
      accountId: result.account?.accountId,
      accountAlias: result.account?.alias,
      arn: result.account?.arn,
    });
  } catch (err: any) {
    logger.error('Validate profile failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/regions - List available AWS regions
 */
async function handleListDiscoveryRegions(ctx: RouteContext): Promise<Response> {
  try {
    const profile = ctx.url.searchParams.get('profile') || undefined;
    const enabledOnly = ctx.url.searchParams.get('enabledOnly') !== 'false';
    const grouped = ctx.url.searchParams.get('grouped') === 'true';

    const regions = enabledOnly
      ? await regionManager.listEnabledRegions(profile)
      : await regionManager.listRegions(profile);

    if (grouped) {
      const groupedRegions = regionManager.groupRegionsByArea(regions);
      return success({
        regions: groupedRegions,
        total: regions.length,
      });
    }

    return success({
      regions: regions.map(r => ({
        name: r.regionName,
        displayName: regionManager.getRegionDisplayName(r.regionName),
        endpoint: r.endpoint,
        optInStatus: r.optInStatus,
      })),
      total: regions.length,
    });
  } catch (err: any) {
    logger.error('List regions failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/regions/validate - Validate a list of regions
 */
async function handleValidateRegions(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ regions: string[]; profile?: string }>(ctx.req);

    if (!body.regions || body.regions.length === 0) {
      return error('Missing required field: regions', 400);
    }

    const result = await regionManager.validateRegions(body.regions, body.profile);

    return success({
      valid: result.valid,
      invalid: result.invalid,
    });
  } catch (err: any) {
    logger.error('Validate regions failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/discover - Start infrastructure discovery
 */
async function handleStartDiscovery(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      profile?: string;
      regions: string[] | 'all';
      excludeRegions?: string[];
      services?: string[];
      excludeServices?: string[];
    }>(ctx.req);

    if (!body.regions) {
      return error('Missing required field: regions', 400);
    }

    const config: DiscoveryConfig = {
      profile: body.profile,
      regions: {
        regions: body.regions,
        excludeRegions: body.excludeRegions,
      },
      services: body.services,
      excludeServices: body.excludeServices,
    };

    const sessionId = await infrastructureScanner.startDiscovery(config);

    return success({
      sessionId,
      status: 'in_progress',
      message: 'Discovery started',
    });
  } catch (err: any) {
    logger.error('Start discovery failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/aws/discover/:sessionId - Get discovery status
 */
async function handleGetDiscoveryStatus(ctx: RouteContext): Promise<Response> {
  try {
    const sessionId = ctx.path.split('/').pop();
    if (!sessionId) {
      return error('Missing session ID', 400);
    }

    const session = infrastructureScanner.getSession(sessionId);
    if (!session) {
      return error('Session not found', 404);
    }

    const response: any = {
      sessionId: session.id,
      status: session.progress.status,
      progress: {
        regionsScanned: session.progress.regionsScanned,
        totalRegions: session.progress.totalRegions,
        servicesScanned: session.progress.servicesScanned,
        totalServices: session.progress.totalServices,
        resourcesFound: session.progress.resourcesFound,
        currentRegion: session.progress.currentRegion,
        currentService: session.progress.currentService,
      },
      errors: session.progress.errors,
      startedAt: session.progress.startedAt,
      updatedAt: session.progress.updatedAt,
    };

    // Include inventory if completed
    if (session.progress.status === 'completed' && session.inventory) {
      response.inventory = session.inventory;
    }

    return success(response);
  } catch (err: any) {
    logger.error('Get discovery status failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/aws/discover/:sessionId/cancel - Cancel discovery
 */
async function handleCancelDiscovery(ctx: RouteContext): Promise<Response> {
  try {
    const pathParts = ctx.path.split('/');
    const sessionId = pathParts[pathParts.length - 2];

    if (!sessionId) {
      return error('Missing session ID', 400);
    }

    const cancelled = infrastructureScanner.cancelDiscovery(sessionId);

    if (!cancelled) {
      return error('Could not cancel discovery (session not found or already completed)', 400);
    }

    return success({ message: 'Discovery cancelled' });
  } catch (err: any) {
    logger.error('Cancel discovery failed', err);
    return error(err.message);
  }
}
