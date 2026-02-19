import { describe, test, expect } from 'bun:test';
import { getGCPPrice } from '../../../src/commands/cost/pricing/gcp';
import type { TerraformResource } from '../../../src/commands/cost/parsers/types';

function makeResource(type: string, attributes: Record<string, any> = {}): TerraformResource {
  return { type, name: 'test', provider: 'gcp', attributes };
}

describe('GCP Pricing', () => {
  test('should return price for google_compute_instance', () => {
    const result = getGCPPrice(makeResource('google_compute_instance', { machine_type: 'e2-medium' }));
    expect(result).not.toBeNull();
    expect(result!.monthlyCost).toBeGreaterThan(0);
  });

  test('should return price for google_container_cluster (GKE)', () => {
    const result = getGCPPrice(makeResource('google_container_cluster'));
    expect(result).not.toBeNull();
    expect(result!.monthlyCost).toBeGreaterThan(0);
  });

  test('should return price for google_storage_bucket', () => {
    const result = getGCPPrice(makeResource('google_storage_bucket'));
    expect(result).not.toBeNull();
  });

  test('should return price for google_sql_database_instance', () => {
    const result = getGCPPrice(makeResource('google_sql_database_instance'));
    expect(result).not.toBeNull();
  });

  test('should return null for unknown GCP resource type', () => {
    const result = getGCPPrice(makeResource('google_unknown_resource'));
    expect(result).toBeNull();
  });

  test('different machine types should return different prices', () => {
    const small = getGCPPrice(makeResource('google_compute_instance', { machine_type: 'e2-small' }));
    const large = getGCPPrice(makeResource('google_compute_instance', { machine_type: 'n1-standard-8' }));
    // Both should have pricing
    if (small && large) {
      expect(large.monthlyCost).toBeGreaterThan(small.monthlyCost);
    }
  });
});
