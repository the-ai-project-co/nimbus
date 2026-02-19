import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { router } from './routes';

const SWAGGER_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Nimbus Helm Tools Service API</title>
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
    title: 'Nimbus Helm Tools Service API',
    version: '0.1.0',
    description: 'Helm operations service for Nimbus. Provides HTTP endpoints for managing Helm charts, releases, repositories, and chart lifecycle operations.',
  },
  servers: [{ url: 'http://localhost:3009', description: 'Local development' }],
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
          service: { type: 'string', example: 'helm-tools-service' },
          version: { type: 'string', example: '0.1.0' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      HelmInstallRequest: {
        type: 'object',
        required: ['name', 'chart'],
        properties: {
          name: { type: 'string', description: 'Release name' },
          chart: { type: 'string', description: 'Chart reference (repo/chart or path)' },
          namespace: { type: 'string', description: 'Target namespace' },
          values: { type: 'string', description: 'Inline YAML values' },
          valuesFiles: { type: 'array', items: { type: 'string' }, description: 'Paths to values files' },
          set: { type: 'object', additionalProperties: { type: 'string' }, description: 'Set individual values' },
          setString: { type: 'object', additionalProperties: { type: 'string' }, description: 'Set string values' },
          version: { type: 'string', description: 'Chart version constraint' },
          createNamespace: { type: 'boolean', description: 'Create namespace if not exists' },
          dryRun: { type: 'boolean', description: 'Simulate install' },
          wait: { type: 'boolean', description: 'Wait for resources to be ready' },
          timeout: { type: 'string', description: 'Timeout duration (e.g. 5m0s)' },
          atomic: { type: 'boolean', description: 'Rollback on failure' },
          kubeconfig: { type: 'string' },
          kubeContext: { type: 'string' },
        },
      },
      HelmUpgradeRequest: {
        type: 'object',
        required: ['name', 'chart'],
        properties: {
          name: { type: 'string', description: 'Release name' },
          chart: { type: 'string', description: 'Chart reference' },
          namespace: { type: 'string' },
          values: { type: 'string' },
          valuesFiles: { type: 'array', items: { type: 'string' } },
          set: { type: 'object', additionalProperties: { type: 'string' } },
          setString: { type: 'object', additionalProperties: { type: 'string' } },
          version: { type: 'string' },
          install: { type: 'boolean', description: 'Install if release does not exist' },
          createNamespace: { type: 'boolean' },
          dryRun: { type: 'boolean' },
          wait: { type: 'boolean' },
          timeout: { type: 'string' },
          atomic: { type: 'boolean' },
          reuseValues: { type: 'boolean', description: 'Reuse existing values' },
          resetValues: { type: 'boolean', description: 'Reset values to defaults' },
          kubeconfig: { type: 'string' },
          kubeContext: { type: 'string' },
        },
      },
      HelmUninstallRequest: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Release name' },
          namespace: { type: 'string' },
          keepHistory: { type: 'boolean', description: 'Keep release history' },
          dryRun: { type: 'boolean' },
          wait: { type: 'boolean' },
          timeout: { type: 'string' },
          kubeconfig: { type: 'string' },
          kubeContext: { type: 'string' },
        },
      },
      HelmRollbackRequest: {
        type: 'object',
        required: ['name', 'revision'],
        properties: {
          name: { type: 'string', description: 'Release name' },
          revision: { type: 'integer', minimum: 0, description: 'Revision to roll back to' },
          namespace: { type: 'string' },
          dryRun: { type: 'boolean' },
          wait: { type: 'boolean' },
          timeout: { type: 'string' },
          force: { type: 'boolean', description: 'Force resource updates' },
          kubeconfig: { type: 'string' },
          kubeContext: { type: 'string' },
        },
      },
      HelmRepoRequest: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { type: 'string', enum: ['add', 'remove', 'list', 'update'], description: 'Repository action' },
          name: { type: 'string', description: 'Repository name' },
          url: { type: 'string', description: 'Repository URL' },
          username: { type: 'string', description: 'Basic auth username' },
          password: { type: 'string', description: 'Basic auth password' },
          kubeconfig: { type: 'string' },
          kubeContext: { type: 'string' },
        },
      },
      HelmTemplateRequest: {
        type: 'object',
        required: ['name', 'chart'],
        properties: {
          name: { type: 'string', description: 'Release name for template' },
          chart: { type: 'string', description: 'Chart reference' },
          namespace: { type: 'string' },
          values: { type: 'string' },
          valuesFiles: { type: 'array', items: { type: 'string' } },
          set: { type: 'object', additionalProperties: { type: 'string' } },
          setString: { type: 'object', additionalProperties: { type: 'string' } },
          version: { type: 'string' },
          kubeconfig: { type: 'string' },
          kubeContext: { type: 'string' },
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
    '/api/helm/install': {
      post: {
        tags: ['Releases'], summary: 'Install chart', description: 'Install a Helm chart as a new release.',
        operationId: 'helmInstall',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/HelmInstallRequest' } } } },
        responses: {
          '200': { description: 'Installed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Install failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/upgrade': {
      post: {
        tags: ['Releases'], summary: 'Upgrade release', description: 'Upgrade an existing Helm release to a new chart version or values.',
        operationId: 'helmUpgrade',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/HelmUpgradeRequest' } } } },
        responses: {
          '200': { description: 'Upgraded', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Upgrade failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/uninstall': {
      post: {
        tags: ['Releases'], summary: 'Uninstall release', description: 'Uninstall a Helm release from the cluster.',
        operationId: 'helmUninstall',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/HelmUninstallRequest' } } } },
        responses: {
          '200': { description: 'Uninstalled', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Uninstall failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/list': {
      get: {
        tags: ['Releases'], summary: 'List releases', description: 'List Helm releases in the cluster.',
        operationId: 'helmList',
        parameters: [
          { name: 'namespace', in: 'query', schema: { type: 'string' } },
          { name: 'allNamespaces', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'List across all namespaces' },
          { name: 'filter', in: 'query', schema: { type: 'string' }, description: 'Filter by release name regex' },
          { name: 'maxResults', in: 'query', schema: { type: 'integer' }, description: 'Maximum results to return' },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'kubeContext', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Release list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/rollback': {
      post: {
        tags: ['Releases'], summary: 'Rollback release', description: 'Roll back a release to a previous revision.',
        operationId: 'helmRollback',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/HelmRollbackRequest' } } } },
        responses: {
          '200': { description: 'Rolled back', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Rollback failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/values': {
      get: {
        tags: ['Releases'], summary: 'Get values', description: 'Get the computed values for a Helm release.',
        operationId: 'helmGetValues',
        parameters: [
          { name: 'name', in: 'query', required: true, schema: { type: 'string' }, description: 'Release name' },
          { name: 'namespace', in: 'query', schema: { type: 'string' } },
          { name: 'allValues', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Include default chart values' },
          { name: 'revision', in: 'query', schema: { type: 'integer' }, description: 'Specific revision' },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'kubeContext', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Values', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/history': {
      get: {
        tags: ['Releases'], summary: 'Release history', description: 'Get the revision history for a Helm release.',
        operationId: 'helmHistory',
        parameters: [
          { name: 'name', in: 'query', required: true, schema: { type: 'string' }, description: 'Release name' },
          { name: 'namespace', in: 'query', schema: { type: 'string' } },
          { name: 'maxResults', in: 'query', schema: { type: 'integer' } },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'kubeContext', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'History', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/status': {
      get: {
        tags: ['Releases'], summary: 'Release status', description: 'Get the status of a Helm release.',
        operationId: 'helmStatus',
        parameters: [
          { name: 'name', in: 'query', required: true, schema: { type: 'string' }, description: 'Release name' },
          { name: 'namespace', in: 'query', schema: { type: 'string' } },
          { name: 'revision', in: 'query', schema: { type: 'integer' } },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'kubeContext', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Status', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/repo': {
      post: {
        tags: ['Repositories'], summary: 'Manage repos', description: 'Add, remove, list, or update Helm chart repositories.',
        operationId: 'helmRepo',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/HelmRepoRequest' } } } },
        responses: {
          '200': { description: 'Repository operation result', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing or invalid action', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/search': {
      get: {
        tags: ['Charts'], summary: 'Search charts', description: 'Search for Helm charts in configured repos or Artifact Hub.',
        operationId: 'helmSearch',
        parameters: [
          { name: 'keyword', in: 'query', required: true, schema: { type: 'string' }, description: 'Search keyword' },
          { name: 'version', in: 'query', schema: { type: 'string' }, description: 'Version constraint' },
          { name: 'versions', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Show all versions' },
          { name: 'regexp', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Use regex matching' },
          { name: 'maxResults', in: 'query', schema: { type: 'integer' } },
          { name: 'hub', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Search Artifact Hub instead of repos' },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'kubeContext', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Search results', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing keyword', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/show': {
      get: {
        tags: ['Charts'], summary: 'Show chart info', description: 'Show chart metadata, readme, values, or CRDs.',
        operationId: 'helmShow',
        parameters: [
          { name: 'chart', in: 'query', required: true, schema: { type: 'string' }, description: 'Chart reference' },
          { name: 'subcommand', in: 'query', required: true, schema: { type: 'string', enum: ['all', 'chart', 'readme', 'values', 'crds'] }, description: 'What to show' },
          { name: 'version', in: 'query', schema: { type: 'string' }, description: 'Chart version' },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'kubeContext', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Chart info', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing chart or subcommand', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/template': {
      post: {
        tags: ['Charts'], summary: 'Template chart', description: 'Render chart templates locally without installing.',
        operationId: 'helmTemplate',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/HelmTemplateRequest' } } } },
        responses: {
          '200': { description: 'Rendered manifests', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Template failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/test': {
      post: {
        tags: ['Releases'], summary: 'Test release', description: 'Run test hooks for a Helm release.',
        operationId: 'helmTest',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', description: 'Release name' }, namespace: { type: 'string' }, timeout: { type: 'string' }, filter: { type: 'string', description: 'Filter tests by name' }, logs: { type: 'boolean', description: 'Include test logs' }, kubeconfig: { type: 'string' }, kubeContext: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Test result', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Test failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/package': {
      post: {
        tags: ['Charts'], summary: 'Package chart', description: 'Package a Helm chart directory into a chart archive.',
        operationId: 'helmPackage',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['chartPath'], properties: { chartPath: { type: 'string', description: 'Path to chart directory' }, destination: { type: 'string', description: 'Output directory' }, version: { type: 'string', description: 'Override chart version' }, appVersion: { type: 'string', description: 'Override app version' }, dependencyUpdate: { type: 'boolean', description: 'Update dependencies first' }, kubeconfig: { type: 'string' }, kubeContext: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Packaged', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing chartPath', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Package failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/lint': {
      post: {
        tags: ['Charts'], summary: 'Lint chart', description: 'Run linting checks on a Helm chart.',
        operationId: 'helmLint',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['chartPath'], properties: { chartPath: { type: 'string', description: 'Path to chart directory' }, strict: { type: 'boolean', description: 'Treat warnings as errors' }, valuesFiles: { type: 'array', items: { type: 'string' }, description: 'Values files to use' }, kubeconfig: { type: 'string' }, kubeContext: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Lint result', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing chartPath', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Lint failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/create': {
      post: {
        tags: ['Charts'], summary: 'Create chart', description: 'Create a new Helm chart scaffold.',
        operationId: 'helmCreate',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', description: 'Chart name' }, starterChart: { type: 'string', description: 'Starter chart to use' }, kubeconfig: { type: 'string' }, kubeContext: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Create failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/dependency/update': {
      post: {
        tags: ['Charts'], summary: 'Update dependencies', description: 'Update chart dependencies based on Chart.yaml.',
        operationId: 'helmDependencyUpdate',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['chartPath'], properties: { chartPath: { type: 'string', description: 'Path to chart directory' }, kubeconfig: { type: 'string' }, kubeContext: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing chartPath', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Update failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/manifest': {
      get: {
        tags: ['Releases'], summary: 'Get manifest', description: 'Get the rendered Kubernetes manifest for a Helm release.',
        operationId: 'helmGetManifest',
        parameters: [
          { name: 'name', in: 'query', required: true, schema: { type: 'string' }, description: 'Release name' },
          { name: 'namespace', in: 'query', schema: { type: 'string' } },
          { name: 'revision', in: 'query', schema: { type: 'integer' } },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'kubeContext', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Manifest', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/helm/version': {
      get: {
        tags: ['Health'], summary: 'Helm version', description: 'Get the installed Helm client version.',
        operationId: 'helmVersion',
        parameters: [
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'kubeContext', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Version info', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
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

  logger.info(`Helm Tools Service HTTP server listening on port ${port}`);

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
