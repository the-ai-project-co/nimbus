import { GitOperations } from './git/operations';
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
    service: 'git-tools-service',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
}

/**
 * POST /api/git/clone - Clone a repository
 */
async function handleClone(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ url: string; path: string; branch?: string; depth?: number }>(ctx.req);

    if (!body.url || !body.path) {
      return error('Missing required fields: url, path', 400);
    }

    const git = new GitOperations();
    const result = await git.clone({
      url: body.url,
      path: body.path,
      branch: body.branch,
      depth: body.depth,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Clone failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/status - Get repository status
 */
async function handleStatus(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();
    const git = new GitOperations(repoPath);

    const status = await git.status();

    return success({
      current: status.current,
      tracking: status.tracking,
      isClean: status.isClean(),
      staged: status.staged,
      modified: status.modified,
      not_added: status.not_added,
      conflicted: status.conflicted,
      deleted: status.deleted,
      renamed: status.renamed,
      ahead: status.ahead,
      behind: status.behind,
    });
  } catch (err: any) {
    logger.error('Status failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/add - Stage files
 */
async function handleAdd(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; files?: string | string[] }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.add(body.files || '.');

    return success(result);
  } catch (err: any) {
    logger.error('Add failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/commit - Commit staged changes
 */
async function handleCommit(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; message: string; amend?: boolean; allowEmpty?: boolean }>(ctx.req);

    if (!body.message) {
      return error('Missing required field: message', 400);
    }

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.commit({
      message: body.message,
      amend: body.amend,
      allowEmpty: body.allowEmpty,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Commit failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/push - Push to remote
 */
async function handlePush(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; remote?: string; branch?: string; force?: boolean; setUpstream?: boolean }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.push({
      remote: body.remote,
      branch: body.branch,
      force: body.force,
      setUpstream: body.setUpstream,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Push failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/pull - Pull from remote
 */
async function handlePull(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; remote?: string; branch?: string; rebase?: boolean }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.pull({
      remote: body.remote,
      branch: body.branch,
      rebase: body.rebase,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Pull failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/branch - Create a new branch
 */
async function handleCreateBranch(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; name: string; checkout?: boolean; startPoint?: string }>(ctx.req);

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.createBranch({
      name: body.name,
      checkout: body.checkout,
      startPoint: body.startPoint,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Branch creation failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/branches - List branches
 */
async function handleListBranches(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();
    const showRemote = ctx.url.searchParams.get('remote') === 'true';

    const git = new GitOperations(repoPath);
    const result = await git.listBranches(showRemote);

    return success(result);
  } catch (err: any) {
    logger.error('List branches failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/checkout - Checkout branch or commit
 */
async function handleCheckout(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; target: string; create?: boolean }>(ctx.req);

    if (!body.target) {
      return error('Missing required field: target', 400);
    }

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.checkout(body.target, body.create);

    return success(result);
  } catch (err: any) {
    logger.error('Checkout failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/diff - Get diff
 */
async function handleDiff(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();
    const cached = ctx.url.searchParams.get('cached') === 'true';
    const nameOnly = ctx.url.searchParams.get('nameOnly') === 'true';
    const from = ctx.url.searchParams.get('from') || undefined;
    const to = ctx.url.searchParams.get('to') || undefined;

    const git = new GitOperations(repoPath);
    const result = await git.diff({ cached, nameOnly, from, to });

    return success(result);
  } catch (err: any) {
    logger.error('Diff failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/log - Get commit log
 */
async function handleLog(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();
    const maxCount = parseInt(ctx.url.searchParams.get('maxCount') || '10');
    const from = ctx.url.searchParams.get('from') || undefined;
    const to = ctx.url.searchParams.get('to') || undefined;
    const file = ctx.url.searchParams.get('file') || undefined;

    const git = new GitOperations(repoPath);
    const result = await git.log({ maxCount, from, to, file });

    return success({
      total: result.total,
      latest: result.latest,
      all: result.all.map(commit => ({
        hash: commit.hash,
        date: commit.date,
        message: commit.message,
        author_name: commit.author_name,
        author_email: commit.author_email,
      })),
    });
  } catch (err: any) {
    logger.error('Log failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/merge - Merge a branch
 */
async function handleMerge(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; branch: string; noFf?: boolean; squash?: boolean; message?: string }>(ctx.req);

    if (!body.branch) {
      return error('Missing required field: branch', 400);
    }

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.merge({
      branch: body.branch,
      noFf: body.noFf,
      squash: body.squash,
      message: body.message,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Merge failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/stash - Stash operations
 */
async function handleStash(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; command: 'push' | 'pop' | 'list' | 'drop' | 'apply' | 'clear'; message?: string; index?: number }>(ctx.req);

    if (!body.command) {
      return error('Missing required field: command', 400);
    }

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.stash({
      command: body.command,
      message: body.message,
      index: body.index,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Stash failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/fetch - Fetch from remote
 */
async function handleFetch(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; remote?: string; prune?: boolean }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.fetch(body.remote, body.prune);

    return success(result);
  } catch (err: any) {
    logger.error('Fetch failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/reset - Reset to commit
 */
async function handleReset(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; target: string; mode?: 'soft' | 'mixed' | 'hard' }>(ctx.req);

    if (!body.target) {
      return error('Missing required field: target', 400);
    }

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.reset(body.target, body.mode);

    return success(result);
  } catch (err: any) {
    logger.error('Reset failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/init - Initialize repository
 */
async function handleInit(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string; bare?: boolean }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.init(body.bare);

    return success(result);
  } catch (err: any) {
    logger.error('Init failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/remote - Get remote URL
 */
async function handleGetRemote(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();
    const remote = ctx.url.searchParams.get('name') || 'origin';

    const git = new GitOperations(repoPath);
    const url = await git.getRemoteUrl(remote);

    return success({ remote, url });
  } catch (err: any) {
    logger.error('Get remote failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/current-branch - Get current branch
 */
async function handleCurrentBranch(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();

    const git = new GitOperations(repoPath);
    const branch = await git.currentBranch();

    return success({ branch });
  } catch (err: any) {
    logger.error('Get current branch failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/is-clean - Check if repository is clean
 */
async function handleIsClean(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();

    const git = new GitOperations(repoPath);
    const isClean = await git.isClean();

    return success({ isClean });
  } catch (err: any) {
    logger.error('Is clean check failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/cherry-pick - Cherry-pick a commit
 */
async function handleCherryPick(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      path?: string;
      commit: string;
      noCommit?: boolean;
      edit?: boolean;
      signoff?: boolean;
      strategy?: string;
    }>(ctx.req);

    if (!body.commit) {
      return error('Missing required field: commit', 400);
    }

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.cherryPick(body.commit, {
      noCommit: body.noCommit,
      edit: body.edit,
      signoff: body.signoff,
      strategy: body.strategy,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Cherry-pick failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/cherry-pick/abort - Abort cherry-pick
 */
async function handleCherryPickAbort(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.cherryPickAbort();

    return success(result);
  } catch (err: any) {
    logger.error('Cherry-pick abort failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/cherry-pick/continue - Continue cherry-pick
 */
async function handleCherryPickContinue(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.cherryPickContinue();

    return success(result);
  } catch (err: any) {
    logger.error('Cherry-pick continue failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/rebase - Rebase onto target
 */
async function handleRebase(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      path?: string;
      target: string;
      onto?: string;
      preserveMerges?: boolean;
      strategy?: string;
      strategyOption?: string;
    }>(ctx.req);

    if (!body.target) {
      return error('Missing required field: target', 400);
    }

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.rebase(body.target, {
      onto: body.onto,
      preserveMerges: body.preserveMerges,
      strategy: body.strategy,
      strategyOption: body.strategyOption,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Rebase failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/rebase/abort - Abort rebase
 */
async function handleRebaseAbort(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.rebaseAbort();

    return success(result);
  } catch (err: any) {
    logger.error('Rebase abort failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/rebase/continue - Continue rebase
 */
async function handleRebaseContinue(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.rebaseContinue();

    return success(result);
  } catch (err: any) {
    logger.error('Rebase continue failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/rebase/skip - Skip commit during rebase
 */
async function handleRebaseSkip(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{ path?: string }>(ctx.req);
    const repoPath = body.path || process.cwd();

    const git = new GitOperations(repoPath);
    const result = await git.rebaseSkip();

    return success(result);
  } catch (err: any) {
    logger.error('Rebase skip failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/tag - Create a tag
 */
async function handleCreateTag(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      path?: string;
      name: string;
      message?: string;
      annotated?: boolean;
      force?: boolean;
      commit?: string;
    }>(ctx.req);

    if (!body.name) {
      return error('Missing required field: name', 400);
    }

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.tag(body.name, {
      message: body.message,
      annotated: body.annotated,
      force: body.force,
      commit: body.commit,
    });

    return success(result);
  } catch (err: any) {
    logger.error('Create tag failed', err);
    return error(err.message);
  }
}

/**
 * DELETE /api/git/tag - Delete a tag
 */
async function handleDeleteTag(ctx: RouteContext): Promise<Response> {
  try {
    const name = ctx.url.searchParams.get('name');
    const remote = ctx.url.searchParams.get('remote') || undefined;
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();

    if (!name) {
      return error('Missing required query parameter: name', 400);
    }

    const git = new GitOperations(repoPath);
    const result = await git.deleteTag(name, remote);

    return success(result);
  } catch (err: any) {
    logger.error('Delete tag failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/tags - List tags
 */
async function handleListTags(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();
    const pattern = ctx.url.searchParams.get('pattern') || undefined;

    const git = new GitOperations(repoPath);
    const tags = await git.listTags(pattern);

    return success({ tags });
  } catch (err: any) {
    logger.error('List tags failed', err);
    return error(err.message);
  }
}

/**
 * POST /api/git/tag/push - Push tags to remote
 */
async function handlePushTags(ctx: RouteContext): Promise<Response> {
  try {
    const body = await parseBody<{
      path?: string;
      remote?: string;
      tagName?: string;
    }>(ctx.req);

    const repoPath = body.path || process.cwd();
    const git = new GitOperations(repoPath);
    const result = await git.pushTags(body.remote, body.tagName);

    return success(result);
  } catch (err: any) {
    logger.error('Push tags failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/tag/show - Show tag information
 */
async function handleShowTag(ctx: RouteContext): Promise<Response> {
  try {
    const name = ctx.url.searchParams.get('name');
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();

    if (!name) {
      return error('Missing required query parameter: name', 400);
    }

    const git = new GitOperations(repoPath);
    const result = await git.showTag(name);

    return success(result);
  } catch (err: any) {
    logger.error('Show tag failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/conflicts - Get conflicted files
 */
async function handleGetConflicts(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();

    const git = new GitOperations(repoPath);
    const conflicts = await git.getConflicts();
    const hasConflicts = conflicts.length > 0;

    return success({ hasConflicts, conflicts });
  } catch (err: any) {
    logger.error('Get conflicts failed', err);
    return error(err.message);
  }
}

/**
 * GET /api/git/blame - Get blame information for a file
 */
async function handleBlame(ctx: RouteContext): Promise<Response> {
  try {
    const repoPath = ctx.url.searchParams.get('path') || process.cwd();
    const file = ctx.url.searchParams.get('file');
    const startLineParam = ctx.url.searchParams.get('startLine');
    const endLineParam = ctx.url.searchParams.get('endLine');

    if (!file) {
      return error('Missing required query parameter: file', 400);
    }

    const options: { startLine?: number; endLine?: number } = {};
    if (startLineParam) {
      options.startLine = parseInt(startLineParam, 10);
    }
    if (endLineParam) {
      options.endLine = parseInt(endLineParam, 10);
    }

    const git = new GitOperations(repoPath);
    const blameOutput = await git.blame(file, options);

    // Parse the raw blame output into structured lines
    const blameLines = blameOutput
      .split('\n')
      .filter(line => line.trim() !== '');

    return success({ blame: blameLines });
  } catch (err: any) {
    logger.error('Blame failed', err);
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
  if (path.startsWith('/api/git')) {
    const route = path.replace('/api/git', '');

    // POST routes
    if (method === 'POST') {
      switch (route) {
        case '/clone':
          return handleClone(ctx);
        case '/add':
          return handleAdd(ctx);
        case '/commit':
          return handleCommit(ctx);
        case '/push':
          return handlePush(ctx);
        case '/pull':
          return handlePull(ctx);
        case '/branch':
          return handleCreateBranch(ctx);
        case '/checkout':
          return handleCheckout(ctx);
        case '/merge':
          return handleMerge(ctx);
        case '/stash':
          return handleStash(ctx);
        case '/fetch':
          return handleFetch(ctx);
        case '/reset':
          return handleReset(ctx);
        case '/init':
          return handleInit(ctx);
        case '/cherry-pick':
          return handleCherryPick(ctx);
        case '/cherry-pick/abort':
          return handleCherryPickAbort(ctx);
        case '/cherry-pick/continue':
          return handleCherryPickContinue(ctx);
        case '/rebase':
          return handleRebase(ctx);
        case '/rebase/abort':
          return handleRebaseAbort(ctx);
        case '/rebase/continue':
          return handleRebaseContinue(ctx);
        case '/rebase/skip':
          return handleRebaseSkip(ctx);
        case '/tag':
          return handleCreateTag(ctx);
        case '/tag/push':
          return handlePushTags(ctx);
      }
    }

    // GET routes
    if (method === 'GET') {
      switch (route) {
        case '/status':
          return handleStatus(ctx);
        case '/branches':
          return handleListBranches(ctx);
        case '/diff':
          return handleDiff(ctx);
        case '/log':
          return handleLog(ctx);
        case '/remote':
          return handleGetRemote(ctx);
        case '/current-branch':
          return handleCurrentBranch(ctx);
        case '/is-clean':
          return handleIsClean(ctx);
        case '/tags':
          return handleListTags(ctx);
        case '/tag/show':
          return handleShowTag(ctx);
        case '/conflicts':
          return handleGetConflicts(ctx);
        case '/blame':
          return handleBlame(ctx);
      }
    }

    // DELETE routes
    if (method === 'DELETE') {
      switch (route) {
        case '/tag':
          return handleDeleteTag(ctx);
      }
    }
  }

  return new Response('Not Found', { status: 404 });
}
