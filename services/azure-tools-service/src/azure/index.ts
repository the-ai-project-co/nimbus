/**
 * Azure Operations Module
 *
 * Exports all Azure service operation classes
 */

export { ComputeOperations, type AzureOperationResult, type ComputeOperationsConfig } from './compute';
export { StorageOperations, type StorageOperationsConfig } from './storage';
export { AKSOperations, type AKSOperationsConfig } from './aks';
export { IAMOperations, type IAMOperationsConfig } from './iam';
export { FunctionsOperations, type FunctionsOperationsConfig } from './functions';
export { NetworkOperations, type NetworkOperationsConfig } from './network';
