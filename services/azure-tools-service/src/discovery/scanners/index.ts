/**
 * Service Scanners Index
 *
 * Exports all service scanners and provides factory functions
 */

export * from './base';
export * from './compute';
export * from './storage';
export * from './aks';
export * from './network';

import { ScannerRegistry, type ServiceScanner } from './base';
import { ComputeScanner } from './compute';
import { StorageScanner } from './storage';
import { AKSScanner } from './aks';
import { NetworkScanner } from './network';

/**
 * Create a scanner registry with all available scanners
 */
export function createScannerRegistry(): ScannerRegistry {
  const registry = new ScannerRegistry();

  registry.register(new ComputeScanner());
  registry.register(new StorageScanner());
  registry.register(new AKSScanner());
  registry.register(new NetworkScanner());

  return registry;
}

/**
 * Get a scanner by service name
 */
export function getScanner(serviceName: string): ServiceScanner | undefined {
  const registry = createScannerRegistry();
  return registry.get(serviceName);
}

/**
 * Get all available scanners
 */
export function getAllScanners(): ServiceScanner[] {
  const registry = createScannerRegistry();
  return registry.getAll();
}

/**
 * Map of service names to their scanner classes
 */
export const SERVICE_SCANNER_MAP: Record<string, new () => ServiceScanner> = {
  Compute: ComputeScanner,
  Storage: StorageScanner,
  AKS: AKSScanner,
  Network: NetworkScanner,
};
