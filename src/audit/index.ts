/**
 * Audit Notebook - barrel exports.
 *
 * Re-exports the security scanner, compliance checker, cost tracker, and
 * activity log modules for convenient single-import access.
 */

export { scanSecurity, formatFindings } from './security-scanner';
export type { SecurityFinding, ScanResult, ScanOptions, Severity } from './security-scanner';

export { checkCompliance, generateScorecard } from './compliance-checker';
export type {
  ComplianceControl,
  ComplianceReport,
  ComplianceOptions,
  Framework,
} from './compliance-checker';

export { CostTracker } from './cost-tracker';
export type { CostEntry, CostSummary } from './cost-tracker';

export { ActivityLog } from './activity-log';
export type { ActivityEntry, ActivityFilter } from './activity-log';
