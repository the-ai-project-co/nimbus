/**
 * Terraform Mappers Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { DiscoveredResource } from '../../../../services/aws-tools-service/src/discovery/types';
import type { MappingContext, TerraformVariable, TerraformReference } from '../../../../services/aws-tools-service/src/terraform/types';
import {
  createMapperRegistry,
  getAllMappers,
  getServiceForTerraformType,
  getTerraformTypeForAwsType,
  isAwsTypeSupported,
  EC2InstanceMapper,
  S3BucketMapper,
  VPCMapper,
  IAMRoleMapper,
  LambdaFunctionMapper,
  RDSInstanceMapper,
  ECSClusterMapper,
  EKSClusterMapper,
  DynamoDBTableMapper,
  CloudFrontDistributionMapper,
} from '../../../../services/aws-tools-service/src/terraform/mappers';

/**
 * Mock mapping context for testing
 */
class MockMappingContext implements MappingContext {
  config = {
    outputDir: '/tmp/terraform',
    defaultRegion: 'us-east-1',
  };

  private variables: TerraformVariable[] = [];
  private resourceRefs: Map<string, TerraformReference> = new Map();

  getResourceReference(arn: string): TerraformReference | undefined {
    return this.resourceRefs.get(arn);
  }

  addVariable(variable: Omit<TerraformVariable, 'name'> & { name: string }): string {
    this.variables.push(variable as TerraformVariable);
    return variable.name;
  }

  markSensitive(key: string, value: string, description: string): TerraformReference {
    const varName = `sensitive_${key}`;
    this.addVariable({
      name: varName,
      type: 'string',
      description,
      sensitive: true,
    });
    return { _type: 'reference', value: `var.${varName}` };
  }

  getVariables(): TerraformVariable[] {
    return this.variables;
  }

  setResourceReference(arn: string, ref: TerraformReference): void {
    this.resourceRefs.set(arn, ref);
  }
}

/**
 * Create a mock discovered resource
 */
function createMockResource(
  type: string,
  id: string,
  properties: Record<string, unknown> = {},
  overrides: Partial<DiscoveredResource> = {}
): DiscoveredResource {
  return {
    id,
    type,
    arn: `arn:aws:service:us-east-1:123456789012:${type.toLowerCase()}/${id}`,
    region: 'us-east-1',
    name: overrides.name || id,
    tags: overrides.tags || {},
    properties,
    relationships: overrides.relationships || [],
    discoveredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('MapperRegistry', () => {
  it('creates a registry with all mappers', () => {
    const registry = createMapperRegistry();
    expect(registry.getAll().length).toBeGreaterThan(0);
  });

  it('retrieves mapper by AWS type', () => {
    const registry = createMapperRegistry();
    const mapper = registry.get('AWS::EC2::Instance');
    expect(mapper).toBeDefined();
    expect(mapper?.terraformType).toBe('aws_instance');
  });

  it('returns undefined for unknown type', () => {
    const registry = createMapperRegistry();
    const mapper = registry.get('AWS::Unknown::Resource');
    expect(mapper).toBeUndefined();
  });

  it('checks if type exists', () => {
    const registry = createMapperRegistry();
    expect(registry.has('AWS::EC2::Instance')).toBe(true);
    expect(registry.has('AWS::Unknown::Resource')).toBe(false);
  });
});

describe('getAllMappers', () => {
  it('returns all mappers', () => {
    const mappers = getAllMappers();
    expect(mappers.length).toBeGreaterThan(20);
  });

  it('includes mappers for major services', () => {
    const mappers = getAllMappers();
    const terraformTypes = mappers.map(m => m.terraformType);

    expect(terraformTypes).toContain('aws_instance');
    expect(terraformTypes).toContain('aws_s3_bucket');
    expect(terraformTypes).toContain('aws_vpc');
    expect(terraformTypes).toContain('aws_iam_role');
    expect(terraformTypes).toContain('aws_lambda_function');
    expect(terraformTypes).toContain('aws_db_instance');
    expect(terraformTypes).toContain('aws_ecs_cluster');
    expect(terraformTypes).toContain('aws_eks_cluster');
    expect(terraformTypes).toContain('aws_dynamodb_table');
    expect(terraformTypes).toContain('aws_cloudfront_distribution');
  });
});

describe('getServiceForTerraformType', () => {
  it('returns correct service for EC2 resources', () => {
    expect(getServiceForTerraformType('aws_instance')).toBe('ec2');
    expect(getServiceForTerraformType('aws_ebs_volume')).toBe('ec2');
    expect(getServiceForTerraformType('aws_security_group')).toBe('ec2');
  });

  it('returns correct service for VPC resources', () => {
    expect(getServiceForTerraformType('aws_vpc')).toBe('vpc');
    expect(getServiceForTerraformType('aws_subnet')).toBe('vpc');
    expect(getServiceForTerraformType('aws_internet_gateway')).toBe('vpc');
  });

  it('returns misc for unknown types', () => {
    expect(getServiceForTerraformType('aws_unknown_resource')).toBe('misc');
  });
});

describe('getTerraformTypeForAwsType', () => {
  it('returns correct Terraform type', () => {
    expect(getTerraformTypeForAwsType('AWS::EC2::Instance')).toBe('aws_instance');
    expect(getTerraformTypeForAwsType('AWS::S3::Bucket')).toBe('aws_s3_bucket');
    expect(getTerraformTypeForAwsType('AWS::Lambda::Function')).toBe('aws_lambda_function');
  });

  it('returns undefined for unknown types', () => {
    expect(getTerraformTypeForAwsType('AWS::Unknown::Resource')).toBeUndefined();
  });
});

describe('isAwsTypeSupported', () => {
  it('returns true for supported types', () => {
    expect(isAwsTypeSupported('AWS::EC2::Instance')).toBe(true);
    expect(isAwsTypeSupported('AWS::S3::Bucket')).toBe(true);
  });

  it('returns false for unsupported types', () => {
    expect(isAwsTypeSupported('AWS::Unknown::Resource')).toBe(false);
  });
});

describe('EC2InstanceMapper', () => {
  let mapper: EC2InstanceMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new EC2InstanceMapper();
    context = new MockMappingContext();
  });

  it('has correct type mappings', () => {
    expect(mapper.awsType).toBe('AWS::EC2::Instance');
    expect(mapper.terraformType).toBe('aws_instance');
  });

  it('maps a basic EC2 instance', () => {
    const resource = createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
      imageId: 'ami-12345678',
      instanceType: 't2.micro',
    });

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_instance');
    expect(result!.attributes.ami).toBe('ami-12345678');
    expect(result!.attributes.instance_type).toBe('t2.micro');
  });

  it('maps security groups', () => {
    const resource = createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
      imageId: 'ami-12345678',
      instanceType: 't2.micro',
      securityGroups: [
        { groupId: 'sg-12345678' },
        { groupId: 'sg-87654321' },
      ],
    });

    const result = mapper.map(resource, context);

    expect(result!.attributes.vpc_security_group_ids).toEqual(['sg-12345678', 'sg-87654321']);
  });

  it('includes lifecycle ignore_changes', () => {
    const resource = createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {
      imageId: 'ami-12345678',
      instanceType: 't2.micro',
    });

    const result = mapper.map(resource, context);

    expect(result!.lifecycle?.ignoreChanges).toContain('ami');
    expect(result!.lifecycle?.ignoreChanges).toContain('user_data');
  });

  it('returns correct import ID', () => {
    const resource = createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {});
    expect(mapper.getImportId(resource)).toBe('i-1234567890abcdef0');
  });

  it('generates suggested outputs', () => {
    const resource = createMockResource('AWS::EC2::Instance', 'i-1234567890abcdef0', {}, {
      name: 'web-server',
    });

    const outputs = mapper.getSuggestedOutputs!(resource);

    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs.some(o => o.name.includes('id'))).toBe(true);
  });
});

describe('S3BucketMapper', () => {
  let mapper: S3BucketMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new S3BucketMapper();
    context = new MockMappingContext();
  });

  it('has correct type mappings', () => {
    expect(mapper.awsType).toBe('AWS::S3::Bucket');
    expect(mapper.terraformType).toBe('aws_s3_bucket');
  });

  it('maps a basic S3 bucket', () => {
    const resource = createMockResource('AWS::S3::Bucket', 'my-bucket', {});

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_s3_bucket');
    expect(result!.attributes.bucket).toBe('my-bucket');
  });

  it('maps tags', () => {
    const resource = createMockResource('AWS::S3::Bucket', 'my-bucket', {}, {
      tags: {
        Environment: 'production',
        Team: 'platform',
      },
    });

    const result = mapper.map(resource, context);

    expect(result!.attributes.tags).toEqual({
      Environment: 'production',
      Team: 'platform',
    });
  });

  it('returns correct import ID', () => {
    const resource = createMockResource('AWS::S3::Bucket', 'my-bucket', {});
    expect(mapper.getImportId(resource)).toBe('my-bucket');
  });

  it('generates suggested outputs', () => {
    const resource = createMockResource('AWS::S3::Bucket', 'my-bucket', {});

    const outputs = mapper.getSuggestedOutputs!(resource);

    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs.some(o => o.name.includes('arn'))).toBe(true);
  });
});

describe('VPCMapper', () => {
  let mapper: VPCMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new VPCMapper();
    context = new MockMappingContext();
  });

  it('maps a VPC with CIDR block', () => {
    const resource = createMockResource('AWS::EC2::VPC', 'vpc-12345678', {
      cidrBlock: '10.0.0.0/16',
    });

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_vpc');
    expect(result!.attributes.cidr_block).toBe('10.0.0.0/16');
    expect(result!.attributes.enable_dns_support).toBe(true);
    expect(result!.attributes.enable_dns_hostnames).toBe(true);
  });
});

describe('IAMRoleMapper', () => {
  let mapper: IAMRoleMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new IAMRoleMapper();
    context = new MockMappingContext();
  });

  it('maps an IAM role with assume role policy', () => {
    const resource = createMockResource('AWS::IAM::Role', 'my-role', {
      roleName: 'my-role',
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { Service: 'ec2.amazonaws.com' },
          Action: 'sts:AssumeRole',
        }],
      },
    });

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_iam_role');
    expect(result!.attributes.name).toBe('my-role');
    expect(result!.attributes.assume_role_policy).toBeDefined();
  });

  it('returns role name as import ID', () => {
    const resource = createMockResource('AWS::IAM::Role', 'arn-id', {
      roleName: 'my-role',
    });
    expect(mapper.getImportId(resource)).toBe('my-role');
  });
});

describe('LambdaFunctionMapper', () => {
  let mapper: LambdaFunctionMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new LambdaFunctionMapper();
    context = new MockMappingContext();
  });

  it('maps a Lambda function', () => {
    const resource = createMockResource('AWS::Lambda::Function', 'my-function', {
      functionName: 'my-function',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
      role: 'arn:aws:iam::123456789012:role/lambda-role',
      memorySize: 256,
      timeout: 30,
    });

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_lambda_function');
    expect(result!.attributes.function_name).toBe('my-function');
    expect(result!.attributes.runtime).toBe('nodejs18.x');
    expect(result!.attributes.handler).toBe('index.handler');
    expect(result!.attributes.memory_size).toBe(256);
    expect(result!.attributes.timeout).toBe(30);
  });

  it('creates a variable for code filename', () => {
    const resource = createMockResource('AWS::Lambda::Function', 'my-function', {
      functionName: 'my-function',
      runtime: 'nodejs18.x',
      handler: 'index.handler',
    });

    mapper.map(resource, context);

    const variables = context.getVariables();
    expect(variables.some(v => v.name.includes('filename'))).toBe(true);
  });

  it('includes lifecycle ignore_changes for code', () => {
    const resource = createMockResource('AWS::Lambda::Function', 'my-function', {
      functionName: 'my-function',
    });

    const result = mapper.map(resource, context);

    expect(result!.lifecycle?.ignoreChanges).toContain('filename');
    expect(result!.lifecycle?.ignoreChanges).toContain('source_code_hash');
  });
});

describe('RDSInstanceMapper', () => {
  let mapper: RDSInstanceMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new RDSInstanceMapper();
    context = new MockMappingContext();
  });

  it('maps an RDS instance', () => {
    const resource = createMockResource('AWS::RDS::DBInstance', 'my-db', {
      dbInstanceIdentifier: 'my-db',
      dbInstanceClass: 'db.t3.micro',
      engine: 'mysql',
      engineVersion: '8.0',
      allocatedStorage: 20,
    });

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_db_instance');
    expect(result!.attributes.identifier).toBe('my-db');
    expect(result!.attributes.instance_class).toBe('db.t3.micro');
    expect(result!.attributes.engine).toBe('mysql');
    expect(result!.attributes.allocated_storage).toBe(20);
  });

  it('creates variables for credentials', () => {
    const resource = createMockResource('AWS::RDS::DBInstance', 'my-db', {
      dbInstanceIdentifier: 'my-db',
      masterUsername: 'admin',
    });

    mapper.map(resource, context);

    const variables = context.getVariables();
    expect(variables.some(v => v.name.includes('password') && v.sensitive)).toBe(true);
  });

  it('includes lifecycle ignore_changes for password', () => {
    const resource = createMockResource('AWS::RDS::DBInstance', 'my-db', {
      dbInstanceIdentifier: 'my-db',
    });

    const result = mapper.map(resource, context);

    expect(result!.lifecycle?.ignoreChanges).toContain('password');
  });
});

describe('ECSClusterMapper', () => {
  let mapper: ECSClusterMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new ECSClusterMapper();
    context = new MockMappingContext();
  });

  it('maps an ECS cluster', () => {
    const resource = createMockResource('AWS::ECS::Cluster', 'my-cluster', {
      clusterName: 'my-cluster',
    });

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_ecs_cluster');
    expect(result!.attributes.name).toBe('my-cluster');
  });
});

describe('EKSClusterMapper', () => {
  let mapper: EKSClusterMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new EKSClusterMapper();
    context = new MockMappingContext();
  });

  it('maps an EKS cluster', () => {
    const resource = createMockResource('AWS::EKS::Cluster', 'my-cluster', {
      name: 'my-cluster',
      roleArn: 'arn:aws:iam::123456789012:role/eks-role',
      version: '1.28',
    });

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_eks_cluster');
    expect(result!.attributes.name).toBe('my-cluster');
    expect(result!.attributes.version).toBe('1.28');
  });
});

describe('DynamoDBTableMapper', () => {
  let mapper: DynamoDBTableMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new DynamoDBTableMapper();
    context = new MockMappingContext();
  });

  it('maps a DynamoDB table', () => {
    const resource = createMockResource('AWS::DynamoDB::Table', 'my-table', {
      tableName: 'my-table',
      keySchema: [
        { attributeName: 'id', keyType: 'HASH' },
        { attributeName: 'sk', keyType: 'RANGE' },
      ],
      attributeDefinitions: [
        { attributeName: 'id', attributeType: 'S' },
        { attributeName: 'sk', attributeType: 'S' },
      ],
    });

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_dynamodb_table');
    expect(result!.attributes.name).toBe('my-table');
    expect(result!.attributes.hash_key).toBe('id');
    expect(result!.attributes.range_key).toBe('sk');
  });
});

describe('CloudFrontDistributionMapper', () => {
  let mapper: CloudFrontDistributionMapper;
  let context: MockMappingContext;

  beforeEach(() => {
    mapper = new CloudFrontDistributionMapper();
    context = new MockMappingContext();
  });

  it('maps a CloudFront distribution', () => {
    const resource = createMockResource('AWS::CloudFront::Distribution', 'E1234567890ABC', {
      enabled: true,
      comment: 'My distribution',
      priceClass: 'PriceClass_100',
    });

    const result = mapper.map(resource, context);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('aws_cloudfront_distribution');
    expect(result!.attributes.enabled).toBe(true);
    expect(result!.attributes.comment).toBe('My distribution');
    expect(result!.attributes.price_class).toBe('PriceClass_100');
  });

  it('includes default restrictions block', () => {
    const resource = createMockResource('AWS::CloudFront::Distribution', 'E1234567890ABC', {
      enabled: true,
    });

    const result = mapper.map(resource, context);

    expect(result!.attributes.restrictions).toBeDefined();
  });
});
