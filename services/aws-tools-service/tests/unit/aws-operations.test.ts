import { describe, test, expect, mock, beforeEach } from 'bun:test';

/**
 * Unit tests for AWS SDK operations (Gap 3)
 *
 * These tests mock the AWS SDK client send method to verify
 * that each operation correctly constructs commands, handles
 * responses, and manages errors.
 */

// ==================== EC2 Operations Tests ====================

describe('EC2Operations', () => {
  let EC2Operations: any;
  let mockSend: ReturnType<typeof mock>;

  beforeEach(async () => {
    mockSend = mock(() => Promise.resolve({}));
    const mod = await import('../../src/aws/ec2');
    EC2Operations = mod.EC2Operations;
  });

  function createEc2WithMock(mockResponse: any = {}) {
    mockSend = mock(() => Promise.resolve(mockResponse));
    const ec2 = new EC2Operations({ region: 'us-east-1' });
    (ec2 as any).client = { send: mockSend };
    return ec2;
  }

  describe('startInstance', () => {
    test('should start a single instance', async () => {
      const ec2 = createEc2WithMock({
        StartingInstances: [{
          InstanceId: 'i-12345',
          PreviousState: { Name: 'stopped' },
          CurrentState: { Name: 'pending' },
        }],
      });

      const result = await ec2.startInstance('i-12345');
      expect(result.success).toBe(true);
      expect(result.data.instances).toHaveLength(1);
      expect(result.data.instances[0].instanceId).toBe('i-12345');
      expect(result.data.instances[0].previousState).toBe('stopped');
      expect(result.data.instances[0].currentState).toBe('pending');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Instance not found')));
      const ec2 = new EC2Operations({ region: 'us-east-1' });
      (ec2 as any).client = { send: mockSend };

      const result = await ec2.startInstance('i-nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Instance not found');
    });
  });

  describe('stopInstance', () => {
    test('should stop a single instance', async () => {
      const ec2 = createEc2WithMock({
        StoppingInstances: [{
          InstanceId: 'i-12345',
          PreviousState: { Name: 'running' },
          CurrentState: { Name: 'stopping' },
        }],
      });

      const result = await ec2.stopInstance('i-12345');
      expect(result.success).toBe(true);
      expect(result.data.instances).toHaveLength(1);
      expect(result.data.instances[0].instanceId).toBe('i-12345');
      expect(result.data.instances[0].previousState).toBe('running');
      expect(result.data.instances[0].currentState).toBe('stopping');
    });

    test('should support force stop', async () => {
      const ec2 = createEc2WithMock({
        StoppingInstances: [{
          InstanceId: 'i-12345',
          PreviousState: { Name: 'running' },
          CurrentState: { Name: 'stopping' },
        }],
      });

      const result = await ec2.stopInstance('i-12345', true);
      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Stop failed')));
      const ec2 = new EC2Operations({ region: 'us-east-1' });
      (ec2 as any).client = { send: mockSend };

      const result = await ec2.stopInstance('i-12345');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Stop failed');
    });
  });

  describe('terminateInstance', () => {
    test('should terminate a single instance', async () => {
      const ec2 = createEc2WithMock({
        TerminatingInstances: [{
          InstanceId: 'i-12345',
          PreviousState: { Name: 'running' },
          CurrentState: { Name: 'shutting-down' },
        }],
      });

      const result = await ec2.terminateInstance('i-12345');
      expect(result.success).toBe(true);
      expect(result.data.instances).toHaveLength(1);
      expect(result.data.instances[0].instanceId).toBe('i-12345');
      expect(result.data.instances[0].currentState).toBe('shutting-down');
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Termination protection enabled')));
      const ec2 = new EC2Operations({ region: 'us-east-1' });
      (ec2 as any).client = { send: mockSend };

      const result = await ec2.terminateInstance('i-12345');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Termination protection enabled');
    });
  });

  describe('describeSecurityGroups', () => {
    test('should describe security groups without filters', async () => {
      const ec2 = createEc2WithMock({
        SecurityGroups: [{
          GroupId: 'sg-12345',
          GroupName: 'test-sg',
          Description: 'Test security group',
          VpcId: 'vpc-12345',
          OwnerId: '123456789012',
          IpPermissions: [{
            IpProtocol: 'tcp',
            FromPort: 443,
            ToPort: 443,
            IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTPS' }],
          }],
          IpPermissionsEgress: [{
            IpProtocol: '-1',
            IpRanges: [{ CidrIp: '0.0.0.0/0' }],
          }],
          Tags: [{ Key: 'Name', Value: 'my-sg' }],
        }],
      });

      const result = await ec2.describeSecurityGroups();
      expect(result.success).toBe(true);
      expect(result.data.securityGroups).toHaveLength(1);

      const sg = result.data.securityGroups[0];
      expect(sg.groupId).toBe('sg-12345');
      expect(sg.groupName).toBe('test-sg');
      expect(sg.vpcId).toBe('vpc-12345');
      expect(sg.ownerId).toBe('123456789012');
      expect(sg.inboundRules).toHaveLength(1);
      expect(sg.inboundRules[0].protocol).toBe('tcp');
      expect(sg.inboundRules[0].fromPort).toBe(443);
      expect(sg.outboundRules).toHaveLength(1);
      expect(sg.tags).toEqual({ Name: 'my-sg' });
    });

    test('should describe security groups with filters', async () => {
      const ec2 = createEc2WithMock({
        SecurityGroups: [{
          GroupId: 'sg-99999',
          GroupName: 'web-sg',
          Description: 'Web tier',
          VpcId: 'vpc-99999',
        }],
      });

      const result = await ec2.describeSecurityGroups({
        'group-name': ['web-sg'],
      });
      expect(result.success).toBe(true);
      expect(result.data.securityGroups).toHaveLength(1);
      expect(result.data.securityGroups[0].groupId).toBe('sg-99999');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Access denied')));
      const ec2 = new EC2Operations({ region: 'us-east-1' });
      (ec2 as any).client = { send: mockSend };

      const result = await ec2.describeSecurityGroups();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Access denied');
    });
  });

  describe('modifyInstanceAttribute', () => {
    test('should modify instanceType attribute', async () => {
      const ec2 = createEc2WithMock({});

      const result = await ec2.modifyInstanceAttribute('i-12345', 'instanceType', 't3.large');
      expect(result.success).toBe(true);
      expect(result.data.instanceId).toBe('i-12345');
      expect(result.data.attribute).toBe('instanceType');
      expect(result.data.value).toBe('t3.large');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should modify disableApiTermination attribute', async () => {
      const ec2 = createEc2WithMock({});

      const result = await ec2.modifyInstanceAttribute('i-12345', 'disableApiTermination', 'true');
      expect(result.success).toBe(true);
      expect(result.data.attribute).toBe('disableApiTermination');
    });

    test('should modify sourceDestCheck attribute', async () => {
      const ec2 = createEc2WithMock({});

      const result = await ec2.modifyInstanceAttribute('i-12345', 'sourceDestCheck', 'false');
      expect(result.success).toBe(true);
      expect(result.data.attribute).toBe('sourceDestCheck');
    });

    test('should modify ebsOptimized attribute', async () => {
      const ec2 = createEc2WithMock({});

      const result = await ec2.modifyInstanceAttribute('i-12345', 'ebsOptimized', 'true');
      expect(result.success).toBe(true);
    });

    test('should reject unsupported attributes', async () => {
      const ec2 = createEc2WithMock({});

      const result = await ec2.modifyInstanceAttribute('i-12345', 'unsupportedAttr', 'value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported attribute');
    });

    test('should handle API errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Instance must be stopped')));
      const ec2 = new EC2Operations({ region: 'us-east-1' });
      (ec2 as any).client = { send: mockSend };

      const result = await ec2.modifyInstanceAttribute('i-12345', 'instanceType', 't3.large');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Instance must be stopped');
    });
  });

  describe('startInstances (batch)', () => {
    test('should start multiple instances', async () => {
      const ec2 = createEc2WithMock({
        StartingInstances: [
          { InstanceId: 'i-111', PreviousState: { Name: 'stopped' }, CurrentState: { Name: 'pending' } },
          { InstanceId: 'i-222', PreviousState: { Name: 'stopped' }, CurrentState: { Name: 'pending' } },
        ],
      });

      const result = await ec2.startInstances(['i-111', 'i-222']);
      expect(result.success).toBe(true);
      expect(result.data.instances).toHaveLength(2);
    });
  });
});

// ==================== S3 Operations Tests ====================

describe('S3Operations', () => {
  let S3Operations: any;
  let mockSend: ReturnType<typeof mock>;

  beforeEach(async () => {
    const mod = await import('../../src/aws/s3');
    S3Operations = mod.S3Operations;
  });

  function createS3WithMock(mockResponse: any = {}) {
    mockSend = mock(() => Promise.resolve(mockResponse));
    const s3 = new S3Operations({ region: 'us-east-1' });
    (s3 as any).client = { send: mockSend };
    return s3;
  }

  describe('putObject', () => {
    test('should put an object to a bucket', async () => {
      const s3 = createS3WithMock({
        ETag: '"abc123"',
        VersionId: 'v1',
      });

      const result = await s3.putObject({
        bucket: 'my-bucket',
        key: 'test/file.txt',
        body: 'Hello, World!',
        contentType: 'text/plain',
      });

      expect(result.success).toBe(true);
      expect(result.data.etag).toBe('"abc123"');
      expect(result.data.versionId).toBe('v1');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should put object with metadata and tags', async () => {
      const s3 = createS3WithMock({ ETag: '"def456"' });

      const result = await s3.putObject({
        bucket: 'my-bucket',
        key: 'data.json',
        body: '{"key":"value"}',
        contentType: 'application/json',
        metadata: { author: 'test' },
        tags: { env: 'staging' },
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Access Denied')));
      const s3 = new S3Operations({ region: 'us-east-1' });
      (s3 as any).client = { send: mockSend };

      const result = await s3.putObject({
        bucket: 'my-bucket',
        key: 'file.txt',
        body: 'data',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Access Denied');
    });
  });

  describe('getObject', () => {
    test('should get an object from a bucket', async () => {
      const s3 = createS3WithMock({
        Body: { transformToString: () => Promise.resolve('Hello, World!') },
        ContentType: 'text/plain',
        ContentLength: 13,
        LastModified: new Date('2025-01-01'),
        ETag: '"abc123"',
        Metadata: { author: 'test' },
      });

      const result = await s3.getObject('my-bucket', 'test/file.txt');
      expect(result.success).toBe(true);
      expect(result.data.body).toBe('Hello, World!');
      expect(result.data.contentType).toBe('text/plain');
      expect(result.data.contentLength).toBe(13);
      expect(result.data.metadata).toEqual({ author: 'test' });
    });

    test('should handle not found errors', async () => {
      mockSend = mock(() => Promise.reject(new Error('NoSuchKey')));
      const s3 = new S3Operations({ region: 'us-east-1' });
      (s3 as any).client = { send: mockSend };

      const result = await s3.getObject('my-bucket', 'missing.txt');
      expect(result.success).toBe(false);
      expect(result.error).toBe('NoSuchKey');
    });
  });

  describe('deleteObject', () => {
    test('should delete an object from a bucket', async () => {
      const s3 = createS3WithMock({
        DeleteMarker: false,
        VersionId: 'v1',
      });

      const result = await s3.deleteObject('my-bucket', 'test/file.txt');
      expect(result.success).toBe(true);
      expect(result.data.deleteMarker).toBe(false);
      expect(result.data.versionId).toBe('v1');
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Bucket not found')));
      const s3 = new S3Operations({ region: 'us-east-1' });
      (s3 as any).client = { send: mockSend };

      const result = await s3.deleteObject('missing-bucket', 'file.txt');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Bucket not found');
    });
  });

  describe('copyObject', () => {
    test('should copy an object between buckets', async () => {
      const s3 = createS3WithMock({
        CopyObjectResult: {
          ETag: '"copy123"',
          LastModified: new Date('2025-01-15'),
        },
      });

      const result = await s3.copyObject({
        sourceBucket: 'source-bucket',
        sourceKey: 'source/file.txt',
        destinationBucket: 'dest-bucket',
        destinationKey: 'dest/file.txt',
      });

      expect(result.success).toBe(true);
      expect(result.data.etag).toBe('"copy123"');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Source not found')));
      const s3 = new S3Operations({ region: 'us-east-1' });
      (s3 as any).client = { send: mockSend };

      const result = await s3.copyObject({
        sourceBucket: 'source',
        sourceKey: 'missing.txt',
        destinationBucket: 'dest',
        destinationKey: 'dest.txt',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Source not found');
    });
  });

  describe('listObjects', () => {
    test('should list objects in a bucket', async () => {
      const s3 = createS3WithMock({
        Contents: [
          { Key: 'file1.txt', Size: 100, LastModified: new Date('2025-01-01'), ETag: '"a"', StorageClass: 'STANDARD' },
          { Key: 'file2.txt', Size: 200, LastModified: new Date('2025-01-02'), ETag: '"b"', StorageClass: 'STANDARD' },
        ],
        IsTruncated: false,
        KeyCount: 2,
      });

      const result = await s3.listObjects({ bucket: 'my-bucket' });
      expect(result.success).toBe(true);
      expect(result.data.objects).toHaveLength(2);
      expect(result.data.objects[0].key).toBe('file1.txt');
      expect(result.data.objects[1].size).toBe(200);
      expect(result.data.isTruncated).toBe(false);
      expect(result.data.keyCount).toBe(2);
    });

    test('should list objects with prefix filter', async () => {
      const s3 = createS3WithMock({
        Contents: [
          { Key: 'data/file1.json', Size: 50 },
        ],
        IsTruncated: false,
        KeyCount: 1,
      });

      const result = await s3.listObjects({
        bucket: 'my-bucket',
        prefix: 'data/',
        maxKeys: 10,
      });

      expect(result.success).toBe(true);
      expect(result.data.objects).toHaveLength(1);
      expect(result.data.objects[0].key).toBe('data/file1.json');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle pagination with continuation token', async () => {
      const s3 = createS3WithMock({
        Contents: [{ Key: 'page2-file.txt', Size: 100 }],
        IsTruncated: false,
        KeyCount: 1,
      });

      const result = await s3.listObjects({
        bucket: 'my-bucket',
        continuationToken: 'next-page-token',
      });

      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});

// ==================== IAM Operations Tests ====================

describe('IAMOperations', () => {
  let IAMOperations: any;
  let mockSend: ReturnType<typeof mock>;

  beforeEach(async () => {
    const mod = await import('../../src/aws/iam');
    IAMOperations = mod.IAMOperations;
  });

  function createIamWithMock(mockResponse: any = {}) {
    mockSend = mock(() => Promise.resolve(mockResponse));
    const iam = new IAMOperations({ region: 'us-east-1' });
    (iam as any).client = { send: mockSend };
    return iam;
  }

  describe('createRole', () => {
    test('should create an IAM role', async () => {
      const iam = createIamWithMock({
        Role: {
          RoleName: 'test-role',
          RoleId: 'AROAEXAMPLE',
          Arn: 'arn:aws:iam::123456789012:role/test-role',
        },
      });

      const result = await iam.createRole({
        roleName: 'test-role',
        assumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: { Service: 'ec2.amazonaws.com' },
            Action: 'sts:AssumeRole',
          }],
        }),
        description: 'Test role',
      });

      expect(result.success).toBe(true);
      expect(result.data.roleName).toBe('test-role');
      expect(result.data.roleId).toBe('AROAEXAMPLE');
      expect(result.data.arn).toContain('test-role');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('EntityAlreadyExists')));
      const iam = new IAMOperations({ region: 'us-east-1' });
      (iam as any).client = { send: mockSend };

      const result = await iam.createRole({
        roleName: 'existing-role',
        assumeRolePolicyDocument: '{}',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('EntityAlreadyExists');
    });
  });

  describe('createPolicy', () => {
    test('should create an IAM policy', async () => {
      const iam = createIamWithMock({
        Policy: {
          PolicyName: 'test-policy',
          PolicyId: 'ANPAEXAMPLE',
          Arn: 'arn:aws:iam::123456789012:policy/test-policy',
          Path: '/',
          CreateDate: new Date('2025-01-01'),
        },
      });

      const policyDocument = JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: 's3:GetObject',
          Resource: 'arn:aws:s3:::my-bucket/*',
        }],
      });

      const result = await iam.createPolicy({
        policyName: 'test-policy',
        policyDocument,
        description: 'S3 read access',
      });

      expect(result.success).toBe(true);
      expect(result.data.policyName).toBe('test-policy');
      expect(result.data.policyId).toBe('ANPAEXAMPLE');
      expect(result.data.arn).toContain('test-policy');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should create policy with tags', async () => {
      const iam = createIamWithMock({
        Policy: {
          PolicyName: 'tagged-policy',
          PolicyId: 'ANPAEXAMPLE2',
          Arn: 'arn:aws:iam::123456789012:policy/tagged-policy',
        },
      });

      const result = await iam.createPolicy({
        policyName: 'tagged-policy',
        policyDocument: '{}',
        tags: { env: 'prod', team: 'platform' },
      });

      expect(result.success).toBe(true);
      expect(result.data.policyName).toBe('tagged-policy');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('MalformedPolicyDocument')));
      const iam = new IAMOperations({ region: 'us-east-1' });
      (iam as any).client = { send: mockSend };

      const result = await iam.createPolicy({
        policyName: 'bad-policy',
        policyDocument: 'invalid json',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('MalformedPolicyDocument');
    });
  });

  describe('attachRolePolicy', () => {
    test('should attach policy to role', async () => {
      const iam = createIamWithMock({});

      const result = await iam.attachRolePolicy(
        'test-role',
        'arn:aws:iam::123456789012:policy/test-policy'
      );

      expect(result.success).toBe(true);
      expect(result.data.message).toContain('test-role');
      expect(result.data.message).toContain('test-policy');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('NoSuchEntity')));
      const iam = new IAMOperations({ region: 'us-east-1' });
      (iam as any).client = { send: mockSend };

      const result = await iam.attachRolePolicy('missing-role', 'arn:aws:iam::123456789012:policy/p');
      expect(result.success).toBe(false);
      expect(result.error).toBe('NoSuchEntity');
    });
  });

  describe('listPolicies', () => {
    test('should list policies with defaults', async () => {
      const iam = createIamWithMock({
        Policies: [
          {
            PolicyName: 'policy-1',
            PolicyId: 'P1',
            Arn: 'arn:aws:iam::123456789012:policy/policy-1',
            Path: '/',
            CreateDate: new Date('2025-01-01'),
            AttachmentCount: 2,
            IsAttachable: true,
            Description: 'First policy',
          },
          {
            PolicyName: 'policy-2',
            PolicyId: 'P2',
            Arn: 'arn:aws:iam::123456789012:policy/policy-2',
            Path: '/',
            AttachmentCount: 0,
            IsAttachable: true,
          },
        ],
        IsTruncated: false,
      });

      const result = await iam.listPolicies();
      expect(result.success).toBe(true);
      expect(result.data.policies).toHaveLength(2);
      expect(result.data.policies[0].policyName).toBe('policy-1');
      expect(result.data.policies[0].attachmentCount).toBe(2);
      expect(result.data.isTruncated).toBe(false);
    });

    test('should list policies with scope filter', async () => {
      const iam = createIamWithMock({
        Policies: [{ PolicyName: 'local-policy', PolicyId: 'LP1' }],
        IsTruncated: false,
      });

      const result = await iam.listPolicies({ scope: 'Local', maxItems: 5 });
      expect(result.success).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUser', () => {
    test('should get user by name', async () => {
      const iam = createIamWithMock({
        User: {
          UserName: 'admin',
          UserId: 'AIDAEXAMPLE',
          Arn: 'arn:aws:iam::123456789012:user/admin',
          Path: '/',
          CreateDate: new Date('2024-01-01'),
          Tags: [{ Key: 'dept', Value: 'engineering' }],
        },
      });

      const result = await iam.getUser('admin');
      expect(result.success).toBe(true);
      expect(result.data.userName).toBe('admin');
      expect(result.data.arn).toContain('admin');
      expect(result.data.tags).toEqual({ dept: 'engineering' });
    });

    test('should get current user when userName is omitted', async () => {
      const iam = createIamWithMock({
        User: {
          UserName: 'current-user',
          UserId: 'AIDACURRENT',
          Arn: 'arn:aws:iam::123456789012:user/current-user',
          Path: '/',
        },
      });

      const result = await iam.getUser();
      expect(result.success).toBe(true);
      expect(result.data.userName).toBe('current-user');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle user not found', async () => {
      mockSend = mock(() => Promise.reject(new Error('NoSuchEntity')));
      const iam = new IAMOperations({ region: 'us-east-1' });
      (iam as any).client = { send: mockSend };

      const result = await iam.getUser('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('NoSuchEntity');
    });
  });
});

// ==================== CloudFormation Operations Tests ====================

describe('CloudFormationOperations', () => {
  let CloudFormationOperations: any;
  let mockSend: ReturnType<typeof mock>;

  beforeEach(async () => {
    const mod = await import('../../src/aws/cloudformation');
    CloudFormationOperations = mod.CloudFormationOperations;
  });

  function createCfWithMock(mockResponse: any = {}) {
    mockSend = mock(() => Promise.resolve(mockResponse));
    const cf = new CloudFormationOperations({ region: 'us-east-1' });
    (cf as any).client = { send: mockSend };
    return cf;
  }

  describe('createStack', () => {
    test('should create a stack with basic parameters', async () => {
      const cf = createCfWithMock({
        StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/test-stack/guid',
      });

      const result = await cf.createStack({
        stackName: 'test-stack',
        templateBody: '{"AWSTemplateFormatVersion": "2010-09-09", "Resources": {}}',
      });

      expect(result.success).toBe(true);
      expect(result.data.stackId).toContain('test-stack');
      expect(result.data.stackName).toBe('test-stack');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should create a stack with parameters and capabilities', async () => {
      const cf = createCfWithMock({
        StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/params-stack/guid',
      });

      const result = await cf.createStack({
        stackName: 'params-stack',
        templateBody: '{"AWSTemplateFormatVersion": "2010-09-09"}',
        parameters: { InstanceType: 't3.micro', KeyName: 'my-key' },
        capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
        tags: { env: 'dev' },
        timeoutInMinutes: 30,
        onFailure: 'ROLLBACK',
      });

      expect(result.success).toBe(true);
      expect(result.data.stackName).toBe('params-stack');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('AlreadyExistsException')));
      const cf = new CloudFormationOperations({ region: 'us-east-1' });
      (cf as any).client = { send: mockSend };

      const result = await cf.createStack({
        stackName: 'existing-stack',
        templateBody: '{}',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('AlreadyExistsException');
    });
  });

  describe('updateStack', () => {
    test('should update a stack', async () => {
      const cf = createCfWithMock({
        StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/update-stack/guid',
      });

      const result = await cf.updateStack({
        stackName: 'update-stack',
        templateBody: '{"AWSTemplateFormatVersion": "2010-09-09", "Resources": {"NewResource": {}}}',
        parameters: { InstanceType: 't3.medium' },
      });

      expect(result.success).toBe(true);
      expect(result.data.stackName).toBe('update-stack');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle no update needed error', async () => {
      mockSend = mock(() => Promise.reject(new Error('No updates are to be performed')));
      const cf = new CloudFormationOperations({ region: 'us-east-1' });
      (cf as any).client = { send: mockSend };

      const result = await cf.updateStack({
        stackName: 'unchanged-stack',
        templateBody: '{}',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('No updates are to be performed');
    });
  });

  describe('deleteStack', () => {
    test('should delete a stack', async () => {
      const cf = createCfWithMock({});

      const result = await cf.deleteStack('test-stack');
      expect(result.success).toBe(true);
      expect(result.data.message).toContain('test-stack');
      expect(result.data.message).toContain('deletion initiated');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Stack not found')));
      const cf = new CloudFormationOperations({ region: 'us-east-1' });
      (cf as any).client = { send: mockSend };

      const result = await cf.deleteStack('missing-stack');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Stack not found');
    });
  });

  describe('describeStacks', () => {
    test('should describe all stacks', async () => {
      const cf = createCfWithMock({
        Stacks: [
          {
            StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/stack-1/guid1',
            StackName: 'stack-1',
            Description: 'First stack',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date('2025-01-01'),
            Parameters: [{ ParameterKey: 'Env', ParameterValue: 'prod' }],
            Outputs: [{
              OutputKey: 'VpcId',
              OutputValue: 'vpc-12345',
              Description: 'VPC ID',
            }],
            Capabilities: ['CAPABILITY_IAM'],
            Tags: [{ Key: 'project', Value: 'nimbus' }],
            EnableTerminationProtection: false,
          },
          {
            StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/stack-2/guid2',
            StackName: 'stack-2',
            StackStatus: 'UPDATE_COMPLETE',
            CreationTime: new Date('2025-01-15'),
          },
        ],
      });

      const result = await cf.describeStacks();
      expect(result.success).toBe(true);
      expect(result.data.stacks).toHaveLength(2);

      const stack1 = result.data.stacks[0];
      expect(stack1.stackName).toBe('stack-1');
      expect(stack1.stackStatus).toBe('CREATE_COMPLETE');
      expect(stack1.description).toBe('First stack');
      expect(stack1.parameters).toHaveLength(1);
      expect(stack1.parameters[0].key).toBe('Env');
      expect(stack1.parameters[0].value).toBe('prod');
      expect(stack1.outputs).toHaveLength(1);
      expect(stack1.outputs[0].key).toBe('VpcId');
      expect(stack1.tags).toEqual({ project: 'nimbus' });
      expect(stack1.enableTerminationProtection).toBe(false);
    });

    test('should describe a specific stack', async () => {
      const cf = createCfWithMock({
        Stacks: [{
          StackName: 'my-stack',
          StackStatus: 'CREATE_COMPLETE',
        }],
      });

      const result = await cf.describeStacks('my-stack');
      expect(result.success).toBe(true);
      expect(result.data.stacks).toHaveLength(1);
      expect(result.data.stacks[0].stackName).toBe('my-stack');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle stack not found', async () => {
      mockSend = mock(() => Promise.reject(new Error('Stack does not exist')));
      const cf = new CloudFormationOperations({ region: 'us-east-1' });
      (cf as any).client = { send: mockSend };

      const result = await cf.describeStacks('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Stack does not exist');
    });
  });

  describe('listStacks', () => {
    test('should list stacks without filters', async () => {
      const cf = createCfWithMock({
        StackSummaries: [
          {
            StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/s1/guid',
            StackName: 's1',
            TemplateDescription: 'Stack 1',
            StackStatus: 'CREATE_COMPLETE',
            CreationTime: new Date('2025-01-01'),
            DriftInformation: { StackDriftStatus: 'NOT_CHECKED' },
          },
          {
            StackId: 'arn:aws:cloudformation:us-east-1:123456789012:stack/s2/guid',
            StackName: 's2',
            StackStatus: 'DELETE_COMPLETE',
            CreationTime: new Date('2025-01-02'),
            DeletionTime: new Date('2025-01-05'),
          },
        ],
      });

      const result = await cf.listStacks();
      expect(result.success).toBe(true);
      expect(result.data.stacks).toHaveLength(2);
      expect(result.data.stacks[0].stackName).toBe('s1');
      expect(result.data.stacks[0].stackStatus).toBe('CREATE_COMPLETE');
      expect(result.data.stacks[0].driftStatus).toBe('NOT_CHECKED');
      expect(result.data.stacks[1].stackName).toBe('s2');
      expect(result.data.stacks[1].stackStatus).toBe('DELETE_COMPLETE');
    });

    test('should list stacks with status filter', async () => {
      const cf = createCfWithMock({
        StackSummaries: [{
          StackName: 'active-stack',
          StackStatus: 'CREATE_COMPLETE',
          CreationTime: new Date('2025-01-01'),
        }],
      });

      const result = await cf.listStacks(['CREATE_COMPLETE', 'UPDATE_COMPLETE']);
      expect(result.success).toBe(true);
      expect(result.data.stacks).toHaveLength(1);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      mockSend = mock(() => Promise.reject(new Error('Access Denied')));
      const cf = new CloudFormationOperations({ region: 'us-east-1' });
      (cf as any).client = { send: mockSend };

      const result = await cf.listStacks();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Access Denied');
    });
  });

  describe('constructor', () => {
    test('should accept region configuration', () => {
      const cf = new CloudFormationOperations({ region: 'eu-west-1' });
      expect(cf).toBeDefined();
    });

    test('should accept credentials configuration', () => {
      const cf = new CloudFormationOperations({
        region: 'us-west-2',
        accessKeyId: 'AKIAEXAMPLE',
        secretAccessKey: 'secret',
        sessionToken: 'token',
      });
      expect(cf).toBeDefined();
    });

    test('should use default region when not specified', () => {
      const cf = new CloudFormationOperations();
      expect(cf).toBeDefined();
    });
  });
});

// ==================== Route Verification Tests ====================

describe('Routes source verification', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const routesPath = path.resolve(__dirname, '../../src/routes.ts');
  let routesSource: string;

  beforeEach(() => {
    routesSource = fs.readFileSync(routesPath, 'utf-8');
  });

  describe('EC2 routes', () => {
    test('should have single instance start route', () => {
      expect(routesSource).toContain("'/instance/start'");
      expect(routesSource).toContain('handleStartInstance');
    });

    test('should have single instance stop route', () => {
      expect(routesSource).toContain("'/instance/stop'");
      expect(routesSource).toContain('handleStopInstance');
    });

    test('should have single instance terminate route', () => {
      expect(routesSource).toContain("'/instance/terminate'");
      expect(routesSource).toContain('handleTerminateInstance');
    });

    test('should have describe security groups route', () => {
      expect(routesSource).toContain("'/security-groups/describe'");
      expect(routesSource).toContain('handleDescribeSecurityGroups');
    });

    test('should have modify instance attribute route', () => {
      expect(routesSource).toContain("'/instance/modify-attribute'");
      expect(routesSource).toContain('handleModifyInstanceAttribute');
    });
  });

  describe('S3 routes', () => {
    test('should have copy object route', () => {
      expect(routesSource).toContain("'/object/copy'");
      expect(routesSource).toContain('handleCopyObject');
    });

    test('should have put object route', () => {
      expect(routesSource).toContain('handlePutObject');
    });

    test('should have get object route', () => {
      expect(routesSource).toContain('handleGetObject');
    });

    test('should have delete object route', () => {
      expect(routesSource).toContain('handleDeleteObject');
    });

    test('should have list objects route', () => {
      expect(routesSource).toContain('handleListObjects');
    });
  });

  describe('IAM routes', () => {
    test('should have create role route', () => {
      expect(routesSource).toContain("'/role'");
      expect(routesSource).toContain('handleCreateRole');
    });

    test('should have create policy route', () => {
      expect(routesSource).toContain("'/policy'");
      expect(routesSource).toContain('handleCreatePolicy');
    });

    test('should have attach role policy route', () => {
      expect(routesSource).toContain("'/role/attach-policy'");
      expect(routesSource).toContain('handleAttachRolePolicy');
    });

    test('should have list policies route', () => {
      expect(routesSource).toContain('handleListPolicies');
    });

    test('should have get user route', () => {
      expect(routesSource).toContain('handleGetUser');
    });
  });

  describe('CloudFormation routes', () => {
    test('should import CloudFormationOperations', () => {
      expect(routesSource).toContain('CloudFormationOperations');
    });

    test('should have create stack route', () => {
      expect(routesSource).toContain('handleCreateStack');
    });

    test('should have update stack route', () => {
      expect(routesSource).toContain('handleUpdateStack');
    });

    test('should have delete stack route', () => {
      expect(routesSource).toContain('handleDeleteStack');
    });

    test('should have describe stacks route', () => {
      expect(routesSource).toContain('handleDescribeStacks');
    });

    test('should have list stacks route', () => {
      expect(routesSource).toContain('handleListStacks');
    });

    test('should have cloudformation path prefix', () => {
      expect(routesSource).toContain('/api/aws/cloudformation');
    });
  });
});

// ==================== Exports Verification Tests ====================

describe('AWS module exports', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const indexPath = path.resolve(__dirname, '../../src/aws/index.ts');

  test('should export CloudFormationOperations', () => {
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toContain('CloudFormationOperations');
  });

  test('should export CreatePolicyOptions', () => {
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toContain('CreatePolicyOptions');
  });

  test('should export EC2Operations', () => {
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toContain('EC2Operations');
  });

  test('should export S3Operations', () => {
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toContain('S3Operations');
  });

  test('should export IAMOperations', () => {
    const source = fs.readFileSync(indexPath, 'utf-8');
    expect(source).toContain('IAMOperations');
  });
});
