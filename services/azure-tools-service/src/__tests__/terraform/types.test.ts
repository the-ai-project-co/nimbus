import { describe, test, expect } from 'bun:test';
import {
  isExcludedField,
  toTerraformIdentifier,
  toSnakeCase,
  EXCLUDED_FIELDS,
} from '../../terraform/types';

describe('Azure Terraform Types', () => {
  describe('EXCLUDED_FIELDS', () => {
    test('should contain common read-only fields', () => {
      expect(EXCLUDED_FIELDS).toContain('id');
      expect(EXCLUDED_FIELDS).toContain('provisioningState');
      expect(EXCLUDED_FIELDS).toContain('etag');
    });
  });

  describe('isExcludedField', () => {
    test('should return true for excluded fields', () => {
      expect(isExcludedField('id')).toBe(true);
      expect(isExcludedField('provisioningState')).toBe(true);
      expect(isExcludedField('etag')).toBe(true);
      expect(isExcludedField('status')).toBe(true);
    });

    test('should return false for normal fields', () => {
      expect(isExcludedField('name')).toBe(false);
      expect(isExcludedField('location')).toBe(false);
      expect(isExcludedField('sku')).toBe(false);
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
      expect(toTerraformIdentifier('my--resource')).toBe('my_resource');
    });

    test('should remove trailing underscores', () => {
      expect(toTerraformIdentifier('resource_')).toBe('resource');
    });

    test('should lowercase the result', () => {
      expect(toTerraformIdentifier('MyResource')).toBe('myresource');
    });
  });

  describe('toSnakeCase', () => {
    test('should convert camelCase to snake_case', () => {
      expect(toSnakeCase('resourceGroup')).toBe('resource_group');
    });

    test('should handle consecutive capitals', () => {
      const result = toSnakeCase('VNet');
      expect(result).toContain('_');
    });

    test('should handle already snake_case', () => {
      expect(toSnakeCase('already_snake')).toBe('already_snake');
    });

    test('should handle simple lowercase', () => {
      expect(toSnakeCase('simple')).toBe('simple');
    });
  });
});
