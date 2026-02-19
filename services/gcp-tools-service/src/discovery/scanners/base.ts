/**
 * Base Scanner Interface and Abstract Class
 *
 * Provides the foundation for all GCP service scanners
 */

import type { DiscoveredResource, ResourceRelationship, ScanError } from '../types';
import { getTerraformType } from '../types';

/**
 * Configuration for a service scanner
 */
export interface ScannerContext {
  projectId: string;
  region: string;
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
   * @param context - Scanner context with project and region
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
    selfLink: string;
    gcpType: string;
    region: string;
    name?: string;
    labels?: Record<string, string>;
    properties: Record<string, unknown>;
    relationships?: ResourceRelationship[];
    createdAt?: Date;
    status?: string;
  }): DiscoveredResource {
    return {
      id: params.id,
      selfLink: params.selfLink,
      type: getTerraformType(params.gcpType),
      gcpType: params.gcpType,
      service: this.serviceName,
      region: params.region,
      name: params.name,
      labels: params.labels || {},
      properties: params.properties,
      relationships: params.relationships || [],
      createdAt: params.createdAt,
      status: params.status,
    };
  }

  /**
   * Convert GCP labels to a simple key-value record
   */
  protected labelsToRecord(labels?: Record<string, string> | null): Record<string, string> {
    if (!labels) return {};
    return { ...labels };
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
   * Build a selfLink for a resource
   */
  protected buildSelfLink(params: {
    project: string;
    resource: string;
    type: string;
    region?: string;
    zone?: string;
  }): string {
    const base = 'https://www.googleapis.com/compute/v1';

    if (params.zone) {
      return `${base}/projects/${params.project}/zones/${params.zone}/${params.type}/${params.resource}`;
    }

    if (params.region) {
      return `${base}/projects/${params.project}/regions/${params.region}/${params.type}/${params.resource}`;
    }

    return `${base}/projects/${params.project}/global/${params.type}/${params.resource}`;
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
