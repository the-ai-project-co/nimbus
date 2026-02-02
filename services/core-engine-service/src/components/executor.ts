import { logger } from '@nimbus/shared-utils';
import type {
  AgentPlan,
  PlanStep,
  ExecutionResult,
  ExecutionLog,
  ExecutionArtifact,
} from '../types/agent';

export class Executor {
  private logs: Map<string, ExecutionLog[]>;
  private artifacts: Map<string, ExecutionArtifact[]>;

  constructor() {
    this.logs = new Map();
    this.artifacts = new Map();
  }

  /**
   * Execute a plan
   */
  async executePlan(plan: AgentPlan): Promise<ExecutionResult[]> {
    logger.info(`Starting execution of plan: ${plan.id}`);

    const results: ExecutionResult[] = [];
    const executedSteps = new Set<string>();

    // Execute steps respecting dependencies
    while (executedSteps.size < plan.steps.length) {
      const readySteps = this.getReadySteps(plan.steps, executedSteps);

      if (readySteps.length === 0) {
        logger.error('No steps ready for execution, possible circular dependency');
        break;
      }

      // Execute ready steps in parallel
      const stepResults = await Promise.allSettled(
        readySteps.map((step) => this.executeStep(plan.id, step))
      );

      // Process results
      for (let i = 0; i < stepResults.length; i++) {
        const stepResult = stepResults[i];
        const step = readySteps[i];

        if (stepResult.status === 'fulfilled') {
          results.push(stepResult.value);
          executedSteps.add(step.id);

          if (stepResult.value.status === 'failure') {
            logger.error(`Step ${step.id} failed, stopping execution`);
            return results;
          }
        } else {
          logger.error(`Step ${step.id} execution error`, stepResult.reason);
          results.push({
            id: this.generateResultId(),
            plan_id: plan.id,
            step_id: step.id,
            status: 'failure',
            started_at: new Date(),
            completed_at: new Date(),
            duration: 0,
            error: {
              code: 'EXECUTION_ERROR',
              message: stepResult.reason.message,
              stack_trace: stepResult.reason.stack,
            },
          });
          return results;
        }
      }
    }

    logger.info(`Plan execution completed: ${results.length} steps executed`);
    return results;
  }

  /**
   * Execute a single step
   */
  private async executeStep(planId: string, step: PlanStep): Promise<ExecutionResult> {
    const executionId = this.generateResultId();
    const startedAt = new Date();

    this.log(executionId, 'info', `Executing step: ${step.description}`);
    logger.info(`Executing step ${step.id}: ${step.description}`);

    try {
      // Update step status
      step.status = 'running';
      step.started_at = startedAt;

      // Execute based on step type
      let outputs: Record<string, unknown> = {};
      let artifacts: ExecutionArtifact[] = [];

      switch (step.action) {
        case 'validate_requirements':
          outputs = await this.validateRequirements(step, executionId);
          break;

        case 'generate_component':
          const generateResult = await this.generateComponent(step, executionId);
          outputs = generateResult.outputs;
          artifacts = generateResult.artifacts;
          break;

        case 'validate_generated_code':
          outputs = await this.validateGeneratedCode(step, executionId);
          break;

        case 'apply_best_practices':
          outputs = await this.applyBestPractices(step, executionId);
          break;

        case 'plan_deployment':
          outputs = await this.planDeployment(step, executionId);
          break;

        case 'apply_deployment':
          outputs = await this.applyDeployment(step, executionId);
          break;

        case 'verify_deployment':
          outputs = await this.verifyDeployment(step, executionId);
          break;

        case 'generate_documentation':
          const docResult = await this.generateDocumentation(step, executionId);
          outputs = docResult.outputs;
          artifacts = docResult.artifacts;
          break;

        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

      // Mark step as completed
      const completedAt = new Date();
      step.status = 'completed';
      step.completed_at = completedAt;
      step.duration = completedAt.getTime() - startedAt.getTime();

      this.log(executionId, 'info', `Step completed successfully in ${step.duration}ms`);

      // Store artifacts
      if (artifacts.length > 0) {
        this.artifacts.set(executionId, artifacts);
      }

      return {
        id: executionId,
        plan_id: planId,
        step_id: step.id,
        status: 'success',
        started_at: startedAt,
        completed_at: completedAt,
        duration: step.duration,
        outputs,
        artifacts,
        logs: this.logs.get(executionId),
      };
    } catch (error) {
      const completedAt = new Date();
      step.status = 'failed';
      step.completed_at = completedAt;
      step.duration = completedAt.getTime() - startedAt.getTime();

      this.log(executionId, 'error', `Step failed: ${(error as Error).message}`);
      logger.error(`Step ${step.id} failed`, error);

      return {
        id: executionId,
        plan_id: planId,
        step_id: step.id,
        status: 'failure',
        started_at: startedAt,
        completed_at: completedAt,
        duration: step.duration!,
        error: {
          code: 'STEP_EXECUTION_ERROR',
          message: (error as Error).message,
          stack_trace: (error as Error).stack,
        },
        logs: this.logs.get(executionId),
      };
    }
  }

  /**
   * Get steps that are ready for execution
   */
  private getReadySteps(steps: PlanStep[], executedSteps: Set<string>): PlanStep[] {
    return steps.filter((step) => {
      // Skip already executed steps
      if (executedSteps.has(step.id)) return false;

      // Skip failed/completed steps
      if (step.status === 'completed' || step.status === 'failed') return false;

      // Check if all dependencies are satisfied
      if (step.depends_on && step.depends_on.length > 0) {
        return step.depends_on.every((depId) => executedSteps.has(depId));
      }

      return true;
    });
  }

  /**
   * Validate requirements
   */
  private async validateRequirements(
    step: PlanStep,
    executionId: string
  ): Promise<Record<string, unknown>> {
    this.log(executionId, 'info', 'Validating infrastructure requirements');

    const { provider, components, requirements } = step.parameters;

    // Validate provider
    if (!['aws', 'gcp', 'azure'].includes(provider as string)) {
      throw new Error(`Invalid provider: ${provider}`);
    }

    // Validate components
    if (!Array.isArray(components) || components.length === 0) {
      throw new Error('No components specified');
    }

    const validComponents = ['vpc', 'eks', 'rds', 's3', 'gke', 'gcs', 'aks'];
    for (const component of components) {
      if (!validComponents.includes(component)) {
        throw new Error(`Invalid component: ${component}`);
      }
    }

    this.log(executionId, 'info', `Validated ${components.length} components for ${provider}`);

    return {
      validated: true,
      provider,
      components,
    };
  }

  /**
   * Generate component
   */
  private async generateComponent(
    step: PlanStep,
    executionId: string
  ): Promise<{ outputs: Record<string, unknown>; artifacts: ExecutionArtifact[] }> {
    this.log(executionId, 'info', `Generating ${step.parameters.component} component`);

    const { component, provider } = step.parameters;

    // Simulate calling Generator Service
    // In production, this would make HTTP request to generator-service
    const generatedCode = this.mockGenerateCode(component as string, provider as string);

    // Create artifact
    const artifact: ExecutionArtifact = {
      id: `artifact_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type: 'terraform',
      name: `${component}.tf`,
      path: `/tmp/nimbus/${executionId}/${component}.tf`,
      size: generatedCode.length,
      checksum: this.calculateChecksum(generatedCode),
      created_at: new Date(),
    };

    this.log(executionId, 'info', `Generated artifact: ${artifact.name} (${artifact.size} bytes)`);

    return {
      outputs: {
        component,
        code_size: generatedCode.length,
        artifact_id: artifact.id,
      },
      artifacts: [artifact],
    };
  }

  /**
   * Validate generated code
   */
  private async validateGeneratedCode(
    step: PlanStep,
    executionId: string
  ): Promise<Record<string, unknown>> {
    this.log(executionId, 'info', 'Validating generated infrastructure code');

    const { components } = step.parameters;

    // Simulate validation
    const validationResults = {
      syntax_valid: true,
      terraform_version: '1.6.0',
      provider_versions: {
        aws: '~> 5.0',
      },
      resources_count: (components as string[]).length * 5,
    };

    this.log(
      executionId,
      'info',
      `Code validation passed: ${validationResults.resources_count} resources`
    );

    return validationResults;
  }

  /**
   * Apply best practices
   */
  private async applyBestPractices(
    step: PlanStep,
    executionId: string
  ): Promise<Record<string, unknown>> {
    this.log(executionId, 'info', 'Applying security and best practices');

    const { components, autofix } = step.parameters;

    // Simulate best practices analysis
    const violations = Math.floor(Math.random() * 5);
    const fixed = autofix ? violations : 0;

    this.log(
      executionId,
      'info',
      `Best practices: ${violations} violations found, ${fixed} auto-fixed`
    );

    return {
      violations_found: violations,
      violations_fixed: fixed,
      compliance_score: 95 + Math.floor(Math.random() * 5),
    };
  }

  /**
   * Plan deployment
   */
  private async planDeployment(
    step: PlanStep,
    executionId: string
  ): Promise<Record<string, unknown>> {
    this.log(executionId, 'info', 'Planning infrastructure deployment');

    // Simulate terraform plan
    const changes = {
      to_add: 15,
      to_change: 0,
      to_destroy: 0,
    };

    this.log(
      executionId,
      'info',
      `Plan: ${changes.to_add} to add, ${changes.to_change} to change, ${changes.to_destroy} to destroy`
    );

    return {
      plan_output: 'terraform plan output...',
      changes,
    };
  }

  /**
   * Apply deployment
   */
  private async applyDeployment(
    step: PlanStep,
    executionId: string
  ): Promise<Record<string, unknown>> {
    this.log(executionId, 'info', 'Applying infrastructure deployment');

    // Simulate terraform apply
    await this.sleep(2000); // Simulate deployment time

    this.log(executionId, 'info', 'Deployment completed successfully');

    return {
      applied: true,
      resources_created: 15,
      deployment_time: 2000,
    };
  }

  /**
   * Verify deployment
   */
  private async verifyDeployment(
    step: PlanStep,
    executionId: string
  ): Promise<Record<string, unknown>> {
    this.log(executionId, 'info', 'Verifying deployed infrastructure');

    const { components } = step.parameters;

    // Simulate verification
    const checks = (components as string[]).map((component) => ({
      component,
      status: 'passed',
      checks_passed: 10,
      checks_failed: 0,
    }));

    this.log(executionId, 'info', `Verification passed for ${checks.length} components`);

    return {
      verification_passed: true,
      checks,
    };
  }

  /**
   * Generate documentation
   */
  private async generateDocumentation(
    step: PlanStep,
    executionId: string
  ): Promise<{ outputs: Record<string, unknown>; artifacts: ExecutionArtifact[] }> {
    this.log(executionId, 'info', 'Generating infrastructure documentation');

    const { components, include_diagrams } = step.parameters;

    // Generate README
    const readmeContent = this.generateReadme(components as string[]);
    const readmeArtifact: ExecutionArtifact = {
      id: `artifact_${Date.now()}_readme`,
      type: 'documentation',
      name: 'README.md',
      path: `/tmp/nimbus/${executionId}/README.md`,
      size: readmeContent.length,
      checksum: this.calculateChecksum(readmeContent),
      created_at: new Date(),
    };

    const artifacts = [readmeArtifact];

    // Generate diagram if requested
    if (include_diagrams) {
      const diagramArtifact: ExecutionArtifact = {
        id: `artifact_${Date.now()}_diagram`,
        type: 'documentation',
        name: 'architecture.png',
        path: `/tmp/nimbus/${executionId}/architecture.png`,
        size: 50000, // Mock size
        checksum: 'mock_checksum',
        created_at: new Date(),
      };
      artifacts.push(diagramArtifact);
    }

    this.log(executionId, 'info', `Generated ${artifacts.length} documentation artifacts`);

    return {
      outputs: {
        artifacts_generated: artifacts.length,
      },
      artifacts,
    };
  }

  /**
   * Rollback a step
   */
  async rollbackStep(step: PlanStep): Promise<ExecutionResult> {
    logger.info(`Rolling back step: ${step.id}`);

    if (!step.rollback_action) {
      throw new Error(`Step ${step.id} does not have a rollback action defined`);
    }

    const executionId = this.generateResultId();
    const startedAt = new Date();

    try {
      // Execute rollback action
      this.log(executionId, 'info', `Executing rollback: ${step.rollback_action}`);

      // Simulate rollback
      await this.sleep(1000);

      const completedAt = new Date();

      this.log(executionId, 'info', 'Rollback completed successfully');

      return {
        id: executionId,
        plan_id: 'rollback',
        step_id: step.id,
        status: 'success',
        started_at: startedAt,
        completed_at: completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        outputs: {
          rolled_back: true,
        },
        logs: this.logs.get(executionId),
      };
    } catch (error) {
      const completedAt = new Date();
      this.log(executionId, 'error', `Rollback failed: ${(error as Error).message}`);

      return {
        id: executionId,
        plan_id: 'rollback',
        step_id: step.id,
        status: 'failure',
        started_at: startedAt,
        completed_at: completedAt,
        duration: completedAt.getTime() - startedAt.getTime(),
        error: {
          code: 'ROLLBACK_ERROR',
          message: (error as Error).message,
        },
        logs: this.logs.get(executionId),
      };
    }
  }

  /**
   * Get execution logs
   */
  getLogs(executionId: string): ExecutionLog[] {
    return this.logs.get(executionId) || [];
  }

  /**
   * Get execution artifacts
   */
  getArtifacts(executionId: string): ExecutionArtifact[] {
    return this.artifacts.get(executionId) || [];
  }

  /**
   * Log a message
   */
  private log(
    executionId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>
  ): void {
    if (!this.logs.has(executionId)) {
      this.logs.set(executionId, []);
    }

    this.logs.get(executionId)!.push({
      timestamp: new Date(),
      level,
      message,
      context,
    });
  }

  /**
   * Helper: Mock code generation
   */
  private mockGenerateCode(component: string, provider: string): string {
    return `# ${component.toUpperCase()} Configuration for ${provider.toUpperCase()}\n\n` +
      `resource "${provider}_${component}" "main" {\n` +
      `  name = "my-${component}"\n` +
      `  # Additional configuration...\n` +
      `}\n`;
  }

  /**
   * Helper: Generate README
   */
  private generateReadme(components: string[]): string {
    return `# Infrastructure Documentation\n\n` +
      `## Components\n\n` +
      components.map((c) => `- ${c.toUpperCase()}`).join('\n') +
      `\n\n## Deployment\n\nRun \`terraform apply\` to deploy.\n`;
  }

  /**
   * Helper: Calculate checksum
   */
  private calculateChecksum(content: string): string {
    // Simple hash function (in production, use proper crypto)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Helper: Sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate result ID
   */
  private generateResultId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
