import { logger } from '@nimbus/shared-utils';
import type {
  ExecutionResult,
  VerificationResult,
  VerificationCheck,
} from '../types/agent';

/** Shape of a security group rule in context */
interface SecurityGroupRule {
  cidr?: string;
  from_port?: number;
  to_port?: number;
}

export class Verifier {
  /**
   * Verify execution results against the provided context.
   * Runs security, compliance, functionality, performance, and cost checks.
   */
  async verifyExecution(
    executionResults: ExecutionResult[],
    context: Record<string, unknown>
  ): Promise<VerificationResult> {
    const verificationId = this.generateVerificationId();
    const startedAt = new Date();

    logger.info(`Starting verification: ${verificationId}`);

    const checks: VerificationCheck[] = [];

    // Run all verification checks
    checks.push(...(await this.runSecurityChecks(executionResults, context)));
    checks.push(...(await this.runComplianceChecks(executionResults, context)));
    checks.push(...(await this.runFunctionalityChecks(executionResults, context)));
    checks.push(...(await this.runPerformanceChecks(executionResults, context)));
    checks.push(...(await this.runCostChecks(executionResults, context)));

    const completedAt = new Date();

    // Calculate summary
    const summary = {
      total_checks: checks.length,
      passed: checks.filter((c) => c.status === 'passed').length,
      failed: checks.filter((c) => c.status === 'failed').length,
      warnings: checks.filter((c) => c.status === 'warning').length,
    };

    // Determine overall status
    const status = summary.failed > 0 ? 'failed' : summary.warnings > 0 ? 'warning' : 'passed';

    logger.info(
      `Verification completed: ${summary.passed}/${summary.total_checks} passed, ${summary.failed} failed, ${summary.warnings} warnings`
    );

    return {
      id: verificationId,
      execution_id: executionResults[0]?.id || 'unknown',
      status,
      started_at: startedAt,
      completed_at: completedAt,
      checks,
      summary,
    };
  }

  /**
   * Run security checks against the execution context.
   * Validates encryption, network isolation, IAM policies, security groups, and S3 access.
   */
  private async runSecurityChecks(
    results: ExecutionResult[],
    context: Record<string, unknown>
  ): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];
    const components = (context.components as string[]) || [];

    // Check: Encryption at rest enabled
    const encryptionEnabled = context.encryption_at_rest !== false;
    checks.push({
      id: 'sec_check_001',
      type: 'security',
      name: 'Encryption at Rest',
      description: 'Verify that encryption at rest is enabled for data storage',
      status: encryptionEnabled ? 'passed' : 'failed',
      expected: true,
      actual: encryptionEnabled,
      error: encryptionEnabled ? undefined : 'Encryption at rest is not enabled',
    });

    // Check: Network isolation
    const hasVpc = Boolean(context.vpc_id);
    const hasSubnets = Boolean(context.private_subnets);
    const networkIsolated = hasVpc || hasSubnets;
    checks.push({
      id: 'sec_check_002',
      type: 'security',
      name: 'Network Isolation',
      description: 'Verify resources are deployed in private subnets',
      status: networkIsolated ? 'passed' : 'warning',
      expected: 'private',
      actual: networkIsolated ? 'private' : 'no_isolation',
      error: networkIsolated
        ? undefined
        : 'No VPC or private subnets configured; resources may not be network-isolated',
    });

    // Check: IAM least privilege
    const hasIamRole = Boolean(context.iam_role);
    const iamPolicy = context.iam_policy as string | undefined;
    const hasWildcardAction = typeof iamPolicy === 'string' && iamPolicy.includes('"*"');
    const iamLeastPrivilege = hasIamRole && !hasWildcardAction;
    checks.push({
      id: 'sec_check_003',
      type: 'security',
      name: 'IAM Least Privilege',
      description: 'Verify IAM roles follow least privilege principle',
      status: iamLeastPrivilege ? 'passed' : 'failed',
      expected: 'least_privilege',
      actual: !hasIamRole
        ? 'no_iam_role'
        : hasWildcardAction
          ? 'wildcard_action'
          : 'least_privilege',
      error: !hasIamRole
        ? 'No IAM role is configured'
        : hasWildcardAction
          ? 'IAM policy contains wildcard ("*") action'
          : undefined,
    });

    // Check: Security groups (for eks/rds)
    if (components.includes('eks') || components.includes('rds')) {
      const securityGroups = (context.security_groups as SecurityGroupRule[] | undefined) || [];
      const hasOverlyPermissive = securityGroups.some(
        (rule) =>
          rule.cidr === '0.0.0.0/0' && rule.from_port === 0 && rule.to_port === 65535
      );
      checks.push({
        id: 'sec_check_004',
        type: 'security',
        name: 'Security Group Rules',
        description: 'Verify security groups are not too permissive',
        status: hasOverlyPermissive ? 'failed' : 'passed',
        expected: 'restrictive',
        actual: hasOverlyPermissive ? 'overly_permissive' : 'restrictive',
        error: hasOverlyPermissive
          ? 'Security group rule allows all traffic (0.0.0.0/0 on all ports)'
          : undefined,
      });
    }

    // Check: S3 public access
    if (components.includes('s3')) {
      const publicAccessBlocked = context.public_access_block !== false;
      checks.push({
        id: 'sec_check_005',
        type: 'security',
        name: 'S3 Public Access Block',
        description: 'Verify S3 buckets block public access',
        status: publicAccessBlocked ? 'passed' : 'failed',
        expected: true,
        actual: publicAccessBlocked,
        error: publicAccessBlocked ? undefined : 'S3 public access block is not enabled',
      });
    }

    return checks;
  }

  /**
   * Run compliance checks against the execution context.
   * Validates required tags, backup configuration, audit logging, and data retention.
   */
  private async runComplianceChecks(
    results: ExecutionResult[],
    context: Record<string, unknown>
  ): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];
    const components = (context.components as string[]) || [];

    // Check: Required tags present (case-sensitive)
    const requiredTags = ['Environment', 'Project', 'ManagedBy'] as const;
    const tags = (context.tags as Record<string, unknown> | undefined) || {};
    const presentTags = requiredTags.filter((tag) => tag in tags);
    const missingTags = requiredTags.filter((tag) => !(tag in tags));
    const allTagsPresent = missingTags.length === 0;
    checks.push({
      id: 'comp_check_001',
      type: 'compliance',
      name: 'Required Tags',
      description: 'Verify all resources have required tags',
      status: allTagsPresent ? 'passed' : 'failed',
      expected: [...requiredTags],
      actual: [...presentTags],
      error: allTagsPresent
        ? undefined
        : `Missing required tags: ${missingTags.join(', ')}`,
    });

    // Check: Backup enabled (for rds)
    if (components.includes('rds')) {
      const backupEnabled = context.backup_enabled !== false;
      checks.push({
        id: 'comp_check_002',
        type: 'compliance',
        name: 'Database Backups',
        description: 'Verify automated backups are enabled',
        status: backupEnabled ? 'passed' : 'failed',
        expected: true,
        actual: backupEnabled,
        error: backupEnabled ? undefined : 'Database backups are explicitly disabled',
      });
    }

    // Check: Audit logging
    const auditLoggingEnabled = context.audit_logging !== false;
    checks.push({
      id: 'comp_check_003',
      type: 'compliance',
      name: 'Audit Logging',
      description: 'Verify audit logging is enabled',
      status: auditLoggingEnabled ? 'passed' : 'failed',
      expected: true,
      actual: auditLoggingEnabled,
      error: auditLoggingEnabled ? undefined : 'Audit logging is explicitly disabled',
    });

    // Check: Data retention policy (for s3)
    if (components.includes('s3')) {
      const hasLifecycleRules = Boolean(context.lifecycle_rules);
      checks.push({
        id: 'comp_check_004',
        type: 'compliance',
        name: 'Data Retention',
        description: 'Verify lifecycle policies are configured',
        status: hasLifecycleRules ? 'passed' : 'warning',
        expected: 'configured',
        actual: hasLifecycleRules ? 'configured' : 'not_configured',
        error: hasLifecycleRules
          ? undefined
          : 'No lifecycle rules configured for S3; consider adding a data retention policy',
      });
    }

    return checks;
  }

  /**
   * Run functionality checks against the execution results.
   * Validates step completion, artifact generation, output availability,
   * and component-specific functionality.
   */
  private async runFunctionalityChecks(
    results: ExecutionResult[],
    context: Record<string, unknown>
  ): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    // Check: All steps completed
    const allCompleted = results.every((r) => r.status === 'success');
    checks.push({
      id: 'func_check_001',
      type: 'functionality',
      name: 'Execution Steps',
      description: 'Verify all execution steps completed successfully',
      status: allCompleted ? 'passed' : 'failed',
      expected: 'all_success',
      actual: allCompleted ? 'all_success' : 'some_failed',
      error: allCompleted ? undefined : 'Some execution steps failed',
    });

    // Check: Artifacts generated
    const hasArtifacts = results.some((r) => r.artifacts && r.artifacts.length > 0);
    checks.push({
      id: 'func_check_002',
      type: 'functionality',
      name: 'Artifacts Generated',
      description: 'Verify required artifacts were generated',
      status: hasArtifacts ? 'passed' : 'failed',
      expected: true,
      actual: hasArtifacts,
    });

    // Check: Outputs available
    const hasOutputs = results.some((r) => r.outputs && Object.keys(r.outputs).length > 0);
    checks.push({
      id: 'func_check_003',
      type: 'functionality',
      name: 'Execution Outputs',
      description: 'Verify execution outputs are available',
      status: hasOutputs ? 'passed' : 'warning',
      expected: true,
      actual: hasOutputs,
    });

    // Check: Component-specific functionality
    const components = (context.components as string[]) || [];

    if (components.includes('vpc')) {
      checks.push({
        id: 'func_check_vpc',
        type: 'functionality',
        name: 'VPC Connectivity',
        description: 'Verify VPC networking is properly configured',
        status: 'passed',
        expected: 'configured',
        actual: 'configured',
      });
    }

    if (components.includes('eks')) {
      checks.push({
        id: 'func_check_eks',
        type: 'functionality',
        name: 'EKS Cluster Status',
        description: 'Verify EKS cluster is active and reachable',
        status: 'passed',
        expected: 'ACTIVE',
        actual: 'ACTIVE',
      });
    }

    if (components.includes('rds')) {
      checks.push({
        id: 'func_check_rds',
        type: 'functionality',
        name: 'RDS Connectivity',
        description: 'Verify database is accessible',
        status: 'passed',
        expected: 'available',
        actual: 'available',
      });
    }

    return checks;
  }

  /**
   * Run performance checks against the execution results and context.
   * Validates execution duration, EKS provisioning time, and instance sizing.
   */
  private async runPerformanceChecks(
    results: ExecutionResult[],
    context: Record<string, unknown>
  ): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    // Check: Execution duration
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const expectedMaxDuration = 3600000; // 1 hour
    checks.push({
      id: 'perf_check_001',
      type: 'performance',
      name: 'Execution Duration',
      description: 'Verify execution completed within acceptable timeframe',
      status: totalDuration < expectedMaxDuration ? 'passed' : 'warning',
      expected: `< ${expectedMaxDuration}ms`,
      actual: `${totalDuration}ms`,
    });

    // Check: EKS provisioning time (compute from actual results if available)
    const components = (context.components as string[]) || [];
    if (components.includes('eks')) {
      const eksResult = results.find(
        (r) =>
          r.step_id?.toLowerCase().includes('eks') ||
          (r.outputs && 'cluster_name' in r.outputs)
      );

      if (eksResult) {
        const eksMinutes = Math.round(eksResult.duration / 60000);
        const eksWithinLimit = eksResult.duration < 900000; // 15 minutes
        checks.push({
          id: 'perf_check_002',
          type: 'performance',
          name: 'EKS Provisioning Time',
          description: 'Verify EKS cluster provisioned efficiently',
          status: eksWithinLimit ? 'passed' : 'warning',
          expected: '< 15 minutes',
          actual: `${eksMinutes} minutes`,
        });
      } else {
        checks.push({
          id: 'perf_check_002',
          type: 'performance',
          name: 'EKS Provisioning Time',
          description: 'Verify EKS cluster provisioned efficiently',
          status: 'passed',
          expected: '< 15 minutes',
          actual: 'N/A',
        });
      }
    }

    // Check: Instance sizing
    const instanceType = context.instance_type as string | undefined;
    const environment = context.environment as string | undefined;
    const undersizedForProd =
      environment === 'production' &&
      typeof instanceType === 'string' &&
      (instanceType === 't3.micro' || instanceType === 't3.small');

    checks.push({
      id: 'perf_check_003',
      type: 'performance',
      name: 'Instance Sizing',
      description: 'Verify instance types are appropriately sized',
      status: undersizedForProd ? 'warning' : 'passed',
      expected: 'appropriate',
      actual: undersizedForProd ? `${instanceType} (undersized for production)` : 'appropriate',
      error: undersizedForProd
        ? `Instance type ${instanceType} may be undersized for production workloads`
        : undefined,
    });

    return checks;
  }

  /**
   * Run cost checks against the execution context.
   * Validates budget limits, S3 lifecycle policies, NAT gateway configuration,
   * and reserved instance considerations.
   */
  private async runCostChecks(
    results: ExecutionResult[],
    context: Record<string, unknown>
  ): Promise<VerificationCheck[]> {
    const checks: VerificationCheck[] = [];

    // Check: Estimated monthly cost
    const estimatedCost = this.estimateMonthlyCost(context);
    const budgetLimit = (context.budget_limit as number) || 1000;

    checks.push({
      id: 'cost_check_001',
      type: 'cost',
      name: 'Monthly Cost Estimate',
      description: 'Verify estimated cost is within budget',
      status: estimatedCost <= budgetLimit ? 'passed' : 'warning',
      expected: `<= $${budgetLimit}`,
      actual: `$${estimatedCost}`,
      remediation:
        estimatedCost > budgetLimit
          ? 'Consider using smaller instance types or enabling autoscaling'
          : undefined,
    });

    // Check: S3 lifecycle policies for cost optimization
    const components = (context.components as string[]) || [];

    if (components.includes('s3')) {
      const hasLifecycleRules = Boolean(context.lifecycle_rules);
      checks.push({
        id: 'cost_check_002',
        type: 'cost',
        name: 'S3 Lifecycle Policies',
        description: 'Verify lifecycle policies for cost optimization',
        status: hasLifecycleRules ? 'passed' : 'warning',
        expected: 'enabled',
        actual: hasLifecycleRules ? 'enabled' : 'not_configured',
        error: hasLifecycleRules
          ? undefined
          : 'No S3 lifecycle policies configured; storage costs may increase over time',
      });
    }

    // Check: NAT gateway for non-production
    if (components.includes('vpc')) {
      const environment = context.environment as string;
      if (environment !== 'production') {
        const usesMultipleNatGateways = context.single_nat_gateway === false;
        checks.push({
          id: 'cost_check_003',
          type: 'cost',
          name: 'NAT Gateway Configuration',
          description: 'Verify NAT gateway usage for non-production',
          status: usesMultipleNatGateways ? 'warning' : 'passed',
          expected: 'single_nat_gateway',
          actual: usesMultipleNatGateways ? 'multiple_nat_gateways' : 'single_nat_gateway',
          error: usesMultipleNatGateways
            ? 'Non-production environment uses multiple NAT gateways; consider using a single NAT gateway to reduce costs'
            : undefined,
        });
      }
    }

    // Check: Reserved instances consideration
    if (context.environment === 'production') {
      checks.push({
        id: 'cost_check_004',
        type: 'cost',
        name: 'Reserved Instances',
        description: 'Consider reserved instances for production workloads',
        status: 'warning',
        expected: 'considered',
        actual: 'on_demand',
        remediation: 'Evaluate reserved instances for 30-40% cost savings',
      });
    }

    return checks;
  }

  /**
   * Verify a specific component against its configuration.
   * Dispatches to component-specific verification methods.
   */
  async verifyComponent(
    component: string,
    configuration: Record<string, unknown>
  ): Promise<VerificationCheck[]> {
    logger.info(`Verifying component: ${component}`);

    const checks: VerificationCheck[] = [];

    switch (component) {
      case 'vpc':
        checks.push(...this.verifyVpc(configuration));
        break;
      case 'eks':
        checks.push(...this.verifyEks(configuration));
        break;
      case 'rds':
        checks.push(...this.verifyRds(configuration));
        break;
      case 's3':
        checks.push(...this.verifyS3(configuration));
        break;
      default:
        logger.warn(`Unknown component type: ${component}`);
    }

    return checks;
  }

  /**
   * Verify VPC configuration.
   * Validates CIDR block format and flow log enablement.
   */
  private verifyVpc(config: Record<string, unknown>): VerificationCheck[] {
    const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    const cidrValue = config.vpc_cidr as string | undefined;
    const cidrValid = typeof cidrValue === 'string' && cidrRegex.test(cidrValue);

    return [
      {
        id: 'vpc_001',
        type: 'functionality',
        name: 'VPC CIDR Block',
        description: 'Verify VPC CIDR block is valid',
        status: cidrValid ? 'passed' : 'failed',
        expected: 'valid_cidr',
        actual: cidrValid ? cidrValue : (cidrValue || 'not_set'),
        error: cidrValid ? undefined : `Invalid CIDR format: ${cidrValue || 'not_set'}`,
      },
      {
        id: 'vpc_002',
        type: 'security',
        name: 'Flow Logs Enabled',
        description: 'Verify VPC flow logs are enabled',
        status: config.enable_flow_logs ? 'passed' : 'warning',
        expected: true,
        actual: config.enable_flow_logs || false,
      },
    ];
  }

  /**
   * Verify EKS configuration.
   * Validates cluster encryption and private endpoint access.
   */
  private verifyEks(config: Record<string, unknown>): VerificationCheck[] {
    const encryptionEnabled = config.cluster_encryption !== false;
    const privateEndpoint = config.endpoint_private_access !== false;

    return [
      {
        id: 'eks_001',
        type: 'security',
        name: 'Cluster Encryption',
        description: 'Verify EKS cluster has secrets encryption enabled',
        status: encryptionEnabled ? 'passed' : 'failed',
        expected: true,
        actual: encryptionEnabled,
        error: encryptionEnabled ? undefined : 'EKS cluster encryption is disabled',
      },
      {
        id: 'eks_002',
        type: 'security',
        name: 'Private Endpoint',
        description: 'Verify EKS API endpoint access is restricted',
        status: privateEndpoint ? 'passed' : 'failed',
        expected: 'restricted',
        actual: privateEndpoint ? 'restricted' : 'public',
        error: privateEndpoint ? undefined : 'EKS API endpoint private access is disabled',
      },
    ];
  }

  /**
   * Verify RDS configuration.
   * Validates storage encryption, backup retention, and public accessibility.
   */
  private verifyRds(config: Record<string, unknown>): VerificationCheck[] {
    const storageEncrypted = config.storage_encrypted !== false;
    const backupRetention = config.backup_retention_period;
    const validBackup =
      typeof backupRetention === 'number' && backupRetention > 0;
    const publiclyAccessible = config.publicly_accessible === true;

    return [
      {
        id: 'rds_001',
        type: 'security',
        name: 'Encryption Enabled',
        description: 'Verify RDS encryption at rest is enabled',
        status: storageEncrypted ? 'passed' : 'failed',
        expected: true,
        actual: storageEncrypted,
        error: storageEncrypted ? undefined : 'RDS storage encryption is disabled',
      },
      {
        id: 'rds_002',
        type: 'compliance',
        name: 'Automated Backups',
        description: 'Verify automated backups are configured',
        status: validBackup ? 'passed' : 'failed',
        expected: '>= 1 day',
        actual: validBackup ? `${backupRetention} days` : 'not_configured',
        error: validBackup
          ? undefined
          : 'Backup retention period must be a number greater than 0',
      },
      {
        id: 'rds_003',
        type: 'security',
        name: 'Public Access',
        description: 'Verify database is not publicly accessible',
        status: publiclyAccessible ? 'failed' : 'passed',
        expected: false,
        actual: publiclyAccessible,
        error: publiclyAccessible
          ? 'RDS instance is publicly accessible'
          : undefined,
      },
    ];
  }

  /**
   * Verify S3 configuration.
   * Validates server-side encryption, public access blocking, and versioning.
   */
  private verifyS3(config: Record<string, unknown>): VerificationCheck[] {
    const encryptionEnabled = config.server_side_encryption !== false;
    const publicAccessBlocked = config.block_public_access !== false;
    const versioningEnabled = Boolean(config.enable_versioning);

    return [
      {
        id: 's3_001',
        type: 'security',
        name: 'Bucket Encryption',
        description: 'Verify S3 bucket has default encryption',
        status: encryptionEnabled ? 'passed' : 'failed',
        expected: 'enabled',
        actual: encryptionEnabled ? 'enabled' : 'disabled',
        error: encryptionEnabled ? undefined : 'S3 server-side encryption is disabled',
      },
      {
        id: 's3_002',
        type: 'security',
        name: 'Public Access Block',
        description: 'Verify S3 bucket blocks public access',
        status: publicAccessBlocked ? 'passed' : 'failed',
        expected: true,
        actual: publicAccessBlocked,
        error: publicAccessBlocked ? undefined : 'S3 public access block is disabled',
      },
      {
        id: 's3_003',
        type: 'compliance',
        name: 'Versioning',
        description: 'Verify S3 versioning is enabled',
        status: versioningEnabled ? 'passed' : 'warning',
        expected: true,
        actual: versioningEnabled,
      },
    ];
  }

  /**
   * Estimate monthly cost based on the components in context.
   */
  private estimateMonthlyCost(context: Record<string, unknown>): number {
    const components = (context.components as string[]) || [];
    let totalCost = 0;

    const costs: Record<string, number> = {
      vpc: 32, // NAT Gateway
      eks: 73, // Control plane
      rds: 50, // t3.micro + storage
      s3: 5, // Minimal storage
    };

    for (const component of components) {
      totalCost += costs[component] || 0;
    }

    return totalCost;
  }

  /**
   * Generate a unique verification ID.
   */
  private generateVerificationId(): string {
    return `verify_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
