/**
 * Drift Detection System
 *
 * Detects infrastructure drift between desired state (IaC) and actual state (cloud provider).
 * Supports Terraform, Kubernetes, and Helm.
 *
 * Embedded version: replaces HTTP client calls with direct tool imports.
 */

import { logger } from '../utils';
import { TerraformOperations } from '../tools/terraform-ops';
import { KubernetesOperations } from '../tools/k8s-ops';
import { HelmOperations } from '../tools/helm-ops';

// ==========================================
// Drift Detection Types (inline — no HTTP)
// ==========================================

export type DriftType = 'added' | 'removed' | 'modified' | 'unchanged';
export type DriftSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type DriftProvider = 'terraform' | 'kubernetes' | 'helm';

export interface DriftDetectionOptions {
  /** The IaC provider to scan */
  provider: DriftProvider;
  /** Working directory containing IaC files */
  workDir: string;
  /** Optional environment label for the report */
  environment?: string;
  /** Terraform: path to .tfvars file */
  varFile?: string;
  /** Terraform: whether to refresh state before planning */
  refresh?: boolean;
  /** Terraform / K8s: specific resources to target */
  targets?: string[];
  /** Kubernetes / Helm: kubeconfig path */
  kubeconfig?: string;
  /** Kubernetes / Helm: kubeconfig context */
  context?: string;
  /** Kubernetes / Helm: namespace to scope the scan */
  namespace?: string;
}

export interface DriftItem {
  resourceId: string;
  resourceType: string;
  resourceName: string;
  driftType: DriftType;
  severity: DriftSeverity;
  expected: unknown;
  actual: unknown;
  attribute?: string;
  description: string;
  remediation: string;
  autoFixable: boolean;
}

export interface ResourceDrift {
  address: string;
  provider: DriftProvider;
  resourceType: string;
  drifts: DriftItem[];
  detectedAt: Date;
}

export interface DriftSummary {
  totalResources: number;
  driftedResources: number;
  unchangedResources: number;
  byDriftType: Record<DriftType, number>;
  bySeverity: Record<DriftSeverity, number>;
  autoFixable: number;
}

export interface DriftReport {
  id: string;
  provider: DriftProvider;
  workDir: string;
  environment?: string;
  summary: DriftSummary;
  resources: ResourceDrift[];
  generatedAt: Date;
  duration: number;
  errors?: string[];
}

// Internal intermediate types
interface TerraformChange {
  address: string;
  type: string;
  name: string;
  change: {
    actions: string[];
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };
}

interface K8sResourceDiff {
  kind: string;
  name: string;
  namespace?: string;
  differences: Array<{ path: string; expected: unknown; actual: unknown }>;
}

interface HelmReleaseDiff {
  name: string;
  namespace: string;
  chartVersion?: { expected: string; actual: string };
  valuesDiff: Array<{ path: string; expected: unknown; actual: unknown }>;
}

// ==========================================
// DriftDetector
// ==========================================

export class DriftDetector {
  private terraformOps: TerraformOperations;

  constructor() {
    // TerraformOperations is stateless — workDir is passed per-call
    this.terraformOps = new TerraformOperations();
  }

  /**
   * Detect drift based on provider type
   */
  async detectDrift(options: DriftDetectionOptions): Promise<DriftReport> {
    const startTime = Date.now();
    logger.info(`Starting drift detection for ${options.provider} in ${options.workDir}`);

    try {
      switch (options.provider) {
        case 'terraform':
          return await this.detectTerraformDrift(options, startTime);
        case 'kubernetes':
          return await this.detectKubernetesDrift(options, startTime);
        case 'helm':
          return await this.detectHelmDrift(options, startTime);
        default:
          throw new Error(`Unsupported provider: ${options.provider}`);
      }
    } catch (error) {
      logger.error('Drift detection failed', error);
      throw error;
    }
  }

  /**
   * Detect Terraform drift using terraform plan.
   * Uses the embedded TerraformOperations directly — no HTTP round-trip.
   */
  private async detectTerraformDrift(
    options: DriftDetectionOptions,
    startTime: number
  ): Promise<DriftReport> {
    const reportId = this.generateReportId();
    const resources: ResourceDrift[] = [];
    const errors: string[] = [];

    // Build a TerraformOperations scoped to the working directory
    const tfOps = new TerraformOperations(options.workDir);

    try {
      // Refresh state to get latest actual values
      if (options.refresh !== false) {
        logger.info('Refreshing Terraform state...');
        try {
          // terraform refresh is equivalent to plan -refresh-only; use plan with refresh flag
          await tfOps.plan({ refresh: true, varFile: options.varFile });
        } catch (error) {
          errors.push(`State refresh warning: ${(error as Error).message}`);
        }
      }

      // Run terraform plan to detect drift
      logger.info('Running Terraform plan to detect drift...');
      const planFile = `${options.workDir}/.drift-plan.tfplan`;
      const planResult = await tfOps.plan({
        varFile: options.varFile,
        out: planFile,
        target: options.targets,
      });

      if (planResult.hasChanges) {
        // Parse the plan output text to extract basic drift information.
        // The embedded TerraformOperations returns text output, not structured JSON,
        // so we extract resource addresses using regex rather than JSON parsing.
        const changeLines = planResult.output
          .split('\n')
          .filter(
            line =>
              line.includes('will be') || line.includes('must be') || line.includes('resource "')
          );

        for (const line of changeLines) {
          // Extract resource addresses like: aws_vpc.main will be updated in-place
          const match = line.match(/^\s*([\w.[\]"]+)\s+(?:will|must)\s+be\s+(\w+)/);
          if (match) {
            const address = match[1];
            const action = match[2]; // created, updated, destroyed, replaced
            const parts = address.split('.');
            const resourceType = parts[0] || 'unknown';
            const resourceName = parts[1] || address;

            let driftType: DriftType = 'unchanged';
            if (action.startsWith('destroy') || action.startsWith('delet')) {
              driftType = 'removed';
            } else if (action.startsWith('creat')) {
              driftType = 'added';
            } else if (action.startsWith('updat') || action.startsWith('replac')) {
              driftType = 'modified';
            }

            if (driftType !== 'unchanged') {
              resources.push({
                address,
                provider: 'terraform',
                resourceType,
                drifts: [
                  {
                    resourceId: address,
                    resourceType,
                    resourceName,
                    driftType,
                    severity: this.determineSeverity(resourceType, ''),
                    expected: `Resource should be ${driftType === 'removed' ? 'present' : 'absent'}`,
                    actual: `Resource is ${driftType === 'removed' ? 'absent' : 'present'}`,
                    description: `Resource '${address}' ${action}`,
                    remediation: `Run 'terraform apply' to reconcile the drift`,
                    autoFixable: true,
                  },
                ],
                detectedAt: new Date(),
              });
            }
          }
        }
      }

      const summary = this.calculateSummary(resources);

      return {
        id: reportId,
        provider: 'terraform',
        workDir: options.workDir,
        environment: options.environment,
        summary,
        resources,
        generatedAt: new Date(),
        duration: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error('Terraform drift detection failed', error);
      throw new Error(`Terraform drift detection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Detect Kubernetes drift by comparing manifests to actual state.
   * Uses the embedded KubernetesOperations directly — no HTTP round-trip.
   */
  private async detectKubernetesDrift(
    options: DriftDetectionOptions,
    startTime: number
  ): Promise<DriftReport> {
    const reportId = this.generateReportId();
    const resources: ResourceDrift[] = [];
    const errors: string[] = [];

    try {
      logger.info('Detecting Kubernetes drift...');

      const diffs = await this.compareKubernetesManifests(options);

      for (const diff of diffs) {
        const resourceDrift = this.parseKubernetesDiff(diff);
        if (resourceDrift.drifts.length > 0) {
          resources.push(resourceDrift);
        }
      }

      const summary = this.calculateSummary(resources);

      return {
        id: reportId,
        provider: 'kubernetes',
        workDir: options.workDir,
        environment: options.environment,
        summary,
        resources,
        generatedAt: new Date(),
        duration: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error('Kubernetes drift detection failed', error);
      throw new Error(`Kubernetes drift detection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Detect Helm drift by comparing deployed values to chart values.
   * Uses the embedded HelmOperations directly — no HTTP round-trip.
   */
  private async detectHelmDrift(
    options: DriftDetectionOptions,
    startTime: number
  ): Promise<DriftReport> {
    const reportId = this.generateReportId();
    const resources: ResourceDrift[] = [];
    const errors: string[] = [];

    try {
      logger.info('Detecting Helm drift...');

      const diffs = await this.compareHelmReleases(options);

      for (const diff of diffs) {
        const resourceDrift = this.parseHelmDiff(diff);
        if (resourceDrift.drifts.length > 0) {
          resources.push(resourceDrift);
        }
      }

      const summary = this.calculateSummary(resources);

      return {
        id: reportId,
        provider: 'helm',
        workDir: options.workDir,
        environment: options.environment,
        summary,
        resources,
        generatedAt: new Date(),
        duration: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      logger.error('Helm drift detection failed', error);
      throw new Error(`Helm drift detection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a change is not related to drift (e.g., planned new resources).
   * Only used when terraform JSON output is available.
   */
  private isNonDriftChange(change: TerraformChange): boolean {
    // If the only action is "no-op", it's not drift
    if (change.change.actions.length === 1 && change.change.actions[0] === 'no-op') {
      return true;
    }
    // If it's a create without prior state, it's not drift
    if (change.change.actions.includes('create') && !change.change.before) {
      return true;
    }
    return false;
  }

  /**
   * Parse a structured Terraform change (JSON plan output) into ResourceDrift.
   * Used when terraform show -json is available.
   */
  private parseTerraformChange(change: TerraformChange): ResourceDrift {
    const drifts: DriftItem[] = [];
    const actions = change.change.actions;
    const before = change.change.before || {};
    const after = change.change.after || {};

    // Determine drift type based on actions
    let driftType: DriftType = 'unchanged';
    if (actions.includes('delete')) {
      driftType = 'removed';
    } else if (actions.includes('create')) {
      driftType = 'added';
    } else if (actions.includes('update')) {
      driftType = 'modified';
    }

    // Find specific attribute changes for modifications
    if (driftType === 'modified') {
      const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

      for (const key of allKeys) {
        const beforeVal = before[key];
        const afterVal = after[key];

        if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
          drifts.push({
            resourceId: change.address,
            resourceType: change.type,
            resourceName: change.name,
            driftType: 'modified',
            severity: this.determineSeverity(change.type, key),
            expected: afterVal,
            actual: beforeVal,
            attribute: key,
            description: `Attribute '${key}' has drifted from expected value`,
            remediation: `Run 'terraform apply' to restore the expected value`,
            autoFixable: true,
          });
        }
      }
    } else if (driftType !== 'unchanged') {
      // For added/removed resources, create a single drift item
      drifts.push({
        resourceId: change.address,
        resourceType: change.type,
        resourceName: change.name,
        driftType,
        severity: 'high',
        expected: driftType === 'removed' ? before : after,
        actual: driftType === 'removed' ? null : before,
        description: `Resource ${driftType === 'removed' ? 'exists in state but not in config' : 'exists in config but not in state'}`,
        remediation: `Run 'terraform apply' to ${driftType === 'removed' ? 'remove' : 'create'} the resource`,
        autoFixable: true,
      });
    }

    return {
      address: change.address,
      provider: 'terraform',
      resourceType: change.type,
      drifts,
      detectedAt: new Date(),
    };
  }

  /**
   * Compare Kubernetes manifests to actual cluster state.
   * Uses the embedded KubernetesOperations to query each resource.
   */
  private async compareKubernetesManifests(
    options: DriftDetectionOptions
  ): Promise<K8sResourceDiff[]> {
    const diffs: K8sResourceDiff[] = [];

    try {
      const { readdir, readFile } = await import('fs/promises');
      const { join } = await import('path');
      const jsYaml = await import('js-yaml');

      let files: string[];
      try {
        files = await readdir(options.workDir);
      } catch {
        return [];
      }

      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

      // Build a KubernetesOperations instance scoped to the provided kubeconfig/context
      const k8sOps = new KubernetesOperations({
        kubeconfig: options.kubeconfig,
        context: options.context,
        namespace: options.namespace,
      });

      for (const file of yamlFiles) {
        try {
          const content = await readFile(join(options.workDir, file), 'utf-8');
          const docs = jsYaml.loadAll(content) as any[];

          for (const doc of docs) {
            if (!doc || !doc.kind || !doc.metadata?.name) {
              continue;
            }

            const namespace = doc.metadata.namespace || options.namespace || 'default';

            try {
              // Use the embedded KubernetesOperations.get() instead of HTTP fetch
              const result = await k8sOps.get({
                resource: `${doc.kind.toLowerCase()}s`,
                name: doc.metadata.name,
                namespace,
                output: 'json',
              });

              if (result.success && result.output) {
                const actual = JSON.parse(result.output) as Record<string, unknown>;
                const differences = this.deepCompare(
                  doc.spec || {},
                  (actual as any).spec || {},
                  'spec'
                );
                if (differences.length > 0) {
                  diffs.push({
                    kind: doc.kind,
                    name: doc.metadata.name,
                    namespace,
                    differences,
                  });
                }
              }
            } catch {
              // Individual resource fetch failed — skip gracefully
            }
          }
        } catch {
          // File parse failed — skip
        }
      }
    } catch {
      // Graceful degradation if filesystem or kubectl are unavailable
      logger.warn('Kubernetes drift detection: unable to compare manifests, returning empty diff');
    }

    return diffs;
  }

  /**
   * Deep compare two objects and return a flat list of differences.
   */
  private deepCompare(
    expected: Record<string, unknown>,
    actual: Record<string, unknown>,
    prefix: string
  ): Array<{ path: string; expected: unknown; actual: unknown }> {
    const differences: Array<{ path: string; expected: unknown; actual: unknown }> = [];
    const allKeys = new Set([...Object.keys(expected), ...Object.keys(actual)]);

    for (const key of allKeys) {
      const path = `${prefix}.${key}`;
      const exp = expected[key];
      const act = actual[key];

      if (
        exp !== null &&
        act !== null &&
        typeof exp === 'object' &&
        typeof act === 'object' &&
        !Array.isArray(exp) &&
        !Array.isArray(act)
      ) {
        differences.push(
          ...this.deepCompare(exp as Record<string, unknown>, act as Record<string, unknown>, path)
        );
      } else if (JSON.stringify(exp) !== JSON.stringify(act)) {
        differences.push({ path, expected: exp, actual: act });
      }
    }

    return differences;
  }

  /**
   * Parse a K8sResourceDiff into a ResourceDrift.
   */
  private parseKubernetesDiff(diff: K8sResourceDiff): ResourceDrift {
    const drifts: DriftItem[] = [];

    for (const d of diff.differences) {
      drifts.push({
        resourceId: `${diff.kind}/${diff.namespace || 'default'}/${diff.name}`,
        resourceType: diff.kind,
        resourceName: diff.name,
        driftType: 'modified',
        severity: this.determineSeverity(diff.kind, d.path),
        expected: d.expected,
        actual: d.actual,
        attribute: d.path,
        description: `Attribute '${d.path}' has drifted`,
        remediation: `Run 'kubectl apply' to restore the expected value`,
        autoFixable: true,
      });
    }

    return {
      address: `${diff.kind}/${diff.namespace || 'default'}/${diff.name}`,
      provider: 'kubernetes',
      resourceType: diff.kind,
      drifts,
      detectedAt: new Date(),
    };
  }

  /**
   * Compare Helm releases to local expected values.
   * Uses the embedded HelmOperations directly — no HTTP round-trip.
   */
  private async compareHelmReleases(options: DriftDetectionOptions): Promise<HelmReleaseDiff[]> {
    const diffs: HelmReleaseDiff[] = [];

    try {
      // Build a HelmOperations instance scoped to the provided kubeconfig/context/namespace
      const helmOps = new HelmOperations({
        kubeconfig: options.kubeconfig,
        kubeContext: options.context,
        namespace: options.namespace,
      });

      // List all deployed releases in the target namespace
      const listResult = await helmOps.list({
        namespace: options.namespace || 'default',
      });

      if (!listResult.success || !listResult.output) {
        return [];
      }

      let releases: Array<{
        name: string;
        namespace: string;
        chart: string;
        chart_version?: string;
        app_version?: string;
      }>;

      try {
        releases = JSON.parse(listResult.output);
      } catch {
        return [];
      }

      // Read local expected values from workDir
      const { readdir, readFile } = await import('fs/promises');
      const { join } = await import('path');
      const jsYaml = await import('js-yaml');

      let localFiles: string[];
      try {
        localFiles = await readdir(options.workDir);
      } catch {
        return [];
      }

      for (const release of releases) {
        try {
          // Get actual deployed values using embedded HelmOperations
          const valuesResult = await helmOps.getValues({
            name: release.name,
            namespace: release.namespace,
          });

          if (!valuesResult.success || !valuesResult.output) {
            continue;
          }

          let actualValues: Record<string, unknown>;
          try {
            actualValues = (jsYaml.load(valuesResult.output) as Record<string, unknown>) || {};
          } catch {
            continue;
          }

          // Find matching local values file
          const valuesFile = localFiles.find(
            f =>
              f === `${release.name}-values.yaml` ||
              f === `${release.name}.values.yaml` ||
              f === 'values.yaml'
          );

          if (valuesFile) {
            const localContent = await readFile(join(options.workDir, valuesFile), 'utf-8');
            const expectedValues = (jsYaml.load(localContent) as Record<string, unknown>) || {};

            const valuesDiff: Array<{ path: string; expected: unknown; actual: unknown }> = [];
            const allKeys = new Set([...Object.keys(expectedValues), ...Object.keys(actualValues)]);

            for (const key of allKeys) {
              const exp = expectedValues[key];
              const act = actualValues[key];
              if (JSON.stringify(exp) !== JSON.stringify(act)) {
                valuesDiff.push({ path: key, expected: exp, actual: act });
              }
            }

            if (valuesDiff.length > 0) {
              diffs.push({
                name: release.name,
                namespace: release.namespace,
                valuesDiff,
              });
            }
          }
        } catch {
          // Individual release comparison failed — skip gracefully
        }
      }
    } catch {
      // Graceful degradation if helm CLI is unavailable
      logger.warn('Helm drift detection: unable to compare releases, returning empty diff');
    }

    return diffs;
  }

  /**
   * Parse a HelmReleaseDiff into a ResourceDrift.
   */
  private parseHelmDiff(diff: HelmReleaseDiff): ResourceDrift {
    const drifts: DriftItem[] = [];

    // Check chart version drift
    if (diff.chartVersion && diff.chartVersion.expected !== diff.chartVersion.actual) {
      drifts.push({
        resourceId: `${diff.namespace}/${diff.name}`,
        resourceType: 'helm-release',
        resourceName: diff.name,
        driftType: 'modified',
        severity: 'medium',
        expected: diff.chartVersion.expected,
        actual: diff.chartVersion.actual,
        attribute: 'chartVersion',
        description: `Chart version has drifted`,
        remediation: `Run 'helm upgrade' to restore the expected version`,
        autoFixable: true,
      });
    }

    // Check values drift
    for (const v of diff.valuesDiff) {
      drifts.push({
        resourceId: `${diff.namespace}/${diff.name}`,
        resourceType: 'helm-release',
        resourceName: diff.name,
        driftType: 'modified',
        severity: 'medium',
        expected: v.expected,
        actual: v.actual,
        attribute: v.path,
        description: `Value '${v.path}' has drifted`,
        remediation: `Run 'helm upgrade' with correct values`,
        autoFixable: true,
      });
    }

    return {
      address: `${diff.namespace}/${diff.name}`,
      provider: 'helm',
      resourceType: 'helm-release',
      drifts,
      detectedAt: new Date(),
    };
  }

  /**
   * Determine drift severity based on resource type and attribute name.
   */
  private determineSeverity(resourceType: string, attribute: string): DriftSeverity {
    const criticalPatterns = [
      'security_group',
      'iam',
      'policy',
      'password',
      'secret',
      'key',
      'encryption',
      'kms',
    ];

    const lowerType = resourceType.toLowerCase();
    const lowerAttr = attribute.toLowerCase();

    for (const pattern of criticalPatterns) {
      if (lowerType.includes(pattern) || lowerAttr.includes(pattern)) {
        return 'critical';
      }
    }

    const highPatterns = ['vpc', 'subnet', 'instance', 'cluster', 'node', 'ingress'];
    for (const pattern of highPatterns) {
      if (lowerType.includes(pattern)) {
        return 'high';
      }
    }

    const mediumPatterns = ['bucket', 'storage', 'config', 'database', 'rds'];
    for (const pattern of mediumPatterns) {
      if (lowerType.includes(pattern)) {
        return 'medium';
      }
    }

    // Tag changes are usually low severity
    if (lowerAttr === 'tags' || lowerAttr.includes('tag')) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Calculate the summary metrics from a list of ResourceDrift objects.
   */
  private calculateSummary(resources: ResourceDrift[]): DriftSummary {
    const byDriftType: Record<DriftType, number> = {
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0,
    };

    const bySeverity: Record<DriftSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    let autoFixable = 0;
    let driftedResources = 0;

    for (const resource of resources) {
      if (resource.drifts.length > 0) {
        driftedResources++;
      }

      for (const drift of resource.drifts) {
        byDriftType[drift.driftType]++;
        bySeverity[drift.severity]++;
        if (drift.autoFixable) {
          autoFixable++;
        }
      }
    }

    return {
      totalResources: resources.length,
      driftedResources,
      unchangedResources: resources.length - driftedResources,
      byDriftType,
      bySeverity,
      autoFixable,
    };
  }

  /**
   * Generate a unique report ID.
   */
  private generateReportId(): string {
    return `drift_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Format a drift report as a Markdown string.
   */
  formatReportAsMarkdown(report: DriftReport): string {
    const lines: string[] = [
      `# Drift Detection Report`,
      ``,
      `**Provider:** ${report.provider}`,
      `**Working Directory:** ${report.workDir}`,
      `**Environment:** ${report.environment || 'N/A'}`,
      `**Generated:** ${report.generatedAt.toISOString()}`,
      `**Duration:** ${report.duration}ms`,
      ``,
      `## Summary`,
      ``,
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Total Resources | ${report.summary.totalResources} |`,
      `| Drifted Resources | ${report.summary.driftedResources} |`,
      `| Unchanged Resources | ${report.summary.unchangedResources} |`,
      `| Auto-Fixable | ${report.summary.autoFixable} |`,
      ``,
      `### By Severity`,
      ``,
      `| Severity | Count |`,
      `|----------|-------|`,
      `| Critical | ${report.summary.bySeverity.critical} |`,
      `| High | ${report.summary.bySeverity.high} |`,
      `| Medium | ${report.summary.bySeverity.medium} |`,
      `| Low | ${report.summary.bySeverity.low} |`,
      `| Info | ${report.summary.bySeverity.info} |`,
      ``,
    ];

    if (report.resources.length > 0) {
      lines.push(`## Drifted Resources`, ``);

      for (const resource of report.resources) {
        lines.push(`### ${resource.address}`, ``);

        for (const drift of resource.drifts) {
          lines.push(
            `- **${drift.attribute || 'Resource'}** (${drift.severity})`,
            `  - Type: ${drift.driftType}`,
            `  - ${drift.description}`,
            `  - Remediation: ${drift.remediation}`,
            `  - Auto-fixable: ${drift.autoFixable ? 'Yes' : 'No'}`,
            ``
          );
        }
      }
    }

    if (report.errors && report.errors.length > 0) {
      lines.push(`## Errors`, ``);
      for (const error of report.errors) {
        lines.push(`- ${error}`);
      }
    }

    return lines.join('\n');
  }
}
