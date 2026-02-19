/**
 * Azure Subscription Manager
 *
 * Manages Azure subscription discovery and region listing
 */

import { SubscriptionClient } from '@azure/arm-subscriptions';
import { DefaultAzureCredential } from '@azure/identity';
import { logger } from '@nimbus/shared-utils';
import type { AzureRegion, AzureSubscription, RegionScanConfig } from './types';

/**
 * Common Azure regions
 */
export const COMMON_AZURE_REGIONS = [
  'eastus',
  'eastus2',
  'westus',
  'westus2',
  'westus3',
  'centralus',
  'northcentralus',
  'southcentralus',
  'westcentralus',
  'canadacentral',
  'canadaeast',
  'brazilsouth',
  'northeurope',
  'westeurope',
  'uksouth',
  'ukwest',
  'francecentral',
  'germanywestcentral',
  'norwayeast',
  'switzerlandnorth',
  'swedencentral',
  'eastasia',
  'southeastasia',
  'japaneast',
  'japanwest',
  'australiaeast',
  'australiasoutheast',
  'centralindia',
  'southindia',
  'koreacentral',
  'koreasouth',
  'southafricanorth',
  'uaenorth',
];

/**
 * Azure region display name mappings
 */
export const REGION_DISPLAY_NAMES: Record<string, string> = {
  eastus: 'East US',
  eastus2: 'East US 2',
  westus: 'West US',
  westus2: 'West US 2',
  westus3: 'West US 3',
  centralus: 'Central US',
  northcentralus: 'North Central US',
  southcentralus: 'South Central US',
  westcentralus: 'West Central US',
  canadacentral: 'Canada Central',
  canadaeast: 'Canada East',
  brazilsouth: 'Brazil South',
  northeurope: 'North Europe',
  westeurope: 'West Europe',
  uksouth: 'UK South',
  ukwest: 'UK West',
  francecentral: 'France Central',
  germanywestcentral: 'Germany West Central',
  norwayeast: 'Norway East',
  switzerlandnorth: 'Switzerland North',
  swedencentral: 'Sweden Central',
  eastasia: 'East Asia',
  southeastasia: 'Southeast Asia',
  japaneast: 'Japan East',
  japanwest: 'Japan West',
  australiaeast: 'Australia East',
  australiasoutheast: 'Australia Southeast',
  centralindia: 'Central India',
  southindia: 'South India',
  koreacentral: 'Korea Central',
  koreasouth: 'Korea South',
  southafricanorth: 'South Africa North',
  uaenorth: 'UAE North',
};

export interface SubscriptionManagerConfig {
  defaultSubscriptionId?: string;
}

/**
 * Manages Azure subscriptions and regions
 */
export class SubscriptionManager {
  private credential: DefaultAzureCredential;
  private client: SubscriptionClient;
  private defaultSubscriptionId: string;

  constructor(config: SubscriptionManagerConfig = {}) {
    this.defaultSubscriptionId =
      config.defaultSubscriptionId || process.env.AZURE_SUBSCRIPTION_ID || '';
    this.credential = new DefaultAzureCredential();
    this.client = new SubscriptionClient(this.credential);
  }

  /**
   * List all Azure regions available for a subscription
   */
  async listRegions(subscriptionId?: string): Promise<AzureRegion[]> {
    try {
      const subId = subscriptionId || this.defaultSubscriptionId;
      if (!subId) {
        // Return common regions as fallback
        return COMMON_AZURE_REGIONS.map(name => ({
          name,
          displayName: REGION_DISPLAY_NAMES[name] || name,
        }));
      }

      const regions: AzureRegion[] = [];
      for await (const location of this.client.subscriptions.listLocations(subId)) {
        regions.push({
          name: location.name || '',
          displayName: location.displayName || '',
          regionalDisplayName: location.regionalDisplayName,
          metadata: location.metadata
            ? {
                regionType: location.metadata.regionType,
                physicalLocation: location.metadata.physicalLocation,
                geography: location.metadata.geography,
                geographyGroup: location.metadata.geographyGroup,
                pairedRegion: location.metadata.pairedRegion?.[0]?.name,
              }
            : undefined,
        });
      }

      return regions;
    } catch (error: any) {
      logger.error('Failed to list Azure regions', error);
      // Return common regions as fallback
      return COMMON_AZURE_REGIONS.map(name => ({
        name,
        displayName: REGION_DISPLAY_NAMES[name] || name,
      }));
    }
  }

  /**
   * List all subscriptions
   */
  async listSubscriptions(): Promise<AzureSubscription[]> {
    try {
      const subscriptions: AzureSubscription[] = [];
      for await (const sub of this.client.subscriptions.list()) {
        subscriptions.push({
          subscriptionId: sub.subscriptionId || '',
          displayName: sub.displayName || '',
          state: sub.state || '',
          tenantId: sub.tenantId,
        });
      }
      return subscriptions;
    } catch (error: any) {
      logger.error('Failed to list subscriptions', error);
      return [];
    }
  }

  /**
   * Get display name for a region
   */
  getRegionDisplayName(regionName: string): string {
    return REGION_DISPLAY_NAMES[regionName] || regionName;
  }

  /**
   * Filter regions based on the scan config
   */
  async filterRegions(
    config: RegionScanConfig,
    subscriptionId?: string
  ): Promise<string[]> {
    let regionNames: string[];

    if (config.regions === 'all') {
      const regions = await this.listRegions(subscriptionId);
      regionNames = regions.map(r => r.name);
    } else {
      regionNames = config.regions;
    }

    if (config.excludeRegions && config.excludeRegions.length > 0) {
      regionNames = regionNames.filter(r => !config.excludeRegions!.includes(r));
    }

    return regionNames;
  }

  /**
   * Validate a list of region names
   */
  async validateRegions(
    regionNames: string[],
    subscriptionId?: string
  ): Promise<{ valid: string[]; invalid: string[] }> {
    const allRegions = await this.listRegions(subscriptionId);
    const validRegionNames = new Set(allRegions.map(r => r.name));

    const valid: string[] = [];
    const invalid: string[] = [];

    for (const name of regionNames) {
      if (validRegionNames.has(name)) {
        valid.push(name);
      } else {
        invalid.push(name);
      }
    }

    return { valid, invalid };
  }

  /**
   * Group regions by geography
   */
  groupRegionsByArea(regions: AzureRegion[]): Record<string, AzureRegion[]> {
    const grouped: Record<string, AzureRegion[]> = {};

    for (const region of regions) {
      const area = region.metadata?.geographyGroup || 'Other';
      if (!grouped[area]) {
        grouped[area] = [];
      }
      grouped[area].push(region);
    }

    return grouped;
  }
}
