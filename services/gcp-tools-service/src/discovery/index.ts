/**
 * GCP Infrastructure Discovery Module
 *
 * Exports all discovery-related functionality
 */

// Types
export * from './types';

// Core components
export { CredentialManager, type CredentialManagerConfig } from './credentials';
export { RegionManager, type RegionManagerConfig, COMMON_GCP_REGIONS, REGION_DISPLAY_NAMES } from './regions';
export { InfrastructureScanner, type ScannerConfig, type ProgressCallback } from './scanner';

// Scanners
export * from './scanners';
