/**
 * AWS Region Enumeration Utility
 *
 * Handles listing and filtering AWS regions for infrastructure discovery
 */

import {
  EC2Client,
  DescribeRegionsCommand,
  type DescribeRegionsCommandInput,
} from '@aws-sdk/client-ec2';
import {
  AccountClient,
  ListRegionsCommand,
  type RegionOptStatus,
} from '@aws-sdk/client-account';
import { logger } from '@nimbus/shared-utils';
import { CredentialManager } from './credentials';
import type { AWSRegion } from './types';

export interface RegionManagerConfig {
  defaultRegion?: string;
}

/**
 * Common AWS regions - used as fallback if API calls fail
 */
export const COMMON_AWS_REGIONS = [
  'us-east-1',      // N. Virginia
  'us-east-2',      // Ohio
  'us-west-1',      // N. California
  'us-west-2',      // Oregon
  'ca-central-1',   // Canada
  'eu-west-1',      // Ireland
  'eu-west-2',      // London
  'eu-west-3',      // Paris
  'eu-central-1',   // Frankfurt
  'eu-north-1',     // Stockholm
  'eu-south-1',     // Milan
  'ap-southeast-1', // Singapore
  'ap-southeast-2', // Sydney
  'ap-northeast-1', // Tokyo
  'ap-northeast-2', // Seoul
  'ap-northeast-3', // Osaka
  'ap-south-1',     // Mumbai
  'sa-east-1',      // São Paulo
] as const;

/**
 * Regions that require opt-in
 */
export const OPT_IN_REGIONS = [
  'af-south-1',     // Cape Town
  'ap-east-1',      // Hong Kong
  'ap-south-2',     // Hyderabad
  'ap-southeast-3', // Jakarta
  'ap-southeast-4', // Melbourne
  'eu-south-2',     // Spain
  'eu-central-2',   // Zurich
  'me-south-1',     // Bahrain
  'me-central-1',   // UAE
  'il-central-1',   // Tel Aviv
] as const;

/**
 * Region display names for better UX
 */
export const REGION_DISPLAY_NAMES: Record<string, string> = {
  'us-east-1': 'US East (N. Virginia)',
  'us-east-2': 'US East (Ohio)',
  'us-west-1': 'US West (N. California)',
  'us-west-2': 'US West (Oregon)',
  'ca-central-1': 'Canada (Central)',
  'eu-west-1': 'Europe (Ireland)',
  'eu-west-2': 'Europe (London)',
  'eu-west-3': 'Europe (Paris)',
  'eu-central-1': 'Europe (Frankfurt)',
  'eu-north-1': 'Europe (Stockholm)',
  'eu-south-1': 'Europe (Milan)',
  'eu-south-2': 'Europe (Spain)',
  'eu-central-2': 'Europe (Zurich)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'ap-southeast-2': 'Asia Pacific (Sydney)',
  'ap-southeast-3': 'Asia Pacific (Jakarta)',
  'ap-southeast-4': 'Asia Pacific (Melbourne)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
  'ap-northeast-2': 'Asia Pacific (Seoul)',
  'ap-northeast-3': 'Asia Pacific (Osaka)',
  'ap-south-1': 'Asia Pacific (Mumbai)',
  'ap-south-2': 'Asia Pacific (Hyderabad)',
  'ap-east-1': 'Asia Pacific (Hong Kong)',
  'sa-east-1': 'South America (São Paulo)',
  'af-south-1': 'Africa (Cape Town)',
  'me-south-1': 'Middle East (Bahrain)',
  'me-central-1': 'Middle East (UAE)',
  'il-central-1': 'Israel (Tel Aviv)',
};

/**
 * Manages AWS region enumeration and filtering
 */
export class RegionManager {
  private credentialManager: CredentialManager;
  private defaultRegion: string;
  private cachedRegions: Map<string, AWSRegion[]> = new Map();

  constructor(config: RegionManagerConfig = {}) {
    this.credentialManager = new CredentialManager({
      defaultRegion: config.defaultRegion,
    });
    this.defaultRegion = config.defaultRegion || 'us-east-1';
  }

  /**
   * List all available AWS regions for a profile
   * Attempts to use Account API for opt-in status, falls back to EC2 API
   */
  async listRegions(profile?: string): Promise<AWSRegion[]> {
    const cacheKey = profile || 'default';

    // Return cached results if available
    if (this.cachedRegions.has(cacheKey)) {
      return this.cachedRegions.get(cacheKey)!;
    }

    try {
      // Try Account API first (provides opt-in status)
      const regions = await this.listRegionsWithOptInStatus(profile);
      this.cachedRegions.set(cacheKey, regions);
      return regions;
    } catch (error) {
      logger.debug('Account API failed, falling back to EC2 API', { error });

      try {
        // Fall back to EC2 API
        const regions = await this.listRegionsFromEC2(profile);
        this.cachedRegions.set(cacheKey, regions);
        return regions;
      } catch (ec2Error) {
        logger.warn('EC2 API failed, using default region list', { error: ec2Error });

        // Final fallback to hardcoded list
        const defaultRegions = COMMON_AWS_REGIONS.map(regionName => ({
          regionName,
          endpoint: `ec2.${regionName}.amazonaws.com`,
          optInStatus: 'opt-in-not-required' as const,
        }));

        this.cachedRegions.set(cacheKey, defaultRegions);
        return defaultRegions;
      }
    }
  }

  /**
   * List regions using Account API (provides opt-in status)
   */
  private async listRegionsWithOptInStatus(profile?: string): Promise<AWSRegion[]> {
    const credentials = await this.credentialManager.getCredentialsProvider(profile);

    const accountClient = new AccountClient({
      region: this.defaultRegion,
      credentials,
    });

    const command = new ListRegionsCommand({
      RegionOptStatusContains: [
        'ENABLED',
        'ENABLED_BY_DEFAULT',
      ],
    });

    const response = await accountClient.send(command);

    return (response.Regions || []).map(region => ({
      regionName: region.RegionName!,
      endpoint: `ec2.${region.RegionName}.amazonaws.com`,
      optInStatus: this.mapOptInStatus(region.RegionOptStatus),
    }));
  }

  /**
   * Map Account API opt-in status to our format
   */
  private mapOptInStatus(status?: RegionOptStatus): AWSRegion['optInStatus'] {
    switch (status) {
      case 'ENABLED':
        return 'opted-in';
      case 'ENABLED_BY_DEFAULT':
        return 'opt-in-not-required';
      case 'DISABLED':
      case 'DISABLING':
      case 'ENABLING':
      default:
        return 'not-opted-in';
    }
  }

  /**
   * List regions using EC2 API (fallback)
   */
  private async listRegionsFromEC2(profile?: string): Promise<AWSRegion[]> {
    const credentials = await this.credentialManager.getCredentialsProvider(profile);

    const ec2Client = new EC2Client({
      region: this.defaultRegion,
      credentials,
    });

    const input: DescribeRegionsCommandInput = {
      AllRegions: false, // Only return regions enabled for the account
    };

    const command = new DescribeRegionsCommand(input);
    const response = await ec2Client.send(command);

    return (response.Regions || []).map(region => ({
      regionName: region.RegionName!,
      endpoint: region.Endpoint!,
      optInStatus: (OPT_IN_REGIONS as readonly string[]).includes(region.RegionName!)
        ? 'opted-in'
        : 'opt-in-not-required',
    }));
  }

  /**
   * List only enabled regions (regions the account can use)
   */
  async listEnabledRegions(profile?: string): Promise<AWSRegion[]> {
    const allRegions = await this.listRegions(profile);
    return allRegions.filter(r =>
      r.optInStatus === 'opted-in' || r.optInStatus === 'opt-in-not-required'
    );
  }

  /**
   * Filter regions based on configuration
   */
  async filterRegions(
    config: { regions: string[] | 'all'; excludeRegions?: string[] },
    profile?: string
  ): Promise<string[]> {
    let regionNames: string[];

    if (config.regions === 'all') {
      const enabledRegions = await this.listEnabledRegions(profile);
      regionNames = enabledRegions.map(r => r.regionName);
    } else {
      regionNames = config.regions;
    }

    // Apply exclusions
    if (config.excludeRegions && config.excludeRegions.length > 0) {
      regionNames = regionNames.filter(r => !config.excludeRegions!.includes(r));
    }

    return regionNames;
  }

  /**
   * Validate that regions are valid and accessible
   */
  async validateRegions(regions: string[], profile?: string): Promise<{
    valid: string[];
    invalid: string[];
  }> {
    const enabledRegions = await this.listEnabledRegions(profile);
    const enabledRegionNames = new Set(enabledRegions.map(r => r.regionName));

    const valid: string[] = [];
    const invalid: string[] = [];

    for (const region of regions) {
      if (enabledRegionNames.has(region)) {
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
   * Group regions by geographic area for better display
   */
  groupRegionsByArea(regions: AWSRegion[]): Record<string, AWSRegion[]> {
    const groups: Record<string, AWSRegion[]> = {
      'North America': [],
      'Europe': [],
      'Asia Pacific': [],
      'South America': [],
      'Middle East': [],
      'Africa': [],
    };

    for (const region of regions) {
      const name = region.regionName;

      if (name.startsWith('us-') || name.startsWith('ca-')) {
        groups['North America'].push(region);
      } else if (name.startsWith('eu-')) {
        groups['Europe'].push(region);
      } else if (name.startsWith('ap-')) {
        groups['Asia Pacific'].push(region);
      } else if (name.startsWith('sa-')) {
        groups['South America'].push(region);
      } else if (name.startsWith('me-') || name.startsWith('il-')) {
        groups['Middle East'].push(region);
      } else if (name.startsWith('af-')) {
        groups['Africa'].push(region);
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
   * Clear the region cache
   */
  clearCache(): void {
    this.cachedRegions.clear();
  }
}
