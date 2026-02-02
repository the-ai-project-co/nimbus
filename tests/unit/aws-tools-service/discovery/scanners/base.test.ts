/**
 * Unit tests for Base Scanner
 */

import { describe, test, expect, mock } from 'bun:test';
import {
  BaseScanner,
  ScannerRegistry,
  type ScannerContext,
  type ScanResult,
} from '../../../../../services/aws-tools-service/src/discovery/scanners/base';
import type { DiscoveredResource } from '../../../../../services/aws-tools-service/src/discovery/types';

// Create a concrete implementation for testing
class TestScanner extends BaseScanner {
  readonly serviceName = 'Test';
  readonly isGlobal = false;

  async scan(context: ScannerContext): Promise<ScanResult> {
    this.clearErrors();

    const resources: DiscoveredResource[] = [
      this.createResource({
        id: 'test-resource-1',
        arn: 'arn:aws:test:us-east-1:123456789012:resource/test-resource-1',
        awsType: 'AWS::Test::Resource',
        region: context.region,
        name: 'Test Resource',
        tags: { Name: 'Test', Environment: 'test' },
        properties: { testProp: 'value' },
      }),
    ];

    return {
      resources,
      errors: this.errors,
    };
  }

  getResourceTypes(): string[] {
    return ['AWS::Test::Resource'];
  }

  // Expose protected methods for testing
  public testTagsToRecord(tags?: Array<{ Key?: string; Value?: string }>): Record<string, string> {
    return this.tagsToRecord(tags);
  }

  public testGetNameFromTags(
    tags?: Array<{ Key?: string; Value?: string }>,
    fallback?: string
  ): string | undefined {
    return this.getNameFromTags(tags, fallback);
  }

  public testBuildArn(params: {
    partition?: string;
    service: string;
    region: string;
    accountId: string;
    resourceType?: string;
    resource: string;
  }): string {
    return this.buildArn(params);
  }

  public testRecordError(operation: string, message: string, region: string, code?: string): void {
    this.recordError(operation, message, region, code);
  }
}

// Create mock context
function createMockContext(): ScannerContext {
  return {
    region: 'us-east-1',
    credentials: {} as any,
    rateLimiter: {
      withBackoff: mock(async (op: () => Promise<any>) => op()),
      acquire: mock(async () => {}),
      release: mock(() => {}),
      getStats: mock(() => ({
        totalRequests: 0,
        throttledRequests: 0,
        currentConcurrent: 0,
        queueLength: 0,
        throttleRate: 0,
      })),
    } as any,
    accountId: '123456789012',
  };
}

describe('BaseScanner', () => {
  describe('createResource', () => {
    test('creates resource with all fields', async () => {
      const scanner = new TestScanner();
      const context = createMockContext();
      const result = await scanner.scan(context);

      expect(result.resources).toHaveLength(1);
      const resource = result.resources[0];

      expect(resource.id).toBe('test-resource-1');
      expect(resource.arn).toBe('arn:aws:test:us-east-1:123456789012:resource/test-resource-1');
      expect(resource.type).toBe('aws_aws_test_resource'); // Terraform type generated for unknown AWS type
      expect(resource.awsType).toBe('AWS::Test::Resource');
      expect(resource.service).toBe('Test');
      expect(resource.region).toBe('us-east-1');
      expect(resource.name).toBe('Test Resource');
      expect(resource.tags).toEqual({ Name: 'Test', Environment: 'test' });
      expect(resource.properties).toEqual({ testProp: 'value' });
      expect(resource.relationships).toEqual([]);
    });
  });

  describe('tagsToRecord', () => {
    test('converts AWS tags to record', () => {
      const scanner = new TestScanner();
      const tags = [
        { Key: 'Name', Value: 'MyResource' },
        { Key: 'Environment', Value: 'production' },
      ];

      const result = scanner.testTagsToRecord(tags);

      expect(result).toEqual({
        Name: 'MyResource',
        Environment: 'production',
      });
    });

    test('handles empty value', () => {
      const scanner = new TestScanner();
      const tags = [{ Key: 'EmptyTag', Value: '' }];

      const result = scanner.testTagsToRecord(tags);

      expect(result).toEqual({ EmptyTag: '' });
    });

    test('handles undefined value', () => {
      const scanner = new TestScanner();
      const tags = [{ Key: 'NoValue' }];

      const result = scanner.testTagsToRecord(tags);

      expect(result).toEqual({ NoValue: '' });
    });

    test('returns empty record for undefined tags', () => {
      const scanner = new TestScanner();

      const result = scanner.testTagsToRecord(undefined);

      expect(result).toEqual({});
    });

    test('skips tags without Key', () => {
      const scanner = new TestScanner();
      const tags = [{ Value: 'orphan' }, { Key: 'Valid', Value: 'value' }];

      const result = scanner.testTagsToRecord(tags);

      expect(result).toEqual({ Valid: 'value' });
    });
  });

  describe('getNameFromTags', () => {
    test('returns Name tag value', () => {
      const scanner = new TestScanner();
      const tags = [{ Key: 'Name', Value: 'MyResource' }];

      const result = scanner.testGetNameFromTags(tags);

      expect(result).toBe('MyResource');
    });

    test('returns fallback when no Name tag', () => {
      const scanner = new TestScanner();
      const tags = [{ Key: 'Other', Value: 'value' }];

      const result = scanner.testGetNameFromTags(tags, 'default-name');

      expect(result).toBe('default-name');
    });

    test('returns undefined when no Name tag and no fallback', () => {
      const scanner = new TestScanner();
      const tags = [{ Key: 'Other', Value: 'value' }];

      const result = scanner.testGetNameFromTags(tags);

      expect(result).toBeUndefined();
    });
  });

  describe('buildArn', () => {
    test('builds ARN without resource type', () => {
      const scanner = new TestScanner();

      const arn = scanner.testBuildArn({
        service: 's3',
        region: '',
        accountId: '',
        resource: 'my-bucket',
      });

      expect(arn).toBe('arn:aws:s3:::my-bucket');
    });

    test('builds ARN with resource type', () => {
      const scanner = new TestScanner();

      const arn = scanner.testBuildArn({
        service: 'ec2',
        region: 'us-east-1',
        accountId: '123456789012',
        resourceType: 'instance',
        resource: 'i-1234567890abcdef0',
      });

      expect(arn).toBe('arn:aws:ec2:us-east-1:123456789012:instance/i-1234567890abcdef0');
    });

    test('builds ARN with custom partition', () => {
      const scanner = new TestScanner();

      const arn = scanner.testBuildArn({
        partition: 'aws-cn',
        service: 'ec2',
        region: 'cn-north-1',
        accountId: '123456789012',
        resourceType: 'instance',
        resource: 'i-1234567890abcdef0',
      });

      expect(arn).toBe('arn:aws-cn:ec2:cn-north-1:123456789012:instance/i-1234567890abcdef0');
    });
  });

  describe('recordError', () => {
    test('records error in errors array', async () => {
      const scanner = new TestScanner();
      scanner.testRecordError('DescribeInstances', 'Access denied', 'us-east-1', 'AccessDenied');

      // We need to call scan to get the errors (they're cleared at start of scan)
      // Instead, access errors through a custom scan that includes errors
      const context = createMockContext();

      // Create a scanner that adds errors during scan
      class ErrorScanner extends TestScanner {
        async scan(context: ScannerContext): Promise<ScanResult> {
          this.clearErrors();
          this.recordError('TestOp', 'Test error', context.region, 'TestCode');
          return { resources: [], errors: this.errors };
        }
      }

      const errorScanner = new ErrorScanner();
      const result = await errorScanner.scan(context);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].service).toBe('Test');
      expect(result.errors[0].operation).toBe('TestOp');
      expect(result.errors[0].message).toBe('Test error');
      expect(result.errors[0].region).toBe('us-east-1');
      expect(result.errors[0].code).toBe('TestCode');
    });
  });

  describe('getResourceTypes', () => {
    test('returns resource types', () => {
      const scanner = new TestScanner();

      expect(scanner.getResourceTypes()).toEqual(['AWS::Test::Resource']);
    });
  });

  describe('serviceName', () => {
    test('returns service name', () => {
      const scanner = new TestScanner();

      expect(scanner.serviceName).toBe('Test');
    });
  });

  describe('isGlobal', () => {
    test('returns false for regional scanner', () => {
      const scanner = new TestScanner();

      expect(scanner.isGlobal).toBe(false);
    });

    test('returns true for global scanner', () => {
      class GlobalScanner extends TestScanner {
        readonly isGlobal = true;
      }

      const scanner = new GlobalScanner();

      expect(scanner.isGlobal).toBe(true);
    });
  });
});

describe('ScannerRegistry', () => {
  test('registers and retrieves scanners', () => {
    const registry = new ScannerRegistry();
    const scanner = new TestScanner();

    registry.register(scanner);

    expect(registry.get('Test')).toBe(scanner);
  });

  test('returns undefined for unregistered scanner', () => {
    const registry = new ScannerRegistry();

    expect(registry.get('NonExistent')).toBeUndefined();
  });

  test('getAll returns all registered scanners', () => {
    const registry = new ScannerRegistry();
    const scanner1 = new TestScanner();

    class AnotherScanner extends TestScanner {
      readonly serviceName = 'Another';
    }
    const scanner2 = new AnotherScanner();

    registry.register(scanner1);
    registry.register(scanner2);

    const all = registry.getAll();

    expect(all).toHaveLength(2);
    expect(all).toContain(scanner1);
    expect(all).toContain(scanner2);
  });

  test('getServiceNames returns all service names', () => {
    const registry = new ScannerRegistry();
    const scanner = new TestScanner();

    registry.register(scanner);

    expect(registry.getServiceNames()).toContain('Test');
  });

  test('has returns true for registered service', () => {
    const registry = new ScannerRegistry();
    const scanner = new TestScanner();

    registry.register(scanner);

    expect(registry.has('Test')).toBe(true);
    expect(registry.has('NonExistent')).toBe(false);
  });
});
