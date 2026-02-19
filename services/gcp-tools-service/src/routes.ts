/**
 * GCP Tools Service Routes
 *
 * HTTP route handlers for all GCP service operations,
 * infrastructure discovery, and Terraform generation.
 */

import { logger } from '@nimbus/shared-utils';
import { ComputeOperations } from './gcp/compute';
import { StorageOperations } from './gcp/storage';
import { GKEOperations } from './gcp/gke';
import { IAMOperations } from './gcp/iam';
import { FunctionsOperations } from './gcp/functions';
import { VPCOperations } from './gcp/vpc';
import {
  CredentialManager,
  RegionManager,
  InfrastructureScanner,
  type DiscoveryConfig,
} from './discovery';
import {
  createGCPTerraformGenerator,
  type TerraformGeneratorConfig,
  type GeneratedFiles,
} from './terraform';

// Singleton instances for state consistency
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
    service: 'gcp-tools-service',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

// ==================== Compute Handlers ====================

/**
 * GET /api/gcp/compute/instances - List Compute Engine instances
 */
async function handleListInstances(ctx: RouteContext): Promise<Response> {
  try {
    const project = ctx.url.searchParams.get('project') || undefined;
    const zone = ctx.url.searchParams.get('zone') || undefined;

    const compute = new ComputeOperations({ projectId: project });
    const result = await compute.listInstances({ project, zone });

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
 * POST /api/gcp/compute/instances/start - Start a Compute Engine instance
 */
async function handleStartInstance(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ project?: string; zone: string; instance: string }>(ctx.req);

    if (!body.zone) {
      return error('Missing required field: zone', 400);
    }
    if (!body.instance) {
      return error('Missing required field: instance', 400);
    }

    const compute = new ComputeOperations({ projectId: body.project });
    const result = await compute.startInstance(body.project || '', body.zone, body.instance);

    if (!result.success) {
      return error(result.error || 'Failed to start instance', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Start instance failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/gcp/compute/instances/stop - Stop a Compute Engine instance
 */
async function handleStopInstance(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ project?: string; zone: string; instance: string }>(ctx.req);

    if (!body.zone) {
      return error('Missing required field: zone', 400);
    }
    if (!body.instance) {
      return error('Missing required field: instance', 400);
    }

    const compute = new ComputeOperations({ projectId: body.project });
    const result = await compute.stopInstance(body.project || '', body.zone, body.instance);

    if (!result.success) {
      return error(result.error || 'Failed to stop instance', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Stop instance failed', err);
    return error(err.message);
  }
}

// ==================== Storage Handlers ====================

/**
 * GET /api/gcp/storage/buckets - List Cloud Storage buckets
 */
async function handleListBuckets(ctx: RouteContext): Promise<Response> {
  try {
    const project = ctx.url.searchParams.get('project') || undefined;

    const storage = new StorageOperations({ projectId: project });
    const result = await storage.listBuckets(project);

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
 * GET /api/gcp/storage/objects - List objects in a bucket
 */
async function handleListObjects(ctx: RouteContext): Promise<Response> {
  try {
    const bucket = ctx.url.searchParams.get('bucket');
    const prefix = ctx.url.searchParams.get('prefix') || undefined;
    const maxResults = ctx.url.searchParams.get('maxResults');

    if (!bucket) {
      return error('Missing required query parameter: bucket', 400);
    }

    const storage = new StorageOperations();
    const result = await storage.listObjects(bucket, {
      prefix,
      maxResults: maxResults ? parseInt(maxResults) : undefined,
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

// ==================== GKE Handlers ====================

/**
 * GET /api/gcp/gke/clusters - List GKE clusters
 */
async function handleListClusters(ctx: RouteContext): Promise<Response> {
  try {
    const project = ctx.url.searchParams.get('project') || undefined;
    const location = ctx.url.searchParams.get('location') || undefined;

    const gke = new GKEOperations({ projectId: project });
    const result = await gke.listClusters(project, location);

    if (!result.success) {
      return error(result.error || 'Failed to list clusters', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List clusters failed', err);
    return error(err.message);
  }
}

// ==================== IAM Handlers ====================

/**
 * GET /api/gcp/iam/service-accounts - List IAM service accounts
 */
async function handleListServiceAccounts(ctx: RouteContext): Promise<Response> {
  try {
    const project = ctx.url.searchParams.get('project') || '';

    const iamOps = new IAMOperations({ projectId: project || undefined });
    const result = await iamOps.listServiceAccounts(project);

    if (!result.success) {
      return error(result.error || 'Failed to list service accounts', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List service accounts failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/gcp/iam/roles - List IAM roles
 */
async function handleListRoles(ctx: RouteContext): Promise<Response> {
  try {
    const project = ctx.url.searchParams.get('project') || undefined;

    const iamOps = new IAMOperations({ projectId: project });
    const result = await iamOps.listRoles(project);

    if (!result.success) {
      return error(result.error || 'Failed to list roles', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List roles failed', err);
    return error(err.message);
  }
}

// ==================== Cloud Functions Handlers ====================

/**
 * GET /api/gcp/functions/functions - List Cloud Functions
 */
async function handleListFunctions(ctx: RouteContext): Promise<Response> {
  try {
    const project = ctx.url.searchParams.get('project') || undefined;
    const location = ctx.url.searchParams.get('location') || undefined;

    const functionsOps = new FunctionsOperations({ projectId: project });
    const result = await functionsOps.listFunctions(project, location);

    if (!result.success) {
      return error(result.error || 'Failed to list functions', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List functions failed', err);
    return error(err.message);
  }
}

// ==================== VPC Handlers ====================

/**
 * GET /api/gcp/vpc/networks - List VPC networks
 */
async function handleListNetworks(ctx: RouteContext): Promise<Response> {
  try {
    const project = ctx.url.searchParams.get('project') || undefined;

    const vpcOps = new VPCOperations({ projectId: project });
    const result = await vpcOps.listNetworks(project);

    if (!result.success) {
      return error(result.error || 'Failed to list networks', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List networks failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/gcp/vpc/subnets - List VPC subnets
 */
async function handleListSubnets(ctx: RouteContext): Promise<Response> {
  try {
    const project = ctx.url.searchParams.get('project') || undefined;
    const region = ctx.url.searchParams.get('region') || undefined;

    const vpcOps = new VPCOperations({ projectId: project });
    const result = await vpcOps.listSubnets(project, region);

    if (!result.success) {
      return error(result.error || 'Failed to list subnets', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List subnets failed', err);
    return error(err.message);
  }
}

// ==================== Discovery Handlers ====================

/**
 * POST /api/gcp/discover - Start infrastructure discovery
 */
async function handleStartDiscovery(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      projectId?: string;
      regions: string[] | 'all';
      excludeRegions?: string[];
      services?: string[];
      excludeServices?: string[];
    }>(ctx.req);

    if (!body.regions) {
      return error('Missing required field: regions', 400);
    }

    const config: DiscoveryConfig = {
      projectId: body.projectId,
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
 * GET /api/gcp/discover/:sessionId - Get discovery status
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

// ==================== Terraform Generation Handlers ====================

/**
 * POST /api/gcp/terraform/generate - Generate Terraform from discovery session
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
        googleProviderVersion?: string;
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
      googleProviderVersion: body.options?.googleProviderVersion || '~> 5.0',
      defaultProject: session.inventory.projectId,
      defaultRegion: session.inventory.regions[0] || 'us-central1',
    };

    // Generate Terraform configuration
    const generator = createGCPTerraformGenerator(config);
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

// ==================== Main Router ====================

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

  // Compute routes
  if (path.startsWith('/api/gcp/compute')) {
    const route = path.replace('/api/gcp/compute', '');

    if (method === 'GET') {
      switch (route) {
        case '/instances':
          return handleListInstances(ctx);
      }
    }

    if (method === 'POST') {
      switch (route) {
        case '/instances/start':
          return handleStartInstance(ctx);
        case '/instances/stop':
          return handleStopInstance(ctx);
      }
    }
  }

  // Storage routes
  if (path.startsWith('/api/gcp/storage')) {
    const route = path.replace('/api/gcp/storage', '');

    if (method === 'GET') {
      switch (route) {
        case '/buckets':
          return handleListBuckets(ctx);
        case '/objects':
          return handleListObjects(ctx);
      }
    }
  }

  // GKE routes
  if (path.startsWith('/api/gcp/gke')) {
    const route = path.replace('/api/gcp/gke', '');

    if (method === 'GET') {
      switch (route) {
        case '/clusters':
          return handleListClusters(ctx);
      }
    }
  }

  // IAM routes
  if (path.startsWith('/api/gcp/iam')) {
    const route = path.replace('/api/gcp/iam', '');

    if (method === 'GET') {
      switch (route) {
        case '/service-accounts':
          return handleListServiceAccounts(ctx);
        case '/roles':
          return handleListRoles(ctx);
      }
    }
  }

  // Cloud Functions routes
  if (path.startsWith('/api/gcp/functions')) {
    const route = path.replace('/api/gcp/functions', '');

    if (method === 'GET') {
      switch (route) {
        case '/functions':
          return handleListFunctions(ctx);
      }
    }
  }

  // VPC routes
  if (path.startsWith('/api/gcp/vpc')) {
    const route = path.replace('/api/gcp/vpc', '');

    if (method === 'GET') {
      switch (route) {
        case '/networks':
          return handleListNetworks(ctx);
        case '/subnets':
          return handleListSubnets(ctx);
      }
    }
  }

  // Discovery routes
  if (path.startsWith('/api/gcp/discover')) {
    if (path === '/api/gcp/discover' && method === 'POST') {
      return handleStartDiscovery(ctx);
    }

    if (path.match(/^\/api\/gcp\/discover\/[\w-]+$/) && method === 'GET') {
      return handleGetDiscoveryStatus(ctx);
    }
  }

  // Terraform routes
  if (path.startsWith('/api/gcp/terraform')) {
    if (path === '/api/gcp/terraform/generate' && method === 'POST') {
      return handleGenerateTerraform(ctx);
    }
  }

  return new Response('Not Found', { status: 404 });
}
