/**
 * Drift Detection Types
 *
 * Type definitions for infrastructure drift detection and remediation
 */

export type DriftType = 'added' | 'removed' | 'modified' | 'unchanged';
export type DriftSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ProviderType = 'terraform' | 'kubernetes' | 'helm';

/**
 * Represents a single drift item
 */
export interface DriftItem {
  /** Unique identifier for the resource */
  resourceId: string;
  /** Resource type (e.g., aws_instance, deployment) */
  resourceType: string;
  /** Resource name */
  resourceName: string;
  /** Type of drift detected */
  driftType: DriftType;
  /** Severity of the drift */
  severity: DriftSeverity;
  /** Expected value (from state/manifest) */
  expected?: unknown;
  /** Actual value (from cloud provider) */
  actual?: unknown;
  /** Attribute that drifted */
  attribute?: string;
  /** Human-readable description of the drift */
  description: string;
  /** Suggested remediation action */
  remediation?: string;
  /** Whether the drift can be auto-fixed */
  autoFixable: boolean;
}

/**
 * Drift detection result for a single resource
 */
export interface ResourceDrift {
  /** Resource address (e.g., module.vpc.aws_vpc.main) */
  address: string;
  /** Provider type */
  provider: ProviderType;
  /** Resource type */
  resourceType: string;
  /** List of drift items for this resource */
  drifts: DriftItem[];
  /** Timestamp when drift was detected */
  detectedAt: Date;
}

/**
 * Summary of drift detection results
 */
export interface DriftSummary {
  /** Total number of resources checked */
  totalResources: number;
  /** Number of resources with drift */
  driftedResources: number;
  /** Number of resources without drift */
  unchangedResources: number;
  /** Breakdown by drift type */
  byDriftType: Record<DriftType, number>;
  /** Breakdown by severity */
  bySeverity: Record<DriftSeverity, number>;
  /** Number of auto-fixable drifts */
  autoFixable: number;
}

/**
 * Complete drift detection report
 */
export interface DriftReport {
  /** Unique report ID */
  id: string;
  /** Provider type */
  provider: ProviderType;
  /** Working directory */
  workDir: string;
  /** Environment (e.g., production, staging) */
  environment?: string;
  /** Report summary */
  summary: DriftSummary;
  /** List of resources with drift */
  resources: ResourceDrift[];
  /** Timestamp when report was generated */
  generatedAt: Date;
  /** Duration of drift detection in milliseconds */
  duration: number;
  /** Any errors encountered during detection */
  errors?: string[];
}

/**
 * Options for drift detection
 */
export interface DriftDetectionOptions {
  /** Working directory containing IaC files */
  workDir: string;
  /** Provider type to detect drift for */
  provider: ProviderType;
  /** Optional namespace for Kubernetes/Helm */
  namespace?: string;
  /** Optional kubeconfig path */
  kubeconfig?: string;
  /** Optional Kubernetes context */
  context?: string;
  /** Whether to refresh state before detection */
  refresh?: boolean;
  /** Specific resources to check (addresses) */
  targets?: string[];
  /** Terraform var file path */
  varFile?: string;
  /** Environment identifier */
  environment?: string;
}

/**
 * Options for drift remediation
 */
export interface DriftRemediationOptions {
  /** Drift report to remediate */
  report: DriftReport;
  /** Whether to auto-approve changes */
  autoApprove?: boolean;
  /** Only fix auto-fixable drifts */
  autoFixOnly?: boolean;
  /** Dry run mode */
  dryRun?: boolean;
  /** Specific resource addresses to fix */
  targets?: string[];
}

/**
 * Result of drift remediation
 */
export interface DriftRemediationResult {
  /** Whether remediation was successful */
  success: boolean;
  /** Number of drifts fixed */
  fixed: number;
  /** Number of drifts that failed to fix */
  failed: number;
  /** Number of drifts skipped */
  skipped: number;
  /** Details of each remediation action */
  actions: RemediationAction[];
  /** Duration of remediation in milliseconds */
  duration: number;
}

/**
 * Individual remediation action
 */
export interface RemediationAction {
  /** Resource address */
  address: string;
  /** Action taken */
  action: 'apply' | 'destroy' | 'import' | 'skip';
  /** Whether the action succeeded */
  success: boolean;
  /** Output from the action */
  output?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Terraform plan change
 */
export interface TerraformChange {
  address: string;
  mode: string;
  type: string;
  name: string;
  providerName: string;
  change: {
    actions: string[];
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    afterUnknown?: Record<string, unknown>;
  };
}

/**
 * Kubernetes resource comparison result
 */
export interface K8sResourceDiff {
  kind: string;
  name: string;
  namespace?: string;
  differences: Array<{
    path: string;
    expected: unknown;
    actual: unknown;
  }>;
}

/**
 * Helm release comparison result
 */
export interface HelmReleaseDiff {
  name: string;
  namespace: string;
  chartVersion?: {
    expected: string;
    actual: string;
  };
  valuesDiff: Array<{
    path: string;
    expected: unknown;
    actual: unknown;
  }>;
}
