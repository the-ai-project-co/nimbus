import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { router } from './routes';

const SWAGGER_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Nimbus Git Tools Service API</title>
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
    title: 'Nimbus Git Tools Service API',
    version: '0.1.0',
    description: 'Git operations service for Nimbus. Provides HTTP endpoints for all common Git operations including clone, commit, push, pull, branching, merging, tagging, rebasing, cherry-picking, stashing, and blame.',
  },
  servers: [{ url: 'http://localhost:3010', description: 'Local development' }],
  components: {
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
          service: { type: 'string', example: 'git-tools-service' },
          version: { type: 'string', example: '0.1.0' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      CloneRequest: {
        type: 'object',
        required: ['url', 'path'],
        properties: {
          url: { type: 'string', description: 'Repository URL to clone' },
          path: { type: 'string', description: 'Local path to clone to' },
          branch: { type: 'string', description: 'Branch to clone' },
          depth: { type: 'integer', description: 'Shallow clone depth' },
        },
      },
      CommitRequest: {
        type: 'object',
        required: ['message'],
        properties: {
          path: { type: 'string', description: 'Repository path' },
          message: { type: 'string', description: 'Commit message' },
          amend: { type: 'boolean', description: 'Amend previous commit' },
          allowEmpty: { type: 'boolean', description: 'Allow empty commits' },
        },
      },
      PushRequest: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Repository path' },
          remote: { type: 'string', description: 'Remote name (default: origin)' },
          branch: { type: 'string', description: 'Branch to push' },
          force: { type: 'boolean', description: 'Force push' },
          setUpstream: { type: 'boolean', description: 'Set upstream tracking' },
        },
      },
      PullRequest: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Repository path' },
          remote: { type: 'string', description: 'Remote name' },
          branch: { type: 'string', description: 'Branch to pull' },
          rebase: { type: 'boolean', description: 'Rebase instead of merge' },
        },
      },
      BranchRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          path: { type: 'string', description: 'Repository path' },
          name: { type: 'string', description: 'Branch name' },
          checkout: { type: 'boolean', description: 'Switch to branch after creation' },
          startPoint: { type: 'string', description: 'Start point (commit/branch)' },
        },
      },
      MergeRequest: {
        type: 'object',
        required: ['branch'],
        properties: {
          path: { type: 'string', description: 'Repository path' },
          branch: { type: 'string', description: 'Branch to merge' },
          noFf: { type: 'boolean', description: 'No fast-forward merge' },
          squash: { type: 'boolean', description: 'Squash merge' },
          message: { type: 'string', description: 'Merge commit message' },
        },
      },
      TagRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          path: { type: 'string', description: 'Repository path' },
          name: { type: 'string', description: 'Tag name' },
          message: { type: 'string', description: 'Tag message (creates annotated tag)' },
          annotated: { type: 'boolean', description: 'Create annotated tag' },
          force: { type: 'boolean', description: 'Force create/move tag' },
          commit: { type: 'string', description: 'Commit to tag (default: HEAD)' },
        },
      },
      CherryPickRequest: {
        type: 'object',
        required: ['commit'],
        properties: {
          path: { type: 'string', description: 'Repository path' },
          commit: { type: 'string', description: 'Commit hash to cherry-pick' },
          noCommit: { type: 'boolean', description: 'Apply changes without committing' },
          edit: { type: 'boolean', description: 'Edit commit message' },
          signoff: { type: 'boolean', description: 'Add Signed-off-by line' },
          strategy: { type: 'string', description: 'Merge strategy' },
        },
      },
      RebaseRequest: {
        type: 'object',
        required: ['target'],
        properties: {
          path: { type: 'string', description: 'Repository path' },
          target: { type: 'string', description: 'Target branch/commit to rebase onto' },
          onto: { type: 'string', description: 'Rebase onto this branch' },
          preserveMerges: { type: 'boolean' },
          strategy: { type: 'string' },
          strategyOption: { type: 'string' },
        },
      },
      StashRequest: {
        type: 'object',
        required: ['command'],
        properties: {
          path: { type: 'string', description: 'Repository path' },
          command: { type: 'string', enum: ['push', 'pop', 'list', 'drop', 'apply', 'clear'], description: 'Stash sub-command' },
          message: { type: 'string', description: 'Stash message (for push)' },
          index: { type: 'integer', description: 'Stash index (for pop/drop/apply)' },
        },
      },
      ResetRequest: {
        type: 'object',
        required: ['target'],
        properties: {
          path: { type: 'string', description: 'Repository path' },
          target: { type: 'string', description: 'Target commit' },
          mode: { type: 'string', enum: ['soft', 'mixed', 'hard'], description: 'Reset mode' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'], summary: 'Health check', operationId: 'healthCheck',
        responses: { '200': { description: 'Service is healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } } },
      },
    },
    '/api/git/status': {
      get: {
        tags: ['Repository'], summary: 'Get repository status', description: 'Get the working tree status including staged, modified, untracked, and conflicted files.',
        operationId: 'gitStatus',
        parameters: [{ name: 'path', in: 'query', schema: { type: 'string' }, description: 'Repository path (default: cwd)' }],
        responses: {
          '200': { description: 'Repository status', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/clone': {
      post: {
        tags: ['Repository'], summary: 'Clone a repository', description: 'Clone a Git repository to a local path.',
        operationId: 'gitClone',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CloneRequest' } } } },
        responses: {
          '200': { description: 'Cloned', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Clone failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/init': {
      post: {
        tags: ['Repository'], summary: 'Initialize repository', description: 'Initialize a new Git repository.',
        operationId: 'gitInit',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' }, bare: { type: 'boolean', description: 'Create a bare repository' } } } } } },
        responses: {
          '200': { description: 'Initialized', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Init failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/add': {
      post: {
        tags: ['Staging'], summary: 'Stage files', description: 'Add files to the staging area.',
        operationId: 'gitAdd',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' }, files: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }], description: 'Files to stage (default: .)' } } } } } },
        responses: {
          '200': { description: 'Staged', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Add failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/commit': {
      post: {
        tags: ['Commits'], summary: 'Commit changes', description: 'Commit staged changes with a message.',
        operationId: 'gitCommit',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CommitRequest' } } } },
        responses: {
          '200': { description: 'Committed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing message', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Commit failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/push': {
      post: {
        tags: ['Remotes'], summary: 'Push to remote', description: 'Push commits to a remote repository.',
        operationId: 'gitPush',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PushRequest' } } } },
        responses: {
          '200': { description: 'Pushed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Push failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/pull': {
      post: {
        tags: ['Remotes'], summary: 'Pull from remote', description: 'Pull changes from a remote repository.',
        operationId: 'gitPull',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PullRequest' } } } },
        responses: {
          '200': { description: 'Pulled', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Pull failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/fetch': {
      post: {
        tags: ['Remotes'], summary: 'Fetch from remote', description: 'Fetch refs and objects from a remote.',
        operationId: 'gitFetch',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' }, remote: { type: 'string' }, prune: { type: 'boolean', description: 'Prune deleted remote branches' } } } } } },
        responses: {
          '200': { description: 'Fetched', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Fetch failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/branch': {
      post: {
        tags: ['Branches'], summary: 'Create branch', description: 'Create a new Git branch.',
        operationId: 'gitCreateBranch',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BranchRequest' } } } },
        responses: {
          '200': { description: 'Branch created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/branches': {
      get: {
        tags: ['Branches'], summary: 'List branches', description: 'List local and optionally remote branches.',
        operationId: 'gitListBranches',
        parameters: [
          { name: 'path', in: 'query', schema: { type: 'string' }, description: 'Repository path' },
          { name: 'remote', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Include remote branches' },
        ],
        responses: {
          '200': { description: 'Branch list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/checkout': {
      post: {
        tags: ['Branches'], summary: 'Checkout branch', description: 'Switch to a branch or commit.',
        operationId: 'gitCheckout',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['target'], properties: { path: { type: 'string' }, target: { type: 'string', description: 'Branch name or commit hash' }, create: { type: 'boolean', description: 'Create branch if not exists (-b)' } } } } } },
        responses: {
          '200': { description: 'Checked out', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing target', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Checkout failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/diff': {
      get: {
        tags: ['Repository'], summary: 'Get diff', description: 'Show changes between commits, working tree, and staging area.',
        operationId: 'gitDiff',
        parameters: [
          { name: 'path', in: 'query', schema: { type: 'string' }, description: 'Repository path' },
          { name: 'cached', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Show staged changes' },
          { name: 'nameOnly', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Show only file names' },
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'From commit' },
          { name: 'to', in: 'query', schema: { type: 'string' }, description: 'To commit' },
        ],
        responses: {
          '200': { description: 'Diff output', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Diff failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/log': {
      get: {
        tags: ['Commits'], summary: 'Get commit log', description: 'Show the commit history.',
        operationId: 'gitLog',
        parameters: [
          { name: 'path', in: 'query', schema: { type: 'string' }, description: 'Repository path' },
          { name: 'maxCount', in: 'query', schema: { type: 'integer', default: 10 }, description: 'Max number of commits' },
          { name: 'from', in: 'query', schema: { type: 'string' }, description: 'From commit' },
          { name: 'to', in: 'query', schema: { type: 'string' }, description: 'To commit' },
          { name: 'file', in: 'query', schema: { type: 'string' }, description: 'Filter by file path' },
        ],
        responses: {
          '200': { description: 'Commit log', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Log failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/merge': {
      post: {
        tags: ['Branches'], summary: 'Merge branch', description: 'Merge a branch into the current branch.',
        operationId: 'gitMerge',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/MergeRequest' } } } },
        responses: {
          '200': { description: 'Merged', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing branch', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Merge failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/stash': {
      post: {
        tags: ['Stash'], summary: 'Stash operations', description: 'Push, pop, list, drop, apply, or clear stash entries.',
        operationId: 'gitStash',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StashRequest' } } } },
        responses: {
          '200': { description: 'Stash result', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing command', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Stash failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/reset': {
      post: {
        tags: ['Repository'], summary: 'Reset to commit', description: 'Reset HEAD to a target commit with soft, mixed, or hard mode.',
        operationId: 'gitReset',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ResetRequest' } } } },
        responses: {
          '200': { description: 'Reset', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing target', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Reset failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/cherry-pick': {
      post: {
        tags: ['Commits'], summary: 'Cherry-pick commit', description: 'Apply changes from a specific commit.',
        operationId: 'gitCherryPick',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CherryPickRequest' } } } },
        responses: {
          '200': { description: 'Cherry-picked', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing commit', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Cherry-pick failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/cherry-pick/abort': {
      post: { tags: ['Commits'], summary: 'Abort cherry-pick', operationId: 'gitCherryPickAbort', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' } } } } } }, responses: { '200': { description: 'Aborted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } } } },
    },
    '/api/git/cherry-pick/continue': {
      post: { tags: ['Commits'], summary: 'Continue cherry-pick', operationId: 'gitCherryPickContinue', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' } } } } } }, responses: { '200': { description: 'Continued', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } } } },
    },
    '/api/git/rebase': {
      post: {
        tags: ['Branches'], summary: 'Rebase onto target', description: 'Rebase current branch onto a target branch or commit.',
        operationId: 'gitRebase',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RebaseRequest' } } } },
        responses: {
          '200': { description: 'Rebased', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing target', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Rebase failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/rebase/abort': {
      post: { tags: ['Branches'], summary: 'Abort rebase', operationId: 'gitRebaseAbort', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' } } } } } }, responses: { '200': { description: 'Aborted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } } } },
    },
    '/api/git/rebase/continue': {
      post: { tags: ['Branches'], summary: 'Continue rebase', operationId: 'gitRebaseContinue', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' } } } } } }, responses: { '200': { description: 'Continued', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } } } },
    },
    '/api/git/rebase/skip': {
      post: { tags: ['Branches'], summary: 'Skip commit during rebase', operationId: 'gitRebaseSkip', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' } } } } } }, responses: { '200': { description: 'Skipped', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } } } },
    },
    '/api/git/tags': {
      get: {
        tags: ['Tags'], summary: 'List tags', operationId: 'gitListTags',
        parameters: [
          { name: 'path', in: 'query', schema: { type: 'string' }, description: 'Repository path' },
          { name: 'pattern', in: 'query', schema: { type: 'string' }, description: 'Glob pattern to filter tags' },
        ],
        responses: {
          '200': { description: 'Tag list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/tag': {
      post: {
        tags: ['Tags'], summary: 'Create tag', description: 'Create a new Git tag.',
        operationId: 'gitCreateTag',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TagRequest' } } } },
        responses: {
          '200': { description: 'Tag created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Tags'], summary: 'Delete tag', description: 'Delete a Git tag locally and optionally from remote.',
        operationId: 'gitDeleteTag',
        parameters: [
          { name: 'name', in: 'query', required: true, schema: { type: 'string' }, description: 'Tag name to delete' },
          { name: 'remote', in: 'query', schema: { type: 'string' }, description: 'Remote to delete from' },
          { name: 'path', in: 'query', schema: { type: 'string' }, description: 'Repository path' },
        ],
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/tag/push': {
      post: {
        tags: ['Tags'], summary: 'Push tags', description: 'Push tags to a remote repository.',
        operationId: 'gitPushTags',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' }, remote: { type: 'string' }, tagName: { type: 'string', description: 'Specific tag to push (omit for all)' } } } } } },
        responses: {
          '200': { description: 'Pushed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/tag/show': {
      get: {
        tags: ['Tags'], summary: 'Show tag info', operationId: 'gitShowTag',
        parameters: [
          { name: 'name', in: 'query', required: true, schema: { type: 'string' }, description: 'Tag name' },
          { name: 'path', in: 'query', schema: { type: 'string' }, description: 'Repository path' },
        ],
        responses: {
          '200': { description: 'Tag info', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/blame': {
      get: {
        tags: ['Repository'], summary: 'Get blame for a file', description: 'Show line-by-line authorship information.',
        operationId: 'gitBlame',
        parameters: [
          { name: 'path', in: 'query', schema: { type: 'string' }, description: 'Repository path' },
          { name: 'file', in: 'query', required: true, schema: { type: 'string' }, description: 'File to blame' },
          { name: 'startLine', in: 'query', schema: { type: 'integer' }, description: 'Start line number' },
          { name: 'endLine', in: 'query', schema: { type: 'integer' }, description: 'End line number' },
        ],
        responses: {
          '200': { description: 'Blame output', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing file', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Blame failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/remote': {
      get: {
        tags: ['Remotes'], summary: 'Get remote URL', operationId: 'gitGetRemote',
        parameters: [
          { name: 'path', in: 'query', schema: { type: 'string' } },
          { name: 'name', in: 'query', schema: { type: 'string', default: 'origin' }, description: 'Remote name' },
        ],
        responses: {
          '200': { description: 'Remote URL', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/current-branch': {
      get: {
        tags: ['Branches'], summary: 'Get current branch', operationId: 'gitCurrentBranch',
        parameters: [{ name: 'path', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Current branch name', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/is-clean': {
      get: {
        tags: ['Repository'], summary: 'Check if repository is clean', operationId: 'gitIsClean',
        parameters: [{ name: 'path', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Clean status', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { isClean: { type: 'boolean' } } } } } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/git/conflicts': {
      get: {
        tags: ['Repository'], summary: 'Get conflicted files', operationId: 'gitGetConflicts',
        parameters: [{ name: 'path', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Conflict list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
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

      if (url.pathname === '/swagger' || url.pathname === '/swagger/') {
        return new Response(SWAGGER_HTML, { headers: { 'Content-Type': 'text/html' } });
      }
      if (url.pathname === '/api/openapi.json') {
        return Response.json(OPENAPI_SPEC);
      }

      // Service-to-service authentication
      const authResponse = serviceAuthMiddleware(req);
      if (authResponse) return authResponse;

      // Rate limiting
      const rateLimitResponse = checkRateLimit(req);
      if (rateLimitResponse) return rateLimitResponse;

      try {
        return await router(req);
      } catch (error: any) {
        logger.error('Request handler error', error);
        return Response.json(
          { success: false, error: error.message || 'Internal server error' },
          { status: 500 }
        );
      }
    },
  });

  logger.info(`Git Tools Service HTTP server listening on port ${port}`);

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
