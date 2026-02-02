/**
 * Base Scanner Interface and Abstract Class
 *
 * Provides the foundation for all AWS service scanners
 */

import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import type { DiscoveredResource, ResourceRelationship, ScanError } from '../types';
import { getTerraformType } from '../types';
import type { RateLimiter } from '../rate-limiter';

/**
 * Configuration for a service scanner
 */
export interface ScannerContext {
  region: string;
  credentials: AwsCredentialIdentityProvider;
  rateLimiter: RateLimiter;
  accountId: string;
}

/**
 * Result from a scan operation
 */
export interface ScanResult {
  resources: DiscoveredResource[];
  errors: ScanError[];
}

/**
 * Base interface for all service scanners
 */
export interface ServiceScanner {
  /** Service name (e.g., 'EC2', 'S3') */
  readonly serviceName: string;

  /** Whether this service is global (not region-specific) */
  readonly isGlobal: boolean;

  /**
   * Scan for resources
   * @param context - Scanner context with credentials and configuration
   * @returns Discovered resources and any errors
   */
  scan(context: ScannerContext): Promise<ScanResult>;

  /**
   * Get resource types this scanner can discover
   */
  getResourceTypes(): string[];
}

/**
 * Abstract base class for service scanners
 * Provides common functionality for all scanners
 */
export abstract class BaseScanner implements ServiceScanner {
  abstract readonly serviceName: string;
  readonly isGlobal: boolean = false;

  protected errors: ScanError[] = [];

  abstract scan(context: ScannerContext): Promise<ScanResult>;
  abstract getResourceTypes(): string[];

  /**
   * Create a discovered resource with common fields populated
   */
  protected createResource(params: {
    id: string;
    arn: string;
    awsType: string;
    region: string;
    name?: string;
    tags?: Record<string, string>;
    properties: Record<string, unknown>;
    relationships?: ResourceRelationship[];
    createdAt?: Date;
    status?: string;
  }): DiscoveredResource {
    return {
      id: params.id,
      arn: params.arn,
      type: getTerraformType(params.awsType),
      awsType: params.awsType,
      service: this.serviceName,
      region: params.region,
      name: params.name,
      tags: params.tags || {},
      properties: params.properties,
      relationships: params.relationships || [],
      createdAt: params.createdAt,
      status: params.status,
    };
  }

  /**
   * Convert AWS tags to a simple key-value record
   * Handles both EC2-style (Key/Value) and ECS-style (key/value) tags
   */
  protected tagsToRecord(tags?: Array<{ Key?: string; Value?: string } | { key?: string; value?: string }>): Record<string, string> {
    if (!tags) return {};

    return tags.reduce((acc, tag) => {
      // Handle EC2-style tags (Key/Value)
      const key = (tag as { Key?: string }).Key || (tag as { key?: string }).key;
      const value = (tag as { Value?: string }).Value || (tag as { value?: string }).value;
      if (key) {
        acc[key] = value || '';
      }
      return acc;
    }, {} as Record<string, string>);
  }

  /**
   * Get the name from tags or use a fallback
   * Handles both EC2-style (Key/Value) and ECS-style (key/value) tags
   */
  protected getNameFromTags(
    tags?: Array<{ Key?: string; Value?: string } | { key?: string; value?: string }>,
    fallback?: string
  ): string | undefined {
    // Use tagsToRecord which handles both tag formats
    const tagRecord = this.tagsToRecord(tags);
    return tagRecord['Name'] || fallback;
  }

  /**
   * Record an error during scanning
   */
  protected recordError(operation: string, message: string, region: string, code?: string): void {
    this.errors.push({
      service: this.serviceName,
      region,
      operation,
      message,
      code,
      timestamp: new Date(),
    });
  }

  /**
   * Build an ARN for a resource
   */
  protected buildArn(params: {
    partition?: string;
    service: string;
    region: string;
    accountId: string;
    resourceType?: string;
    resource: string;
  }): string {
    const partition = params.partition || 'aws';
    const resourcePart = params.resourceType
      ? `${params.resourceType}/${params.resource}`
      : params.resource;

    return `arn:${partition}:${params.service}:${params.region}:${params.accountId}:${resourcePart}`;
  }

  /**
   * Execute an operation with rate limiting
   */
  protected async withRateLimit<T>(
    context: ScannerContext,
    operation: () => Promise<T>
  ): Promise<T> {
    return context.rateLimiter.withBackoff(operation);
  }

  /**
   * Clear errors for a new scan
   */
  protected clearErrors(): void {
    this.errors = [];
  }
}

/**
 * Scanner registry for managing available scanners
 */
export class ScannerRegistry {
  private scanners: Map<string, ServiceScanner> = new Map();

  /**
   * Register a scanner
   */
  register(scanner: ServiceScanner): void {
    this.scanners.set(scanner.serviceName, scanner);
  }

  /**
   * Get a scanner by service name
   */
  get(serviceName: string): ServiceScanner | undefined {
    return this.scanners.get(serviceName);
  }

  /**
   * Get all registered scanners
   */
  getAll(): ServiceScanner[] {
    return Array.from(this.scanners.values());
  }

  /**
   * Get all service names
   */
  getServiceNames(): string[] {
    return Array.from(this.scanners.keys());
  }

  /**
   * Check if a service has a registered scanner
   */
  has(serviceName: string): boolean {
    return this.scanners.has(serviceName);
  }
}
