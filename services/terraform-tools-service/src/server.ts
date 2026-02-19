import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { router } from './routes';

const SWAGGER_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Nimbus Terraform Tools Service API</title>
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
    title: 'Nimbus Terraform Tools Service API',
    version: '0.1.0',
    description: 'Terraform operations service for Nimbus. Provides HTTP endpoints for managing Terraform workflows including init, plan, apply, destroy, state management, workspaces, and formatting.',
  },
  servers: [{ url: 'http://localhost:3007', description: 'Local development' }],
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
          service: { type: 'string', example: 'terraform-tools-service' },
          version: { type: 'string', example: '0.1.0' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      TerraformInitRequest: {
        type: 'object',
        required: ['directory'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          backend: { type: 'boolean', description: 'Configure backend' },
          upgrade: { type: 'boolean', description: 'Upgrade provider plugins' },
          reconfigure: { type: 'boolean', description: 'Reconfigure backend' },
          backendConfig: { type: 'object', additionalProperties: { type: 'string' }, description: 'Backend configuration key-value pairs' },
        },
      },
      TerraformPlanRequest: {
        type: 'object',
        required: ['directory'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          varFile: { type: 'string', description: 'Path to variable file' },
          out: { type: 'string', description: 'Output plan file path' },
          destroy: { type: 'boolean', description: 'Plan for destruction' },
          target: { type: 'array', items: { type: 'string' }, description: 'Resource targets' },
          var: { type: 'object', additionalProperties: { type: 'string' }, description: 'Variable values' },
          refresh: { type: 'boolean', description: 'Refresh state before planning' },
        },
      },
      TerraformApplyRequest: {
        type: 'object',
        required: ['directory'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          autoApprove: { type: 'boolean', description: 'Skip interactive approval' },
          varFile: { type: 'string', description: 'Path to variable file' },
          planFile: { type: 'string', description: 'Path to saved plan file' },
          target: { type: 'array', items: { type: 'string' }, description: 'Resource targets' },
          var: { type: 'object', additionalProperties: { type: 'string' }, description: 'Variable values' },
          parallelism: { type: 'integer', description: 'Number of concurrent operations' },
        },
      },
      TerraformDestroyRequest: {
        type: 'object',
        required: ['directory'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          autoApprove: { type: 'boolean', description: 'Skip interactive approval' },
          varFile: { type: 'string', description: 'Path to variable file' },
          target: { type: 'array', items: { type: 'string' }, description: 'Resource targets' },
          var: { type: 'object', additionalProperties: { type: 'string' }, description: 'Variable values' },
        },
      },
      TerraformFmtRequest: {
        type: 'object',
        required: ['directory'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          check: { type: 'boolean', description: 'Check formatting without modifying files' },
          recursive: { type: 'boolean', description: 'Process subdirectories recursively' },
          diff: { type: 'boolean', description: 'Show formatting diff' },
        },
      },
      TerraformImportRequest: {
        type: 'object',
        required: ['directory', 'address', 'id'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          address: { type: 'string', description: 'Terraform resource address' },
          id: { type: 'string', description: 'Resource ID to import' },
          varFile: { type: 'string', description: 'Path to variable file' },
        },
      },
      TerraformWorkspaceRequest: {
        type: 'object',
        required: ['directory', 'name'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          name: { type: 'string', description: 'Workspace name' },
        },
      },
      TerraformStateMoveRequest: {
        type: 'object',
        required: ['directory', 'source', 'destination'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          source: { type: 'string', description: 'Source resource address' },
          destination: { type: 'string', description: 'Destination resource address' },
        },
      },
      TerraformTaintRequest: {
        type: 'object',
        required: ['directory', 'address'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          address: { type: 'string', description: 'Resource address to taint/untaint' },
        },
      },
      TerraformForceUnlockRequest: {
        type: 'object',
        required: ['directory', 'lockId'],
        properties: {
          directory: { type: 'string', description: 'Path to Terraform configuration directory' },
          lockId: { type: 'string', description: 'Lock ID to force unlock' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        operationId: 'healthCheck',
        responses: {
          '200': { description: 'Service is healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } },
        },
      },
    },
    '/api/terraform/init': {
      post: {
        tags: ['Core'],
        summary: 'Initialize Terraform',
        description: 'Initialize a Terraform working directory. Downloads providers and modules.',
        operationId: 'terraformInit',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformInitRequest' } } } },
        responses: {
          '200': { description: 'Initialized successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Init failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/plan': {
      post: {
        tags: ['Core'],
        summary: 'Generate execution plan',
        description: 'Create an execution plan showing what Terraform will do.',
        operationId: 'terraformPlan',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformPlanRequest' } } } },
        responses: {
          '200': { description: 'Plan generated', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Plan failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/apply': {
      post: {
        tags: ['Core'],
        summary: 'Apply configuration',
        description: 'Apply Terraform configuration changes to create, update, or delete infrastructure.',
        operationId: 'terraformApply',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformApplyRequest' } } } },
        responses: {
          '200': { description: 'Applied successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Apply failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/destroy': {
      post: {
        tags: ['Core'],
        summary: 'Destroy resources',
        description: 'Destroy all Terraform-managed infrastructure.',
        operationId: 'terraformDestroy',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformDestroyRequest' } } } },
        responses: {
          '200': { description: 'Destroyed successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Destroy failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/validate': {
      post: {
        tags: ['Core'],
        summary: 'Validate configuration',
        description: 'Validate the Terraform configuration files for syntax and internal consistency.',
        operationId: 'terraformValidate',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['directory'], properties: { directory: { type: 'string', description: 'Path to Terraform configuration directory' } } } } } },
        responses: {
          '200': { description: 'Validation result', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Validation failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/fmt': {
      post: {
        tags: ['Core'],
        summary: 'Format files',
        description: 'Format Terraform configuration files to canonical format.',
        operationId: 'terraformFmt',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformFmtRequest' } } } },
        responses: {
          '200': { description: 'Formatted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Format failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/lint': {
      post: {
        tags: ['Core'],
        summary: 'Lint configuration',
        description: 'Run linting checks (tflint, checkov) on Terraform configuration.',
        operationId: 'terraformLint',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['directory'], properties: { directory: { type: 'string' }, tflint: { type: 'boolean' }, checkov: { type: 'boolean' } } } } } },
        responses: {
          '200': { description: 'Lint results', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Lint failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/import': {
      post: {
        tags: ['State'],
        summary: 'Import resource',
        description: 'Import an existing infrastructure resource into Terraform state.',
        operationId: 'terraformImport',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformImportRequest' } } } },
        responses: {
          '200': { description: 'Imported', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Import failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/refresh': {
      post: {
        tags: ['State'],
        summary: 'Refresh state',
        description: 'Reconcile Terraform state with real-world infrastructure.',
        operationId: 'terraformRefresh',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['directory'], properties: { directory: { type: 'string' }, varFile: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Refreshed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Refresh failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/state/mv': {
      post: {
        tags: ['State'],
        summary: 'Move resource in state',
        description: 'Move a resource from one address to another in the Terraform state.',
        operationId: 'terraformStateMove',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformStateMoveRequest' } } } },
        responses: {
          '200': { description: 'Moved', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Move failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/state/push': {
      post: {
        tags: ['State'],
        summary: 'Push local state',
        description: 'Push local state file to configured remote backend.',
        operationId: 'terraformStatePush',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['directory'], properties: { directory: { type: 'string' }, stateFile: { type: 'string' }, force: { type: 'boolean' } } } } } },
        responses: {
          '200': { description: 'Pushed', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Push failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/state/list': {
      get: {
        tags: ['State'],
        summary: 'List state resources',
        description: 'List all resources tracked in the Terraform state.',
        operationId: 'terraformStateList',
        parameters: [
          { name: 'directory', in: 'query', required: true, schema: { type: 'string' }, description: 'Path to Terraform configuration directory' },
        ],
        responses: {
          '200': { description: 'Resource list', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { resources: { type: 'array', items: { type: 'string' } }, count: { type: 'integer' } } } } } } } },
          '400': { description: 'Missing required query param', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/state/show': {
      get: {
        tags: ['State'],
        summary: 'Show state resource',
        description: 'Show detailed information about a single resource in the state.',
        operationId: 'terraformStateShow',
        parameters: [
          { name: 'directory', in: 'query', required: true, schema: { type: 'string' }, description: 'Path to Terraform configuration directory' },
          { name: 'address', in: 'query', required: true, schema: { type: 'string' }, description: 'Resource address in state' },
        ],
        responses: {
          '200': { description: 'Resource state', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required query params', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/state/pull': {
      get: {
        tags: ['State'],
        summary: 'Pull remote state',
        description: 'Pull state from the configured remote backend.',
        operationId: 'terraformStatePull',
        parameters: [
          { name: 'directory', in: 'query', required: true, schema: { type: 'string' }, description: 'Path to Terraform configuration directory' },
        ],
        responses: {
          '200': { description: 'State data', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required query param', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/output': {
      get: {
        tags: ['Core'],
        summary: 'Get output values',
        description: 'Read Terraform output values from the state.',
        operationId: 'terraformOutput',
        parameters: [
          { name: 'directory', in: 'query', required: true, schema: { type: 'string' }, description: 'Path to Terraform configuration directory' },
          { name: 'name', in: 'query', schema: { type: 'string' }, description: 'Specific output name (omit for all)' },
          { name: 'json', in: 'query', schema: { type: 'string', enum: ['true', 'false'], default: 'true' }, description: 'JSON output format' },
        ],
        responses: {
          '200': { description: 'Output values', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required query param', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/show': {
      get: {
        tags: ['Core'],
        summary: 'Show state or plan',
        description: 'Show a human-readable output of a state or plan file.',
        operationId: 'terraformShow',
        parameters: [
          { name: 'directory', in: 'query', required: true, schema: { type: 'string' }, description: 'Path to Terraform configuration directory' },
          { name: 'planFile', in: 'query', schema: { type: 'string' }, description: 'Plan file to show (omit for state)' },
        ],
        responses: {
          '200': { description: 'State/plan data', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required query param', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/graph': {
      get: {
        tags: ['Core'],
        summary: 'Get resource graph',
        description: 'Generate a visual graph of Terraform resources in DOT format.',
        operationId: 'terraformGraph',
        parameters: [
          { name: 'directory', in: 'query', required: true, schema: { type: 'string' }, description: 'Path to Terraform configuration directory' },
          { name: 'type', in: 'query', schema: { type: 'string', enum: ['plan', 'apply'] }, description: 'Graph type' },
        ],
        responses: {
          '200': { description: 'Graph data', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required query param', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/version': {
      get: {
        tags: ['Core'],
        summary: 'Get Terraform version',
        description: 'Return the installed Terraform version information.',
        operationId: 'terraformVersion',
        responses: {
          '200': { description: 'Version info', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/workspace/list': {
      get: {
        tags: ['Workspaces'],
        summary: 'List workspaces',
        description: 'List all Terraform workspaces in the given directory.',
        operationId: 'terraformWorkspaceList',
        parameters: [
          { name: 'directory', in: 'query', required: true, schema: { type: 'string' }, description: 'Path to Terraform configuration directory' },
        ],
        responses: {
          '200': { description: 'Workspace list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required query param', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/workspace/new': {
      post: {
        tags: ['Workspaces'],
        summary: 'Create workspace',
        description: 'Create a new Terraform workspace.',
        operationId: 'terraformWorkspaceNew',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformWorkspaceRequest' } } } },
        responses: {
          '200': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/workspace/select': {
      post: {
        tags: ['Workspaces'],
        summary: 'Select workspace',
        description: 'Switch to an existing Terraform workspace.',
        operationId: 'terraformWorkspaceSelect',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformWorkspaceRequest' } } } },
        responses: {
          '200': { description: 'Selected', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/workspace/delete': {
      delete: {
        tags: ['Workspaces'],
        summary: 'Delete workspace',
        description: 'Delete a Terraform workspace.',
        operationId: 'terraformWorkspaceDelete',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['directory', 'name'], properties: { directory: { type: 'string' }, name: { type: 'string' }, force: { type: 'boolean' } } } } } },
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/taint': {
      post: {
        tags: ['State'],
        summary: 'Taint resource',
        description: 'Mark a resource for forced recreation on next apply.',
        operationId: 'terraformTaint',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformTaintRequest' } } } },
        responses: {
          '200': { description: 'Tainted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/untaint': {
      post: {
        tags: ['State'],
        summary: 'Untaint resource',
        description: 'Remove taint marking from a resource.',
        operationId: 'terraformUntaint',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformTaintRequest' } } } },
        responses: {
          '200': { description: 'Untainted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/terraform/force-unlock': {
      post: {
        tags: ['State'],
        summary: 'Force unlock state',
        description: 'Manually unlock the Terraform state by providing the lock ID.',
        operationId: 'terraformForceUnlock',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TerraformForceUnlockRequest' } } } },
        responses: {
          '200': { description: 'Unlocked', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
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

  logger.info(`Terraform Tools Service HTTP server listening on port ${port}`);

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
