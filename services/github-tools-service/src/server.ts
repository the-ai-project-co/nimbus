/**
 * GitHub Tools Service Server
 *
 * HTTP server for GitHub API operations
 */

import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';
import {
  listPRsHandler,
  getPRHandler,
  createPRHandler,
  mergePRHandler,
  createPRReviewHandler,
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

const SWAGGER_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Nimbus GitHub Tools Service API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui' });</script>
</body>
</html>`;

const OPENAPI_SPEC = {
  openapi: '3.0.3',
  info: {
    title: 'Nimbus GitHub Tools Service API',
    version: '0.1.0',
    description: 'GitHub operations service for Nimbus. Provides HTTP endpoints for managing GitHub pull requests, issues, repositories, branches, GitHub Actions workflows, and releases via the GitHub API.',
  },
  servers: [{ url: 'http://localhost:3011', description: 'Local development' }],
  components: {
    securitySchemes: {
      BearerAuth: { type: 'http', scheme: 'bearer', description: 'GitHub personal access token' },
    },
    schemas: {
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
        },
      },
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'healthy' },
          service: { type: 'string', example: 'github-tools-service' },
          version: { type: 'string', example: '0.1.0' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      OwnerRepoParams: {
        type: 'object',
        properties: {
          owner: { type: 'string', description: 'Repository owner' },
          repo: { type: 'string', description: 'Repository name' },
        },
      },
      CreatePRRequest: {
        type: 'object',
        required: ['owner', 'repo', 'title', 'head', 'base'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          title: { type: 'string', description: 'PR title' },
          head: { type: 'string', description: 'Source branch' },
          base: { type: 'string', description: 'Target branch' },
          body: { type: 'string', description: 'PR description' },
          draft: { type: 'boolean', description: 'Create as draft' },
        },
      },
      MergePRRequest: {
        type: 'object',
        required: ['owner', 'repo'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          commit_title: { type: 'string', description: 'Merge commit title' },
          commit_message: { type: 'string', description: 'Merge commit message' },
          merge_method: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Merge strategy' },
        },
      },
      CreatePRReviewRequest: {
        type: 'object',
        required: ['owner', 'repo', 'event'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          event: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'], description: 'Review event type' },
          body: { type: 'string', description: 'Review comment' },
        },
      },
      CreateIssueRequest: {
        type: 'object',
        required: ['owner', 'repo', 'title'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body' },
          labels: { type: 'array', items: { type: 'string' }, description: 'Labels to add' },
          assignees: { type: 'array', items: { type: 'string' }, description: 'Assignees' },
          milestone: { type: 'integer', description: 'Milestone number' },
        },
      },
      AddCommentRequest: {
        type: 'object',
        required: ['owner', 'repo', 'body'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          body: { type: 'string', description: 'Comment text' },
        },
      },
      CreateBranchRequest: {
        type: 'object',
        required: ['owner', 'repo', 'branch', 'sha'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          branch: { type: 'string', description: 'New branch name' },
          sha: { type: 'string', description: 'Commit SHA to branch from' },
        },
      },
      TriggerWorkflowRequest: {
        type: 'object',
        required: ['owner', 'repo', 'workflow_id', 'ref'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          workflow_id: { oneOf: [{ type: 'string' }, { type: 'integer' }], description: 'Workflow ID or filename' },
          ref: { type: 'string', description: 'Branch or tag reference' },
          inputs: { type: 'object', additionalProperties: { type: 'string' }, description: 'Workflow input parameters' },
        },
      },
      CreateReleaseRequest: {
        type: 'object',
        required: ['owner', 'repo', 'tag_name'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          tag_name: { type: 'string', description: 'Tag for the release' },
          target_commitish: { type: 'string', description: 'Target commit or branch' },
          name: { type: 'string', description: 'Release name' },
          body: { type: 'string', description: 'Release notes' },
          draft: { type: 'boolean' },
          prerelease: { type: 'boolean' },
          generate_release_notes: { type: 'boolean', description: 'Auto-generate notes' },
        },
      },
      GenerateNotesRequest: {
        type: 'object',
        required: ['owner', 'repo', 'tag_name'],
        properties: {
          owner: { type: 'string' },
          repo: { type: 'string' },
          tag_name: { type: 'string', description: 'Tag name for the release' },
          previous_tag_name: { type: 'string', description: 'Previous tag for comparison' },
          target_commitish: { type: 'string' },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'], summary: 'Health check', operationId: 'healthCheck', security: [],
        responses: { '200': { description: 'Healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } } },
      },
    },
    '/api/github/user': {
      get: {
        tags: ['User'], summary: 'Get authenticated user', description: 'Validate the GitHub token and return user info.',
        operationId: 'getUser',
        responses: {
          '200': { description: 'User info', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Missing auth token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/prs': {
      get: {
        tags: ['Pull Requests'], summary: 'List PRs', operationId: 'listPRs',
        parameters: [
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'state', in: 'query', schema: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' } },
          { name: 'per_page', in: 'query', schema: { type: 'integer', default: 30 } },
        ],
        responses: {
          '200': { description: 'PR list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing owner/repo', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      post: {
        tags: ['Pull Requests'], summary: 'Create PR', operationId: 'createPR',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePRRequest' } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/prs/{number}': {
      get: {
        tags: ['Pull Requests'], summary: 'Get PR', operationId: 'getPR',
        parameters: [
          { name: 'number', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'PR details', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/prs/{number}/merge': {
      post: {
        tags: ['Pull Requests'], summary: 'Merge PR', operationId: 'mergePR',
        parameters: [{ name: 'number', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/MergePRRequest' } } } },
        responses: {
          '200': { description: 'Merged', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/prs/{number}/reviews': {
      post: {
        tags: ['Pull Requests'], summary: 'Create PR review', operationId: 'createPRReview',
        parameters: [{ name: 'number', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatePRReviewRequest' } } } },
        responses: {
          '201': { description: 'Review created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Invalid event type', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/issues': {
      get: {
        tags: ['Issues'], summary: 'List issues', operationId: 'listIssues',
        parameters: [
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'state', in: 'query', schema: { type: 'string', enum: ['open', 'closed', 'all'], default: 'open' } },
          { name: 'per_page', in: 'query', schema: { type: 'integer', default: 30 } },
        ],
        responses: {
          '200': { description: 'Issue list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing owner/repo', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      post: {
        tags: ['Issues'], summary: 'Create issue', operationId: 'createIssue',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateIssueRequest' } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/issues/{number}': {
      get: {
        tags: ['Issues'], summary: 'Get issue', operationId: 'getIssue',
        parameters: [
          { name: 'number', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Issue details', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/issues/{number}/close': {
      put: {
        tags: ['Issues'], summary: 'Close issue', operationId: 'closeIssue',
        parameters: [
          { name: 'number', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Closed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/issues/{number}/comments': {
      post: {
        tags: ['Issues'], summary: 'Add comment to issue', operationId: 'addComment',
        parameters: [{ name: 'number', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AddCommentRequest' } } } },
        responses: {
          '201': { description: 'Comment added', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing body', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/repos': {
      get: {
        tags: ['Repository'], summary: 'Get repo info', operationId: 'getRepo',
        parameters: [
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Repo info', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/repos/branches': {
      get: {
        tags: ['Repository'], summary: 'List branches', operationId: 'listBranches',
        parameters: [
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'per_page', in: 'query', schema: { type: 'integer', default: 30 } },
        ],
        responses: {
          '200': { description: 'Branch list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      post: {
        tags: ['Repository'], summary: 'Create branch', operationId: 'createBranch',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateBranchRequest' } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Repository'], summary: 'Delete branch', operationId: 'deleteBranch',
        parameters: [
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'branch', in: 'query', required: true, schema: { type: 'string' }, description: 'Branch name to delete' },
        ],
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing parameters', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/actions/workflows': {
      get: {
        tags: ['Actions'], summary: 'List workflows', operationId: 'listWorkflows',
        parameters: [
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'per_page', in: 'query', schema: { type: 'integer', default: 30 } },
        ],
        responses: {
          '200': { description: 'Workflow list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/actions/runs': {
      get: {
        tags: ['Actions'], summary: 'List workflow runs', operationId: 'listWorkflowRuns',
        parameters: [
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'workflow_id', in: 'query', schema: { type: 'string' } },
          { name: 'branch', in: 'query', schema: { type: 'string' } },
          { name: 'event', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['queued', 'in_progress', 'completed', 'requested', 'waiting'] } },
          { name: 'per_page', in: 'query', schema: { type: 'integer', default: 30 } },
        ],
        responses: {
          '200': { description: 'Run list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/actions/runs/{runId}': {
      get: {
        tags: ['Actions'], summary: 'Get workflow run', operationId: 'getWorkflowRun',
        parameters: [
          { name: 'runId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Run details', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/actions/trigger': {
      post: {
        tags: ['Actions'], summary: 'Trigger workflow', operationId: 'triggerWorkflow',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TriggerWorkflowRequest' } } } },
        responses: {
          '202': { description: 'Triggered', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/actions/runs/{runId}/cancel': {
      post: {
        tags: ['Actions'], summary: 'Cancel workflow run', operationId: 'cancelWorkflowRun',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['owner', 'repo'], properties: { owner: { type: 'string' }, repo: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Cancelled', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/actions/runs/{runId}/rerun': {
      post: {
        tags: ['Actions'], summary: 'Re-run workflow', operationId: 'rerunWorkflow',
        parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['owner', 'repo'], properties: { owner: { type: 'string' }, repo: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Re-run triggered', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/releases': {
      get: {
        tags: ['Releases'], summary: 'List releases', operationId: 'listReleases',
        parameters: [
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'per_page', in: 'query', schema: { type: 'integer', default: 30 } },
        ],
        responses: {
          '200': { description: 'Release list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      post: {
        tags: ['Releases'], summary: 'Create release', operationId: 'createRelease',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateReleaseRequest' } } } },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/releases/latest': {
      get: {
        tags: ['Releases'], summary: 'Latest release', operationId: 'getLatestRelease',
        parameters: [
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Latest release', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/releases/tag/{tag}': {
      get: {
        tags: ['Releases'], summary: 'Get release by tag', operationId: 'getReleaseByTag',
        parameters: [
          { name: 'tag', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Release', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/releases/{releaseId}': {
      delete: {
        tags: ['Releases'], summary: 'Delete release', operationId: 'deleteRelease',
        parameters: [
          { name: 'releaseId', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'owner', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'repo', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/github/releases/notes': {
      post: {
        tags: ['Releases'], summary: 'Generate release notes', operationId: 'generateReleaseNotes',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GenerateNotesRequest' } } } },
        responses: {
          '200': { description: 'Generated notes', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
  },
};

const limiter = new SimpleRateLimiter({ requestsPerMinute: 120 });
const checkRateLimit = rateLimitMiddleware(limiter);

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

      // Swagger UI
      if (path === '/swagger' || path === '/swagger/') {
        return addCorsHeaders(new Response(SWAGGER_HTML, { headers: { 'Content-Type': 'text/html' } }));
      }

      // OpenAPI spec
      if (path === '/api/openapi.json') {
        return addCorsHeaders(Response.json(OPENAPI_SPEC));
      }

      let response: Response;

      // Health check endpoint
      if (path === '/health') {
        response = Response.json(healthHandler());
        return addCorsHeaders(response);
      }

      // Service-to-service authentication
      const authResponse = serviceAuthMiddleware(req);
      if (authResponse) return addCorsHeaders(authResponse);

      // Rate limiting
      const rateLimitResponse = checkRateLimit(req);
      if (rateLimitResponse) return addCorsHeaders(rateLimitResponse);

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

      // POST /api/github/prs/:number/reviews - Create PR review
      const createReviewMatch = path.match(/^\/api\/github\/prs\/(\d+)\/reviews$/);
      if (createReviewMatch && method === 'POST') {
        const prNumber = parseNumber(createReviewMatch[1]);
        if (prNumber) {
          response = await createPRReviewHandler(req, prNumber);
          return addCorsHeaders(response);
        }
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

  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    server.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down...');
    server.stop();
    process.exit(0);
  });

  return server;
}
