/**
 * GitHub API Routes
 *
 * HTTP handlers for GitHub operations
 */

import { GitHubOperations } from '../github';
import { logger } from '@nimbus/shared-utils';
import type { CreatePRParams, CreateIssueParams, MergeParams } from '../github';

/**
 * Helper to get token from request
 */
function getToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  // Support both "Bearer <token>" and "token <token>" formats
  const match = authHeader.match(/^(?:Bearer|token)\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Helper to parse JSON body safely
 */
async function parseBody<T>(req: Request): Promise<T | null> {
  try {
    return await req.json() as T;
  } catch {
    return null;
  }
}

/**
 * Create success response
 */
function success(data: any, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

/**
 * Create error response
 */
function error(message: string, status = 500): Response {
  return Response.json({ success: false, error: message }, { status });
}

// ==========================================
// Pull Request Routes
// ==========================================

/**
 * GET /api/github/prs - List pull requests
 */
export async function listPRsHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');
  const state = (url.searchParams.get('state') || 'open') as 'open' | 'closed' | 'all';
  const perPage = parseInt(url.searchParams.get('per_page') || '30', 10);

  if (!owner || !repo) {
    return error('owner and repo query parameters required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const prs = await github.listPRs(owner, repo, state, perPage);
    return success(prs);
  } catch (err: any) {
    logger.error('Failed to list PRs', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * GET /api/github/prs/:number - Get a pull request
 */
export async function getPRHandler(req: Request, prNumber: number): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');

  if (!owner || !repo) {
    return error('owner and repo query parameters required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const pr = await github.getPR(owner, repo, prNumber);
    return success(pr);
  } catch (err: any) {
    logger.error('Failed to get PR', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/prs - Create a pull request
 */
export async function createPRHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
  } & CreatePRParams>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo, ...params } = body;

  if (!owner || !repo || !params.title || !params.head || !params.base) {
    return error('owner, repo, title, head, and base are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const pr = await github.createPR(owner, repo, params);
    return success(pr, 201);
  } catch (err: any) {
    logger.error('Failed to create PR', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/prs/:number/merge - Merge a pull request
 */
export async function mergePRHandler(req: Request, prNumber: number): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
  } & MergeParams>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo, ...params } = body;

  if (!owner || !repo) {
    return error('owner and repo are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const result = await github.mergePR(owner, repo, prNumber, params);
    return success(result);
  } catch (err: any) {
    logger.error('Failed to merge PR', err);
    return error(err.message, err.status || 500);
  }
}

// ==========================================
// Issue Routes
// ==========================================

/**
 * GET /api/github/issues - List issues
 */
export async function listIssuesHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');
  const state = (url.searchParams.get('state') || 'open') as 'open' | 'closed' | 'all';
  const perPage = parseInt(url.searchParams.get('per_page') || '30', 10);

  if (!owner || !repo) {
    return error('owner and repo query parameters required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const issues = await github.listIssues(owner, repo, state, perPage);
    return success(issues);
  } catch (err: any) {
    logger.error('Failed to list issues', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * GET /api/github/issues/:number - Get an issue
 */
export async function getIssueHandler(req: Request, issueNumber: number): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');

  if (!owner || !repo) {
    return error('owner and repo query parameters required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const issue = await github.getIssue(owner, repo, issueNumber);
    return success(issue);
  } catch (err: any) {
    logger.error('Failed to get issue', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/issues - Create an issue
 */
export async function createIssueHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
  } & CreateIssueParams>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo, ...params } = body;

  if (!owner || !repo || !params.title) {
    return error('owner, repo, and title are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const issue = await github.createIssue(owner, repo, params);
    return success(issue, 201);
  } catch (err: any) {
    logger.error('Failed to create issue', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * PUT /api/github/issues/:number/close - Close an issue
 */
export async function closeIssueHandler(req: Request, issueNumber: number): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');

  if (!owner || !repo) {
    return error('owner and repo query parameters required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const issue = await github.closeIssue(owner, repo, issueNumber);
    return success(issue);
  } catch (err: any) {
    logger.error('Failed to close issue', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/issues/:number/comments - Add a comment
 */
export async function addCommentHandler(req: Request, issueNumber: number): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
    body: string;
  }>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo, body: commentBody } = body;

  if (!owner || !repo || !commentBody) {
    return error('owner, repo, and body are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const comment = await github.addComment(owner, repo, issueNumber, commentBody);
    return success(comment, 201);
  } catch (err: any) {
    logger.error('Failed to add comment', err);
    return error(err.message, err.status || 500);
  }
}

// ==========================================
// Repository Routes
// ==========================================

/**
 * GET /api/github/repos - Get repository info
 */
export async function getRepoHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');

  if (!owner || !repo) {
    return error('owner and repo query parameters required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const repository = await github.getRepo(owner, repo);
    return success(repository);
  } catch (err: any) {
    logger.error('Failed to get repo', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * GET /api/github/repos/branches - List branches
 */
export async function listBranchesHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');
  const perPage = parseInt(url.searchParams.get('per_page') || '30', 10);

  if (!owner || !repo) {
    return error('owner and repo query parameters required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const branches = await github.listBranches(owner, repo, perPage);
    return success(branches);
  } catch (err: any) {
    logger.error('Failed to list branches', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/repos/branches - Create a branch
 */
export async function createBranchHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
    branch: string;
    sha: string;
  }>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo, branch, sha } = body;

  if (!owner || !repo || !branch || !sha) {
    return error('owner, repo, branch, and sha are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const result = await github.createBranch(owner, repo, branch, sha);
    return success(result, 201);
  } catch (err: any) {
    logger.error('Failed to create branch', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * DELETE /api/github/repos/branches - Delete a branch
 */
export async function deleteBranchHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');
  const branch = url.searchParams.get('branch');

  if (!owner || !repo || !branch) {
    return error('owner, repo, and branch query parameters required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    await github.deleteBranch(owner, repo, branch);
    return success({ message: `Branch ${branch} deleted` });
  } catch (err: any) {
    logger.error('Failed to delete branch', err);
    return error(err.message, err.status || 500);
  }
}

// ==========================================
// Auth Routes
// ==========================================

/**
 * GET /api/github/user - Validate token and get user info
 */
export async function getUserHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  try {
    const github = new GitHubOperations(token);
    const user = await github.validateToken();
    return success(user);
  } catch (err: any) {
    logger.error('Failed to get user', err);
    return error(err.message, err.status || 500);
  }
}
