/**
 * Drift Analyzer
 *
 * Analyzes drift reports and provides remediation suggestions
 */

import { logger } from '@nimbus/shared-utils';
import { TerraformToolsClient } from '../clients';
import type {
  DriftReport,
  DriftRemediationOptions,
  DriftRemediationResult,
  RemediationAction,
  ResourceDrift,
  DriftItem,
} from '../types/drift';

const k8sServiceUrl = process.env.K8S_TOOLS_URL || 'http://localhost:3007';
const helmServiceUrl = process.env.HELM_TOOLS_URL || 'http://localhost:3008';

export interface RemediationPlan {
  /** Resources that will be updated */
  update: string[];
  /** Resources that will be created */
  create: string[];
  /** Resources that will be destroyed */
  destroy: string[];
  /** Resources that require manual intervention */
  manual: string[];
  /** Estimated impact */
  impact: 'low' | 'medium' | 'high' | 'critical';
  /** Warnings about the remediation */
  warnings: string[];
}

export class DriftAnalyzer {
  private terraformClient: TerraformToolsClient;

  constructor() {
    this.terraformClient = new TerraformToolsClient();
  }

  /**
   * Analyze a drift report and create a remediation plan
   */
  createRemediationPlan(report: DriftReport): RemediationPlan {
    const plan: RemediationPlan = {
      update: [],
      create: [],
      destroy: [],
      manual: [],
      impact: 'low',
      warnings: [],
    };

    for (const resource of report.resources) {
      for (const drift of resource.drifts) {
        switch (drift.driftType) {
          case 'modified':
            if (drift.autoFixable) {
              plan.update.push(resource.address);
            } else {
              plan.manual.push(resource.address);
              plan.warnings.push(
                `Resource ${resource.address} requires manual intervention for attribute '${drift.attribute}'`
              );
            }
            break;

          case 'added':
            plan.create.push(resource.address);
            break;

          case 'removed':
            plan.destroy.push(resource.address);
            plan.warnings.push(
              `Resource ${resource.address} will be destroyed - ensure this is intentional`
            );
            break;
        }
      }
    }

    // Deduplicate arrays
    plan.update = [...new Set(plan.update)];
    plan.create = [...new Set(plan.create)];
    plan.destroy = [...new Set(plan.destroy)];
    plan.manual = [...new Set(plan.manual)];

    // Determine impact level
    plan.impact = this.determineImpact(report, plan);

    return plan;
  }

  /**
   * Determine the overall impact of remediation
   */
  private determineImpact(
    report: DriftReport,
    plan: RemediationPlan
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Critical if any critical severity drifts or destroy actions
    if (report.summary.bySeverity.critical > 0 || plan.destroy.length > 0) {
      return 'critical';
    }

    // High if many high severity drifts
    if (report.summary.bySeverity.high > 3) {
      return 'high';
    }

    // Medium if any high severity or many updates
    if (report.summary.bySeverity.high > 0 || plan.update.length > 5) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Execute drift remediation
   */
  async remediate(options: DriftRemediationOptions): Promise<DriftRemediationResult> {
    const startTime = Date.now();
    const actions: RemediationAction[] = [];
    let fixed = 0;
    let failed = 0;
    let skipped = 0;

    logger.info(`Starting drift remediation for ${options.report.provider}`);

    try {
      switch (options.report.provider) {
        case 'terraform':
          return await this.remediateTerraform(options, startTime);
        case 'kubernetes':
          return await this.remediateKubernetes(options, startTime);
        case 'helm':
          return await this.remediateHelm(options, startTime);
        default:
          throw new Error(`Unsupported provider: ${options.report.provider}`);
      }
    } catch (error) {
      logger.error('Drift remediation failed', error);
      return {
        success: false,
        fixed,
        failed: failed + 1,
        skipped,
        actions,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Remediate Terraform drift
   */
  private async remediateTerraform(
    options: DriftRemediationOptions,
    startTime: number
  ): Promise<DriftRemediationResult> {
    const actions: RemediationAction[] = [];
    let fixed = 0;
    let failed = 0;
    let skipped = 0;

    const { report, autoApprove, autoFixOnly, dryRun, targets } = options;

    // Filter resources based on options
    const resourcesToFix = report.resources.filter((resource) => {
      // Filter by targets if specified
      if (targets && targets.length > 0) {
        if (!targets.includes(resource.address)) {
          return false;
        }
      }

      // Filter by auto-fixable if specified
      if (autoFixOnly) {
        return resource.drifts.every((d) => d.autoFixable);
      }

      return true;
    });

    if (resourcesToFix.length === 0) {
      logger.info('No resources to remediate');
      return {
        success: true,
        fixed: 0,
        failed: 0,
        skipped: report.resources.length,
        actions: [],
        duration: Date.now() - startTime,
      };
    }

    // Build target list for terraform apply
    const targetAddresses = resourcesToFix.map((r) => r.address);

    if (dryRun) {
      // Just run plan in dry run mode
      logger.info('Dry run mode - showing what would be changed');

      try {
        const planResult = await this.terraformClient.plan(report.workDir, {
          target: targetAddresses,
        });

        for (const resource of resourcesToFix) {
          actions.push({
            address: resource.address,
            action: 'apply',
            success: true,
            output: `Would apply: ${planResult.output.substring(0, 200)}...`,
          });
          fixed++;
        }

        return {
          success: true,
          fixed,
          failed,
          skipped: report.resources.length - fixed,
          actions,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        return {
          success: false,
          fixed: 0,
          failed: resourcesToFix.length,
          skipped: report.resources.length - resourcesToFix.length,
          actions: [
            {
              address: 'all',
              action: 'apply',
              success: false,
              error: (error as Error).message,
            },
          ],
          duration: Date.now() - startTime,
        };
      }
    }

    // Run terraform apply
    try {
      logger.info(`Applying changes to ${targetAddresses.length} resources`);

      const applyResult = await this.terraformClient.apply(report.workDir, {
        autoApprove: autoApprove ?? true,
        target: targetAddresses,
      });

      for (const resource of resourcesToFix) {
        actions.push({
          address: resource.address,
          action: 'apply',
          success: true,
          output: 'Applied successfully',
        });
        fixed++;
      }

      return {
        success: true,
        fixed,
        failed,
        skipped: report.resources.length - fixed,
        actions,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      logger.error('Terraform apply failed', error);

      for (const resource of resourcesToFix) {
        actions.push({
          address: resource.address,
          action: 'apply',
          success: false,
          error: (error as Error).message,
        });
        failed++;
      }

      return {
        success: false,
        fixed,
        failed,
        skipped: report.resources.length - resourcesToFix.length,
        actions,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Remediate Kubernetes drift
   */
  private async remediateKubernetes(
    options: DriftRemediationOptions,
    startTime: number
  ): Promise<DriftRemediationResult> {
    const actions: RemediationAction[] = [];
    let fixed = 0;
    let failed = 0;
    let skipped = 0;

    const { report, dryRun, targets } = options;

    // Filter resources based on targets
    const resourcesToFix = report.resources.filter((resource) => {
      if (targets && targets.length > 0) {
        return targets.includes(resource.address);
      }
      return true;
    });

    if (resourcesToFix.length === 0) {
      logger.info('No Kubernetes resources to remediate');
      return {
        success: true,
        fixed: 0,
        failed: 0,
        skipped: report.resources.length,
        actions: [],
        duration: Date.now() - startTime,
      };
    }

    for (const resource of resourcesToFix) {
      try {
        const response = await fetch(`${k8sServiceUrl}/api/k8s/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manifest: resource.expected,
            namespace: (resource as any).namespace,
            dryRun: dryRun,
          }),
        });

        const data = await response.json() as { success: boolean; output?: string; error?: string };

        if (data.success) {
          actions.push({
            address: resource.address,
            action: 'apply',
            success: true,
            output: dryRun ? 'Would apply manifest' : (data.output || 'Applied manifest'),
          });
          fixed++;
        } else {
          actions.push({
            address: resource.address,
            action: 'apply',
            success: false,
            error: data.error || 'Apply failed',
          });
          failed++;
        }
      } catch (error: any) {
        logger.error(`Failed to remediate K8s resource ${resource.address}`, error);
        actions.push({
          address: resource.address,
          action: 'apply',
          success: false,
          error: `K8s tools service unreachable: ${error.message}`,
        });
        failed++;
      }
    }

    skipped = report.resources.length - resourcesToFix.length;

    return {
      success: failed === 0,
      fixed,
      failed,
      skipped,
      actions,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Remediate Helm drift
   */
  private async remediateHelm(
    options: DriftRemediationOptions,
    startTime: number
  ): Promise<DriftRemediationResult> {
    const actions: RemediationAction[] = [];
    let fixed = 0;
    let failed = 0;
    let skipped = 0;

    const { report, dryRun, targets } = options;

    // Filter resources based on targets
    const resourcesToFix = report.resources.filter((resource) => {
      if (targets && targets.length > 0) {
        return targets.includes(resource.address);
      }
      return true;
    });

    if (resourcesToFix.length === 0) {
      logger.info('No Helm releases to remediate');
      return {
        success: true,
        fixed: 0,
        failed: 0,
        skipped: report.resources.length,
        actions: [],
        duration: Date.now() - startTime,
      };
    }

    for (const resource of resourcesToFix) {
      try {
        // Extract release name and namespace from the resource address
        // Address format is typically "release/name" or just "name"
        const parts = resource.address.split('/');
        const name = parts.length > 1 ? parts[1] : parts[0];
        const namespace = (resource as any).namespace || 'default';

        const response = await fetch(`${helmServiceUrl}/api/helm/upgrade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            namespace,
            dryRun: dryRun,
            reuseValues: true,
          }),
        });

        const data = await response.json() as { success: boolean; output?: string; error?: string };

        if (data.success) {
          actions.push({
            address: resource.address,
            action: 'apply',
            success: true,
            output: dryRun ? 'Would upgrade release' : (data.output || 'Upgraded release'),
          });
          fixed++;
        } else {
          actions.push({
            address: resource.address,
            action: 'apply',
            success: false,
            error: data.error || 'Upgrade failed',
          });
          failed++;
        }
      } catch (error: any) {
        logger.error(`Failed to remediate Helm release ${resource.address}`, error);
        actions.push({
          address: resource.address,
          action: 'apply',
          success: false,
          error: `Helm tools service unreachable: ${error.message}`,
        });
        failed++;
      }
    }

    skipped = report.resources.length - resourcesToFix.length;

    return {
      success: failed === 0,
      fixed,
      failed,
      skipped,
      actions,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Get suggested actions for a drift item
   */
  getSuggestedActions(drift: DriftItem): string[] {
    const actions: string[] = [];

    switch (drift.driftType) {
      case 'modified':
        actions.push(`Review the change: expected=${JSON.stringify(drift.expected)}, actual=${JSON.stringify(drift.actual)}`);
        if (drift.autoFixable) {
          actions.push(`Auto-fix available: run remediation to restore expected value`);
        } else {
          actions.push(`Manual review required: ${drift.remediation}`);
        }
        break;

      case 'added':
        actions.push(`Resource needs to be created`);
        actions.push(drift.remediation || 'Run apply to create the resource');
        break;

      case 'removed':
        actions.push(`Resource exists in state but not in config - verify intentional deletion`);
        actions.push(drift.remediation || 'Run apply to remove from state or add back to config');
        break;
    }

    // Add severity-specific guidance
    switch (drift.severity) {
      case 'critical':
        actions.unshift(`⚠️ CRITICAL: Immediate attention required`);
        break;
      case 'high':
        actions.unshift(`⚡ HIGH: Address this drift soon`);
        break;
    }

    return actions;
  }

  /**
   * Generate a compliance report from drift data
   */
  generateComplianceReport(report: DriftReport): {
    compliant: boolean;
    score: number;
    findings: Array<{
      resource: string;
      finding: string;
      severity: string;
      remediation: string;
    }>;
  } {
    const findings: Array<{
      resource: string;
      finding: string;
      severity: string;
      remediation: string;
    }> = [];

    for (const resource of report.resources) {
      for (const drift of resource.drifts) {
        findings.push({
          resource: resource.address,
          finding: drift.description,
          severity: drift.severity,
          remediation: drift.remediation || 'No specific remediation provided',
        });
      }
    }

    // Calculate compliance score (100% - drift percentage)
    const totalChecks = report.summary.totalResources;
    const failedChecks = report.summary.driftedResources;
    const score = totalChecks > 0 ? Math.round(((totalChecks - failedChecks) / totalChecks) * 100) : 100;

    return {
      compliant: score === 100,
      score,
      findings,
    };
  }
}
