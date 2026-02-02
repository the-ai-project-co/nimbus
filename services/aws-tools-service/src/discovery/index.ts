/**
 * AWS Infrastructure Discovery Module
 *
 * Exports all discovery-related functionality
 */

// Types
export * from './types';

// Core components
export { CredentialManager, type CredentialManagerConfig, type AssumeRoleOptions } from './credentials';
export { RegionManager, type RegionManagerConfig, COMMON_AWS_REGIONS, OPT_IN_REGIONS, REGION_DISPLAY_NAMES } from './regions';
export {
  RateLimiter,
  type RateLimiterConfig,
  type BackoffOptions,
  createDiscoveryRateLimiter,
  createConservativeRateLimiter,
} from './rate-limiter';
export { InfrastructureScanner, type ScannerConfig, type ProgressCallback } from './scanner';

// Scanners
export * from './scanners';
