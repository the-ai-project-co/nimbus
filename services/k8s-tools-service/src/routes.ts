import { KubernetesOperations } from './k8s/operations';
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
    service: 'k8s-tools-service',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/k8s/resources - Get Kubernetes resources
 */
async function handleGetResources(ctx: RouteContext): Promise<Response> {
  try {
    const resource = ctx.url.searchParams.get('resource');
    const name = ctx.url.searchParams.get('name') || undefined;
    const namespace = ctx.url.searchParams.get('namespace') || undefined;
    const selector = ctx.url.searchParams.get('selector') || undefined;
    const allNamespaces = ctx.url.searchParams.get('allNamespaces') === 'true';
    const output = (ctx.url.searchParams.get('output') as 'json' | 'yaml' | 'wide' | 'name') || 'json';
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    if (!resource) {
      return error('Missing required query parameter: resource', 400);
    }

    const k8s = new KubernetesOperations({ kubeconfig, context, namespace });
    const result = await k8s.get({
      resource,
      name,
      namespace,
      selector,
      allNamespaces,
      output,
    });

    if (!result.success) {
      return error(result.error || 'Failed to get resources', 500);
    }

    // Parse JSON output if applicable
    let data = result.output;
    if (output === 'json' && result.output) {
      try {
        data = JSON.parse(result.output);
      } catch {
        // Keep as string if not valid JSON
      }
    }

    return success({ output: data });
  } catch (err: any) {
    logger.error('Get resources failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/apply - Apply a manifest
 */
async function handleApply(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      manifest: string;
      namespace?: string;
      dryRun?: boolean;
      force?: boolean;
      serverSide?: boolean;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.manifest) {
      return error('Missing required field: manifest', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
      namespace: body.namespace,
    });

    const result = await k8s.apply({
      manifest: body.manifest,
      namespace: body.namespace,
      dryRun: body.dryRun,
      force: body.force,
      serverSide: body.serverSide,
    });

    if (!result.success) {
      return error(result.error || 'Failed to apply manifest', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Apply failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/delete - Delete Kubernetes resources
 */
async function handleDelete(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      resource: string;
      name?: string;
      namespace?: string;
      selector?: string;
      force?: boolean;
      gracePeriod?: number;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.resource) {
      return error('Missing required field: resource', 400);
    }

    if (!body.name && !body.selector) {
      return error('Either name or selector must be provided', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
      namespace: body.namespace,
    });

    const result = await k8s.delete({
      resource: body.resource,
      name: body.name,
      namespace: body.namespace,
      selector: body.selector,
      force: body.force,
      gracePeriod: body.gracePeriod,
    });

    if (!result.success) {
      return error(result.error || 'Failed to delete resources', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Delete failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/k8s/logs - Get pod logs
 */
async function handleLogs(ctx: RouteContext): Promise<Response> {
  try {
    const pod = ctx.url.searchParams.get('pod');
    const namespace = ctx.url.searchParams.get('namespace') || undefined;
    const container = ctx.url.searchParams.get('container') || undefined;
    const tail = ctx.url.searchParams.get('tail');
    const previous = ctx.url.searchParams.get('previous') === 'true';
    const since = ctx.url.searchParams.get('since') || undefined;
    const timestamps = ctx.url.searchParams.get('timestamps') === 'true';
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    if (!pod) {
      return error('Missing required query parameter: pod', 400);
    }

    const k8s = new KubernetesOperations({ kubeconfig, context, namespace });
    const result = await k8s.logs({
      pod,
      namespace,
      container,
      tail: tail ? parseInt(tail) : undefined,
      previous,
      since,
      timestamps,
    });

    if (!result.success) {
      return error(result.error || 'Failed to get logs', 500);
    }

    return success({ logs: result.output });
  } catch (err: any) {
    logger.error('Get logs failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/exec - Execute command in pod
 */
async function handleExec(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      pod: string;
      command: string[];
      namespace?: string;
      container?: string;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.pod) {
      return error('Missing required field: pod', 400);
    }

    if (!body.command || body.command.length === 0) {
      return error('Missing required field: command', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
      namespace: body.namespace,
    });

    const result = await k8s.exec({
      pod: body.pod,
      namespace: body.namespace,
      container: body.container,
      command: body.command,
    });

    if (!result.success) {
      return error(result.error || 'Failed to execute command', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Exec failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/k8s/describe - Describe Kubernetes resources
 */
async function handleDescribe(ctx: RouteContext): Promise<Response> {
  try {
    const resource = ctx.url.searchParams.get('resource');
    const name = ctx.url.searchParams.get('name') || undefined;
    const namespace = ctx.url.searchParams.get('namespace') || undefined;
    const selector = ctx.url.searchParams.get('selector') || undefined;
    const allNamespaces = ctx.url.searchParams.get('allNamespaces') === 'true';
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    if (!resource) {
      return error('Missing required query parameter: resource', 400);
    }

    const k8s = new KubernetesOperations({ kubeconfig, context, namespace });
    const result = await k8s.describe({
      resource,
      name,
      namespace,
      selector,
      allNamespaces,
    });

    if (!result.success) {
      return error(result.error || 'Failed to describe resources', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Describe failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/scale - Scale a deployment/replicaset/statefulset
 */
async function handleScale(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      resource: string;
      name: string;
      replicas: number;
      namespace?: string;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.resource) {
      return error('Missing required field: resource', 400);
    }

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    if (body.replicas === undefined || body.replicas < 0) {
      return error('Missing or invalid field: replicas (must be >= 0)', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
      namespace: body.namespace,
    });

    const result = await k8s.scale({
      resource: body.resource,
      name: body.name,
      replicas: body.replicas,
      namespace: body.namespace,
    });

    if (!result.success) {
      return error(result.error || 'Failed to scale resource', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Scale failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/rollout - Manage rollouts
 */
async function handleRollout(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      resource: string;
      name: string;
      action: 'status' | 'history' | 'restart' | 'undo' | 'pause' | 'resume';
      namespace?: string;
      revision?: number;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.resource) {
      return error('Missing required field: resource', 400);
    }

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    if (!body.action) {
      return error('Missing required field: action', 400);
    }

    const validActions = ['status', 'history', 'restart', 'undo', 'pause', 'resume'];
    if (!validActions.includes(body.action)) {
      return error(`Invalid action. Must be one of: ${validActions.join(', ')}`, 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
      namespace: body.namespace,
    });

    const result = await k8s.rollout({
      resource: body.resource,
      name: body.name,
      action: body.action,
      namespace: body.namespace,
      revision: body.revision,
    });

    if (!result.success) {
      return error(result.error || 'Failed to manage rollout', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Rollout failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/k8s/cluster-info - Get cluster information
 */
async function handleClusterInfo(ctx: RouteContext): Promise<Response> {
  try {
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    const k8s = new KubernetesOperations({ kubeconfig, context });
    const result = await k8s.clusterInfo();

    if (!result.success) {
      return error(result.error || 'Failed to get cluster info', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Cluster info failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/k8s/contexts - Get available contexts
 */
async function handleContexts(ctx: RouteContext): Promise<Response> {
  try {
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;

    const k8s = new KubernetesOperations({ kubeconfig });
    const [contextsResult, currentResult] = await Promise.all([
      k8s.getContexts(),
      k8s.currentContext(),
    ]);

    const contexts = contextsResult.success
      ? contextsResult.output.split('\n').filter(Boolean)
      : [];
    const current = currentResult.success ? currentResult.output : null;

    return success({ contexts, current });
  } catch (err: any) {
    logger.error('Get contexts failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/context - Switch context
 */
async function handleSwitchContext(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ context: string; kubeconfig?: string }>(ctx.req);

    if (!body.context) {
      return error('Missing required field: context', 400);
    }

    const k8s = new KubernetesOperations({ kubeconfig: body.kubeconfig });
    const result = await k8s.useContext(body.context);

    if (!result.success) {
      return error(result.error || 'Failed to switch context', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Switch context failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/k8s/namespaces - Get namespaces
 */
async function handleNamespaces(ctx: RouteContext): Promise<Response> {
  try {
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    const k8s = new KubernetesOperations({ kubeconfig, context });
    const result = await k8s.getNamespaces();

    if (!result.success) {
      return error(result.error || 'Failed to get namespaces', 500);
    }

    let namespaces: string[] = [];
    try {
      const parsed = JSON.parse(result.output);
      namespaces = parsed.items?.map((ns: any) => ns.metadata?.name).filter(Boolean) || [];
    } catch {
      // Keep empty array if parsing fails
    }

    return success({ namespaces });
  } catch (err: any) {
    logger.error('Get namespaces failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/namespace - Create namespace
 */
async function handleCreateNamespace(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ name: string; kubeconfig?: string; context?: string }>(ctx.req);

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    const k8s = new KubernetesOperations({ kubeconfig: body.kubeconfig, context: body.context });
    const result = await k8s.createNamespace(body.name);

    if (!result.success) {
      return error(result.error || 'Failed to create namespace', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Create namespace failed', err);
    return error(err.message);
  }
}

/**
 * DELETE /api/k8s/namespace - Delete namespace
 */
async function handleDeleteNamespace(ctx: RouteContext): Promise<Response> {
  try {
    const name = ctx.url.searchParams.get('name');
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    if (!name) {
      return error('Missing required query parameter: name', 400);
    }

    const k8s = new KubernetesOperations({ kubeconfig, context });
    const result = await k8s.deleteNamespace(name);

    if (!result.success) {
      return error(result.error || 'Failed to delete namespace', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Delete namespace failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/k8s/events - Get events
 */
async function handleEvents(ctx: RouteContext): Promise<Response> {
  try {
    const namespace = ctx.url.searchParams.get('namespace') || undefined;
    const fieldSelector = ctx.url.searchParams.get('fieldSelector') || undefined;
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    const k8s = new KubernetesOperations({ kubeconfig, context });
    const result = await k8s.getEvents(namespace, fieldSelector);

    if (!result.success) {
      return error(result.error || 'Failed to get events', 500);
    }

    let events: any[] = [];
    try {
      const parsed = JSON.parse(result.output);
      events = parsed.items || [];
    } catch {
      // Keep empty array if parsing fails
    }

    return success({ events });
  } catch (err: any) {
    logger.error('Get events failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/k8s/top/pods - Get pod resource usage
 */
async function handleTopPods(ctx: RouteContext): Promise<Response> {
  try {
    const namespace = ctx.url.searchParams.get('namespace') || undefined;
    const selector = ctx.url.searchParams.get('selector') || undefined;
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    const k8s = new KubernetesOperations({ kubeconfig, context });
    const result = await k8s.topPods(namespace, selector);

    if (!result.success) {
      return error(result.error || 'Failed to get pod metrics', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Top pods failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/k8s/top/nodes - Get node resource usage
 */
async function handleTopNodes(ctx: RouteContext): Promise<Response> {
  try {
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    const k8s = new KubernetesOperations({ kubeconfig, context });
    const result = await k8s.topNodes();

    if (!result.success) {
      return error(result.error || 'Failed to get node metrics', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Top nodes failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/k8s/version - Get Kubernetes version
 */
async function handleVersion(ctx: RouteContext): Promise<Response> {
  try {
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const context = ctx.url.searchParams.get('context') || undefined;

    const k8s = new KubernetesOperations({ kubeconfig, context });
    const result = await k8s.version();

    if (!result.success) {
      return error(result.error || 'Failed to get version', 500);
    }

    let version: any = result.output;
    try {
      version = JSON.parse(result.output);
    } catch {
      // Keep as string if not valid JSON
    }

    return success({ version });
  } catch (err: any) {
    logger.error('Get version failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/port-forward - Start port forwarding
 */
async function handlePortForward(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      resource: string;
      name: string;
      namespace?: string;
      ports: string[];
      address?: string;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.resource) {
      return error('Missing required field: resource', 400);
    }

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    if (!body.ports || body.ports.length === 0) {
      return error('Missing required field: ports', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
      namespace: body.namespace,
    });

    const result = await k8s.portForward({
      resource: body.resource,
      name: body.name,
      namespace: body.namespace,
      ports: body.ports,
      address: body.address,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Port forward failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/label - Label a resource
 */
async function handleLabel(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      resource: string;
      name: string;
      namespace?: string;
      labels: Record<string, string | null>;
      overwrite?: boolean;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.resource || !body.name || !body.labels) {
      return error('Missing required fields: resource, name, labels', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
      namespace: body.namespace,
    });

    const result = await k8s.label({
      resource: body.resource,
      name: body.name,
      namespace: body.namespace,
      labels: body.labels,
      overwrite: body.overwrite,
    });

    if (!result.success) {
      return error(result.error || 'Failed to label resource', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Label failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/annotate - Annotate a resource
 */
async function handleAnnotate(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      resource: string;
      name: string;
      namespace?: string;
      annotations: Record<string, string | null>;
      overwrite?: boolean;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.resource || !body.name || !body.annotations) {
      return error('Missing required fields: resource, name, annotations', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
      namespace: body.namespace,
    });

    const result = await k8s.annotate({
      resource: body.resource,
      name: body.name,
      namespace: body.namespace,
      annotations: body.annotations,
      overwrite: body.overwrite,
    });

    if (!result.success) {
      return error(result.error || 'Failed to annotate resource', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Annotate failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/patch - Patch a resource
 */
async function handlePatch(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      resource: string;
      name: string;
      namespace?: string;
      patch: Record<string, unknown>;
      type?: 'json' | 'merge' | 'strategic';
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.resource || !body.name || !body.patch) {
      return error('Missing required fields: resource, name, patch', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
      namespace: body.namespace,
    });

    const result = await k8s.patch({
      resource: body.resource,
      name: body.name,
      namespace: body.namespace,
      patch: body.patch,
      type: body.type,
    });

    if (!result.success) {
      return error(result.error || 'Failed to patch resource', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Patch failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/node/cordon - Cordon a node
 */
async function handleCordon(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      nodeName: string;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.nodeName) {
      return error('Missing required field: nodeName', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
    });

    const result = await k8s.cordon(body.nodeName);

    if (!result.success) {
      return error(result.error || 'Failed to cordon node', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Cordon failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/node/uncordon - Uncordon a node
 */
async function handleUncordon(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      nodeName: string;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.nodeName) {
      return error('Missing required field: nodeName', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
    });

    const result = await k8s.uncordon(body.nodeName);

    if (!result.success) {
      return error(result.error || 'Failed to uncordon node', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Uncordon failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/k8s/node/drain - Drain a node
 */
async function handleDrain(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      nodeName: string;
      force?: boolean;
      ignoreDaemonsets?: boolean;
      deleteEmptyDirData?: boolean;
      gracePeriod?: number;
      timeout?: string;
      kubeconfig?: string;
      context?: string;
    }>(ctx.req);

    if (!body.nodeName) {
      return error('Missing required field: nodeName', 400);
    }

    const k8s = new KubernetesOperations({
      kubeconfig: body.kubeconfig,
      context: body.context,
    });

    const result = await k8s.drain(body.nodeName, {
      force: body.force,
      ignoreDaemonsets: body.ignoreDaemonsets,
      deleteEmptyDirData: body.deleteEmptyDirData,
      gracePeriod: body.gracePeriod,
      timeout: body.timeout,
    });

    if (!result.success) {
      return error(result.error || 'Failed to drain node', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Drain failed', err);
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

  // API routes
  if (path.startsWith('/api/k8s')) {
    const route = path.replace('/api/k8s', '');

    // POST routes
    if (method === 'POST') {
      switch (route) {
        case '/apply':
          return handleApply(ctx);
        case '/delete':
          return handleDelete(ctx);
        case '/exec':
          return handleExec(ctx);
        case '/scale':
          return handleScale(ctx);
        case '/rollout':
          return handleRollout(ctx);
        case '/context':
          return handleSwitchContext(ctx);
        case '/namespace':
          return handleCreateNamespace(ctx);
        case '/port-forward':
          return handlePortForward(ctx);
        case '/label':
          return handleLabel(ctx);
        case '/annotate':
          return handleAnnotate(ctx);
        case '/patch':
          return handlePatch(ctx);
        case '/node/cordon':
          return handleCordon(ctx);
        case '/node/uncordon':
          return handleUncordon(ctx);
        case '/node/drain':
          return handleDrain(ctx);
      }
    }

    // GET routes
    if (method === 'GET') {
      switch (route) {
        case '/resources':
          return handleGetResources(ctx);
        case '/logs':
          return handleLogs(ctx);
        case '/describe':
          return handleDescribe(ctx);
        case '/cluster-info':
          return handleClusterInfo(ctx);
        case '/contexts':
          return handleContexts(ctx);
        case '/namespaces':
          return handleNamespaces(ctx);
        case '/events':
          return handleEvents(ctx);
        case '/top/pods':
          return handleTopPods(ctx);
        case '/top/nodes':
          return handleTopNodes(ctx);
        case '/version':
          return handleVersion(ctx);
      }
    }

    // DELETE routes
    if (method === 'DELETE') {
      switch (route) {
        case '/namespace':
          return handleDeleteNamespace(ctx);
      }
    }
  }

  return new Response('Not Found', { status: 404 });
}
