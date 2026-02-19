/**
 * Azure Tools Service Routes
 *
 * HTTP route handler for all Azure service endpoints.
 * Follows the same pattern as the AWS tools service routes.
 */

import { logger } from '@nimbus/shared-utils';
import {
  ComputeOperations,
  StorageOperations,
  AKSOperations,
  IAMOperations,
  FunctionsOperations,
  NetworkOperations,
} from './azure';
import {
  AzureCredentialManager,
  SubscriptionManager,
  InfrastructureScanner,
  type DiscoveryConfig,
} from './discovery';
import {
  createAzureTerraformGenerator,
  type TerraformGeneratorConfig,
  type GeneratedFiles,
} from './terraform';

// Shared singleton instances
const credentialManager = new AzureCredentialManager();
const subscriptionManager = new SubscriptionManager();
const infrastructureScanner = new InfrastructureScanner();

// Terraform generation cache - stores generated files by session ID
const terraformCache = new Map<
  string,
  {
    files: GeneratedFiles;
    createdAt: Date;
    sessionId: string;
  }
>();

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
    service: 'azure-tools-service',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

// ==================== Compute (VM) Handlers ====================

/**
 * GET /api/azure/compute/vms - List Azure VMs
 */
async function handleListVMs(ctx: RouteContext): Promise<Response> {
  try {
    const subscriptionId = ctx.url.searchParams.get('subscriptionId') || undefined;
    const resourceGroup = ctx.url.searchParams.get('resourceGroup') || undefined;

    const compute = new ComputeOperations({ subscriptionId });
    const result = await compute.listVMs(subscriptionId, resourceGroup);

    if (!result.success) {
      return error(result.error || 'Failed to list VMs', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List VMs failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/azure/compute/vms/start - Start an Azure VM
 */
async function handleStartVM(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      subscriptionId?: string;
      resourceGroup: string;
      vmName: string;
    }>(ctx.req);

    if (!body.resourceGroup) {
      return error('Missing required field: resourceGroup', 400);
    }

    if (!body.vmName) {
      return error('Missing required field: vmName', 400);
    }

    const compute = new ComputeOperations({ subscriptionId: body.subscriptionId });
    const result = await compute.startVM(
      body.subscriptionId || '',
      body.resourceGroup,
      body.vmName,
    );

    if (!result.success) {
      return error(result.error || 'Failed to start VM', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Start VM failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/azure/compute/vms/stop - Stop (deallocate) an Azure VM
 */
async function handleStopVM(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      subscriptionId?: string;
      resourceGroup: string;
      vmName: string;
    }>(ctx.req);

    if (!body.resourceGroup) {
      return error('Missing required field: resourceGroup', 400);
    }

    if (!body.vmName) {
      return error('Missing required field: vmName', 400);
    }

    const compute = new ComputeOperations({ subscriptionId: body.subscriptionId });
    const result = await compute.stopVM(
      body.subscriptionId || '',
      body.resourceGroup,
      body.vmName,
    );

    if (!result.success) {
      return error(result.error || 'Failed to stop VM', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Stop VM failed', err);
    return error(err.message);
  }
}

// ==================== Storage Handlers ====================

/**
 * GET /api/azure/storage/accounts - List storage accounts
 */
async function handleListStorageAccounts(ctx: RouteContext): Promise<Response> {
  try {
    const subscriptionId = ctx.url.searchParams.get('subscriptionId') || undefined;
    const resourceGroup = ctx.url.searchParams.get('resourceGroup') || undefined;

    const storage = new StorageOperations({ subscriptionId });
    const result = await storage.listStorageAccounts(subscriptionId, resourceGroup);

    if (!result.success) {
      return error(result.error || 'Failed to list storage accounts', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List storage accounts failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/azure/storage/accounts/:name - Get storage account details (containers)
 */
async function handleGetStorageAccount(ctx: RouteContext): Promise<Response> {
  try {
    const pathParts = ctx.path.split('/');
    const accountName = pathParts[pathParts.length - 1];

    if (!accountName) {
      return error('Missing storage account name', 400);
    }

    const subscriptionId = ctx.url.searchParams.get('subscriptionId') || '';
    const resourceGroup = ctx.url.searchParams.get('resourceGroup') || '';

    if (!resourceGroup) {
      return error('Missing required query parameter: resourceGroup', 400);
    }

    const storage = new StorageOperations({ subscriptionId });
    const result = await storage.listContainers(subscriptionId, resourceGroup, accountName);

    if (!result.success) {
      return error(result.error || 'Failed to get storage account details', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Get storage account failed', err);
    return error(err.message);
  }
}

// ==================== AKS Handlers ====================

/**
 * GET /api/azure/aks/clusters - List AKS clusters
 */
async function handleListClusters(ctx: RouteContext): Promise<Response> {
  try {
    const subscriptionId = ctx.url.searchParams.get('subscriptionId') || undefined;
    const resourceGroup = ctx.url.searchParams.get('resourceGroup') || undefined;

    const aks = new AKSOperations({ subscriptionId });
    const result = await aks.listClusters(subscriptionId, resourceGroup);

    if (!result.success) {
      return error(result.error || 'Failed to list AKS clusters', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List AKS clusters failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/azure/aks/clusters/:name - Get AKS cluster details
 */
async function handleDescribeCluster(ctx: RouteContext): Promise<Response> {
  try {
    const pathParts = ctx.path.split('/');
    const clusterName = pathParts[pathParts.length - 1];

    if (!clusterName) {
      return error('Missing cluster name', 400);
    }

    const subscriptionId = ctx.url.searchParams.get('subscriptionId') || '';
    const resourceGroup = ctx.url.searchParams.get('resourceGroup') || '';

    if (!resourceGroup) {
      return error('Missing required query parameter: resourceGroup', 400);
    }

    const aks = new AKSOperations({ subscriptionId });
    const result = await aks.describeCluster(subscriptionId, resourceGroup, clusterName);

    if (!result.success) {
      return error(result.error || 'Failed to describe AKS cluster', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('Describe AKS cluster failed', err);
    return error(err.message);
  }
}

// ==================== IAM Handlers ====================

/**
 * GET /api/azure/iam/role-assignments - List role assignments
 */
async function handleListRoleAssignments(ctx: RouteContext): Promise<Response> {
  try {
    const subscriptionId = ctx.url.searchParams.get('subscriptionId') || undefined;

    const iam = new IAMOperations({ subscriptionId });
    const result = await iam.listRoleAssignments(subscriptionId);

    if (!result.success) {
      return error(result.error || 'Failed to list role assignments', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List role assignments failed', err);
    return error(err.message);
  }
}

// ==================== Functions Handlers ====================

/**
 * GET /api/azure/functions/apps - List Azure Function Apps
 */
async function handleListFunctionApps(ctx: RouteContext): Promise<Response> {
  try {
    const subscriptionId = ctx.url.searchParams.get('subscriptionId') || undefined;
    const resourceGroup = ctx.url.searchParams.get('resourceGroup') || undefined;

    const functions = new FunctionsOperations({ subscriptionId });
    const result = await functions.listFunctionApps(subscriptionId, resourceGroup);

    if (!result.success) {
      return error(result.error || 'Failed to list function apps', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List function apps failed', err);
    return error(err.message);
  }
}

// ==================== Network Handlers ====================

/**
 * GET /api/azure/network/vnets - List virtual networks
 */
async function handleListVNets(ctx: RouteContext): Promise<Response> {
  try {
    const subscriptionId = ctx.url.searchParams.get('subscriptionId') || undefined;
    const resourceGroup = ctx.url.searchParams.get('resourceGroup') || undefined;

    const network = new NetworkOperations({ subscriptionId });
    const result = await network.listVNets(subscriptionId, resourceGroup);

    if (!result.success) {
      return error(result.error || 'Failed to list virtual networks', 500);
    }

    return success(result.data);
  } catch (err: any) {
    logger.error('List VNets failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/azure/network/subnets - List subnets for a VNet
 */
async function handleListSubnets(ctx: RouteContext): Promise<Response> {
  try {
    const subscriptionId = ctx.url.searchParams.get('subscriptionId') || '';
    const resourceGroup = ctx.url.searchParams.get('resourceGroup') || '';
    const vnetName = ctx.url.searchParams.get('vnetName') || '';

    if (!resourceGroup) {
      return error('Missing required query parameter: resourceGroup', 400);
    }

    if (!vnetName) {
      return error('Missing required query parameter: vnetName', 400);
    }

    const network = new NetworkOperations({ subscriptionId });
    const result = await network.listSubnets(subscriptionId, resourceGroup, vnetName);

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
 * POST /api/azure/discover - Start infrastructure discovery
 */
async function handleStartDiscovery(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      subscriptionId?: string;
      regions: string[] | 'all';
      excludeRegions?: string[];
      services?: string[];
      excludeServices?: string[];
    }>(ctx.req);

    if (!body.regions) {
      return error('Missing required field: regions', 400);
    }

    const config: DiscoveryConfig = {
      subscriptionId: body.subscriptionId,
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
 * GET /api/azure/discover/:sessionId - Get discovery status
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
 * POST /api/azure/terraform/generate - Generate Terraform from discovery session or direct resources
 */
async function handleGenerateTerraform(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      sessionId?: string;
      resources?: Array<{
        id: string;
        resourceId: string;
        type: string;
        azureType: string;
        service: string;
        region: string;
        resourceGroup: string;
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
        azurermProviderVersion?: string;
        defaultRegion?: string;
      };
    }>(ctx.req);

    let resources: any[];

    if (body.sessionId) {
      // Generate from discovery session
      const session = infrastructureScanner.getSession(body.sessionId);
      if (!session) {
        return error('Discovery session not found', 404);
      }

      if (session.progress.status !== 'completed') {
        return error(
          `Discovery is not complete. Current status: ${session.progress.status}`,
          400,
        );
      }

      if (!session.inventory || session.inventory.resources.length === 0) {
        return error('No resources found in discovery session', 400);
      }

      resources = session.inventory.resources;
    } else if (body.resources && body.resources.length > 0) {
      // Generate from directly provided resources
      resources = body.resources.map(r => ({
        ...r,
        tags: r.tags || {},
        relationships: [],
      }));
    } else {
      return error('Either sessionId or resources array is required', 400);
    }

    // Create Terraform generator config
    const config: TerraformGeneratorConfig = {
      outputDir: body.options?.outputDir || '/tmp/terraform-azure',
      generateImportBlocks: body.options?.generateImportBlocks ?? true,
      generateImportScript: body.options?.generateImportScript ?? true,
      organizeByService: body.options?.organizeByService ?? true,
      terraformVersion: body.options?.terraformVersion || '1.5.0',
      azurermProviderVersion: body.options?.azurermProviderVersion || '~> 3.0',
      defaultRegion: body.options?.defaultRegion || resources[0]?.region || 'eastus',
    };

    // Generate Terraform configuration
    const generator = createAzureTerraformGenerator(config);
    const generatedFiles = generator.generate(resources);

    // Cache the generated files
    const terraformSessionId = body.sessionId
      ? `tf-${body.sessionId}`
      : `tf-direct-${crypto.randomUUID()}`;

    terraformCache.set(terraformSessionId, {
      files: generatedFiles,
      createdAt: new Date(),
      sessionId: body.sessionId || 'direct',
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
      importScript: generatedFiles.importScript,
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
  if (path.startsWith('/api/azure/compute')) {
    const route = path.replace('/api/azure/compute', '');

    if (method === 'GET') {
      switch (route) {
        case '/vms':
          return handleListVMs(ctx);
      }
    }

    if (method === 'POST') {
      switch (route) {
        case '/vms/start':
          return handleStartVM(ctx);
        case '/vms/stop':
          return handleStopVM(ctx);
      }
    }
  }

  // Storage routes
  if (path.startsWith('/api/azure/storage')) {
    const route = path.replace('/api/azure/storage', '');

    if (method === 'GET') {
      if (route === '/accounts') {
        return handleListStorageAccounts(ctx);
      }

      // Match /accounts/:name
      if (route.match(/^\/accounts\/[^/]+$/)) {
        return handleGetStorageAccount(ctx);
      }
    }
  }

  // AKS routes
  if (path.startsWith('/api/azure/aks')) {
    const route = path.replace('/api/azure/aks', '');

    if (method === 'GET') {
      if (route === '/clusters') {
        return handleListClusters(ctx);
      }

      // Match /clusters/:name
      if (route.match(/^\/clusters\/[^/]+$/)) {
        return handleDescribeCluster(ctx);
      }
    }
  }

  // IAM routes
  if (path.startsWith('/api/azure/iam')) {
    const route = path.replace('/api/azure/iam', '');

    if (method === 'GET') {
      switch (route) {
        case '/role-assignments':
          return handleListRoleAssignments(ctx);
      }
    }
  }

  // Functions routes
  if (path.startsWith('/api/azure/functions')) {
    const route = path.replace('/api/azure/functions', '');

    if (method === 'GET') {
      switch (route) {
        case '/apps':
          return handleListFunctionApps(ctx);
      }
    }
  }

  // Network routes
  if (path.startsWith('/api/azure/network')) {
    const route = path.replace('/api/azure/network', '');

    if (method === 'GET') {
      switch (route) {
        case '/vnets':
          return handleListVNets(ctx);
        case '/subnets':
          return handleListSubnets(ctx);
      }
    }
  }

  // Discovery routes
  if (path.startsWith('/api/azure/discover')) {
    if (path === '/api/azure/discover' && method === 'POST') {
      return handleStartDiscovery(ctx);
    }

    if (path.match(/^\/api\/azure\/discover\/[\w-]+$/) && method === 'GET') {
      return handleGetDiscoveryStatus(ctx);
    }
  }

  // Terraform routes
  if (path.startsWith('/api/azure/terraform')) {
    if (path === '/api/azure/terraform/generate' && method === 'POST') {
      return handleGenerateTerraform(ctx);
    }
  }

  return new Response('Not Found', { status: 404 });
}
