/**
 * Drift Detection System
 *
 * Detects infrastructure drift between desired state (IaC) and actual state (cloud provider)
 * Supports Terraform, Kubernetes, and Helm
 */

import { logger } from '@nimbus/shared-utils';
import { TerraformToolsClient } from '../clients';
import type {
  DriftDetectionOptions,
  DriftReport,
  DriftSummary,
  ResourceDrift,
  DriftItem,
  DriftType,
  DriftSeverity,
  TerraformChange,
  K8sResourceDiff,
  HelmReleaseDiff,
} from '../types/drift';

export class DriftDetector {
  private terraformClient: TerraformToolsClient;

  constructor() {
    this.terraformClient = new TerraformToolsClient();
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
   * Detect Terraform drift using terraform plan
   */
  private async detectTerraformDrift(
    options: DriftDetectionOptions,
    startTime: number
  ): Promise<DriftReport> {
    const reportId = this.generateReportId();
    const resources: ResourceDrift[] = [];
    const errors: string[] = [];

    try {
      // Refresh state to get latest actual values
      if (options.refresh !== false) {
        logger.info('Refreshing Terraform state...');
        try {
          await this.terraformClient.refresh(options.workDir, { varFile: options.varFile });
        } catch (error) {
          errors.push(`State refresh warning: ${(error as Error).message}`);
        }
      }

      // Run terraform plan to detect drift
      logger.info('Running Terraform plan to detect drift...');
      const planResult = await this.terraformClient.plan(options.workDir, {
        varFile: options.varFile,
        out: `${options.workDir}/.drift-plan.tfplan`,
        target: options.targets,
      });

      // Parse the plan output to extract drift information
      const hasChanges = planResult.changes.to_add > 0 || planResult.changes.to_change > 0 || planResult.changes.to_destroy > 0;
      if (hasChanges) {
        // Get detailed plan output
        const showResult = await this.terraformClient.show(
          options.workDir,
          `${options.workDir}/.drift-plan.tfplan`
        );

        if (showResult.json) {
          const planJson = showResult.json;
          const resourceChanges = planJson.resource_changes || [];

          for (const change of resourceChanges) {
            if (this.isNonDriftChange(change)) continue;

            const resourceDrift = this.parseTerraformChange(change);
            if (resourceDrift.drifts.length > 0) {
              resources.push(resourceDrift);
            }
          }
        }
      }

      // Calculate summary
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
   * Detect Kubernetes drift by comparing manifests to actual state
   */
  private async detectKubernetesDrift(
    options: DriftDetectionOptions,
    startTime: number
  ): Promise<DriftReport> {
    const reportId = this.generateReportId();
    const resources: ResourceDrift[] = [];
    const errors: string[] = [];

    try {
      // This would use the K8s tools service to compare manifests vs actual
      // For now, we'll implement a basic version that compares desired vs actual

      // Build kubectl args
      const kubeArgs: string[] = [];
      if (options.kubeconfig) {
        kubeArgs.push('--kubeconfig', options.kubeconfig);
      }
      if (options.context) {
        kubeArgs.push('--context', options.context);
      }
      if (options.namespace) {
        kubeArgs.push('-n', options.namespace);
      }

      // Use kubectl diff to detect changes
      // This would be called via the k8s-tools-service in a real implementation
      logger.info('Detecting Kubernetes drift...');

      // For each manifest in workDir, compare to actual state
      // This is a placeholder - actual implementation would parse manifests and compare
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
   * Detect Helm drift by comparing deployed values to chart values
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

      // Compare Helm release values vs chart values
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
   * Check if a change is not related to drift (e.g., planned new resources)
   */
  private isNonDriftChange(change: TerraformChange): boolean {
    // If only action is "no-op", it's not drift
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
   * Parse Terraform change to ResourceDrift
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

    // Find specific attribute changes
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
   * Compare Kubernetes manifests to actual state
   */
  private async compareKubernetesManifests(
    options: DriftDetectionOptions
  ): Promise<K8sResourceDiff[]> {
    // This would be implemented using kubectl diff or kubernetes client
    // For now, return empty array - actual implementation would:
    // 1. Parse all YAML/JSON manifests in workDir
    // 2. For each resource, fetch actual state from cluster
    // 3. Deep compare and return differences
    return [];
  }

  /**
   * Parse Kubernetes diff to ResourceDrift
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
   * Compare Helm releases to expected values
   */
  private async compareHelmReleases(
    options: DriftDetectionOptions
  ): Promise<HelmReleaseDiff[]> {
    // This would be implemented using helm get values and comparing
    // For now, return empty array
    return [];
  }

  /**
   * Parse Helm diff to ResourceDrift
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
   * Determine severity based on resource type and attribute
   */
  private determineSeverity(resourceType: string, attribute: string): DriftSeverity {
    // Critical: Security-related changes
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

    // High: Network and compute changes
    const highPatterns = ['vpc', 'subnet', 'instance', 'cluster', 'node', 'ingress'];
    for (const pattern of highPatterns) {
      if (lowerType.includes(pattern)) {
        return 'high';
      }
    }

    // Medium: Storage and configuration
    const mediumPatterns = ['bucket', 'storage', 'config', 'database', 'rds'];
    for (const pattern of mediumPatterns) {
      if (lowerType.includes(pattern)) {
        return 'medium';
      }
    }

    // Tags are usually low severity
    if (lowerAttr === 'tags' || lowerAttr.includes('tag')) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Calculate summary from resources
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

    const totalDrifts = Object.values(byDriftType).reduce((a, b) => a + b, 0);

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
   * Generate unique report ID
   */
  private generateReportId(): string {
    return `drift_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Format drift report as markdown
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
