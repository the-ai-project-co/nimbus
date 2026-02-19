import { logger, serviceAuthMiddleware, SimpleRateLimiter, rateLimitMiddleware } from '@nimbus/shared-utils';
import { router } from './routes';
import { createWebSocketServer } from './websocket';

export interface ServerOptions {
  httpPort: number;
  wsPort?: number;
  enableWebSocket?: boolean;
}

export interface ServerInstances {
  http: ReturnType<typeof Bun.serve>;
  ws?: ReturnType<typeof Bun.serve>;
  stop: () => void;
}

const SWAGGER_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Nimbus AWS Tools Service API</title>
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
    title: 'Nimbus AWS Tools Service API',
    version: '0.1.0',
    description: 'AWS operations service for Nimbus. Provides HTTP endpoints for managing AWS infrastructure including EC2 instances, S3 buckets and objects, IAM users/roles/policies, CloudFormation stacks, VPC resources, and infrastructure discovery with Terraform generation.',
  },
  servers: [{ url: 'http://localhost:3006', description: 'Local development' }],
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
          service: { type: 'string', example: 'aws-tools-service' },
          version: { type: 'string', example: '0.1.0' },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      RegionParam: {
        type: 'object',
        properties: {
          region: { type: 'string', description: 'AWS region (e.g. us-east-1)' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'], summary: 'Health check', operationId: 'healthCheck',
        responses: { '200': { description: 'Healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } } },
      },
    },
    // ========== EC2 ==========
    '/api/aws/ec2/instances': {
      get: {
        tags: ['EC2'], summary: 'List EC2 instances', operationId: 'listInstances',
        parameters: [
          { name: 'instanceIds', in: 'query', schema: { type: 'string' }, description: 'Comma-separated instance IDs' },
          { name: 'maxResults', in: 'query', schema: { type: 'integer' } },
          { name: 'nextToken', in: 'query', schema: { type: 'string' }, description: 'Pagination token' },
          { name: 'region', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Instance list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/aws/ec2/instances/start': {
      post: {
        tags: ['EC2'], summary: 'Start EC2 instances', operationId: 'startInstances',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['instanceIds'], properties: { instanceIds: { type: 'array', items: { type: 'string' } }, region: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Started', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing instanceIds', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/aws/ec2/instances/stop': {
      post: {
        tags: ['EC2'], summary: 'Stop EC2 instances', operationId: 'stopInstances',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['instanceIds'], properties: { instanceIds: { type: 'array', items: { type: 'string' } }, force: { type: 'boolean' }, region: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Stopped', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing instanceIds', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/aws/ec2/instances/reboot': {
      post: {
        tags: ['EC2'], summary: 'Reboot EC2 instances', operationId: 'rebootInstances',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['instanceIds'], properties: { instanceIds: { type: 'array', items: { type: 'string' } }, region: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Rebooted', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing instanceIds', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/aws/ec2/instances/terminate': {
      post: {
        tags: ['EC2'], summary: 'Terminate EC2 instances', operationId: 'terminateInstances',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['instanceIds'], properties: { instanceIds: { type: 'array', items: { type: 'string' } }, region: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Terminated', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing instanceIds', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/aws/ec2/instances/run': {
      post: {
        tags: ['EC2'], summary: 'Run new EC2 instances', operationId: 'runInstances',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['imageId', 'instanceType'], properties: { imageId: { type: 'string', description: 'AMI ID' }, instanceType: { type: 'string', description: 'Instance type (e.g. t3.micro)' }, minCount: { type: 'integer', default: 1 }, maxCount: { type: 'integer', default: 1 }, keyName: { type: 'string' }, securityGroupIds: { type: 'array', items: { type: 'string' } }, subnetId: { type: 'string' }, userData: { type: 'string' }, tags: { type: 'object', additionalProperties: { type: 'string' } }, region: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'Instances launched', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } },
          '400': { description: 'Missing required fields', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          '500': { description: 'Failed', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/aws/ec2/instance/start': { post: { tags: ['EC2'], summary: 'Start single instance', operationId: 'startInstance', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['instanceId'], properties: { instanceId: { type: 'string' }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Started' }, '400': { description: 'Missing instanceId' }, '500': { description: 'Failed' } } } },
    '/api/aws/ec2/instance/stop': { post: { tags: ['EC2'], summary: 'Stop single instance', operationId: 'stopInstance', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['instanceId'], properties: { instanceId: { type: 'string' }, force: { type: 'boolean' }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Stopped' }, '400': { description: 'Missing instanceId' }, '500': { description: 'Failed' } } } },
    '/api/aws/ec2/instance/terminate': { post: { tags: ['EC2'], summary: 'Terminate single instance', operationId: 'terminateInstance', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['instanceId'], properties: { instanceId: { type: 'string' }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Terminated' }, '400': { description: 'Missing instanceId' }, '500': { description: 'Failed' } } } },
    '/api/aws/ec2/instance/modify-attribute': { post: { tags: ['EC2'], summary: 'Modify instance attribute', operationId: 'modifyInstanceAttribute', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['instanceId', 'attribute', 'value'], properties: { instanceId: { type: 'string' }, attribute: { type: 'string' }, value: { type: 'string' }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Modified' }, '400': { description: 'Missing fields' }, '500': { description: 'Failed' } } } },
    '/api/aws/ec2/regions': { get: { tags: ['EC2'], summary: 'List AWS regions', operationId: 'listRegions', parameters: [{ name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Region list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed' } } } },
    '/api/aws/ec2/vpcs': { get: { tags: ['VPC'], summary: 'List VPCs', operationId: 'listVpcs', parameters: [{ name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'VPC list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed' } } } },
    '/api/aws/ec2/subnets': { get: { tags: ['VPC'], summary: 'List subnets', operationId: 'listSubnets', parameters: [{ name: 'vpcId', in: 'query', schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Subnet list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed' } } } },
    '/api/aws/ec2/security-groups': { get: { tags: ['VPC'], summary: 'List security groups', operationId: 'listSecurityGroups', parameters: [{ name: 'vpcId', in: 'query', schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Security group list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed' } } } },
    '/api/aws/ec2/security-groups/describe': { post: { tags: ['VPC'], summary: 'Describe security groups with filters', operationId: 'describeSecurityGroups', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { filters: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Security group details' }, '500': { description: 'Failed' } } } },
    // ========== S3 ==========
    '/api/aws/s3/buckets': { get: { tags: ['S3'], summary: 'List S3 buckets', operationId: 'listBuckets', parameters: [{ name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Bucket list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed' } } } },
    '/api/aws/s3/objects': { get: { tags: ['S3'], summary: 'List S3 objects', operationId: 'listObjects', parameters: [{ name: 'bucket', in: 'query', required: true, schema: { type: 'string' } }, { name: 'prefix', in: 'query', schema: { type: 'string' } }, { name: 'delimiter', in: 'query', schema: { type: 'string' } }, { name: 'maxKeys', in: 'query', schema: { type: 'integer' } }, { name: 'continuationToken', in: 'query', schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Object list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '400': { description: 'Missing bucket' }, '500': { description: 'Failed' } } } },
    '/api/aws/s3/object': {
      get: { tags: ['S3'], summary: 'Get S3 object', operationId: 'getObject', parameters: [{ name: 'bucket', in: 'query', required: true, schema: { type: 'string' } }, { name: 'key', in: 'query', required: true, schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Object data', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '400': { description: 'Missing bucket/key' }, '500': { description: 'Failed' } } },
      post: { tags: ['S3'], summary: 'Put S3 object', operationId: 'putObject', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['bucket', 'key', 'body'], properties: { bucket: { type: 'string' }, key: { type: 'string' }, body: { type: 'string' }, contentType: { type: 'string' }, metadata: { type: 'object', additionalProperties: { type: 'string' } }, tags: { type: 'object', additionalProperties: { type: 'string' } }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Put result' }, '400': { description: 'Missing fields' }, '500': { description: 'Failed' } } },
      delete: { tags: ['S3'], summary: 'Delete S3 object', operationId: 'deleteObject', parameters: [{ name: 'bucket', in: 'query', required: true, schema: { type: 'string' } }, { name: 'key', in: 'query', required: true, schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' }, '400': { description: 'Missing bucket/key' }, '500': { description: 'Failed' } } },
    },
    '/api/aws/s3/object/copy': { post: { tags: ['S3'], summary: 'Copy S3 object', operationId: 'copyObject', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['sourceBucket', 'sourceKey', 'destinationBucket', 'destinationKey'], properties: { sourceBucket: { type: 'string' }, sourceKey: { type: 'string' }, destinationBucket: { type: 'string' }, destinationKey: { type: 'string' }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Copied' }, '400': { description: 'Missing fields' }, '500': { description: 'Failed' } } } },
    '/api/aws/s3/bucket': {
      post: { tags: ['S3'], summary: 'Create S3 bucket', operationId: 'createBucket', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['bucket'], properties: { bucket: { type: 'string' }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Created' }, '400': { description: 'Missing bucket' }, '500': { description: 'Failed' } } },
      delete: { tags: ['S3'], summary: 'Delete S3 bucket', operationId: 'deleteBucket', parameters: [{ name: 'bucket', in: 'query', required: true, schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' }, '400': { description: 'Missing bucket' }, '500': { description: 'Failed' } } },
    },
    // ========== IAM ==========
    '/api/aws/iam/users': { get: { tags: ['IAM'], summary: 'List IAM users', operationId: 'listUsers', parameters: [{ name: 'maxItems', in: 'query', schema: { type: 'integer' } }, { name: 'marker', in: 'query', schema: { type: 'string' } }, { name: 'pathPrefix', in: 'query', schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'User list', content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } } }, '500': { description: 'Failed' } } } },
    '/api/aws/iam/user': {
      get: { tags: ['IAM'], summary: 'Get IAM user', operationId: 'getUser', parameters: [{ name: 'userName', in: 'query', schema: { type: 'string' }, description: 'User name (omit for current)' }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'User info' }, '500': { description: 'Failed' } } },
      post: { tags: ['IAM'], summary: 'Create IAM user', operationId: 'createUser', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userName'], properties: { userName: { type: 'string' }, path: { type: 'string' }, tags: { type: 'object', additionalProperties: { type: 'string' } }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Created' }, '400': { description: 'Missing userName' }, '500': { description: 'Failed' } } },
      delete: { tags: ['IAM'], summary: 'Delete IAM user', operationId: 'deleteUser', parameters: [{ name: 'userName', in: 'query', required: true, schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' }, '400': { description: 'Missing userName' }, '500': { description: 'Failed' } } },
    },
    '/api/aws/iam/roles': { get: { tags: ['IAM'], summary: 'List IAM roles', operationId: 'listRoles', parameters: [{ name: 'maxItems', in: 'query', schema: { type: 'integer' } }, { name: 'marker', in: 'query', schema: { type: 'string' } }, { name: 'pathPrefix', in: 'query', schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Role list' }, '500': { description: 'Failed' } } } },
    '/api/aws/iam/role': {
      get: { tags: ['IAM'], summary: 'Get IAM role', operationId: 'getRole', parameters: [{ name: 'roleName', in: 'query', required: true, schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Role info' }, '400': { description: 'Missing roleName' }, '500': { description: 'Failed' } } },
      post: { tags: ['IAM'], summary: 'Create IAM role', operationId: 'createRole', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['roleName', 'assumeRolePolicyDocument'], properties: { roleName: { type: 'string' }, assumeRolePolicyDocument: { type: 'string', description: 'Trust policy JSON' }, description: { type: 'string' }, path: { type: 'string' }, maxSessionDuration: { type: 'integer' }, tags: { type: 'object', additionalProperties: { type: 'string' } }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Created' }, '400': { description: 'Missing fields' }, '500': { description: 'Failed' } } },
    },
    '/api/aws/iam/policy': { post: { tags: ['IAM'], summary: 'Create IAM policy', operationId: 'createPolicy', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['policyName', 'policyDocument'], properties: { policyName: { type: 'string' }, policyDocument: { type: 'string', description: 'Policy JSON document' }, description: { type: 'string' }, path: { type: 'string' }, tags: { type: 'object', additionalProperties: { type: 'string' } }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Created' }, '400': { description: 'Missing fields' }, '500': { description: 'Failed' } } } },
    '/api/aws/iam/role/attach-policy': { post: { tags: ['IAM'], summary: 'Attach policy to role', operationId: 'attachRolePolicy', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['roleName', 'policyArn'], properties: { roleName: { type: 'string' }, policyArn: { type: 'string' }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Attached' }, '400': { description: 'Missing fields' }, '500': { description: 'Failed' } } } },
    '/api/aws/iam/policies': { get: { tags: ['IAM'], summary: 'List IAM policies', operationId: 'listPolicies', parameters: [{ name: 'maxItems', in: 'query', schema: { type: 'integer' } }, { name: 'marker', in: 'query', schema: { type: 'string' } }, { name: 'scope', in: 'query', schema: { type: 'string', enum: ['All', 'AWS', 'Local'] } }, { name: 'onlyAttached', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Policy list' }, '500': { description: 'Failed' } } } },
    '/api/aws/iam/groups': { get: { tags: ['IAM'], summary: 'List IAM groups', operationId: 'listGroups', parameters: [{ name: 'maxItems', in: 'query', schema: { type: 'integer' } }, { name: 'marker', in: 'query', schema: { type: 'string' } }, { name: 'pathPrefix', in: 'query', schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Group list' }, '500': { description: 'Failed' } } } },
    // ========== CloudFormation ==========
    '/api/aws/cloudformation/stacks': {
      get: { tags: ['CloudFormation'], summary: 'Describe stacks', operationId: 'describeStacks', parameters: [{ name: 'stackName', in: 'query', schema: { type: 'string' }, description: 'Stack name (omit for all)' }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Stack details' }, '500': { description: 'Failed' } } },
      post: { tags: ['CloudFormation'], summary: 'Create stack', operationId: 'createStack', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['stackName', 'templateBody'], properties: { stackName: { type: 'string' }, templateBody: { type: 'string' }, parameters: { type: 'object', additionalProperties: { type: 'string' } }, capabilities: { type: 'array', items: { type: 'string' } }, tags: { type: 'object', additionalProperties: { type: 'string' } }, timeoutInMinutes: { type: 'integer' }, onFailure: { type: 'string', enum: ['DO_NOTHING', 'ROLLBACK', 'DELETE'] }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Created' }, '400': { description: 'Missing fields' }, '500': { description: 'Failed' } } },
      put: { tags: ['CloudFormation'], summary: 'Update stack', operationId: 'updateStack', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['stackName', 'templateBody'], properties: { stackName: { type: 'string' }, templateBody: { type: 'string' }, parameters: { type: 'object', additionalProperties: { type: 'string' } }, capabilities: { type: 'array', items: { type: 'string' } }, tags: { type: 'object', additionalProperties: { type: 'string' } }, region: { type: 'string' } } } } } }, responses: { '200': { description: 'Updated' }, '400': { description: 'Missing fields' }, '500': { description: 'Failed' } } },
      delete: { tags: ['CloudFormation'], summary: 'Delete stack', operationId: 'deleteStack', parameters: [{ name: 'stackName', in: 'query', required: true, schema: { type: 'string' } }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' }, '400': { description: 'Missing stackName' }, '500': { description: 'Failed' } } },
    },
    '/api/aws/cloudformation/stacks/list': { get: { tags: ['CloudFormation'], summary: 'List stacks with status filter', operationId: 'listStacks', parameters: [{ name: 'statusFilter', in: 'query', schema: { type: 'string' }, description: 'Comma-separated status values' }, { name: 'region', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Stack list' }, '500': { description: 'Failed' } } } },
    // ========== Discovery ==========
    '/api/aws/profiles': { get: { tags: ['Discovery'], summary: 'List AWS profiles', operationId: 'listProfiles', responses: { '200': { description: 'Profile list' }, '500': { description: 'Failed' } } } },
    '/api/aws/profiles/validate': { post: { tags: ['Discovery'], summary: 'Validate AWS profile credentials', operationId: 'validateProfile', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { profile: { type: 'string' } } } } } }, responses: { '200': { description: 'Validation result' }, '500': { description: 'Failed' } } } },
    '/api/aws/regions': { get: { tags: ['Discovery'], summary: 'List available regions', operationId: 'listDiscoveryRegions', parameters: [{ name: 'profile', in: 'query', schema: { type: 'string' } }, { name: 'enabledOnly', in: 'query', schema: { type: 'string', enum: ['true', 'false'], default: 'true' } }, { name: 'grouped', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } }], responses: { '200': { description: 'Region list' }, '500': { description: 'Failed' } } } },
    '/api/aws/regions/validate': { post: { tags: ['Discovery'], summary: 'Validate regions', operationId: 'validateRegions', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['regions'], properties: { regions: { type: 'array', items: { type: 'string' } }, profile: { type: 'string' } } } } } }, responses: { '200': { description: 'Validation result' }, '400': { description: 'Missing regions' }, '500': { description: 'Failed' } } } },
    '/api/aws/discover': { post: { tags: ['Discovery'], summary: 'Start infrastructure discovery', operationId: 'startDiscovery', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['regions'], properties: { profile: { type: 'string' }, regions: { oneOf: [{ type: 'array', items: { type: 'string' } }, { type: 'string', enum: ['all'] }] }, excludeRegions: { type: 'array', items: { type: 'string' } }, services: { type: 'array', items: { type: 'string' } }, excludeServices: { type: 'array', items: { type: 'string' } } } } } } }, responses: { '200': { description: 'Discovery started with session ID' }, '400': { description: 'Missing regions' }, '500': { description: 'Failed' } } } },
    '/api/aws/discover/{sessionId}': { get: { tags: ['Discovery'], summary: 'Get discovery status', operationId: 'getDiscoveryStatus', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Discovery progress and results' }, '404': { description: 'Session not found' }, '500': { description: 'Failed' } } } },
    '/api/aws/discover/{sessionId}/cancel': { post: { tags: ['Discovery'], summary: 'Cancel discovery', operationId: 'cancelDiscovery', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Cancelled' }, '400': { description: 'Cannot cancel' }, '500': { description: 'Failed' } } } },
    // ========== Terraform Generation ==========
    '/api/aws/terraform/supported-types': { get: { tags: ['Terraform'], summary: 'Get supported AWS resource types for Terraform generation', operationId: 'getSupportedTypes', responses: { '200': { description: 'Supported types list' }, '500': { description: 'Failed' } } } },
    '/api/aws/terraform/generate': { post: { tags: ['Terraform'], summary: 'Generate Terraform from discovery session', operationId: 'generateTerraform', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['sessionId'], properties: { sessionId: { type: 'string', description: 'Discovery session ID' }, options: { type: 'object', properties: { outputDir: { type: 'string' }, generateImportBlocks: { type: 'boolean' }, generateImportScript: { type: 'boolean' }, organizeByService: { type: 'boolean' }, terraformVersion: { type: 'string' }, awsProviderVersion: { type: 'string' } } } } } } } }, responses: { '200': { description: 'Generated files summary' }, '400': { description: 'Invalid session' }, '404': { description: 'Session not found' }, '500': { description: 'Failed' } } } },
    '/api/aws/terraform/generate-direct': { post: { tags: ['Terraform'], summary: 'Generate Terraform from provided resources', operationId: 'generateTerraformDirect', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['resources'], properties: { resources: { type: 'array', items: { type: 'object', required: ['id', 'type', 'region'], properties: { id: { type: 'string' }, type: { type: 'string', description: 'Terraform resource type (e.g. aws_instance)' }, arn: { type: 'string' }, region: { type: 'string' }, name: { type: 'string' }, tags: { type: 'object', additionalProperties: { type: 'string' } }, properties: { type: 'object' } } } }, options: { type: 'object', properties: { outputDir: { type: 'string' }, generateImportBlocks: { type: 'boolean' }, generateImportScript: { type: 'boolean' }, organizeByService: { type: 'boolean' }, terraformVersion: { type: 'string' }, awsProviderVersion: { type: 'string' }, defaultRegion: { type: 'string' } } } } } } } }, responses: { '200': { description: 'Generated Terraform files' }, '400': { description: 'Missing resources' }, '500': { description: 'Failed' } } } },
  },
};

const limiter = new SimpleRateLimiter({ requestsPerMinute: 120 });
const checkRateLimit = rateLimitMiddleware(limiter);

export async function startServer(portOrOptions: number | ServerOptions): Promise<ServerInstances> {
  const options: ServerOptions = typeof portOrOptions === 'number'
    ? { httpPort: portOrOptions, enableWebSocket: false }
    : portOrOptions;

  const { httpPort, wsPort, enableWebSocket = false } = options;

  // Start HTTP server
  const httpServer = Bun.serve({
    port: httpPort,
    async fetch(req) {
      const url = new URL(req.url);

      // Swagger UI
      if (url.pathname === '/swagger' || url.pathname === '/swagger/') {
        return new Response(SWAGGER_HTML, { headers: { 'Content-Type': 'text/html' } });
      }

      // OpenAPI spec
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

  logger.info(`AWS Tools Service HTTP server listening on port ${httpPort}`);

  // Optionally start WebSocket server
  let wsServer: ReturnType<typeof Bun.serve> | undefined;
  if (enableWebSocket && wsPort) {
    wsServer = createWebSocketServer(wsPort);
  }

  const instances: ServerInstances = {
    http: httpServer,
    ws: wsServer,
    stop: () => {
      httpServer.stop();
      if (wsServer) {
        wsServer.stop();
      }
    },
  };

  // Graceful shutdown handlers
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    instances.stop();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down...');
    instances.stop();
    process.exit(0);
  });

  return instances;
}
