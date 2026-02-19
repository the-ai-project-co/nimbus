import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { router } from './routes';

const SWAGGER_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Nimbus Kubernetes Tools Service API</title>
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
    title: 'Nimbus Kubernetes Tools Service API',
    version: '0.1.0',
    description: 'Kubernetes operations service for Nimbus. Provides HTTP endpoints for managing Kubernetes resources, pods, deployments, namespaces, nodes, and cluster operations via kubectl.',
  },
  servers: [{ url: 'http://localhost:3008', description: 'Local development' }],
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
          service: { type: 'string', example: 'k8s-tools-service' },
          version: { type: 'string', example: '0.1.0' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      KubeCommonParams: {
        type: 'object',
        properties: {
          kubeconfig: { type: 'string', description: 'Path to kubeconfig file' },
          context: { type: 'string', description: 'Kubernetes context to use' },
          namespace: { type: 'string', description: 'Kubernetes namespace' },
        },
      },
      ApplyRequest: {
        type: 'object',
        required: ['manifest'],
        properties: {
          manifest: { type: 'string', description: 'YAML manifest content to apply' },
          namespace: { type: 'string', description: 'Target namespace' },
          dryRun: { type: 'boolean', description: 'Perform a dry run' },
          force: { type: 'boolean', description: 'Force apply' },
          serverSide: { type: 'boolean', description: 'Use server-side apply' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      DeleteRequest: {
        type: 'object',
        required: ['resource'],
        properties: {
          resource: { type: 'string', description: 'Resource type (e.g. pod, deployment)' },
          name: { type: 'string', description: 'Resource name' },
          namespace: { type: 'string', description: 'Target namespace' },
          selector: { type: 'string', description: 'Label selector' },
          force: { type: 'boolean', description: 'Force delete' },
          gracePeriod: { type: 'integer', description: 'Grace period in seconds' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      ExecRequest: {
        type: 'object',
        required: ['pod', 'command'],
        properties: {
          pod: { type: 'string', description: 'Pod name' },
          command: { type: 'array', items: { type: 'string' }, description: 'Command to execute' },
          namespace: { type: 'string' },
          container: { type: 'string', description: 'Container name within the pod' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      ScaleRequest: {
        type: 'object',
        required: ['resource', 'name', 'replicas'],
        properties: {
          resource: { type: 'string', description: 'Resource type (deployment, replicaset, statefulset)' },
          name: { type: 'string', description: 'Resource name' },
          replicas: { type: 'integer', minimum: 0, description: 'Desired replica count' },
          namespace: { type: 'string' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      RolloutRequest: {
        type: 'object',
        required: ['resource', 'name', 'action'],
        properties: {
          resource: { type: 'string', description: 'Resource type' },
          name: { type: 'string', description: 'Resource name' },
          action: { type: 'string', enum: ['status', 'history', 'restart', 'undo', 'pause', 'resume'], description: 'Rollout action' },
          namespace: { type: 'string' },
          revision: { type: 'integer', description: 'Target revision for undo' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      PortForwardRequest: {
        type: 'object',
        required: ['resource', 'name', 'ports'],
        properties: {
          resource: { type: 'string', description: 'Resource type (pod, service)' },
          name: { type: 'string', description: 'Resource name' },
          namespace: { type: 'string' },
          ports: { type: 'array', items: { type: 'string' }, description: 'Port mappings (e.g. 8080:80)' },
          address: { type: 'string', description: 'Local address to bind' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      LabelRequest: {
        type: 'object',
        required: ['resource', 'name', 'labels'],
        properties: {
          resource: { type: 'string' },
          name: { type: 'string' },
          namespace: { type: 'string' },
          labels: { type: 'object', additionalProperties: { type: 'string', nullable: true }, description: 'Labels to set (null value removes label)' },
          overwrite: { type: 'boolean', description: 'Overwrite existing labels' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      AnnotateRequest: {
        type: 'object',
        required: ['resource', 'name', 'annotations'],
        properties: {
          resource: { type: 'string' },
          name: { type: 'string' },
          namespace: { type: 'string' },
          annotations: { type: 'object', additionalProperties: { type: 'string', nullable: true }, description: 'Annotations to set (null value removes)' },
          overwrite: { type: 'boolean' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      PatchRequest: {
        type: 'object',
        required: ['resource', 'name', 'patch'],
        properties: {
          resource: { type: 'string' },
          name: { type: 'string' },
          namespace: { type: 'string' },
          patch: { type: 'object', description: 'Patch content' },
          type: { type: 'string', enum: ['json', 'merge', 'strategic'], description: 'Patch type' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      NodeOperationRequest: {
        type: 'object',
        required: ['nodeName'],
        properties: {
          nodeName: { type: 'string', description: 'Name of the node' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
        },
      },
      DrainRequest: {
        type: 'object',
        required: ['nodeName'],
        properties: {
          nodeName: { type: 'string', description: 'Name of the node to drain' },
          force: { type: 'boolean' },
          ignoreDaemonsets: { type: 'boolean' },
          deleteEmptyDirData: { type: 'boolean' },
          gracePeriod: { type: 'integer' },
          timeout: { type: 'string', description: 'Timeout duration (e.g. 5m)' },
          kubeconfig: { type: 'string' },
          context: { type: 'string' },
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
    '/api/k8s/resources': {
      get: {
        tags: ['Resources'], summary: 'Get resources', description: 'List or get Kubernetes resources by type.',
        operationId: 'getResources',
        parameters: [
          { name: 'resource', in: 'query', required: true, schema: { type: 'string' }, description: 'Resource type (e.g. pods, deployments, services)' },
          { name: 'name', in: 'query', schema: { type: 'string' }, description: 'Specific resource name' },
          { name: 'namespace', in: 'query', schema: { type: 'string' }, description: 'Namespace' },
          { name: 'selector', in: 'query', schema: { type: 'string' }, description: 'Label selector' },
          { name: 'allNamespaces', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'List across all namespaces' },
          { name: 'output', in: 'query', schema: { type: 'string', enum: ['json', 'yaml', 'wide', 'name'], default: 'json' }, description: 'Output format' },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Resource data', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing resource parameter', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/apply': {
      post: {
        tags: ['Resources'], summary: 'Apply manifest', description: 'Apply a YAML manifest to the cluster.',
        operationId: 'applyManifest',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ApplyRequest' } } } },
        responses: {
          '200': { description: 'Applied', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing manifest', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Apply failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/delete': {
      post: {
        tags: ['Resources'], summary: 'Delete resources', description: 'Delete Kubernetes resources by name or selector.',
        operationId: 'deleteResources',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DeleteRequest' } } } },
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Delete failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/logs': {
      get: {
        tags: ['Pods'], summary: 'Get pod logs', description: 'Retrieve logs from a pod container.',
        operationId: 'getPodLogs',
        parameters: [
          { name: 'pod', in: 'query', required: true, schema: { type: 'string' }, description: 'Pod name' },
          { name: 'namespace', in: 'query', schema: { type: 'string' } },
          { name: 'container', in: 'query', schema: { type: 'string' }, description: 'Container name' },
          { name: 'tail', in: 'query', schema: { type: 'integer' }, description: 'Number of lines from end' },
          { name: 'previous', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Get logs from previous container instance' },
          { name: 'since', in: 'query', schema: { type: 'string' }, description: 'Duration (e.g. 5m, 1h)' },
          { name: 'timestamps', in: 'query', schema: { type: 'string', enum: ['true', 'false'] }, description: 'Include timestamps' },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Log output', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing pod parameter', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/exec': {
      post: {
        tags: ['Pods'], summary: 'Execute in pod', description: 'Execute a command inside a running pod.',
        operationId: 'execInPod',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ExecRequest' } } } },
        responses: {
          '200': { description: 'Command output', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Exec failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/describe': {
      get: {
        tags: ['Resources'], summary: 'Describe resource', description: 'Show detailed information about a Kubernetes resource.',
        operationId: 'describeResource',
        parameters: [
          { name: 'resource', in: 'query', required: true, schema: { type: 'string' }, description: 'Resource type' },
          { name: 'name', in: 'query', schema: { type: 'string' }, description: 'Resource name' },
          { name: 'namespace', in: 'query', schema: { type: 'string' } },
          { name: 'selector', in: 'query', schema: { type: 'string' } },
          { name: 'allNamespaces', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Description output', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing resource parameter', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/scale': {
      post: {
        tags: ['Deployments'], summary: 'Scale deployment', description: 'Scale a deployment, replicaset, or statefulset.',
        operationId: 'scaleResource',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ScaleRequest' } } } },
        responses: {
          '200': { description: 'Scaled', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Scale failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/rollout': {
      post: {
        tags: ['Deployments'], summary: 'Manage rollout', description: 'Manage rollouts: status, history, restart, undo, pause, resume.',
        operationId: 'manageRollout',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RolloutRequest' } } } },
        responses: {
          '200': { description: 'Rollout result', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Rollout failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/cluster-info': {
      get: {
        tags: ['Cluster'], summary: 'Cluster info', description: 'Get cluster endpoint and component information.',
        operationId: 'getClusterInfo',
        parameters: [
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Cluster info', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/contexts': {
      get: {
        tags: ['Cluster'], summary: 'List contexts', description: 'List available kubeconfig contexts and current context.',
        operationId: 'listContexts',
        parameters: [{ name: 'kubeconfig', in: 'query', schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Context list', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { contexts: { type: 'array', items: { type: 'string' } }, current: { type: 'string', nullable: true } } } } } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/context': {
      post: {
        tags: ['Cluster'], summary: 'Switch context', description: 'Switch the active Kubernetes context.',
        operationId: 'switchContext',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['context'], properties: { context: { type: 'string', description: 'Context name to switch to' }, kubeconfig: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Switched', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing context', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/namespaces': {
      get: {
        tags: ['Namespaces'], summary: 'List namespaces', operationId: 'listNamespaces',
        parameters: [
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Namespace list', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { namespaces: { type: 'array', items: { type: 'string' } } } } } } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/namespace': {
      post: {
        tags: ['Namespaces'], summary: 'Create namespace', operationId: 'createNamespace',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', description: 'Namespace name' }, kubeconfig: { type: 'string' }, context: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Namespaces'], summary: 'Delete namespace', operationId: 'deleteNamespace',
        parameters: [
          { name: 'name', in: 'query', required: true, schema: { type: 'string' }, description: 'Namespace name' },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Deleted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing name', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/events': {
      get: {
        tags: ['Resources'], summary: 'Get events', description: 'Get Kubernetes events, optionally filtered by namespace or field selector.',
        operationId: 'getEvents',
        parameters: [
          { name: 'namespace', in: 'query', schema: { type: 'string' } },
          { name: 'fieldSelector', in: 'query', schema: { type: 'string' }, description: 'Field selector filter' },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Event list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/top/pods': {
      get: {
        tags: ['Pods'], summary: 'Pod resource usage', description: 'Get CPU and memory usage for pods (requires metrics-server).',
        operationId: 'topPods',
        parameters: [
          { name: 'namespace', in: 'query', schema: { type: 'string' } },
          { name: 'selector', in: 'query', schema: { type: 'string' } },
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Pod metrics', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/top/nodes': {
      get: {
        tags: ['Nodes'], summary: 'Node resource usage', description: 'Get CPU and memory usage for nodes (requires metrics-server).',
        operationId: 'topNodes',
        parameters: [
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Node metrics', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/version': {
      get: {
        tags: ['Cluster'], summary: 'Kubernetes version', description: 'Get the Kubernetes client and server version.',
        operationId: 'getVersion',
        parameters: [
          { name: 'kubeconfig', in: 'query', schema: { type: 'string' } },
          { name: 'context', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Version info', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/port-forward': {
      post: {
        tags: ['Pods'], summary: 'Port forward', description: 'Start port forwarding to a pod or service.',
        operationId: 'portForward',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PortForwardRequest' } } } },
        responses: {
          '200': { description: 'Port forward started', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/label': {
      post: {
        tags: ['Resources'], summary: 'Label resource', description: 'Add or update labels on a Kubernetes resource.',
        operationId: 'labelResource',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LabelRequest' } } } },
        responses: {
          '200': { description: 'Labeled', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/annotate': {
      post: {
        tags: ['Resources'], summary: 'Annotate resource', description: 'Add or update annotations on a Kubernetes resource.',
        operationId: 'annotateResource',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AnnotateRequest' } } } },
        responses: {
          '200': { description: 'Annotated', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/patch': {
      post: {
        tags: ['Resources'], summary: 'Patch resource', description: 'Patch a Kubernetes resource using JSON, merge, or strategic merge patch.',
        operationId: 'patchResource',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PatchRequest' } } } },
        responses: {
          '200': { description: 'Patched', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/node/cordon': {
      post: {
        tags: ['Nodes'], summary: 'Cordon node', description: 'Mark a node as unschedulable.',
        operationId: 'cordonNode',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NodeOperationRequest' } } } },
        responses: {
          '200': { description: 'Cordoned', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing nodeName', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/node/uncordon': {
      post: {
        tags: ['Nodes'], summary: 'Uncordon node', description: 'Mark a node as schedulable.',
        operationId: 'uncordonNode',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NodeOperationRequest' } } } },
        responses: {
          '200': { description: 'Uncordoned', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing nodeName', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/k8s/node/drain': {
      post: {
        tags: ['Nodes'], summary: 'Drain node', description: 'Safely evict all pods from a node.',
        operationId: 'drainNode',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DrainRequest' } } } },
        responses: {
          '200': { description: 'Drained', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing nodeName', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
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

  logger.info(`Kubernetes Tools Service HTTP server listening on port ${port}`);

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
