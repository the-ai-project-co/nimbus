/**
 * Base Resource Mapper
 *
 * Provides common functionality for mapping AWS resources to Terraform
 */

import type { DiscoveredResource } from '../../discovery/types';
import type {
  ResourceMapper,
  MappingContext,
  TerraformResource,
  TerraformValue,
  TerraformBlock,
  TerraformReference,
  TerraformOutput,
} from '../types';
import { toTerraformIdentifier, toSnakeCase, isSensitiveField, isExcludedField } from '../types';

/**
 * Base class for resource mappers
 */
export abstract class BaseResourceMapper implements ResourceMapper {
  abstract readonly awsType: string;
  abstract readonly terraformType: string;

  abstract map(resource: DiscoveredResource, context: MappingContext): TerraformResource | null;

  /**
   * Get the import ID for a resource
   * Default implementation returns the resource ID
   */
  getImportId(resource: DiscoveredResource): string {
    return resource.id;
  }

  /**
   * Get suggested outputs for this resource type
   * Override in subclasses to provide resource-specific outputs
   */
  getSuggestedOutputs?(resource: DiscoveredResource): TerraformOutput[];

  /**
   * Generate a unique Terraform resource name
   */
  protected generateResourceName(resource: DiscoveredResource): string {
    // Prefer Name tag, then resource name, then ID
    const baseName = resource.name || resource.tags?.Name || resource.id;
    return toTerraformIdentifier(baseName);
  }

  /**
   * Create a reference to another resource
   */
  protected createReference(value: string): TerraformReference {
    return { _type: 'reference', value };
  }

  /**
   * Create a block structure
   */
  protected createBlock(attributes: Record<string, TerraformValue>): TerraformBlock {
    return { _type: 'block', attributes };
  }

  /**
   * Convert AWS tags to Terraform tags format
   */
  protected mapTags(tags: Record<string, string>): Record<string, string> {
    // Filter out AWS-managed tags
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(tags)) {
      if (!key.startsWith('aws:')) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Convert a property value, handling sensitive data
   */
  protected mapProperty(
    key: string,
    value: unknown,
    context: MappingContext
  ): TerraformValue | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    // Check if this is a sensitive field
    if (isSensitiveField(key) && typeof value === 'string') {
      return context.markSensitive(key, value, `Sensitive value for ${key}`);
    }

    // Handle different types
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((v, i) => this.mapProperty(`${key}_${i}`, v, context)).filter(v => v !== undefined) as TerraformValue[];
    }

    if (typeof value === 'object') {
      const result: Record<string, TerraformValue> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const snakeKey = toSnakeCase(k);
        const mapped = this.mapProperty(snakeKey, v, context);
        if (mapped !== undefined) {
          result[snakeKey] = mapped;
        }
      }
      return result;
    }

    return String(value);
  }

  /**
   * Try to get a reference to another resource by ARN
   */
  protected getResourceRef(arn: string | undefined, context: MappingContext): TerraformValue | undefined {
    if (!arn) return undefined;

    const ref = context.getResourceReference(arn);
    if (ref) {
      return ref;
    }

    // Return the ARN as a string if no reference found
    return arn;
  }

  /**
   * Map a list of ARNs to references
   */
  protected mapArnList(arns: string[] | undefined, context: MappingContext): TerraformValue[] | undefined {
    if (!arns || arns.length === 0) return undefined;

    return arns.map(arn => this.getResourceRef(arn, context)).filter(v => v !== undefined) as TerraformValue[];
  }
}

/**
 * Registry of resource mappers
 */
export class MapperRegistry {
  private mappers: Map<string, ResourceMapper> = new Map();

  /**
   * Register a mapper
   */
  register(mapper: ResourceMapper): void {
    this.mappers.set(mapper.awsType, mapper);
  }

  /**
   * Get a mapper by AWS type
   */
  get(awsType: string): ResourceMapper | undefined {
    return this.mappers.get(awsType);
  }

  /**
   * Get all registered mappers
   */
  getAll(): ResourceMapper[] {
    return Array.from(this.mappers.values());
  }

  /**
   * Get all AWS types with registered mappers
   */
  getAwsTypes(): string[] {
    return Array.from(this.mappers.keys());
  }

  /**
   * Check if a mapper exists for an AWS type
   */
  has(awsType: string): boolean {
    return this.mappers.has(awsType);
  }
}
