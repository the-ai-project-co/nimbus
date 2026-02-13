import { TerraformOperations } from './terraform/operations';
import { logger } from '@nimbus/shared-utils';

interface RouteContext {
  req: Request;
  url: URL;
  path: string;
  method: string;
}

async function parseBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

function success(data: any, status: number = 200): Response {
  return Response.json({ success: true, data }, { status });
}

function error(message: string, status: number = 500): Response {
  return Response.json({ success: false, error: message }, { status });
}

export function healthHandler(): Response {
  return Response.json({
    status: 'healthy',
    service: 'terraform-tools-service',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

// POST /api/terraform/init
async function handleInit(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      backend?: boolean;
      upgrade?: boolean;
      reconfigure?: boolean;
      backendConfig?: Record<string, string>;
    }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.init({
      backend: body.backend,
      upgrade: body.upgrade,
      reconfigure: body.reconfigure,
      backendConfig: body.backendConfig,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Terraform init failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/plan
async function handlePlan(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      varFile?: string;
      out?: string;
      destroy?: boolean;
      target?: string[];
      var?: Record<string, string>;
      refresh?: boolean;
    }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.plan({
      varFile: body.varFile,
      out: body.out,
      destroy: body.destroy,
      target: body.target,
      var: body.var,
      refresh: body.refresh,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Terraform plan failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/apply
async function handleApply(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      autoApprove?: boolean;
      varFile?: string;
      planFile?: string;
      target?: string[];
      var?: Record<string, string>;
      parallelism?: number;
    }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.apply({
      autoApprove: body.autoApprove,
      varFile: body.varFile,
      planFile: body.planFile,
      target: body.target,
      var: body.var,
      parallelism: body.parallelism,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Terraform apply failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/destroy
async function handleDestroy(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      autoApprove?: boolean;
      varFile?: string;
      target?: string[];
      var?: Record<string, string>;
    }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.destroy({
      autoApprove: body.autoApprove,
      varFile: body.varFile,
      target: body.target,
      var: body.var,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Terraform destroy failed', err);
    return error(err.message);
  }
}

// GET /api/terraform/output
async function handleOutput(ctx: RouteContext): Promise<Response> {
  try {
    const directory = ctx.url.searchParams.get('directory');
    const name = ctx.url.searchParams.get('name') || undefined;
    const json = ctx.url.searchParams.get('json') !== 'false';

    if (!directory) {
      return error('Missing required query param: directory', 400);
    }

    const terraform = new TerraformOperations(directory);
    const result = await terraform.output({ name, json });

    return success({ output: result });
  } catch (err: any) {
    logger.error('Terraform output failed', err);
    return error(err.message);
  }
}

// GET /api/terraform/show
async function handleShow(ctx: RouteContext): Promise<Response> {
  try {
    const directory = ctx.url.searchParams.get('directory');
    const planFile = ctx.url.searchParams.get('planFile') || undefined;

    if (!directory) {
      return error('Missing required query param: directory', 400);
    }

    const terraform = new TerraformOperations(directory);
    const result = await terraform.show(planFile);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform show failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/validate
async function handleValidate(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ directory: string }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.validate();

    return success(result);
  } catch (err: any) {
    logger.error('Terraform validate failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/fmt
async function handleFmt(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      check?: boolean;
      recursive?: boolean;
      diff?: boolean;
    }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.fmt({
      check: body.check,
      recursive: body.recursive,
      diff: body.diff,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Terraform fmt failed', err);
    return error(err.message);
  }
}

// GET /api/terraform/workspace/list
async function handleWorkspaceList(ctx: RouteContext): Promise<Response> {
  try {
    const directory = ctx.url.searchParams.get('directory');

    if (!directory) {
      return error('Missing required query param: directory', 400);
    }

    const terraform = new TerraformOperations(directory);
    const result = await terraform.workspaceList();

    return success(result);
  } catch (err: any) {
    logger.error('Terraform workspace list failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/workspace/select
async function handleWorkspaceSelect(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ directory: string; name: string }>(ctx.req);

    if (!body.directory || !body.name) {
      return error('Missing required fields: directory, name', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.workspaceSelect(body.name);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform workspace select failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/workspace/new
async function handleWorkspaceNew(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ directory: string; name: string }>(ctx.req);

    if (!body.directory || !body.name) {
      return error('Missing required fields: directory, name', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.workspaceNew(body.name);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform workspace new failed', err);
    return error(err.message);
  }
}

// DELETE /api/terraform/workspace/delete
async function handleWorkspaceDelete(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ directory: string; name: string; force?: boolean }>(ctx.req);

    if (!body.directory || !body.name) {
      return error('Missing required fields: directory, name', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.workspaceDelete(body.name, body.force);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform workspace delete failed', err);
    return error(err.message);
  }
}

// GET /api/terraform/state/list
async function handleStateList(ctx: RouteContext): Promise<Response> {
  try {
    const directory = ctx.url.searchParams.get('directory');

    if (!directory) {
      return error('Missing required query param: directory', 400);
    }

    const terraform = new TerraformOperations(directory);
    const resources = await terraform.stateList();

    return success({ resources, count: resources.length });
  } catch (err: any) {
    logger.error('Terraform state list failed', err);
    return error(err.message);
  }
}

// GET /api/terraform/state/show
async function handleStateShow(ctx: RouteContext): Promise<Response> {
  try {
    const directory = ctx.url.searchParams.get('directory');
    const address = ctx.url.searchParams.get('address');

    if (!directory || !address) {
      return error('Missing required query params: directory, address', 400);
    }

    const terraform = new TerraformOperations(directory);
    const state = await terraform.stateShow(address);

    return success({ state });
  } catch (err: any) {
    logger.error('Terraform state show failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/import
async function handleImport(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      address: string;
      id: string;
      varFile?: string;
    }>(ctx.req);

    if (!body.directory || !body.address || !body.id) {
      return error('Missing required fields: directory, address, id', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.import(body.address, body.id, { varFile: body.varFile });

    return success(result);
  } catch (err: any) {
    logger.error('Terraform import failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/refresh
async function handleRefresh(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ directory: string; varFile?: string }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.refresh({ varFile: body.varFile });

    return success(result);
  } catch (err: any) {
    logger.error('Terraform refresh failed', err);
    return error(err.message);
  }
}

// GET /api/terraform/version
async function handleVersion(ctx: RouteContext): Promise<Response> {
  try {
    const terraform = new TerraformOperations();
    const result = await terraform.version();

    return success(result);
  } catch (err: any) {
    logger.error('Terraform version failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/state/mv - Move resource in state
async function handleStateMove(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      source: string;
      destination: string;
    }>(ctx.req);

    if (!body.directory || !body.source || !body.destination) {
      return error('Missing required fields: directory, source, destination', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.stateMove(body.source, body.destination);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform state mv failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/taint - Taint a resource
async function handleTaint(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      address: string;
    }>(ctx.req);

    if (!body.directory || !body.address) {
      return error('Missing required fields: directory, address', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.taint(body.address);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform taint failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/untaint - Untaint a resource
async function handleUntaint(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      address: string;
    }>(ctx.req);

    if (!body.directory || !body.address) {
      return error('Missing required fields: directory, address', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.untaint(body.address);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform untaint failed', err);
    return error(err.message);
  }
}

// GET /api/terraform/state/pull - Pull remote state
async function handleStatePull(ctx: RouteContext): Promise<Response> {
  try {
    const directory = ctx.url.searchParams.get('directory');

    if (!directory) {
      return error('Missing required query param: directory', 400);
    }

    const terraform = new TerraformOperations(directory);
    const result = await terraform.statePull();

    return success(result);
  } catch (err: any) {
    logger.error('Terraform state pull failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/state/push - Push local state
async function handleStatePush(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      stateFile?: string;
      force?: boolean;
    }>(ctx.req);

    if (!body.directory) {
      return error('Missing required field: directory', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.statePush(body.stateFile, body.force);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform state push failed', err);
    return error(err.message);
  }
}

// GET /api/terraform/graph - Get resource graph
async function handleGraph(ctx: RouteContext): Promise<Response> {
  try {
    const directory = ctx.url.searchParams.get('directory');
    const type = ctx.url.searchParams.get('type') as 'plan' | 'apply' | undefined;

    if (!directory) {
      return error('Missing required query param: directory', 400);
    }

    const terraform = new TerraformOperations(directory);
    const result = await terraform.graph(type || undefined);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform graph failed', err);
    return error(err.message);
  }
}

// POST /api/terraform/force-unlock - Force unlock state
async function handleForceUnlock(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      directory: string;
      lockId: string;
    }>(ctx.req);

    if (!body.directory || !body.lockId) {
      return error('Missing required fields: directory, lockId', 400);
    }

    const terraform = new TerraformOperations(body.directory);
    const result = await terraform.forceUnlock(body.lockId);

    return success(result);
  } catch (err: any) {
    logger.error('Terraform force-unlock failed', err);
    return error(err.message);
  }
}

export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  const ctx: RouteContext = { req, url, path, method };

  if (path === '/health') {
    return healthHandler();
  }

  if (path.startsWith('/api/terraform')) {
    const route = path.replace('/api/terraform', '');

    // POST routes
    if (method === 'POST') {
      switch (route) {
        case '/init':
          return handleInit(ctx);
        case '/plan':
          return handlePlan(ctx);
        case '/apply':
          return handleApply(ctx);
        case '/destroy':
          return handleDestroy(ctx);
        case '/validate':
          return handleValidate(ctx);
        case '/fmt':
          return handleFmt(ctx);
        case '/workspace/select':
          return handleWorkspaceSelect(ctx);
        case '/workspace/new':
          return handleWorkspaceNew(ctx);
        case '/import':
          return handleImport(ctx);
        case '/refresh':
          return handleRefresh(ctx);
        case '/state/mv':
          return handleStateMove(ctx);
        case '/state/push':
          return handleStatePush(ctx);
        case '/taint':
          return handleTaint(ctx);
        case '/untaint':
          return handleUntaint(ctx);
        case '/force-unlock':
          return handleForceUnlock(ctx);
      }
    }

    // GET routes
    if (method === 'GET') {
      switch (route) {
        case '/output':
          return handleOutput(ctx);
        case '/show':
          return handleShow(ctx);
        case '/workspace/list':
          return handleWorkspaceList(ctx);
        case '/state/list':
          return handleStateList(ctx);
        case '/state/show':
          return handleStateShow(ctx);
        case '/state/pull':
          return handleStatePull(ctx);
        case '/graph':
          return handleGraph(ctx);
        case '/version':
          return handleVersion(ctx);
      }
    }

    // DELETE routes
    if (method === 'DELETE') {
      switch (route) {
        case '/workspace/delete':
          return handleWorkspaceDelete(ctx);
      }
    }
  }

  return new Response('Not Found', { status: 404 });
}
