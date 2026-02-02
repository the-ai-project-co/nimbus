/**
 * Shared Singleton Instances
 *
 * This module provides singleton instances of core services that need to be
 * shared between HTTP routes and WebSocket handlers to ensure consistent state.
 */

import {
  InfrastructureScanner,
  CredentialManager,
  RegionManager,
} from './discovery';

// Create singleton instances
const credentialManager = new CredentialManager();
const regionManager = new RegionManager();
const infrastructureScanner = new InfrastructureScanner({
  credentialManager,
  regionManager,
});

/**
 * Get the shared credential manager instance
 */
export function getCredentialManager(): CredentialManager {
  return credentialManager;
}

/**
 * Get the shared region manager instance
 */
export function getRegionManager(): RegionManager {
  return regionManager;
}

/**
 * Get the shared infrastructure scanner instance
 */
export function getInfrastructureScanner(): InfrastructureScanner {
  return infrastructureScanner;
}
