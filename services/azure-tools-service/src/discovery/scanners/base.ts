/**
 * Base Scanner Interface and Abstract Class
 *
 * Provides the foundation for all Azure service scanners
 */

import type { DefaultAzureCredential } from '@azure/identity';
import type { DiscoveredResource, ResourceRelationship, ScanError } from '../types';
import { getTerraformType, extractResourceGroup } from '../types';

/**
 * Configuration for a service scanner
 */
export interface ScannerContext {
  subscriptionId: string;
  region: string;
  credential: DefaultAzureCredential;
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
  /** Service name (e.g., 'Compute', 'Storage') */
  readonly serviceName: string;

  /** Whether this service is global (not region-specific) */
  readonly isGlobal: boolean;

  /**
   * Scan for resources
   */
  scan(context: ScannerContext): Promise<ScanResult>;

  /**
   * Get resource types this scanner can discover
   */
  getResourceTypes(): string[];
}

/**
 * Abstract base class for service scanners
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
    resourceId: string;
    azureType: string;
    region: string;
    resourceGroup: string;
    name?: string;
    tags?: Record<string, string>;
    properties: Record<string, unknown>;
    relationships?: ResourceRelationship[];
    createdAt?: Date;
    status?: string;
  }): DiscoveredResource {
    return {
      id: params.id,
      resourceId: params.resourceId,
      type: getTerraformType(params.azureType),
      azureType: params.azureType,
      service: this.serviceName,
      region: params.region,
      resourceGroup: params.resourceGroup,
      name: params.name,
      tags: params.tags || {},
      properties: params.properties,
      relationships: params.relationships || [],
      createdAt: params.createdAt,
      status: params.status,
    };
  }

  /**
   * Convert Azure tags to a simple key-value record
   */
  protected tagsToRecord(tags?: Record<string, string> | null): Record<string, string> {
    return tags || {};
  }

  /**
   * Get the name from tags or use a fallback
   */
  protected getNameFromTags(
    tags?: Record<string, string> | null,
    fallback?: string
  ): string | undefined {
    return tags?.Name || tags?.name || fallback;
  }

  /**
   * Record an error during scanning
   */
  protected recordError(
    operation: string,
    message: string,
    region: string,
    code?: string
  ): void {
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
   * Extract resource group from an Azure resource ID
   */
  protected extractResourceGroup(resourceId: string): string {
    return extractResourceGroup(resourceId);
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

  register(scanner: ServiceScanner): void {
    this.scanners.set(scanner.serviceName, scanner);
  }

  get(serviceName: string): ServiceScanner | undefined {
    return this.scanners.get(serviceName);
  }

  getAll(): ServiceScanner[] {
    return Array.from(this.scanners.values());
  }

  getServiceNames(): string[] {
    return Array.from(this.scanners.keys());
  }

  has(serviceName: string): boolean {
    return this.scanners.has(serviceName);
  }
}
