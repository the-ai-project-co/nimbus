/**
 * Azure Infrastructure Discovery Module
 *
 * Exports all discovery-related functionality
 */

// Types
export * from './types';

// Core components
export { AzureCredentialManager, type CredentialManagerConfig } from './credentials';
export {
  SubscriptionManager,
  type SubscriptionManagerConfig,
  COMMON_AZURE_REGIONS,
  REGION_DISPLAY_NAMES,
} from './subscriptions';
export { InfrastructureScanner, type ScannerConfig, type ProgressCallback } from './scanner';

// Scanners
export * from './scanners';
