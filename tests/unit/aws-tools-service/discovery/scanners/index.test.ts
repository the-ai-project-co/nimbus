/**
 * Unit tests for Scanner Index and Factory Functions
 */

import { describe, test, expect } from 'bun:test';
import {
  createScannerRegistry,
  getScanner,
  getAllScanners,
  SERVICE_SCANNER_MAP,
} from '../../../../../services/aws-tools-service/src/discovery/scanners';

describe('createScannerRegistry', () => {
  test('creates registry with all scanners registered', () => {
    const registry = createScannerRegistry();

    // Check that all expected scanners are registered
    expect(registry.has('Tagging')).toBe(true);
    expect(registry.has('EC2')).toBe(true);
    expect(registry.has('S3')).toBe(true);
    expect(registry.has('RDS')).toBe(true);
    expect(registry.has('Lambda')).toBe(true);
    expect(registry.has('VPC')).toBe(true);
    expect(registry.has('IAM')).toBe(true);
    expect(registry.has('ECS')).toBe(true);
    expect(registry.has('DynamoDB')).toBe(true);
    expect(registry.has('CloudFront')).toBe(true);
  });

  test('registry returns correct scanner instances', () => {
    const registry = createScannerRegistry();

    const ec2Scanner = registry.get('EC2');
    expect(ec2Scanner).toBeDefined();
    expect(ec2Scanner?.serviceName).toBe('EC2');
    expect(ec2Scanner?.isGlobal).toBe(false);

    const iamScanner = registry.get('IAM');
    expect(iamScanner).toBeDefined();
    expect(iamScanner?.serviceName).toBe('IAM');
    expect(iamScanner?.isGlobal).toBe(true);

    const s3Scanner = registry.get('S3');
    expect(s3Scanner).toBeDefined();
    expect(s3Scanner?.serviceName).toBe('S3');
    expect(s3Scanner?.isGlobal).toBe(true);
  });
});

describe('getScanner', () => {
  test('returns scanner for valid service name', () => {
    const scanner = getScanner('EC2');

    expect(scanner).toBeDefined();
    expect(scanner?.serviceName).toBe('EC2');
  });

  test('returns undefined for invalid service name', () => {
    const scanner = getScanner('NonExistent');

    expect(scanner).toBeUndefined();
  });
});

describe('getAllScanners', () => {
  test('returns array of all scanners', () => {
    const scanners = getAllScanners();

    expect(scanners.length).toBeGreaterThanOrEqual(10);

    // Verify some scanners are present
    const serviceNames = scanners.map(s => s.serviceName);
    expect(serviceNames).toContain('EC2');
    expect(serviceNames).toContain('S3');
    expect(serviceNames).toContain('RDS');
    expect(serviceNames).toContain('IAM');
  });
});

describe('SERVICE_SCANNER_MAP', () => {
  test('contains all expected services', () => {
    expect(SERVICE_SCANNER_MAP['EC2']).toBeDefined();
    expect(SERVICE_SCANNER_MAP['S3']).toBeDefined();
    expect(SERVICE_SCANNER_MAP['RDS']).toBeDefined();
    expect(SERVICE_SCANNER_MAP['Lambda']).toBeDefined();
    expect(SERVICE_SCANNER_MAP['VPC']).toBeDefined();
    expect(SERVICE_SCANNER_MAP['IAM']).toBeDefined();
    expect(SERVICE_SCANNER_MAP['ECS']).toBeDefined();
    expect(SERVICE_SCANNER_MAP['EKS']).toBeDefined();
    expect(SERVICE_SCANNER_MAP['DynamoDB']).toBeDefined();
    expect(SERVICE_SCANNER_MAP['CloudFront']).toBeDefined();
  });

  test('ECS and EKS share the same scanner class', () => {
    expect(SERVICE_SCANNER_MAP['ECS']).toBe(SERVICE_SCANNER_MAP['EKS']);
  });

  test('scanner classes can be instantiated', () => {
    for (const [serviceName, ScannerClass] of Object.entries(SERVICE_SCANNER_MAP)) {
      const scanner = new ScannerClass();
      expect(scanner).toBeDefined();
      expect(scanner.serviceName).toBeDefined();
    }
  });
});

describe('Scanner getResourceTypes', () => {
  test('EC2 scanner returns EC2 resource types', () => {
    const scanner = getScanner('EC2');
    const types = scanner?.getResourceTypes() || [];

    expect(types).toContain('AWS::EC2::Instance');
    expect(types).toContain('AWS::EC2::Volume');
    expect(types).toContain('AWS::EC2::SecurityGroup');
  });

  test('S3 scanner returns S3 resource types', () => {
    const scanner = getScanner('S3');
    const types = scanner?.getResourceTypes() || [];

    expect(types).toContain('AWS::S3::Bucket');
  });

  test('RDS scanner returns RDS resource types', () => {
    const scanner = getScanner('RDS');
    const types = scanner?.getResourceTypes() || [];

    expect(types).toContain('AWS::RDS::DBInstance');
    expect(types).toContain('AWS::RDS::DBCluster');
  });

  test('Lambda scanner returns Lambda resource types', () => {
    const scanner = getScanner('Lambda');
    const types = scanner?.getResourceTypes() || [];

    expect(types).toContain('AWS::Lambda::Function');
    expect(types).toContain('AWS::Lambda::LayerVersion');
  });

  test('VPC scanner returns VPC resource types', () => {
    const scanner = getScanner('VPC');
    const types = scanner?.getResourceTypes() || [];

    expect(types).toContain('AWS::EC2::VPC');
    expect(types).toContain('AWS::EC2::Subnet');
    expect(types).toContain('AWS::EC2::RouteTable');
    expect(types).toContain('AWS::EC2::InternetGateway');
    expect(types).toContain('AWS::EC2::NatGateway');
  });

  test('IAM scanner returns IAM resource types', () => {
    const scanner = getScanner('IAM');
    const types = scanner?.getResourceTypes() || [];

    expect(types).toContain('AWS::IAM::Role');
    expect(types).toContain('AWS::IAM::Policy');
    expect(types).toContain('AWS::IAM::User');
    expect(types).toContain('AWS::IAM::Group');
  });

  test('ECS scanner returns ECS and EKS resource types', () => {
    const scanner = getScanner('ECS');
    const types = scanner?.getResourceTypes() || [];

    expect(types).toContain('AWS::ECS::Cluster');
    expect(types).toContain('AWS::ECS::Service');
    expect(types).toContain('AWS::EKS::Cluster');
    expect(types).toContain('AWS::EKS::Nodegroup');
  });

  test('DynamoDB scanner returns DynamoDB resource types', () => {
    const scanner = getScanner('DynamoDB');
    const types = scanner?.getResourceTypes() || [];

    expect(types).toContain('AWS::DynamoDB::Table');
  });

  test('CloudFront scanner returns CloudFront resource types', () => {
    const scanner = getScanner('CloudFront');
    const types = scanner?.getResourceTypes() || [];

    expect(types).toContain('AWS::CloudFront::Distribution');
  });
});

describe('Scanner isGlobal property', () => {
  test('global services are marked as global', () => {
    expect(getScanner('IAM')?.isGlobal).toBe(true);
    expect(getScanner('S3')?.isGlobal).toBe(true);
    expect(getScanner('CloudFront')?.isGlobal).toBe(true);
  });

  test('regional services are not marked as global', () => {
    expect(getScanner('EC2')?.isGlobal).toBe(false);
    expect(getScanner('RDS')?.isGlobal).toBe(false);
    expect(getScanner('Lambda')?.isGlobal).toBe(false);
    expect(getScanner('VPC')?.isGlobal).toBe(false);
    expect(getScanner('ECS')?.isGlobal).toBe(false);
    expect(getScanner('DynamoDB')?.isGlobal).toBe(false);
  });
});
