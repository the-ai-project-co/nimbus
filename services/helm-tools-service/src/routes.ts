import { HelmOperations } from './helm/operations';
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
    service: 'helm-tools-service',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/helm/install - Install a Helm chart
 */
async function handleInstall(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      name: string;
      chart: string;
      namespace?: string;
      values?: string;
      valuesFiles?: string[];
      set?: Record<string, string>;
      setString?: Record<string, string>;
      version?: string;
      createNamespace?: boolean;
      dryRun?: boolean;
      wait?: boolean;
      timeout?: string;
      atomic?: boolean;
      kubeconfig?: string;
      kubeContext?: string;
    }>(ctx.req);

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    if (!body.chart) {
      return error('Missing required field: chart', 400);
    }

    const helm = new HelmOperations({
      kubeconfig: body.kubeconfig,
      kubeContext: body.kubeContext,
      namespace: body.namespace,
    });

    const result = await helm.install({
      name: body.name,
      chart: body.chart,
      namespace: body.namespace,
      values: body.values,
      valuesFiles: body.valuesFiles,
      set: body.set,
      setString: body.setString,
      version: body.version,
      createNamespace: body.createNamespace,
      dryRun: body.dryRun,
      wait: body.wait,
      timeout: body.timeout,
      atomic: body.atomic,
    });

    if (!result.success) {
      return error(result.error || 'Failed to install chart', 500);
    }

    let output = result.output;
    try {
      output = JSON.parse(result.output);
    } catch {
      // Keep as string if not valid JSON
    }

    return success({ release: output });
  } catch (err: any) {
    logger.error('Install failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/helm/upgrade - Upgrade a Helm release
 */
async function handleUpgrade(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      name: string;
      chart: string;
      namespace?: string;
      values?: string;
      valuesFiles?: string[];
      set?: Record<string, string>;
      setString?: Record<string, string>;
      version?: string;
      install?: boolean;
      createNamespace?: boolean;
      dryRun?: boolean;
      wait?: boolean;
      timeout?: string;
      atomic?: boolean;
      reuseValues?: boolean;
      resetValues?: boolean;
      kubeconfig?: string;
      kubeContext?: string;
    }>(ctx.req);

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    if (!body.chart) {
      return error('Missing required field: chart', 400);
    }

    const helm = new HelmOperations({
      kubeconfig: body.kubeconfig,
      kubeContext: body.kubeContext,
      namespace: body.namespace,
    });

    const result = await helm.upgrade({
      name: body.name,
      chart: body.chart,
      namespace: body.namespace,
      values: body.values,
      valuesFiles: body.valuesFiles,
      set: body.set,
      setString: body.setString,
      version: body.version,
      install: body.install,
      createNamespace: body.createNamespace,
      dryRun: body.dryRun,
      wait: body.wait,
      timeout: body.timeout,
      atomic: body.atomic,
      reuseValues: body.reuseValues,
      resetValues: body.resetValues,
    });

    if (!result.success) {
      return error(result.error || 'Failed to upgrade release', 500);
    }

    let output = result.output;
    try {
      output = JSON.parse(result.output);
    } catch {
      // Keep as string if not valid JSON
    }

    return success({ release: output });
  } catch (err: any) {
    logger.error('Upgrade failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/helm/uninstall - Uninstall a Helm release
 */
async function handleUninstall(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      name: string;
      namespace?: string;
      keepHistory?: boolean;
      dryRun?: boolean;
      wait?: boolean;
      timeout?: string;
      kubeconfig?: string;
      kubeContext?: string;
    }>(ctx.req);

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    const helm = new HelmOperations({
      kubeconfig: body.kubeconfig,
      kubeContext: body.kubeContext,
      namespace: body.namespace,
    });

    const result = await helm.uninstall({
      name: body.name,
      namespace: body.namespace,
      keepHistory: body.keepHistory,
      dryRun: body.dryRun,
      wait: body.wait,
      timeout: body.timeout,
    });

    if (!result.success) {
      return error(result.error || 'Failed to uninstall release', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Uninstall failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/helm/list - List Helm releases
 */
async function handleList(ctx: RouteContext): Promise<Response> {
  try {
    const namespace = ctx.url.searchParams.get('namespace') || undefined;
    const allNamespaces = ctx.url.searchParams.get('allNamespaces') === 'true';
    const filter = ctx.url.searchParams.get('filter') || undefined;
    const maxResults = ctx.url.searchParams.get('maxResults');
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const kubeContext = ctx.url.searchParams.get('kubeContext') || undefined;

    const helm = new HelmOperations({ kubeconfig, kubeContext, namespace });
    const result = await helm.list({
      namespace,
      allNamespaces,
      filter,
      maxResults: maxResults ? parseInt(maxResults) : undefined,
    });

    if (!result.success) {
      return error(result.error || 'Failed to list releases', 500);
    }

    let releases: any[] = [];
    try {
      releases = JSON.parse(result.output) || [];
    } catch {
      // Keep empty array if parsing fails
    }

    return success({ releases });
  } catch (err: any) {
    logger.error('List failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/helm/rollback - Rollback a Helm release
 */
async function handleRollback(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      name: string;
      revision: number;
      namespace?: string;
      dryRun?: boolean;
      wait?: boolean;
      timeout?: string;
      force?: boolean;
      kubeconfig?: string;
      kubeContext?: string;
    }>(ctx.req);

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    if (body.revision === undefined || body.revision < 0) {
      return error('Missing or invalid field: revision', 400);
    }

    const helm = new HelmOperations({
      kubeconfig: body.kubeconfig,
      kubeContext: body.kubeContext,
      namespace: body.namespace,
    });

    const result = await helm.rollback({
      name: body.name,
      revision: body.revision,
      namespace: body.namespace,
      dryRun: body.dryRun,
      wait: body.wait,
      timeout: body.timeout,
      force: body.force,
    });

    if (!result.success) {
      return error(result.error || 'Failed to rollback release', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Rollback failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/helm/values - Get values for a release
 */
async function handleGetValues(ctx: RouteContext): Promise<Response> {
  try {
    const name = ctx.url.searchParams.get('name');
    const namespace = ctx.url.searchParams.get('namespace') || undefined;
    const allValues = ctx.url.searchParams.get('allValues') === 'true';
    const revision = ctx.url.searchParams.get('revision');
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const kubeContext = ctx.url.searchParams.get('kubeContext') || undefined;

    if (!name) {
      return error('Missing required query parameter: name', 400);
    }

    const helm = new HelmOperations({ kubeconfig, kubeContext, namespace });
    const result = await helm.getValues({
      name,
      namespace,
      allValues,
      revision: revision ? parseInt(revision) : undefined,
    });

    if (!result.success) {
      return error(result.error || 'Failed to get values', 500);
    }

    return success({ values: result.output });
  } catch (err: any) {
    logger.error('Get values failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/helm/history - Get release history
 */
async function handleHistory(ctx: RouteContext): Promise<Response> {
  try {
    const name = ctx.url.searchParams.get('name');
    const namespace = ctx.url.searchParams.get('namespace') || undefined;
    const maxResults = ctx.url.searchParams.get('maxResults');
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const kubeContext = ctx.url.searchParams.get('kubeContext') || undefined;

    if (!name) {
      return error('Missing required query parameter: name', 400);
    }

    const helm = new HelmOperations({ kubeconfig, kubeContext, namespace });
    const result = await helm.history({
      name,
      namespace,
      maxResults: maxResults ? parseInt(maxResults) : undefined,
    });

    if (!result.success) {
      return error(result.error || 'Failed to get history', 500);
    }

    let history: any[] = [];
    try {
      history = JSON.parse(result.output) || [];
    } catch {
      // Keep empty array if parsing fails
    }

    return success({ history });
  } catch (err: any) {
    logger.error('History failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/helm/status - Get release status
 */
async function handleStatus(ctx: RouteContext): Promise<Response> {
  try {
    const name = ctx.url.searchParams.get('name');
    const namespace = ctx.url.searchParams.get('namespace') || undefined;
    const revision = ctx.url.searchParams.get('revision');
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const kubeContext = ctx.url.searchParams.get('kubeContext') || undefined;

    if (!name) {
      return error('Missing required query parameter: name', 400);
    }

    const helm = new HelmOperations({ kubeconfig, kubeContext, namespace });
    const result = await helm.status(
      name,
      namespace,
      revision ? parseInt(revision) : undefined
    );

    if (!result.success) {
      return error(result.error || 'Failed to get status', 500);
    }

    let status: any = result.output;
    try {
      status = JSON.parse(result.output);
    } catch {
      // Keep as string if parsing fails
    }

    return success({ status });
  } catch (err: any) {
    logger.error('Status failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/helm/repo - Manage Helm repositories
 */
async function handleRepo(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      action: 'add' | 'remove' | 'list' | 'update';
      name?: string;
      url?: string;
      username?: string;
      password?: string;
      kubeconfig?: string;
      kubeContext?: string;
    }>(ctx.req);

    if (!body.action) {
      return error('Missing required field: action', 400);
    }

    const validActions = ['add', 'remove', 'list', 'update'];
    if (!validActions.includes(body.action)) {
      return error(`Invalid action. Must be one of: ${validActions.join(', ')}`, 400);
    }

    const helm = new HelmOperations({
      kubeconfig: body.kubeconfig,
      kubeContext: body.kubeContext,
    });

    const result = await helm.repo({
      action: body.action,
      name: body.name,
      url: body.url,
      username: body.username,
      password: body.password,
    });

    if (!result.success) {
      return error(result.error || 'Failed to manage repository', 500);
    }

    let output: any = result.output;
    if (body.action === 'list') {
      try {
        output = JSON.parse(result.output);
      } catch {
        // Keep as string if parsing fails
      }
    }

    return success({ output });
  } catch (err: any) {
    logger.error('Repo operation failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/helm/search - Search for charts
 */
async function handleSearch(ctx: RouteContext): Promise<Response> {
  try {
    const keyword = ctx.url.searchParams.get('keyword');
    const version = ctx.url.searchParams.get('version') || undefined;
    const versions = ctx.url.searchParams.get('versions') === 'true';
    const regexp = ctx.url.searchParams.get('regexp') === 'true';
    const maxResults = ctx.url.searchParams.get('maxResults');
    const hub = ctx.url.searchParams.get('hub') === 'true';
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const kubeContext = ctx.url.searchParams.get('kubeContext') || undefined;

    if (!keyword) {
      return error('Missing required query parameter: keyword', 400);
    }

    const helm = new HelmOperations({ kubeconfig, kubeContext });

    let result;
    if (hub) {
      result = await helm.searchHub(keyword, maxResults ? parseInt(maxResults) : undefined);
    } else {
      result = await helm.search({
        keyword,
        version,
        versions,
        regexp,
        maxResults: maxResults ? parseInt(maxResults) : undefined,
      });
    }

    if (!result.success) {
      return error(result.error || 'Failed to search', 500);
    }

    let charts: any[] = [];
    try {
      charts = JSON.parse(result.output) || [];
    } catch {
      // Keep empty array if parsing fails
    }

    return success({ charts });
  } catch (err: any) {
    logger.error('Search failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/helm/show - Show chart information
 */
async function handleShow(ctx: RouteContext): Promise<Response> {
  try {
    const chart = ctx.url.searchParams.get('chart');
    const subcommand = ctx.url.searchParams.get('subcommand') as 'all' | 'chart' | 'readme' | 'values' | 'crds';
    const version = ctx.url.searchParams.get('version') || undefined;
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const kubeContext = ctx.url.searchParams.get('kubeContext') || undefined;

    if (!chart) {
      return error('Missing required query parameter: chart', 400);
    }

    const validSubcommands = ['all', 'chart', 'readme', 'values', 'crds'];
    if (!subcommand || !validSubcommands.includes(subcommand)) {
      return error(`Invalid or missing subcommand. Must be one of: ${validSubcommands.join(', ')}`, 400);
    }

    const helm = new HelmOperations({ kubeconfig, kubeContext });
    const result = await helm.show({
      chart,
      subcommand,
      version,
    });

    if (!result.success) {
      return error(result.error || 'Failed to show chart', 500);
    }

    return success({ output: result.output });
  } catch (err: any) {
    logger.error('Show failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/helm/template - Template a chart
 */
async function handleTemplate(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      name: string;
      chart: string;
      namespace?: string;
      values?: string;
      valuesFiles?: string[];
      set?: Record<string, string>;
      setString?: Record<string, string>;
      version?: string;
      kubeconfig?: string;
      kubeContext?: string;
    }>(ctx.req);

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    if (!body.chart) {
      return error('Missing required field: chart', 400);
    }

    const helm = new HelmOperations({
      kubeconfig: body.kubeconfig,
      kubeContext: body.kubeContext,
    });

    const result = await helm.template({
      name: body.name,
      chart: body.chart,
      namespace: body.namespace,
      values: body.values,
      valuesFiles: body.valuesFiles,
      set: body.set,
      setString: body.setString,
      version: body.version,
    });

    if (!result.success) {
      return error(result.error || 'Failed to template chart', 500);
    }

    return success({ manifests: result.output });
  } catch (err: any) {
    logger.error('Template failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/helm/version - Get Helm version
 */
async function handleVersion(ctx: RouteContext): Promise<Response> {
  try {
    const kubeconfig = ctx.url.searchParams.get('kubeconfig') || undefined;
    const kubeContext = ctx.url.searchParams.get('kubeContext') || undefined;

    const helm = new HelmOperations({ kubeconfig, kubeContext });
    const result = await helm.version();

    if (!result.success) {
      return error(result.error || 'Failed to get version', 500);
    }

    return success({ version: result.output });
  } catch (err: any) {
    logger.error('Version failed', err);
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
  if (path.startsWith('/api/helm')) {
    const route = path.replace('/api/helm', '');

    // POST routes
    if (method === 'POST') {
      switch (route) {
        case '/install':
          return handleInstall(ctx);
        case '/upgrade':
          return handleUpgrade(ctx);
        case '/uninstall':
          return handleUninstall(ctx);
        case '/rollback':
          return handleRollback(ctx);
        case '/repo':
          return handleRepo(ctx);
        case '/template':
          return handleTemplate(ctx);
      }
    }

    // GET routes
    if (method === 'GET') {
      switch (route) {
        case '/list':
          return handleList(ctx);
        case '/values':
          return handleGetValues(ctx);
        case '/history':
          return handleHistory(ctx);
        case '/status':
          return handleStatus(ctx);
        case '/search':
          return handleSearch(ctx);
        case '/show':
          return handleShow(ctx);
        case '/version':
          return handleVersion(ctx);
      }
    }
  }

  return new Response('Not Found', { status: 404 });
}
