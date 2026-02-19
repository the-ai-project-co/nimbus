/**
 * GCP Region/Zone Management
 *
 * Handles listing and filtering GCP regions and zones for infrastructure discovery
 */

import { logger } from '@nimbus/shared-utils';
import type { GCPRegion } from './types';

export interface RegionManagerConfig {
  projectId?: string;
}

/**
 * Common GCP regions with their zones
 */
export const COMMON_GCP_REGIONS: Record<string, string[]> = {
  'us-central1': ['us-central1-a', 'us-central1-b', 'us-central1-c', 'us-central1-f'],
  'us-east1': ['us-east1-b', 'us-east1-c', 'us-east1-d'],
  'us-east4': ['us-east4-a', 'us-east4-b', 'us-east4-c'],
  'us-west1': ['us-west1-a', 'us-west1-b', 'us-west1-c'],
  'us-west2': ['us-west2-a', 'us-west2-b', 'us-west2-c'],
  'us-west3': ['us-west3-a', 'us-west3-b', 'us-west3-c'],
  'us-west4': ['us-west4-a', 'us-west4-b', 'us-west4-c'],
  'us-south1': ['us-south1-a', 'us-south1-b', 'us-south1-c'],
  'europe-west1': ['europe-west1-b', 'europe-west1-c', 'europe-west1-d'],
  'europe-west2': ['europe-west2-a', 'europe-west2-b', 'europe-west2-c'],
  'europe-west3': ['europe-west3-a', 'europe-west3-b', 'europe-west3-c'],
  'europe-west4': ['europe-west4-a', 'europe-west4-b', 'europe-west4-c'],
  'europe-west6': ['europe-west6-a', 'europe-west6-b', 'europe-west6-c'],
  'europe-north1': ['europe-north1-a', 'europe-north1-b', 'europe-north1-c'],
  'europe-central2': ['europe-central2-a', 'europe-central2-b', 'europe-central2-c'],
  'asia-east1': ['asia-east1-a', 'asia-east1-b', 'asia-east1-c'],
  'asia-east2': ['asia-east2-a', 'asia-east2-b', 'asia-east2-c'],
  'asia-northeast1': ['asia-northeast1-a', 'asia-northeast1-b', 'asia-northeast1-c'],
  'asia-northeast2': ['asia-northeast2-a', 'asia-northeast2-b', 'asia-northeast2-c'],
  'asia-northeast3': ['asia-northeast3-a', 'asia-northeast3-b', 'asia-northeast3-c'],
  'asia-south1': ['asia-south1-a', 'asia-south1-b', 'asia-south1-c'],
  'asia-south2': ['asia-south2-a', 'asia-south2-b', 'asia-south2-c'],
  'asia-southeast1': ['asia-southeast1-a', 'asia-southeast1-b', 'asia-southeast1-c'],
  'asia-southeast2': ['asia-southeast2-a', 'asia-southeast2-b', 'asia-southeast2-c'],
  'australia-southeast1': ['australia-southeast1-a', 'australia-southeast1-b', 'australia-southeast1-c'],
  'australia-southeast2': ['australia-southeast2-a', 'australia-southeast2-b', 'australia-southeast2-c'],
  'southamerica-east1': ['southamerica-east1-a', 'southamerica-east1-b', 'southamerica-east1-c'],
  'northamerica-northeast1': ['northamerica-northeast1-a', 'northamerica-northeast1-b', 'northamerica-northeast1-c'],
  'me-west1': ['me-west1-a', 'me-west1-b', 'me-west1-c'],
};

/**
 * Region display names for better UX
 */
export const REGION_DISPLAY_NAMES: Record<string, string> = {
  'us-central1': 'Iowa',
  'us-east1': 'South Carolina',
  'us-east4': 'Northern Virginia',
  'us-west1': 'Oregon',
  'us-west2': 'Los Angeles',
  'us-west3': 'Salt Lake City',
  'us-west4': 'Las Vegas',
  'us-south1': 'Dallas',
  'europe-west1': 'Belgium',
  'europe-west2': 'London',
  'europe-west3': 'Frankfurt',
  'europe-west4': 'Netherlands',
  'europe-west6': 'Zurich',
  'europe-north1': 'Finland',
  'europe-central2': 'Warsaw',
  'asia-east1': 'Taiwan',
  'asia-east2': 'Hong Kong',
  'asia-northeast1': 'Tokyo',
  'asia-northeast2': 'Osaka',
  'asia-northeast3': 'Seoul',
  'asia-south1': 'Mumbai',
  'asia-south2': 'Delhi',
  'asia-southeast1': 'Singapore',
  'asia-southeast2': 'Jakarta',
  'australia-southeast1': 'Sydney',
  'australia-southeast2': 'Melbourne',
  'southamerica-east1': 'Sao Paulo',
  'northamerica-northeast1': 'Montreal',
  'me-west1': 'Tel Aviv',
};

/**
 * Manages GCP region enumeration and filtering
 */
export class RegionManager {
  private projectId: string;
  private cachedRegions: GCPRegion[] | null = null;

  constructor(config: RegionManagerConfig = {}) {
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
  }

  /**
   * List all available GCP regions
   */
  async listRegions(projectId?: string): Promise<GCPRegion[]> {
    if (this.cachedRegions) {
      return this.cachedRegions;
    }

    try {
      const effectiveProject = projectId || this.projectId;

      if (effectiveProject) {
        const compute = require('@google-cloud/compute');
        const regionsClient = new compute.RegionsClient();
        const [regions] = await regionsClient.list({ project: effectiveProject });

        const gcpRegions: GCPRegion[] = (regions || []).map((region: any) => ({
          regionName: region.name,
          zones: (region.zones || []).map((z: string) => z.split('/').pop()),
          status: region.status,
        }));

        this.cachedRegions = gcpRegions;
        return gcpRegions;
      }
    } catch (error) {
      logger.debug('Failed to list regions from API, using defaults', { error });
    }

    // Fallback to hardcoded list
    const defaultRegions: GCPRegion[] = Object.entries(COMMON_GCP_REGIONS).map(([name, zones]) => ({
      regionName: name,
      zones,
      status: 'UP',
    }));

    this.cachedRegions = defaultRegions;
    return defaultRegions;
  }

  /**
   * Filter regions based on configuration
   */
  async filterRegions(
    config: { regions: string[] | 'all'; excludeRegions?: string[] },
    projectId?: string
  ): Promise<string[]> {
    let regionNames: string[];

    if (config.regions === 'all') {
      const allRegions = await this.listRegions(projectId);
      regionNames = allRegions.map(r => r.regionName);
    } else {
      regionNames = config.regions;
    }

    if (config.excludeRegions && config.excludeRegions.length > 0) {
      regionNames = regionNames.filter(r => !config.excludeRegions!.includes(r));
    }

    return regionNames;
  }

  /**
   * Validate that regions are valid
   */
  async validateRegions(regions: string[], projectId?: string): Promise<{
    valid: string[];
    invalid: string[];
  }> {
    const allRegions = await this.listRegions(projectId);
    const validRegionNames = new Set(allRegions.map(r => r.regionName));

    const valid: string[] = [];
    const invalid: string[] = [];

    for (const region of regions) {
      if (validRegionNames.has(region)) {
        valid.push(region);
      } else {
        invalid.push(region);
      }
    }

    return { valid, invalid };
  }

  /**
   * Get display name for a region
   */
  getRegionDisplayName(regionName: string): string {
    return REGION_DISPLAY_NAMES[regionName] || regionName;
  }

  /**
   * Group regions by geographic area
   */
  groupRegionsByArea(regions: GCPRegion[]): Record<string, GCPRegion[]> {
    const groups: Record<string, GCPRegion[]> = {
      'North America': [],
      'Europe': [],
      'Asia Pacific': [],
      'South America': [],
      'Middle East': [],
      'Australia': [],
    };

    for (const region of regions) {
      const name = region.regionName;

      if (name.startsWith('us-') || name.startsWith('northamerica-')) {
        groups['North America'].push(region);
      } else if (name.startsWith('europe-')) {
        groups['Europe'].push(region);
      } else if (name.startsWith('asia-')) {
        groups['Asia Pacific'].push(region);
      } else if (name.startsWith('southamerica-')) {
        groups['South America'].push(region);
      } else if (name.startsWith('me-')) {
        groups['Middle East'].push(region);
      } else if (name.startsWith('australia-')) {
        groups['Australia'].push(region);
      }
    }

    // Remove empty groups
    for (const key of Object.keys(groups)) {
      if (groups[key].length === 0) {
        delete groups[key];
      }
    }

    return groups;
  }

  /**
   * Get zones for a region
   */
  async getZones(regionName: string, projectId?: string): Promise<string[]> {
    const regions = await this.listRegions(projectId);
    const region = regions.find(r => r.regionName === regionName);
    return region?.zones || COMMON_GCP_REGIONS[regionName] || [];
  }

  /**
   * Clear the region cache
   */
  clearCache(): void {
    this.cachedRegions = null;
  }
}
