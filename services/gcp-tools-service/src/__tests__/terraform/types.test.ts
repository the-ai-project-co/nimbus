import { describe, test, expect } from 'bun:test';
import {
  getServiceForTerraformType,
  toTerraformIdentifier,
  TERRAFORM_TYPE_TO_SERVICE,
} from '../../terraform/types';

describe('GCP Terraform Types', () => {
  describe('TERRAFORM_TYPE_TO_SERVICE', () => {
    test('should map compute types to compute service', () => {
      expect(TERRAFORM_TYPE_TO_SERVICE['google_compute_instance']).toBe('compute');
      expect(TERRAFORM_TYPE_TO_SERVICE['google_compute_disk']).toBe('compute');
      expect(TERRAFORM_TYPE_TO_SERVICE['google_compute_firewall']).toBe('compute');
    });

    test('should map vpc types to vpc service', () => {
      expect(TERRAFORM_TYPE_TO_SERVICE['google_compute_network']).toBe('vpc');
      expect(TERRAFORM_TYPE_TO_SERVICE['google_compute_subnetwork']).toBe('vpc');
    });

    test('should map storage types to storage service', () => {
      expect(TERRAFORM_TYPE_TO_SERVICE['google_storage_bucket']).toBe('storage');
    });

    test('should map gke types to gke service', () => {
      expect(TERRAFORM_TYPE_TO_SERVICE['google_container_cluster']).toBe('gke');
    });

    test('should map iam types to iam service', () => {
      expect(TERRAFORM_TYPE_TO_SERVICE['google_service_account']).toBe('iam');
    });
  });

  describe('getServiceForTerraformType', () => {
    test('should return correct service for known types', () => {
      expect(getServiceForTerraformType('google_compute_instance')).toBe('compute');
      expect(getServiceForTerraformType('google_storage_bucket')).toBe('storage');
      expect(getServiceForTerraformType('google_container_cluster')).toBe('gke');
    });

    test('should return misc for unknown types', () => {
      expect(getServiceForTerraformType('google_unknown_thing')).toBe('misc');
      expect(getServiceForTerraformType('random_type')).toBe('misc');
    });
  });

  describe('toTerraformIdentifier', () => {
    test('should convert hyphens to underscores', () => {
      expect(toTerraformIdentifier('my-resource')).toBe('my_resource');
    });

    test('should prefix with underscore when starting with digit', () => {
      expect(toTerraformIdentifier('123abc')).toBe('_123abc');
    });

    test('should collapse multiple underscores', () => {
      expect(toTerraformIdentifier('my--resource--name')).toBe('my_resource_name');
    });

    test('should remove trailing underscores', () => {
      expect(toTerraformIdentifier('resource_')).toBe('resource');
    });

    test('should lowercase the result', () => {
      expect(toTerraformIdentifier('MyResource')).toBe('myresource');
    });

    test('should handle special characters', () => {
      expect(toTerraformIdentifier('my.resource@name')).toBe('my_resource_name');
    });
  });
});
