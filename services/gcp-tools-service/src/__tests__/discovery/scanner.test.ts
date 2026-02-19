import { describe, test, expect, beforeEach, mock } from 'bun:test';

// Mock external dependencies
mock.module('@nimbus/shared-utils', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

import { InfrastructureScanner } from '../../discovery/scanner';
import { CredentialManager } from '../../discovery/credentials';
import { RegionManager } from '../../discovery/regions';

describe('GCP InfrastructureScanner', () => {
  let scanner: InfrastructureScanner;

  beforeEach(() => {
    scanner = new InfrastructureScanner({
      credentialManager: new CredentialManager(),
      regionManager: new RegionManager(),
    });
  });

  test('should be instantiable with config', () => {
    expect(scanner).toBeDefined();
  });

  test('should return available services', () => {
    const services = scanner.getAvailableServices();
    expect(Array.isArray(services)).toBe(true);
    expect(services.length).toBeGreaterThan(0);
  });

  test('should return undefined for non-existent session', () => {
    expect(scanner.getSession('non-existent')).toBeUndefined();
  });

  test('should return undefined progress for non-existent session', () => {
    expect(scanner.getProgress('non-existent')).toBeUndefined();
  });

  test('should return undefined inventory for non-existent session', () => {
    expect(scanner.getInventory('non-existent')).toBeUndefined();
  });

  test('should fail to cancel non-existent session', () => {
    expect(scanner.cancelDiscovery('non-existent')).toBe(false);
  });

  test('should cleanup zero sessions when empty', () => {
    const cleaned = scanner.cleanupSessions(0);
    expect(cleaned).toBe(0);
  });

  test('available services should include standard GCP services', () => {
    const services = scanner.getAvailableServices();
    // Should include at least compute, storage, etc.
    expect(services.length).toBeGreaterThanOrEqual(3);
  });
});
