/**
 * GitHub Tools Service Server
 *
 * HTTP server for GitHub API operations
 */

import { logger } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';
import {
  listPRsHandler,
  getPRHandler,
  createPRHandler,
  mergePRHandler,
  listIssuesHandler,
  getIssueHandler,
  createIssueHandler,
  closeIssueHandler,
  addCommentHandler,
  getRepoHandler,
  listBranchesHandler,
  createBranchHandler,
  deleteBranchHandler,
  getUserHandler,
  // Actions handlers
  listWorkflowsHandler,
  listWorkflowRunsHandler,
  getWorkflowRunHandler,
  triggerWorkflowHandler,
  cancelWorkflowRunHandler,
  rerunWorkflowHandler,
  // Release handlers
  listReleasesHandler,
  getLatestReleaseHandler,
  getReleaseByTagHandler,
  createReleaseHandler,
  deleteReleaseHandler,
  generateReleaseNotesHandler,
} from './routes/github';

/**
 * Parse number from URL path segment
 */
function parseNumber(segment: string): number | null {
  const num = parseInt(segment, 10);
  return isNaN(num) ? null : num;
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function startServer(port: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // Handle CORS preflight
      if (method === 'OPTIONS') {
        return addCorsHeaders(new Response(null, { status: 204 }));
      }

      let response: Response;

      // Health check endpoint
      if (path === '/health') {
        response = Response.json(healthHandler());
        return addCorsHeaders(response);
      }

      // ==========================================
      // Pull Request Routes
      // ==========================================

      // GET /api/github/prs - List PRs
      if (path === '/api/github/prs' && method === 'GET') {
        response = await listPRsHandler(req);
        return addCorsHeaders(response);
      }

      // POST /api/github/prs - Create PR
      if (path === '/api/github/prs' && method === 'POST') {
        response = await createPRHandler(req);
        return addCorsHeaders(response);
      }

      // GET /api/github/prs/:number - Get PR
      const getPRMatch = path.match(/^\/api\/github\/prs\/(\d+)$/);
      if (getPRMatch && method === 'GET') {
        const prNumber = parseNumber(getPRMatch[1]);
        if (prNumber) {
          response = await getPRHandler(req, prNumber);
          return addCorsHeaders(response);
        }
      }

      // POST /api/github/prs/:number/merge - Merge PR
      const mergePRMatch = path.match(/^\/api\/github\/prs\/(\d+)\/merge$/);
      if (mergePRMatch && method === 'POST') {
        const prNumber = parseNumber(mergePRMatch[1]);
        if (prNumber) {
          response = await mergePRHandler(req, prNumber);
          return addCorsHeaders(response);
        }
      }

      // ==========================================
      // Issue Routes
      // ==========================================

      // GET /api/github/issues - List issues
      if (path === '/api/github/issues' && method === 'GET') {
        response = await listIssuesHandler(req);
        return addCorsHeaders(response);
      }

      // POST /api/github/issues - Create issue
      if (path === '/api/github/issues' && method === 'POST') {
        response = await createIssueHandler(req);
        return addCorsHeaders(response);
      }

      // GET /api/github/issues/:number - Get issue
      const getIssueMatch = path.match(/^\/api\/github\/issues\/(\d+)$/);
      if (getIssueMatch && method === 'GET') {
        const issueNumber = parseNumber(getIssueMatch[1]);
        if (issueNumber) {
          response = await getIssueHandler(req, issueNumber);
          return addCorsHeaders(response);
        }
      }

      // PUT /api/github/issues/:number/close - Close issue
      const closeIssueMatch = path.match(/^\/api\/github\/issues\/(\d+)\/close$/);
      if (closeIssueMatch && method === 'PUT') {
        const issueNumber = parseNumber(closeIssueMatch[1]);
        if (issueNumber) {
          response = await closeIssueHandler(req, issueNumber);
          return addCorsHeaders(response);
        }
      }

      // POST /api/github/issues/:number/comments - Add comment
      const addCommentMatch = path.match(/^\/api\/github\/issues\/(\d+)\/comments$/);
      if (addCommentMatch && method === 'POST') {
        const issueNumber = parseNumber(addCommentMatch[1]);
        if (issueNumber) {
          response = await addCommentHandler(req, issueNumber);
          return addCorsHeaders(response);
        }
      }

      // ==========================================
      // Repository Routes
      // ==========================================

      // GET /api/github/repos - Get repository info
      if (path === '/api/github/repos' && method === 'GET') {
        response = await getRepoHandler(req);
        return addCorsHeaders(response);
      }

      // GET /api/github/repos/branches - List branches
      if (path === '/api/github/repos/branches' && method === 'GET') {
        response = await listBranchesHandler(req);
        return addCorsHeaders(response);
      }

      // POST /api/github/repos/branches - Create branch
      if (path === '/api/github/repos/branches' && method === 'POST') {
        response = await createBranchHandler(req);
        return addCorsHeaders(response);
      }

      // DELETE /api/github/repos/branches - Delete branch
      if (path === '/api/github/repos/branches' && method === 'DELETE') {
        response = await deleteBranchHandler(req);
        return addCorsHeaders(response);
      }

      // ==========================================
      // User Routes
      // ==========================================

      // GET /api/github/user - Get authenticated user
      if (path === '/api/github/user' && method === 'GET') {
        response = await getUserHandler(req);
        return addCorsHeaders(response);
      }

      // ==========================================
      // Actions Routes
      // ==========================================

      // GET /api/github/actions/workflows - List workflows
      if (path === '/api/github/actions/workflows' && method === 'GET') {
        response = await listWorkflowsHandler(req);
        return addCorsHeaders(response);
      }

      // GET /api/github/actions/runs - List workflow runs
      if (path === '/api/github/actions/runs' && method === 'GET') {
        response = await listWorkflowRunsHandler(req);
        return addCorsHeaders(response);
      }

      // GET /api/github/actions/runs/:runId - Get a workflow run
      const getRunMatch = path.match(/^\/api\/github\/actions\/runs\/(\d+)$/);
      if (getRunMatch && method === 'GET') {
        const runId = parseNumber(getRunMatch[1]);
        if (runId) {
          response = await getWorkflowRunHandler(req, runId);
          return addCorsHeaders(response);
        }
      }

      // POST /api/github/actions/trigger - Trigger a workflow
      if (path === '/api/github/actions/trigger' && method === 'POST') {
        response = await triggerWorkflowHandler(req);
        return addCorsHeaders(response);
      }

      // POST /api/github/actions/runs/:runId/cancel - Cancel a workflow run
      const cancelRunMatch = path.match(/^\/api\/github\/actions\/runs\/(\d+)\/cancel$/);
      if (cancelRunMatch && method === 'POST') {
        const runId = parseNumber(cancelRunMatch[1]);
        if (runId) {
          response = await cancelWorkflowRunHandler(req, runId);
          return addCorsHeaders(response);
        }
      }

      // POST /api/github/actions/runs/:runId/rerun - Re-run a workflow
      const rerunMatch = path.match(/^\/api\/github\/actions\/runs\/(\d+)\/rerun$/);
      if (rerunMatch && method === 'POST') {
        const runId = parseNumber(rerunMatch[1]);
        if (runId) {
          response = await rerunWorkflowHandler(req, runId);
          return addCorsHeaders(response);
        }
      }

      // ==========================================
      // Release Routes
      // ==========================================

      // GET /api/github/releases - List releases
      if (path === '/api/github/releases' && method === 'GET') {
        response = await listReleasesHandler(req);
        return addCorsHeaders(response);
      }

      // GET /api/github/releases/latest - Get latest release
      if (path === '/api/github/releases/latest' && method === 'GET') {
        response = await getLatestReleaseHandler(req);
        return addCorsHeaders(response);
      }

      // GET /api/github/releases/tag/:tag - Get release by tag
      const getReleaseByTagMatch = path.match(/^\/api\/github\/releases\/tag\/(.+)$/);
      if (getReleaseByTagMatch && method === 'GET') {
        const tag = decodeURIComponent(getReleaseByTagMatch[1]);
        response = await getReleaseByTagHandler(req, tag);
        return addCorsHeaders(response);
      }

      // POST /api/github/releases - Create a release
      if (path === '/api/github/releases' && method === 'POST') {
        response = await createReleaseHandler(req);
        return addCorsHeaders(response);
      }

      // DELETE /api/github/releases/:releaseId - Delete a release
      const deleteReleaseMatch = path.match(/^\/api\/github\/releases\/(\d+)$/);
      if (deleteReleaseMatch && method === 'DELETE') {
        const releaseId = parseNumber(deleteReleaseMatch[1]);
        if (releaseId) {
          response = await deleteReleaseHandler(req, releaseId);
          return addCorsHeaders(response);
        }
      }

      // POST /api/github/releases/notes - Generate release notes
      if (path === '/api/github/releases/notes' && method === 'POST') {
        response = await generateReleaseNotesHandler(req);
        return addCorsHeaders(response);
      }

      // 404
      response = new Response('Not Found', { status: 404 });
      return addCorsHeaders(response);
    },
  });

  logger.info(`GitHub Tools Service HTTP server listening on port ${port}`);
  logger.info('Available routes:');
  logger.info('  - GET  /health');
  logger.info('  - GET  /api/github/user');
  logger.info('  - GET  /api/github/prs');
  logger.info('  - POST /api/github/prs');
  logger.info('  - GET  /api/github/prs/:number');
  logger.info('  - POST /api/github/prs/:number/merge');
  logger.info('  - GET  /api/github/issues');
  logger.info('  - POST /api/github/issues');
  logger.info('  - GET  /api/github/issues/:number');
  logger.info('  - PUT  /api/github/issues/:number/close');
  logger.info('  - POST /api/github/issues/:number/comments');
  logger.info('  - GET  /api/github/repos');
  logger.info('  - GET  /api/github/repos/branches');
  logger.info('  - POST /api/github/repos/branches');
  logger.info('  - DELETE /api/github/repos/branches');
  logger.info('  - GET  /api/github/actions/workflows');
  logger.info('  - GET  /api/github/actions/runs');
  logger.info('  - GET  /api/github/actions/runs/:runId');
  logger.info('  - POST /api/github/actions/trigger');
  logger.info('  - POST /api/github/actions/runs/:runId/cancel');
  logger.info('  - POST /api/github/actions/runs/:runId/rerun');
  logger.info('  - GET  /api/github/releases');
  logger.info('  - GET  /api/github/releases/latest');
  logger.info('  - GET  /api/github/releases/tag/:tag');
  logger.info('  - POST /api/github/releases');
  logger.info('  - DELETE /api/github/releases/:releaseId');
  logger.info('  - POST /api/github/releases/notes');

  return server;
}
