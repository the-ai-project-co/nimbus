/**
 * GCP Infrastructure Scanner
 *
 * Main orchestrator for GCP infrastructure discovery.
 * Coordinates service-specific scanners and aggregates results.
 */

import { logger } from '@nimbus/shared-utils';
import { CredentialManager } from './credentials';
import { RegionManager } from './regions';
import {
  createScannerRegistry,
  type ScannerContext,
  type ServiceScanner,
  type ScannerRegistry,
} from './scanners';
import type {
  DiscoveryConfig,
  DiscoveredResource,
  InfrastructureInventory,
  InventorySummary,
  DiscoveryProgress,
  DiscoverySession,
  ScanError,
  ScanWarning,
} from './types';
import { SUPPORTED_SERVICES } from './types';
import { randomUUID } from 'node:crypto';

export interface ScannerConfig {
  credentialManager?: CredentialManager;
  regionManager?: RegionManager;
  scannerRegistry?: ScannerRegistry;
}

export type ProgressCallback = (progress: DiscoveryProgress) => void;

/**
 * Default services to scan
 */
const DEFAULT_SERVICES = [
  'Compute',
  'Storage',
  'GKE',
  'IAM',
  'VPC',
];

/**
 * Main infrastructure scanner that orchestrates discovery across services and regions
 */
export class InfrastructureScanner {
  private credentialManager: CredentialManager;
  private regionManager: RegionManager;
  private scannerRegistry: ScannerRegistry;

  private sessions: Map<string, DiscoverySession> = new Map();
  private errors: ScanError[] = [];
  private warnings: ScanWarning[] = [];

  constructor(config: ScannerConfig = {}) {
    this.credentialManager = config.credentialManager || new CredentialManager();
    this.regionManager = config.regionManager || new RegionManager();
    this.scannerRegistry = config.scannerRegistry || createScannerRegistry();
  }

  /**
   * Start a new discovery session
   */
  async startDiscovery(
    config: DiscoveryConfig,
    onProgress?: ProgressCallback,
  ): Promise<string> {
    const sessionId = randomUUID();

    // Validate credentials
    const credentialResult = await this.credentialManager.validateCredentials(config.projectId);
    if (!credentialResult.valid || !credentialResult.credential) {
      throw new Error(`Invalid credentials: ${credentialResult.error}`);
    }

    // Determine regions to scan
    const regions = await this.regionManager.filterRegions(config.regions, config.projectId);
    if (regions.length === 0) {
      throw new Error('No valid regions to scan');
    }

    // Determine services to scan
    const services = this.filterServices(config.services, config.excludeServices);

    // Initialize session
    const session: DiscoverySession = {
      id: sessionId,
      config,
      progress: {
        status: 'pending',
        regionsScanned: 0,
        totalRegions: regions.length,
        servicesScanned: 0,
        totalServices: services.length,
        resourcesFound: 0,
        errors: [],
        startedAt: new Date(),
        updatedAt: new Date(),
      },
    };

    this.sessions.set(sessionId, session);

    // Start async discovery
    this.runDiscovery(session, regions, services, credentialResult.credential, onProgress)
      .catch(error => {
        logger.error('Discovery failed', { sessionId, error });
        session.progress.status = 'failed';
        session.progress.errors.push({
          service: 'discovery',
          region: 'global',
          operation: 'runDiscovery',
          message: error.message,
          timestamp: new Date(),
        });
      });

    return sessionId;
  }

  /**
   * Get discovery session by ID
   */
  getSession(sessionId: string): DiscoverySession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get discovery progress
   */
  getProgress(sessionId: string): DiscoveryProgress | undefined {
    return this.sessions.get(sessionId)?.progress;
  }

  /**
   * Get completed inventory
   */
  getInventory(sessionId: string): InfrastructureInventory | undefined {
    return this.sessions.get(sessionId)?.inventory;
  }

  /**
   * Get accumulated errors
   */
  getErrors(): ScanError[] {
    return [...this.errors];
  }

  /**
   * Run the discovery process
   */
  private async runDiscovery(
    session: DiscoverySession,
    regions: string[],
    services: string[],
    credential: { projectId: string; serviceAccountEmail?: string; authenticated: boolean },
    onProgress?: ProgressCallback,
  ): Promise<void> {
    const startTime = Date.now();
    session.progress.status = 'in_progress';
    this.errors = [];
    this.warnings = [];
    let apiCallCount = 0;

    const allResources: DiscoveredResource[] = [];

    // Update progress helper
    const updateProgress = () => {
      session.progress.updatedAt = new Date();
      session.progress.resourcesFound = allResources.length;
      onProgress?.(session.progress);
    };

    try {
      // Scan each region
      for (let regionIndex = 0; regionIndex < regions.length; regionIndex++) {
        const region = regions[regionIndex];
        session.progress.currentRegion = region;

        // Create scanner context for this region
        const context: ScannerContext = {
          projectId: credential.projectId,
          region,
        };

        // Scan each service in the region
        for (let serviceIndex = 0; serviceIndex < services.length; serviceIndex++) {
          const service = services[serviceIndex];
          session.progress.currentService = service;
          updateProgress();

          // Check if session was cancelled (status may be mutated externally by cancelDiscovery)
          const currentStatus: string = session.progress.status;
          if (currentStatus === 'failed') {
            return;
          }

          try {
            const scanner = this.scannerRegistry.get(service);
            if (!scanner) {
              logger.debug(`No scanner found for service ${service}`);
              continue;
            }

            // Skip global services for non-first regions
            // IAM is global -- only scan once in the first region
            if (scanner.isGlobal && regionIndex > 0) {
              continue;
            }

            const result = await scanner.scan(context);

            allResources.push(...result.resources);
            this.errors.push(...result.errors);
            apiCallCount++;

            logger.debug(`Scanned ${service} in ${region}`, {
              resourceCount: result.resources.length,
              errorCount: result.errors.length,
            });
          } catch (error: any) {
            this.errors.push({
              service,
              region,
              operation: 'scan',
              message: error.message,
              code: error.code,
              timestamp: new Date(),
            });

            logger.warn(`Failed to scan ${service} in ${region}`, { error: error.message });
          }

          session.progress.servicesScanned = serviceIndex + 1;
          updateProgress();
        }

        session.progress.regionsScanned = regionIndex + 1;
        session.progress.servicesScanned = 0; // Reset for next region
        updateProgress();
      }

      // Deduplicate resources (some may be discovered by multiple scanners)
      const uniqueResources = this.deduplicateResources(allResources);

      // Build inventory
      const inventory: InfrastructureInventory = {
        id: session.id,
        timestamp: new Date(),
        provider: 'gcp',
        projectId: credential.projectId,
        credential,
        regions,
        summary: this.buildSummary(uniqueResources),
        resources: uniqueResources,
        metadata: {
          scanDuration: Date.now() - startTime,
          apiCallCount,
          startedAt: session.progress.startedAt,
          completedAt: new Date(),
          errors: this.errors,
          warnings: this.warnings,
        },
      };

      session.inventory = inventory;
      session.progress.status = 'completed';
      session.progress.errors = this.errors;
      session.progress.currentRegion = undefined;
      session.progress.currentService = undefined;
      session.progress.resourcesFound = uniqueResources.length;
      updateProgress();

      logger.info('Discovery completed', {
        sessionId: session.id,
        totalResources: uniqueResources.length,
        duration: `${Math.round((Date.now() - startTime) / 1000)}s`,
      });
    } catch (error: any) {
      session.progress.status = 'failed';
      session.progress.errors.push({
        service: 'discovery',
        region: 'global',
        operation: 'runDiscovery',
        message: error.message,
        timestamp: new Date(),
      });
      updateProgress();
      throw error;
    }
  }

  /**
   * Deduplicate resources by selfLink
   */
  private deduplicateResources(resources: DiscoveredResource[]): DiscoveredResource[] {
    const seen = new Map<string, DiscoveredResource>();

    for (const resource of resources) {
      const key = resource.selfLink || `${resource.type}:${resource.id}`;
      const existing = seen.get(key);

      if (!existing) {
        seen.set(key, resource);
      } else {
        // Merge relationships and prefer more complete resource data
        const mergedRelationships = [...existing.relationships];
        for (const rel of resource.relationships) {
          if (!mergedRelationships.some(r => r.targetSelfLink === rel.targetSelfLink && r.type === rel.type)) {
            mergedRelationships.push(rel);
          }
        }

        // Merge properties
        const mergedProperties = { ...existing.properties, ...resource.properties };

        // Merge labels
        const mergedLabels = { ...existing.labels, ...resource.labels };

        seen.set(key, {
          ...existing,
          ...resource,
          relationships: mergedRelationships,
          properties: mergedProperties,
          labels: mergedLabels,
        });
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Filter services based on include/exclude lists
   */
  private filterServices(include?: string[], exclude?: string[]): string[] {
    let services: string[];

    if (include && include.length > 0) {
      services = include.filter(s => this.isValidService(s));
    } else {
      services = [...DEFAULT_SERVICES];
    }

    if (exclude && exclude.length > 0) {
      services = services.filter(s => !exclude.includes(s));
    }

    return services;
  }

  /**
   * Check if a service name is valid
   */
  private isValidService(service: string): boolean {
    return this.scannerRegistry.has(service) || DEFAULT_SERVICES.includes(service);
  }

  /**
   * Build summary from resources
   */
  private buildSummary(resources: DiscoveredResource[]): InventorySummary {
    const resourcesByService: Record<string, number> = {};
    const resourcesByRegion: Record<string, number> = {};
    const resourcesByType: Record<string, number> = {};

    for (const resource of resources) {
      resourcesByService[resource.service] = (resourcesByService[resource.service] || 0) + 1;
      resourcesByRegion[resource.region] = (resourcesByRegion[resource.region] || 0) + 1;
      resourcesByType[resource.type] = (resourcesByType[resource.type] || 0) + 1;
    }

    return {
      totalResources: resources.length,
      resourcesByService,
      resourcesByRegion,
      resourcesByType,
    };
  }

  /**
   * Cancel a running discovery session
   */
  cancelDiscovery(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.progress.status === 'in_progress') {
      session.progress.status = 'failed';
      session.progress.errors.push({
        service: 'discovery',
        region: 'global',
        operation: 'cancel',
        message: 'Discovery cancelled by user',
        timestamp: new Date(),
      });
      return true;
    }

    return false;
  }

  /**
   * Clean up old sessions
   */
  cleanupSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const sessionAge = now - session.progress.startedAt.getTime();
      if (sessionAge > maxAgeMs) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get available services
   */
  getAvailableServices(): string[] {
    return this.scannerRegistry.getServiceNames();
  }
}
