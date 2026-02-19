import { logger } from '@nimbus/shared-utils';
import type { SafetyCheck, SafetyCheckResult, AgentPlan, AgentTask } from '../types/agent';

export class SafetyManager {
  private checks: Map<string, SafetyCheck>;

  constructor() {
    this.checks = new Map();
    this.initializeDefaultChecks();
  }

  /**
   * Run pre-execution safety checks
   */
  async runPreExecutionChecks(
    task: AgentTask,
    plan: AgentPlan
  ): Promise<{ passed: boolean; results: SafetyCheckResult[]; blockers: SafetyCheckResult[] }> {
    logger.info(`Running pre-execution safety checks for task: ${task.id}`);

    const preExecutionChecks = Array.from(this.checks.values()).filter(
      (check) => check.type === 'pre_execution'
    );

    const results: SafetyCheckResult[] = [];
    const context = {
      task,
      plan,
      environment: task.context.environment,
      provider: task.context.provider,
      components: task.context.components,
    };

    for (const check of preExecutionChecks) {
      try {
        const result = await check.check(context);
        results.push(result);

        logger.info(
          `Safety check ${check.id}: ${result.passed ? 'PASSED' : 'FAILED'} (${check.name})`
        );
      } catch (error) {
        logger.error(`Error running safety check ${check.id}`, error);
        results.push({
          passed: false,
          severity: 'high',
          message: `Check failed with error: ${(error as Error).message}`,
          can_proceed: false,
          requires_approval: true,
        });
      }
    }

    // Identify blockers (failed checks that prevent execution)
    const blockers = results.filter((r) => !r.passed && !r.can_proceed);

    const passed = blockers.length === 0;

    logger.info(
      `Pre-execution checks: ${results.length} total, ${results.filter((r) => r.passed).length} passed, ${blockers.length} blockers`
    );

    return { passed, results, blockers };
  }

  /**
   * Run during-execution safety checks
   */
  async runDuringExecutionChecks(
    context: Record<string, unknown>
  ): Promise<{ passed: boolean; results: SafetyCheckResult[] }> {
    logger.info('Running during-execution safety checks');

    const duringExecutionChecks = Array.from(this.checks.values()).filter(
      (check) => check.type === 'during_execution'
    );

    const results: SafetyCheckResult[] = [];

    for (const check of duringExecutionChecks) {
      try {
        const result = await check.check(context);
        results.push(result);
      } catch (error) {
        logger.error(`Error running safety check ${check.id}`, error);
        results.push({
          passed: false,
          severity: 'high',
          message: `Check failed with error: ${(error as Error).message}`,
          can_proceed: false,
          requires_approval: true,
        });
      }
    }

    const passed = results.every((r) => r.passed || r.can_proceed);

    return { passed, results };
  }

  /**
   * Run post-execution safety checks
   */
  async runPostExecutionChecks(
    context: Record<string, unknown>
  ): Promise<{ passed: boolean; results: SafetyCheckResult[] }> {
    logger.info('Running post-execution safety checks');

    const postExecutionChecks = Array.from(this.checks.values()).filter(
      (check) => check.type === 'post_execution'
    );

    const results: SafetyCheckResult[] = [];

    for (const check of postExecutionChecks) {
      try {
        const result = await check.check(context);
        results.push(result);
      } catch (error) {
        logger.error(`Error running safety check ${check.id}`, error);
        results.push({
          passed: false,
          severity: 'high',
          message: `Check failed with error: ${(error as Error).message}`,
          can_proceed: true, // Post-execution failures don't block
          requires_approval: false,
        });
      }
    }

    const passed = results.every((r) => r.passed);

    return { passed, results };
  }

  /**
   * Register custom safety check
   */
  registerCheck(check: SafetyCheck): void {
    this.checks.set(check.id, check);
    logger.info(`Registered safety check: ${check.id}`);
  }

  /**
   * Remove safety check
   */
  removeCheck(checkId: string): void {
    this.checks.delete(checkId);
    logger.info(`Removed safety check: ${checkId}`);
  }

  /**
   * Get all checks
   */
  getAllChecks(): SafetyCheck[] {
    return Array.from(this.checks.values());
  }

  /**
   * Initialize default safety checks
   */
  private initializeDefaultChecks(): void {
    // ===== Pre-Execution Checks =====

    // Check: Production environment safeguards
    this.registerCheck({
      id: 'pre_prod_safeguard',
      type: 'pre_execution',
      category: 'security',
      name: 'Production Environment Safeguards',
      description: 'Verify additional safeguards for production deployments',
      severity: 'critical',
      check: async (context) => {
        const task = context.task as AgentTask;
        const plan = context.plan as AgentPlan;

        if (task.context.environment === 'production') {
          // Production requires approval
          if (!plan.requires_approval || !plan.approved_by) {
            return {
              passed: false,
              severity: 'critical',
              message: 'Production deployment requires explicit approval',
              can_proceed: false,
              requires_approval: true,
            };
          }

          // Check for high-risk operations
          if (plan.risk_level === 'high' || plan.risk_level === 'critical') {
            return {
              passed: true,
              severity: 'high',
              message: 'High-risk production deployment approved',
              details: {
                risk_level: plan.risk_level,
                approved_by: plan.approved_by,
              },
              can_proceed: true,
              requires_approval: false,
            };
          }
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Environment safeguards satisfied',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: Cost limits
    this.registerCheck({
      id: 'pre_cost_limit',
      type: 'pre_execution',
      category: 'cost',
      name: 'Cost Limit Check',
      description: 'Verify estimated cost is within acceptable limits',
      severity: 'high',
      check: async (context) => {
        const plan = context.plan as AgentPlan;
        const estimatedCost = plan.estimated_cost || 0;
        const maxCost = 5000; // $5000 per month limit

        if (estimatedCost > maxCost) {
          return {
            passed: false,
            severity: 'high',
            message: `Estimated cost $${estimatedCost} exceeds limit $${maxCost}`,
            details: {
              estimated: estimatedCost,
              limit: maxCost,
            },
            can_proceed: false,
            requires_approval: true,
          };
        }

        return {
          passed: true,
          severity: 'low',
          message: `Estimated cost $${estimatedCost} within limit`,
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: Security best practices
    this.registerCheck({
      id: 'pre_security_practices',
      type: 'pre_execution',
      category: 'security',
      name: 'Security Best Practices',
      description: 'Verify security best practices are applied',
      severity: 'critical',
      check: async (context) => {
        const plan = context.plan as AgentPlan;

        // Check if security validation steps are included
        const hasSecurityValidation = plan.steps.some(
          (step) => step.action === 'apply_best_practices'
        );

        if (!hasSecurityValidation) {
          return {
            passed: false,
            severity: 'critical',
            message: 'Plan missing security best practices validation',
            can_proceed: false,
            requires_approval: true,
          };
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Security best practices validation included',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: Backup strategy
    this.registerCheck({
      id: 'pre_backup_strategy',
      type: 'pre_execution',
      category: 'availability',
      name: 'Backup Strategy',
      description: 'Verify backup strategy is defined for stateful components',
      severity: 'high',
      check: async (context) => {
        const task = context.task as AgentTask;
        const hasStatefulComponents = task.context.components.some((c) =>
          ['rds', 's3', 'efs'].includes(c)
        );

        if (hasStatefulComponents) {
          // Check if backup is configured
          const hasBackup = task.context.requirements?.backup_enabled === true;

          if (!hasBackup && task.context.environment === 'production') {
            return {
              passed: false,
              severity: 'high',
              message: 'Production stateful components require backup strategy',
              can_proceed: false,
              requires_approval: true,
            };
          }

          if (!hasBackup) {
            return {
              passed: true,
              severity: 'medium',
              message: 'Backup recommended for stateful components',
              can_proceed: true,
              requires_approval: false,
            };
          }
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Backup strategy validated',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: Destructive operations
    this.registerCheck({
      id: 'pre_destructive_ops',
      type: 'pre_execution',
      category: 'availability',
      name: 'Destructive Operations',
      description: 'Verify destructive operations are intentional',
      severity: 'critical',
      check: async (context) => {
        const plan = context.plan as AgentPlan;

        // Check for deployment steps that could be destructive
        const hasDeployment = plan.steps.some((step) => step.action === 'apply_deployment');

        if (hasDeployment) {
          // Ensure plan has rollback capability
          const hasRollback = plan.steps.some((step) => step.rollback_action);

          if (!hasRollback) {
            return {
              passed: false,
              severity: 'high',
              message: 'Deployment steps should have rollback capability',
              can_proceed: true, // Can proceed but warned
              requires_approval: true,
            };
          }
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Destructive operations validated',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // ===== During-Execution Checks =====

    // Check: Resource creation rate
    this.registerCheck({
      id: 'during_resource_rate',
      type: 'during_execution',
      category: 'cost',
      name: 'Resource Creation Rate',
      description: 'Monitor resource creation rate for anomalies',
      severity: 'medium',
      check: async (context) => {
        // In production, this would monitor actual resource creation
        // For now, simulate check
        const resourcesCreated = (context.resources_created as number) || 0;
        const maxRate = 50; // Max 50 resources per execution

        if (resourcesCreated > maxRate) {
          return {
            passed: false,
            severity: 'high',
            message: `Unusual resource creation rate: ${resourcesCreated} resources`,
            details: { count: resourcesCreated, threshold: maxRate },
            can_proceed: false,
            requires_approval: true,
          };
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Resource creation rate normal',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: Execution timeout
    this.registerCheck({
      id: 'during_execution_timeout',
      type: 'during_execution',
      category: 'availability',
      name: 'Execution Timeout',
      description: 'Ensure execution does not exceed time limits',
      severity: 'medium',
      check: async (context) => {
        const startTime = context.start_time as Date;
        const maxDuration = 3600000; // 1 hour

        if (startTime) {
          const elapsed = Date.now() - startTime.getTime();

          if (elapsed > maxDuration) {
            return {
              passed: false,
              severity: 'high',
              message: 'Execution exceeding time limit',
              details: { elapsed, limit: maxDuration },
              can_proceed: false,
              requires_approval: false,
            };
          }
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Execution within time limits',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // ===== Post-Execution Checks =====

    // Check: Deployment verification
    this.registerCheck({
      id: 'post_deployment_verify',
      type: 'post_execution',
      category: 'availability',
      name: 'Deployment Verification',
      description: 'Verify deployed resources are healthy',
      severity: 'high',
      check: async (context) => {
        const deploymentSuccess = context.deployment_success as boolean;

        if (deploymentSuccess === false) {
          return {
            passed: false,
            severity: 'critical',
            message: 'Deployment verification failed',
            can_proceed: true, // Already deployed
            requires_approval: false,
          };
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Deployment verified successfully',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: Cost anomaly detection
    this.registerCheck({
      id: 'post_cost_anomaly',
      type: 'post_execution',
      category: 'cost',
      name: 'Cost Anomaly Detection',
      description: 'Check for unexpected cost increases',
      severity: 'medium',
      check: async (context) => {
        const estimatedCost = (context.estimated_cost as number) || 0;
        const actualCost = (context.actual_cost as number) || estimatedCost;

        // Allow 20% variance
        const variance = Math.abs(actualCost - estimatedCost) / estimatedCost;

        if (variance > 0.2) {
          return {
            passed: false,
            severity: 'high',
            message: `Actual cost differs significantly from estimate`,
            details: {
              estimated: estimatedCost,
              actual: actualCost,
              variance: `${(variance * 100).toFixed(1)}%`,
            },
            can_proceed: true,
            requires_approval: false,
          };
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Cost within expected range',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: Security posture
    this.registerCheck({
      id: 'post_security_posture',
      type: 'post_execution',
      category: 'security',
      name: 'Security Posture Assessment',
      description: 'Assess final security configuration',
      severity: 'critical',
      check: async (context) => {
        const securityScore = (context.security_score as number) || 0;
        const minScore = 80;

        if (securityScore < minScore) {
          return {
            passed: false,
            severity: 'critical',
            message: `Security score ${securityScore} below threshold ${minScore}`,
            details: { score: securityScore, threshold: minScore },
            can_proceed: true,
            requires_approval: false,
          };
        }

        return {
          passed: true,
          severity: 'low',
          message: `Security score ${securityScore} meets requirements`,
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: No production delete without backup
    this.registerCheck({
      id: 'no_production_delete_without_backup',
      type: 'pre_execution',
      category: 'availability',
      name: 'No Production Delete Without Backup',
      description: 'Blocks destroy/delete operations in production when backup is not enabled',
      severity: 'critical',
      check: async (context) => {
        const task = context.task as AgentTask;
        const plan = context.plan as AgentPlan;

        if (task.context.environment !== 'production') {
          return {
            passed: true,
            severity: 'low',
            message: 'Non-production environment, policy not applicable',
            can_proceed: true,
            requires_approval: false,
          };
        }

        const hasDestructiveAction = plan.steps.some(
          (step) => step.action === 'apply_deployment' && step.parameters?.destroy ||
            step.action === 'apply_deployment' && step.description?.toLowerCase().includes('delete') ||
            step.description?.toLowerCase().includes('destroy')
        );

        if (!hasDestructiveAction) {
          return {
            passed: true,
            severity: 'low',
            message: 'No destructive actions found in plan',
            can_proceed: true,
            requires_approval: false,
          };
        }

        const backupEnabled = task.context.requirements?.backup_enabled === true;

        if (!backupEnabled) {
          return {
            passed: false,
            severity: 'critical',
            message: 'Production destroy/delete operations require backup_enabled in requirements. Create a backup first or use a staging environment.',
            can_proceed: false,
            requires_approval: true,
          };
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Backup enabled for production destructive operation',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: Require dry-run before apply
    this.registerCheck({
      id: 'require_dry_run_first',
      type: 'pre_execution',
      category: 'compliance',
      name: 'Require Dry Run First',
      description: 'Blocks apply_deployment if no plan_deployment step precedes it',
      severity: 'high',
      check: async (context) => {
        const plan = context.plan as AgentPlan;

        const hasApply = plan.steps.some((step) => step.action === 'apply_deployment');

        if (!hasApply) {
          return {
            passed: true,
            severity: 'low',
            message: 'No apply_deployment steps in plan',
            can_proceed: true,
            requires_approval: false,
          };
        }

        const hasPlan = plan.steps.some((step) => step.action === 'plan_deployment');

        if (!hasPlan) {
          return {
            passed: false,
            severity: 'high',
            message: 'Plan contains apply_deployment without a preceding plan_deployment step. Run with --dry-run first to preview changes.',
            can_proceed: false,
            requires_approval: true,
          };
        }

        return {
          passed: true,
          severity: 'low',
          message: 'Dry-run (plan_deployment) step precedes apply',
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    // Check: Token budget guardrail
    this.registerCheck({
      id: 'pre_token_budget',
      type: 'pre_execution',
      category: 'cost',
      name: 'Token Budget Check',
      description: 'Verify estimated token usage does not exceed budget',
      severity: 'high',
      check: async (context) => {
        const plan = context.plan as AgentPlan & { estimated_tokens?: number };
        const maxTokensPerTask = parseInt(process.env.MAX_TOKENS_PER_TASK || '0', 10);

        if (!maxTokensPerTask || maxTokensPerTask <= 0) {
          return {
            passed: true,
            severity: 'low',
            message: 'No token budget configured',
            can_proceed: true,
            requires_approval: false,
          };
        }

        const estimatedTokens = plan.estimated_tokens ?? plan.estimated_cost ?? 0;

        if (estimatedTokens > maxTokensPerTask) {
          return {
            passed: false,
            severity: 'high',
            message: `Estimated token usage (${estimatedTokens}) exceeds budget (${maxTokensPerTask})`,
            details: {
              estimated: estimatedTokens,
              budget: maxTokensPerTask,
            },
            can_proceed: false,
            requires_approval: true,
          };
        }

        return {
          passed: true,
          severity: 'low',
          message: `Estimated tokens (${estimatedTokens}) within budget (${maxTokensPerTask})`,
          can_proceed: true,
          requires_approval: false,
        };
      },
    });

    logger.info(`Initialized ${this.checks.size} default safety checks`);
  }
}
