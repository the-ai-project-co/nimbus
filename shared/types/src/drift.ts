/**
 * Drift Detection and Remediation Types
 */

// ==========================================
// Provider Types
// ==========================================

export type DriftProvider = 'terraform' | 'kubernetes' | 'helm';

// ==========================================
// Drift Detection Types
// ==========================================

export interface DriftChange {
  attribute: string;
  expected: unknown;
  actual: unknown;
}

export interface ResourceDrift {
  resourceId: string;
  resourceType: string;
  name?: string;
  driftType: 'added' | 'removed' | 'modified';
  severity: 'critical' | 'high' | 'medium' | 'low';
  changes: DriftChange[];
  metadata?: Record<string, unknown>;
}

export interface DriftSummary {
  total: number;
  added: number;
  removed: number;
  modified: number;
  bySeverity: Record<string, number>;
}

export interface DriftReport {
  provider: DriftProvider;
  directory: string;
  detectedAt: string;
  hasDrift: boolean;
  summary: DriftSummary;
  resources: ResourceDrift[];
  metadata?: Record<string, unknown>;
}

// ==========================================
// Remediation Types
// ==========================================

export type RemediationActionType = 'apply' | 'destroy' | 'import' | 'refresh' | 'manual';
export type RemediationActionStatus = 'pending' | 'applied' | 'failed' | 'skipped';

export interface RemediationAction {
  id: string;
  type: RemediationActionType;
  resourceId: string;
  description: string;
  command?: string;
  status: RemediationActionStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DriftRemediationOptions {
  dryRun?: boolean;
  autoApprove?: boolean;
  excludeResources?: string[];
  onlyResources?: string[];
  force?: boolean;
}

export interface DriftRemediationResult {
  success: boolean;
  appliedCount: number;
  failedCount: number;
  skippedCount: number;
  actions: RemediationAction[];
  report?: string;
  errors?: string[];
}

// ==========================================
// Compliance Types
// ==========================================

export type ComplianceStandard = 'soc2' | 'hipaa' | 'pci' | 'gdpr' | 'cis';

export interface ComplianceRule {
  id: string;
  standard: ComplianceStandard;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ComplianceViolation {
  rule: ComplianceRule;
  resourceId: string;
  resourceType: string;
  details: string;
  remediation?: string;
}

export interface ComplianceReport {
  standard: ComplianceStandard;
  generatedAt: string;
  score: number;
  maxScore: number;
  violations: ComplianceViolation[];
  passed: number;
  failed: number;
}
