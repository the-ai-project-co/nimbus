import { describe, test, expect } from 'bun:test';
import { getAWSPrice } from '../../../src/commands/cost/pricing/aws';
import type { TerraformResource } from '../../../src/commands/cost/parsers/types';

function makeResource(type: string, attributes: Record<string, any> = {}): TerraformResource {
  return { type, name: 'test', provider: 'aws', attributes };
}

describe('AWS Pricing', () => {
  test('should return price for aws_instance with known type', () => {
    const result = getAWSPrice(makeResource('aws_instance', { instance_type: 't3.micro' }));
    expect(result).not.toBeNull();
    expect(result!.monthlyCost).toBeGreaterThan(0);
    expect(result!.hourlyCost).toBeGreaterThan(0);
  });

  test('should return default price for aws_instance with unknown type', () => {
    const result = getAWSPrice(makeResource('aws_instance', { instance_type: 'unknown.type' }));
    expect(result).not.toBeNull();
    expect(result!.monthlyCost).toBeGreaterThan(0);
  });

  test('should return price for aws_db_instance', () => {
    const result = getAWSPrice(makeResource('aws_db_instance', { instance_class: 'db.t3.micro' }));
    expect(result).not.toBeNull();
    expect(result!.monthlyCost).toBeGreaterThan(0);
  });

  test('should return price for aws_s3_bucket', () => {
    const result = getAWSPrice(makeResource('aws_s3_bucket'));
    expect(result).not.toBeNull();
    expect(result!.monthlyCost).toBeGreaterThanOrEqual(0);
  });

  test('should return price for aws_eks_cluster', () => {
    const result = getAWSPrice(makeResource('aws_eks_cluster'));
    expect(result).not.toBeNull();
    expect(result!.monthlyCost).toBeGreaterThan(0);
  });

  test('should return price for aws_nat_gateway', () => {
    const result = getAWSPrice(makeResource('aws_nat_gateway'));
    expect(result).not.toBeNull();
    expect(result!.monthlyCost).toBeGreaterThan(0);
  });

  test('should return price for aws_lb (ALB)', () => {
    const result = getAWSPrice(makeResource('aws_lb'));
    expect(result).not.toBeNull();
  });

  test('should return null for unknown resource type', () => {
    const result = getAWSPrice(makeResource('aws_totally_unknown_resource'));
    expect(result).toBeNull();
  });

  test('different instance types should return different prices', () => {
    const micro = getAWSPrice(makeResource('aws_instance', { instance_type: 't3.micro' }));
    const xlarge = getAWSPrice(makeResource('aws_instance', { instance_type: 'm5.xlarge' }));
    expect(micro).not.toBeNull();
    expect(xlarge).not.toBeNull();
    expect(xlarge!.monthlyCost).toBeGreaterThan(micro!.monthlyCost);
  });
});
