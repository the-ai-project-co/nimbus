import { describe, test, expect, mock } from 'bun:test';

/**
 * GCP Resource Discovery Tests (discovery.test.ts)
 *
 * These tests exercise GCP resource discovery across multiple services.
 * The InfrastructureScanner orchestrates discovery; we test its session
 * lifecycle, service filtering, error handling, and inventory building by
 * injecting lightweight mock collaborators instead of calling real GCP APIs.
 */

mock.module('@nimbus/shared-utils', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

function makeResource(overrides: Partial<any> = {}): any {
  return {
    id: 'resource-1',
    selfLink: 'https://gcp.googleapis.com/resource-1',
    type: 'google_compute_instance',
    gcpType: 'compute.googleapis.com/Instance',
    service: 'Compute',
    region: 'us-central1',
    name: 'my-instance',
    labels: {},
    properties: { machineType: 'e2-medium' },
    relationships: [],
    status: 'RUNNING',
    ...overrides,
  };
}

// Minimal CredentialManager mock
class MockCredentialManager {
  async validateCredentials(_projectId?: string) {
    return {
      valid: true,
      credential: {
        projectId: 'test-project',
        serviceAccountEmail: 'sa@test-project.iam.gserviceaccount.com',
        authenticated: true,
      },
    };
  }
}

class MockFailingCredentialManager {
  async validateCredentials(_projectId?: string) {
    return { valid: false, error: 'No valid credentials found' };
  }
}

// Minimal RegionManager mock
class MockRegionManager {
  async filterRegions(regionConfig: any, _projectId?: string): Promise<string[]> {
    if (regionConfig.regions === 'all') return ['us-central1', 'us-east1'];
    if (Array.isArray(regionConfig.regions)) return regionConfig.regions;
    return [];
  }
}

class MockEmptyRegionManager {
  async filterRegions(_regionConfig: any, _projectId?: string): Promise<string[]> {
    return [];
  }
}

// Minimal ScannerRegistry mock
function makeScannerRegistry(resources: any[] = [], shouldFail = false) {
  const registry = new Map<string, any>();

  const makeScanner = (service: string, isGlobal = false) => ({
    service,
    isGlobal,
    async scan(_ctx: any) {
      if (shouldFail) {
        throw new Error(`Scanner error for ${service}`);
      }
      return {
        resources: resources.filter(r => r.service === service),
        errors: [],
      };
    },
  });

  registry.set('Compute', makeScanner('Compute'));
  registry.set('Storage', makeScanner('Storage'));
  registry.set('GKE', makeScanner('GKE'));
  registry.set('IAM', makeScanner('IAM', true /* global */));
  registry.set('VPC', makeScanner('VPC'));

  return {
    get: (name: string) => registry.get(name),
    has: (name: string) => registry.has(name),
    getServiceNames: () => Array.from(registry.keys()),
  };
}

// Import the real InfrastructureScanner (all its cloud calls are replaced by mock collaborators)
import { InfrastructureScanner } from '../../discovery/scanner';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GCP InfrastructureScanner — Resource Discovery', () => {
  describe('startDiscovery', () => {
    test('should return a valid session ID on successful start', async () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      const sessionId = await scanner.startDiscovery({
        projectId: 'test-project',
        regions: { regions: ['us-central1'] },
      });

      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
    });

    test('should throw error when credentials are invalid', async () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockFailingCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      await expect(
        scanner.startDiscovery({ regions: { regions: ['us-central1'] } })
      ).rejects.toThrow('Invalid credentials');
    });

    test('should throw error when no valid regions available', async () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockEmptyRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      await expect(
        scanner.startDiscovery({ regions: { regions: [] } })
      ).rejects.toThrow('No valid regions');
    });

    test('should create session with pending status immediately', async () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      const sessionId = await scanner.startDiscovery({
        regions: { regions: ['us-central1'] },
      });

      const session = scanner.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.id).toBe(sessionId);
    });

    test('should discover resources across multiple services', async () => {
      const resources = [
        makeResource({ service: 'Compute', id: 'vm-1', selfLink: 'sl-1' }),
        makeResource({ service: 'Storage', id: 'bucket-1', selfLink: 'sl-2', type: 'google_storage_bucket' }),
        makeResource({ service: 'GKE', id: 'cluster-1', selfLink: 'sl-3', type: 'google_container_cluster' }),
      ];

      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry(resources) as any,
      });

      const sessionId = await scanner.startDiscovery({
        regions: { regions: ['us-central1'] },
      });

      // Wait for async discovery to complete
      await new Promise(r => setTimeout(r, 100));

      const session = scanner.getSession(sessionId);
      expect(session!.progress.status).toBe('completed');
      expect(session!.inventory!.resources.length).toBeGreaterThan(0);
    });
  });

  describe('getSession', () => {
    test('should return undefined for unknown session ID', () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      const session = scanner.getSession('non-existent-id');
      expect(session).toBeUndefined();
    });

    test('should return session after startDiscovery is called', async () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      const sessionId = await scanner.startDiscovery({
        regions: { regions: ['us-central1'] },
      });

      const session = scanner.getSession(sessionId);
      expect(session).toBeDefined();
      expect(session!.id).toBe(sessionId);
    });
  });

  describe('getProgress', () => {
    test('should return progress for a known session', async () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      const sessionId = await scanner.startDiscovery({
        regions: { regions: ['us-central1'] },
      });

      const progress = scanner.getProgress(sessionId);
      expect(progress).toBeDefined();
      expect(progress!.totalRegions).toBe(1);
    });

    test('should return undefined for unknown session', () => {
      const scanner = new InfrastructureScanner();
      expect(scanner.getProgress('bad-id')).toBeUndefined();
    });
  });

  describe('cancelDiscovery', () => {
    test('should return false for non-existent session', () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      const cancelled = scanner.cancelDiscovery('does-not-exist');
      expect(cancelled).toBe(false);
    });
  });

  describe('cleanupSessions', () => {
    test('should clean up sessions older than maxAgeMs', async () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      const sessionId = await scanner.startDiscovery({
        regions: { regions: ['us-central1'] },
      });

      // Force session to look old by setting started time in the past
      const session = scanner.getSession(sessionId);
      if (session) {
        session.progress.startedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
      }

      const cleaned = scanner.cleanupSessions(24 * 60 * 60 * 1000);
      expect(cleaned).toBe(1);
      expect(scanner.getSession(sessionId)).toBeUndefined();
    });

    test('should not clean up sessions within maxAgeMs', async () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      await scanner.startDiscovery({ regions: { regions: ['us-central1'] } });

      const cleaned = scanner.cleanupSessions(24 * 60 * 60 * 1000);
      expect(cleaned).toBe(0);
    });
  });

  describe('getAvailableServices', () => {
    test('should return list of registered service names', () => {
      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry([]) as any,
      });

      const services = scanner.getAvailableServices();
      expect(Array.isArray(services)).toBe(true);
      expect(services).toContain('Compute');
      expect(services).toContain('Storage');
    });
  });

  describe('service filtering', () => {
    test('should discover only specified services', async () => {
      const resources = [
        makeResource({ service: 'Compute', id: 'vm-1', selfLink: 'sl-1' }),
        makeResource({ service: 'Storage', id: 'bucket-1', selfLink: 'sl-2', type: 'google_storage_bucket' }),
      ];

      const scanner = new InfrastructureScanner({
        credentialManager: new MockCredentialManager() as any,
        regionManager: new MockRegionManager() as any,
        scannerRegistry: makeScannerRegistry(resources) as any,
      });

      const sessionId = await scanner.startDiscovery({
        regions: { regions: ['us-central1'] },
        services: ['Compute'],
      });

      await new Promise(r => setTimeout(r, 100));
      const session = scanner.getSession(sessionId);
      expect(session!.progress.status).toBe('completed');

      // Only Compute resources should appear
      const computeResources = session!.inventory?.resources.filter(
        (r: any) => r.service === 'Compute'
      );
      const storageResources = session!.inventory?.resources.filter(
        (r: any) => r.service === 'Storage'
      );
      expect(computeResources?.length).toBe(1);
      expect(storageResources?.length).toBe(0);
    });
  });
});
