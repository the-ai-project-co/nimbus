/**
 * GCP Operations Module
 *
 * Exports all GCP service operation classes
 */

export { ComputeOperations, type ComputeConfig } from './compute';
export { StorageOperations, type StorageConfig } from './storage';
export { GKEOperations, type GKEConfig } from './gke';
export { IAMOperations, type IAMConfig } from './iam';
export { FunctionsOperations, type FunctionsConfig } from './functions';
export { VPCOperations, type VPCConfig } from './vpc';
export type { OperationResult } from './compute';
