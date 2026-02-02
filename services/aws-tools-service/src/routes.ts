import { EC2Operations } from './aws/ec2';
import { S3Operations } from './aws/s3';
import { IAMOperations } from './aws/iam';
import { logger } from '@nimbus/shared-utils';

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

  return new Response('Not Found', { status: 404 });
}
