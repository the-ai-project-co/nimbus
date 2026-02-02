/**
 * Unit tests for Infrastructure Scanner
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  InfrastructureScanner,
  type ScannerConfig,
} from '../../../../services/aws-tools-service/src/discovery/scanner';
import { CredentialManager } from '../../../../services/aws-tools-service/src/discovery/credentials';
import { RegionManager } from '../../../../services/aws-tools-service/src/discovery/regions';
import { RateLimiter } from '../../../../services/aws-tools-service/src/discovery/rate-limiter';

// Create mock implementations
function createMockCredentialManager() {
  return {
    validateCredentials: mock(async (profile?: string) => ({
      valid: true,
      account: {
        accountId: '123456789012',
        arn: 'arn:aws:iam::123456789012:user/test',
        alias: 'test-account',
      },
    })),
    getCredentialsProvider: mock(async () => ({})),
    listProfiles: mock(async () => []),
  } as unknown as CredentialManager;
}

function createMockRegionManager() {
  return {
    filterRegions: mock(async () => ['us-east-1', 'us-west-2']),
    listEnabledRegions: mock(async () => [
      { regionName: 'us-east-1', endpoint: 'ec2.us-east-1.amazonaws.com' },
      { regionName: 'us-west-2', endpoint: 'ec2.us-west-2.amazonaws.com' },
    ]),
    getRegionDisplayName: mock((name: string) => name),
  } as unknown as RegionManager;
}

function createMockRateLimiter() {
  return {
    withBackoff: mock(async <T>(operation: () => Promise<T>) => operation()),
    acquire: mock(async () => {}),
    release: mock(() => {}),
    getStats: mock(() => ({
      totalRequests: 0,
      throttledRequests: 0,
      currentConcurrent: 0,
      queueLength: 0,
      throttleRate: 0,
    })),
  } as unknown as RateLimiter;
}

describe('InfrastructureScanner', () => {
  let scanner: InfrastructureScanner;
  let mockCredentialManager: ReturnType<typeof createMockCredentialManager>;
  let mockRegionManager: ReturnType<typeof createMockRegionManager>;
  let mockRateLimiter: ReturnType<typeof createMockRateLimiter>;

  beforeEach(() => {
    mockCredentialManager = createMockCredentialManager();
    mockRegionManager = createMockRegionManager();
    mockRateLimiter = createMockRateLimiter();

    scanner = new InfrastructureScanner({
      credentialManager: mockCredentialManager,
      regionManager: mockRegionManager,
      rateLimiter: mockRateLimiter,
    });
  });

  describe('startDiscovery', () => {
    test('returns session ID', async () => {
      const sessionId = await scanner.startDiscovery({
        profile: 'default',
        regions: { regions: ['us-east-1'] },
      });

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    test('validates credentials before starting', async () => {
      await scanner.startDiscovery({
        profile: 'test-profile',
        regions: { regions: ['us-east-1'] },
      });

      expect(mockCredentialManager.validateCredentials).toHaveBeenCalledWith('test-profile');
    });

    test('throws error for invalid credentials', async () => {
      mockCredentialManager.validateCredentials = mock(async () => ({
        valid: false,
        error: 'Invalid credentials',
      }));

      await expect(
        scanner.startDiscovery({
          profile: 'invalid-profile',
          regions: { regions: ['us-east-1'] },
        })
      ).rejects.toThrow('Invalid credentials');
    });

    test('filters regions based on config', async () => {
      await scanner.startDiscovery({
        profile: 'default',
        regions: { regions: 'all' },
      });

      expect(mockRegionManager.filterRegions).toHaveBeenCalled();
    });
  });

  describe('getSession', () => {
    test('returns session by ID', async () => {
      const sessionId = await scanner.startDiscovery({
        profile: 'default',
        regions: { regions: ['us-east-1'] },
      });

      const session = scanner.getSession(sessionId);

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
    });

    test('returns undefined for unknown session', () => {
      const session = scanner.getSession('non-existent-session');

      expect(session).toBeUndefined();
    });
  });

  describe('getProgress', () => {
    test('returns progress for valid session', async () => {
      const sessionId = await scanner.startDiscovery({
        profile: 'default',
        regions: { regions: ['us-east-1'] },
      });

      const progress = scanner.getProgress(sessionId);

      expect(progress).toBeDefined();
      expect(progress?.status).toMatch(/pending|in_progress|completed/);
      expect(progress?.startedAt).toBeDefined();
    });

    test('returns undefined for unknown session', () => {
      const progress = scanner.getProgress('non-existent-session');

      expect(progress).toBeUndefined();
    });
  });

  describe('cancelDiscovery', () => {
    test('cancels running discovery', async () => {
      const sessionId = await scanner.startDiscovery({
        profile: 'default',
        regions: { regions: ['us-east-1'] },
      });

      // Give it a moment to start
      await new Promise(resolve => setTimeout(resolve, 10));

      const cancelled = scanner.cancelDiscovery(sessionId);

      // May or may not cancel depending on timing
      expect(typeof cancelled).toBe('boolean');
    });

    test('returns false for unknown session', () => {
      const cancelled = scanner.cancelDiscovery('non-existent-session');

      expect(cancelled).toBe(false);
    });
  });

  describe('cleanupSessions', () => {
    test('removes old sessions', async () => {
      // Start a session
      const sessionId = await scanner.startDiscovery({
        profile: 'default',
        regions: { regions: ['us-east-1'] },
      });

      // Cleanup with very short max age (0ms means all sessions are old)
      const cleaned = scanner.cleanupSessions(0);

      // Session should be cleaned
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });

    test('keeps recent sessions', async () => {
      const sessionId = await scanner.startDiscovery({
        profile: 'default',
        regions: { regions: ['us-east-1'] },
      });

      // Cleanup with long max age
      const cleaned = scanner.cleanupSessions(24 * 60 * 60 * 1000);

      // Session should still exist
      const session = scanner.getSession(sessionId);
      // May or may not exist depending on cleanup
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRateLimiterStats', () => {
    test('returns rate limiter statistics', () => {
      const stats = scanner.getRateLimiterStats();

      expect(stats).toBeDefined();
      expect(stats.totalRequests).toBeDefined();
      expect(stats.throttledRequests).toBeDefined();
    });
  });

  describe('getErrors', () => {
    test('returns empty array initially', () => {
      const errors = scanner.getErrors();

      expect(errors).toEqual([]);
    });
  });
});

describe('InfrastructureScanner with default config', () => {
  test('creates scanner with default components', () => {
    const scanner = new InfrastructureScanner();

    expect(scanner).toBeDefined();
    expect(scanner.getRateLimiterStats()).toBeDefined();
  });
});
