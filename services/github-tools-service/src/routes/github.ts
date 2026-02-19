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

/**
 * POST /api/github/prs/:number/reviews - Create a review on a pull request
 */
export async function createPRReviewHandler(req: Request, prNumber: number): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
    body?: string;
  }>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo, event: reviewEvent, body: reviewBody } = body;

  if (!owner || !repo) {
    return error('owner and repo are required', 400);
  }

  const validEvents = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'];
  if (!reviewEvent || !validEvents.includes(reviewEvent)) {
    return error(`event is required and must be one of: ${validEvents.join(', ')}`, 400);
  }

  try {
    const github = new GitHubOperations(token);
    const review = await github.createPRReview(owner, repo, prNumber, reviewEvent, reviewBody);
    return success(review, 201);
  } catch (err: any) {
    logger.error('Failed to create PR review', err);
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

// ==========================================
// Actions Routes
// ==========================================

/**
 * GET /api/github/actions/workflows - List workflows
 */
export async function listWorkflowsHandler(req: Request): Promise<Response> {
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
    const workflows = await github.listWorkflows(owner, repo, perPage);
    return success(workflows);
  } catch (err: any) {
    logger.error('Failed to list workflows', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * GET /api/github/actions/runs - List workflow runs
 */
export async function listWorkflowRunsHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const url = new URL(req.url);
  const owner = url.searchParams.get('owner');
  const repo = url.searchParams.get('repo');
  const workflowId = url.searchParams.get('workflow_id') || undefined;
  const branch = url.searchParams.get('branch') || undefined;
  const event = url.searchParams.get('event') || undefined;
  const status = url.searchParams.get('status') as any || undefined;
  const perPage = parseInt(url.searchParams.get('per_page') || '30', 10);

  if (!owner || !repo) {
    return error('owner and repo query parameters required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const runs = await github.listWorkflowRuns(owner, repo, {
      workflowId,
      branch,
      event,
      status,
      perPage,
    });
    return success(runs);
  } catch (err: any) {
    logger.error('Failed to list workflow runs', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * GET /api/github/actions/runs/:runId - Get a workflow run
 */
export async function getWorkflowRunHandler(req: Request, runId: number): Promise<Response> {
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
    const run = await github.getWorkflowRun(owner, repo, runId);
    return success(run);
  } catch (err: any) {
    logger.error('Failed to get workflow run', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/actions/trigger - Trigger a workflow
 */
export async function triggerWorkflowHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
    workflow_id: string | number;
    ref: string;
    inputs?: Record<string, string>;
  }>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo, workflow_id, ref, inputs } = body;

  if (!owner || !repo || !workflow_id || !ref) {
    return error('owner, repo, workflow_id, and ref are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    await github.triggerWorkflow(owner, repo, workflow_id, ref, inputs);
    return success({ message: 'Workflow triggered successfully' }, 202);
  } catch (err: any) {
    logger.error('Failed to trigger workflow', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/actions/runs/:runId/cancel - Cancel a workflow run
 */
export async function cancelWorkflowRunHandler(req: Request, runId: number): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
  }>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo } = body;

  if (!owner || !repo) {
    return error('owner and repo are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    await github.cancelWorkflowRun(owner, repo, runId);
    return success({ message: 'Workflow run cancelled' });
  } catch (err: any) {
    logger.error('Failed to cancel workflow run', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/actions/runs/:runId/rerun - Re-run a workflow
 */
export async function rerunWorkflowHandler(req: Request, runId: number): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
  }>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo } = body;

  if (!owner || !repo) {
    return error('owner and repo are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    await github.rerunWorkflow(owner, repo, runId);
    return success({ message: 'Workflow re-run triggered' });
  } catch (err: any) {
    logger.error('Failed to re-run workflow', err);
    return error(err.message, err.status || 500);
  }
}

// ==========================================
// Release Routes
// ==========================================

/**
 * GET /api/github/releases - List releases
 */
export async function listReleasesHandler(req: Request): Promise<Response> {
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
    const releases = await github.listReleases(owner, repo, perPage);
    return success(releases);
  } catch (err: any) {
    logger.error('Failed to list releases', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * GET /api/github/releases/latest - Get latest release
 */
export async function getLatestReleaseHandler(req: Request): Promise<Response> {
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
    const release = await github.getLatestRelease(owner, repo);
    return success(release);
  } catch (err: any) {
    logger.error('Failed to get latest release', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * GET /api/github/releases/tag/:tag - Get release by tag
 */
export async function getReleaseByTagHandler(req: Request, tag: string): Promise<Response> {
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
    const release = await github.getReleaseByTag(owner, repo, tag);
    return success(release);
  } catch (err: any) {
    logger.error('Failed to get release by tag', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/releases - Create a release
 */
export async function createReleaseHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
    tag_name: string;
    target_commitish?: string;
    name?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    generate_release_notes?: boolean;
  }>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo, tag_name, ...options } = body;

  if (!owner || !repo || !tag_name) {
    return error('owner, repo, and tag_name are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const release = await github.createRelease(owner, repo, {
      tagName: tag_name,
      targetCommitish: options.target_commitish,
      name: options.name,
      body: options.body,
      draft: options.draft,
      prerelease: options.prerelease,
      generateReleaseNotes: options.generate_release_notes,
    });
    return success(release, 201);
  } catch (err: any) {
    logger.error('Failed to create release', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * DELETE /api/github/releases/:releaseId - Delete a release
 */
export async function deleteReleaseHandler(req: Request, releaseId: number): Promise<Response> {
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
    await github.deleteRelease(owner, repo, releaseId);
    return success({ message: 'Release deleted' });
  } catch (err: any) {
    logger.error('Failed to delete release', err);
    return error(err.message, err.status || 500);
  }
}

/**
 * POST /api/github/releases/notes - Generate release notes
 */
export async function generateReleaseNotesHandler(req: Request): Promise<Response> {
  const token = getToken(req);
  if (!token) {
    return error('Authorization header required', 401);
  }

  const body = await parseBody<{
    owner: string;
    repo: string;
    tag_name: string;
    previous_tag_name?: string;
    target_commitish?: string;
  }>(req);

  if (!body) {
    return error('Invalid JSON body', 400);
  }

  const { owner, repo, tag_name, previous_tag_name, target_commitish } = body;

  if (!owner || !repo || !tag_name) {
    return error('owner, repo, and tag_name are required', 400);
  }

  try {
    const github = new GitHubOperations(token);
    const notes = await github.generateReleaseNotes(owner, repo, tag_name, {
      previousTagName: previous_tag_name,
      targetCommitish: target_commitish,
    });
    return success(notes);
  } catch (err: any) {
    logger.error('Failed to generate release notes', err);
    return error(err.message, err.status || 500);
  }
}
