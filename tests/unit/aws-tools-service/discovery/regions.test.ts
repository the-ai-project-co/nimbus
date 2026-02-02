/**
 * Unit tests for Region Manager
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  RegionManager,
  COMMON_AWS_REGIONS,
  OPT_IN_REGIONS,
  REGION_DISPLAY_NAMES,
} from '../../../../services/aws-tools-service/src/discovery/regions';

describe('RegionManager', () => {
  let regionManager: RegionManager;

  beforeEach(() => {
    regionManager = new RegionManager({ defaultRegion: 'us-east-1' });
    regionManager.clearCache();
  });

  describe('getRegionDisplayName', () => {
    test('returns display name for known region', () => {
      expect(regionManager.getRegionDisplayName('us-east-1')).toBe('US East (N. Virginia)');
      expect(regionManager.getRegionDisplayName('eu-west-1')).toBe('Europe (Ireland)');
      expect(regionManager.getRegionDisplayName('ap-northeast-1')).toBe('Asia Pacific (Tokyo)');
    });

    test('returns region name for unknown region', () => {
      expect(regionManager.getRegionDisplayName('unknown-region-1')).toBe('unknown-region-1');
    });
  });

  describe('groupRegionsByArea', () => {
    test('groups regions by geographic area', () => {
      const regions = [
        { regionName: 'us-east-1', endpoint: 'ec2.us-east-1.amazonaws.com' },
        { regionName: 'us-west-2', endpoint: 'ec2.us-west-2.amazonaws.com' },
        { regionName: 'eu-west-1', endpoint: 'ec2.eu-west-1.amazonaws.com' },
        { regionName: 'ap-northeast-1', endpoint: 'ec2.ap-northeast-1.amazonaws.com' },
      ];

      const grouped = regionManager.groupRegionsByArea(regions);

      expect(grouped['North America']).toHaveLength(2);
      expect(grouped['Europe']).toHaveLength(1);
      expect(grouped['Asia Pacific']).toHaveLength(1);
    });

    test('excludes empty groups', () => {
      const regions = [
        { regionName: 'us-east-1', endpoint: 'ec2.us-east-1.amazonaws.com' },
      ];

      const grouped = regionManager.groupRegionsByArea(regions);

      expect(grouped['North America']).toHaveLength(1);
      expect(grouped['Europe']).toBeUndefined();
      expect(grouped['Asia Pacific']).toBeUndefined();
    });
  });

  describe('filterRegions', () => {
    test('returns all regions when "all" is specified', async () => {
      // This would normally call AWS API, but we test the logic with mocked data
      const result = await regionManager.filterRegions({
        regions: 'all',
      });

      // Should return common regions as fallback
      expect(result.length).toBeGreaterThan(0);
    });

    test('returns specific regions when array is specified', async () => {
      const result = await regionManager.filterRegions({
        regions: ['us-east-1', 'us-west-2'],
      });

      expect(result).toEqual(['us-east-1', 'us-west-2']);
    });

    test('applies exclusions', async () => {
      const result = await regionManager.filterRegions({
        regions: ['us-east-1', 'us-west-2', 'eu-west-1'],
        excludeRegions: ['us-west-2'],
      });

      expect(result).toEqual(['us-east-1', 'eu-west-1']);
    });
  });

  describe('clearCache', () => {
    test('clears cached regions', () => {
      // Just verify it doesn't throw
      regionManager.clearCache();
    });
  });
});

describe('Region Constants', () => {
  test('COMMON_AWS_REGIONS contains major regions', () => {
    expect(COMMON_AWS_REGIONS).toContain('us-east-1');
    expect(COMMON_AWS_REGIONS).toContain('us-west-2');
    expect(COMMON_AWS_REGIONS).toContain('eu-west-1');
    expect(COMMON_AWS_REGIONS).toContain('ap-northeast-1');
  });

  test('OPT_IN_REGIONS contains opt-in regions', () => {
    expect(OPT_IN_REGIONS).toContain('af-south-1');
    expect(OPT_IN_REGIONS).toContain('ap-east-1');
    expect(OPT_IN_REGIONS).toContain('me-south-1');
  });

  test('REGION_DISPLAY_NAMES has entries for common regions', () => {
    expect(REGION_DISPLAY_NAMES['us-east-1']).toBeDefined();
    expect(REGION_DISPLAY_NAMES['eu-west-1']).toBeDefined();
    expect(REGION_DISPLAY_NAMES['ap-northeast-1']).toBeDefined();
  });
});
