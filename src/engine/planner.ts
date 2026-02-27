import { logger } from '../utils';
import { LLMRouter } from '../llm/router';

// ==========================================
// Inline Types (from core-engine-service/src/types/agent.ts)
// ==========================================

export interface AgentTask {
  id: string;
  type: 'generate' | 'deploy' | 'verify' | 'rollback' | 'analyze';
  status: 'pending' | 'planning' | 'executing' | 'verifying' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  user_id: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
  context: {
    provider: 'aws' | 'gcp' | 'azure';
    environment: string;
    region?: string;
    components: string[];
    requirements?: Record<string, unknown>;
  };
  execution: {
    plan_id?: string;
    execution_id?: string;
    verification_id?: string;
  };
  result?: {
    success: boolean;
    outputs?: Record<string, unknown>;
    artifacts?: string[];
    errors?: string[];
  };
  metadata?: Record<string, unknown>;
}

export interface AgentPlan {
  id: string;
  task_id: string;
  status: 'draft' | 'approved' | 'rejected' | 'executing' | 'completed';
  created_at: Date;
  updated_at: Date;
  steps: PlanStep[];
  dependencies: PlanDependency[];
  estimated_duration?: number;
  estimated_cost?: number;
  risks: Risk[];
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  requires_approval: boolean;
  approved_by?: string;
  approved_at?: Date;
}

export interface PlanStep {
  id: string;
  order: number;
  type: 'generate' | 'validate' | 'deploy' | 'configure' | 'verify';
  description: string;
  component?: string;
  action: string;
  parameters: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at?: Date;
  completed_at?: Date;
  duration?: number;
  depends_on?: string[];
  rollback_action?: string;
  rollback_parameters?: Record<string, unknown>;
}

export interface PlanDependency {
  step_id: string;
  depends_on: string[];
  type: 'sequential' | 'parallel';
}

export interface Risk {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'security' | 'cost' | 'availability' | 'performance' | 'compliance';
  description: string;
  mitigation?: string;
  probability: number;
  impact: number;
}

// ==========================================
// Constants
// ==========================================

/** System prompt instructing the LLM to generate execution steps as JSON. */
const PLANNING_PROMPT =
  'You are an infrastructure planning agent. Given the task context, generate an ordered array of execution steps as JSON. ' +
  'Each step has fields: id (string like step_1), name (string), description (string), type (one of: generate, validate, deploy, configure, verify), ' +
  'order (number), estimatedDuration (number in seconds). Return ONLY the JSON array, no markdown.';

/** System prompt instructing the LLM to assess risks as JSON. */
const RISK_ASSESSMENT_PROMPT =
  'You are an infrastructure risk assessor. Given the task and execution steps, identify risks. ' +
  'Return a JSON array of risks with fields: id (string), severity (low|medium|high|critical), ' +
  'category (security|cost|availability|performance|compliance), description (string), mitigation (string), ' +
  'probability (0-1), impact (0-1). Return ONLY the JSON array.';

/** Valid step types for plan steps. */
const VALID_STEP_TYPES = new Set(['generate', 'validate', 'deploy', 'configure', 'verify']);

/** Valid severity levels for risks. */
const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

/** Valid risk categories. */
const VALID_CATEGORIES = new Set(['security', 'cost', 'availability', 'performance', 'compliance']);

// ==========================================
// Planner
// ==========================================

export class Planner {
  private router: LLMRouter;

  constructor() {
    this.router = new LLMRouter();
  }

  /**
   * Generate an execution plan for a task
   */
  async generatePlan(task: AgentTask): Promise<AgentPlan> {
    logger.info(`Generating plan for task: ${task.id}`);

    const steps = await this.generateSteps(task);
    const dependencies = this.analyzeDependencies(steps);
    const risks = await this.assessRisks(task, steps);
    const riskLevel = this.calculateOverallRiskLevel(risks);

    const plan: AgentPlan = {
      id: this.generatePlanId(),
      task_id: task.id,
      status: 'draft',
      created_at: new Date(),
      updated_at: new Date(),
      steps,
      dependencies,
      risks,
      risk_level: riskLevel,
      requires_approval: riskLevel === 'high' || riskLevel === 'critical',
    };

    // Estimate duration and cost
    plan.estimated_duration = this.estimateDuration(steps);
    plan.estimated_cost = await this.estimateCost(task, steps);

    logger.info(`Generated plan ${plan.id} with ${steps.length} steps, risk level: ${riskLevel}`);

    return plan;
  }

  /**
   * Generate execution steps for a task.
   * Attempts LLM-based generation first, falls back to heuristic logic.
   */
  private async generateSteps(task: AgentTask): Promise<PlanStep[]> {
    try {
      const llmSteps = await this.generateStepsWithLLM(task);
      if (llmSteps.length > 0) {
        logger.info(`Using LLM-generated steps (${llmSteps.length} steps)`);
        return llmSteps;
      }
    } catch (error) {
      logger.debug(
        `LLM step generation failed, falling back to heuristics: ${(error as Error).message}`
      );
    }

    return this.generateStepsHeuristic(task);
  }

  /**
   * Generate steps using the embedded LLM router.
   */
  private async generateStepsWithLLM(task: AgentTask): Promise<PlanStep[]> {
    const response = await this.router.route({
      messages: [
        { role: 'system', content: PLANNING_PROMPT },
        { role: 'user', content: JSON.stringify(task.context) },
      ],
    });

    const content = response?.content;
    if (!content) {
      throw new Error('LLM response missing content');
    }

    const parsed: unknown = JSON.parse(content);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('LLM response is not a non-empty array');
    }

    const steps: PlanStep[] = [];
    for (const item of parsed) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof item.id !== 'string' ||
        typeof item.description !== 'string' ||
        !VALID_STEP_TYPES.has(item.type)
      ) {
        throw new Error('LLM response contains invalid step structure');
      }

      steps.push({
        id: item.id,
        order: typeof item.order === 'number' ? item.order : steps.length + 1,
        type: item.type as PlanStep['type'],
        description: item.description,
        action: item.type as string,
        parameters: {},
        status: 'pending',
      });
    }

    return steps;
  }

  /**
   * Generate execution steps using heuristic logic (fallback).
   */
  private generateStepsHeuristic(task: AgentTask): PlanStep[] {
    const steps: PlanStep[] = [];
    let order = 1;

    // Step 1: Validate requirements
    steps.push({
      id: `step_${order++}`,
      order: steps.length + 1,
      type: 'validate',
      description: 'Validate infrastructure requirements and constraints',
      action: 'validate_requirements',
      parameters: {
        provider: task.context.provider,
        components: task.context.components,
        requirements: task.context.requirements,
      },
      status: 'pending',
    });

    // Step 2-N: Generate infrastructure components
    for (const component of task.context.components) {
      steps.push({
        id: `step_${order++}`,
        order: steps.length + 1,
        type: 'generate',
        description: `Generate ${component.toUpperCase()} configuration`,
        component,
        action: 'generate_component',
        parameters: {
          component,
          provider: task.context.provider,
          environment: task.context.environment,
          requirements: task.context.requirements,
        },
        status: 'pending',
        depends_on: ['step_1'], // Depends on validation
      });
    }

    // Step: Validate generated code
    steps.push({
      id: `step_${order++}`,
      order: steps.length + 1,
      type: 'validate',
      description: 'Validate generated infrastructure code',
      action: 'validate_generated_code',
      parameters: {
        components: task.context.components,
      },
      status: 'pending',
      depends_on: steps.slice(1, -1).map(s => s.id), // Depends on all generation steps
    });

    // Step: Apply best practices
    steps.push({
      id: `step_${order++}`,
      order: steps.length + 1,
      type: 'validate',
      description: 'Apply security and best practices',
      action: 'apply_best_practices',
      parameters: {
        components: task.context.components,
        autofix: true,
      },
      status: 'pending',
      depends_on: [steps[steps.length - 1].id],
    });

    // If deployment is requested
    if (task.type === 'deploy') {
      // Step: Plan deployment
      steps.push({
        id: `step_${order++}`,
        order: steps.length + 1,
        type: 'deploy',
        description: 'Plan infrastructure deployment (terraform plan)',
        action: 'plan_deployment',
        parameters: {
          provider: task.context.provider,
          environment: task.context.environment,
        },
        status: 'pending',
        depends_on: [steps[steps.length - 1].id],
      });

      // Step: Apply deployment
      steps.push({
        id: `step_${order++}`,
        order: steps.length + 1,
        type: 'deploy',
        description: 'Apply infrastructure deployment (terraform apply)',
        action: 'apply_deployment',
        parameters: {
          provider: task.context.provider,
          environment: task.context.environment,
          auto_approve: false,
        },
        status: 'pending',
        depends_on: [steps[steps.length - 1].id],
        rollback_action: 'destroy_deployment',
        rollback_parameters: {
          provider: task.context.provider,
          environment: task.context.environment,
        },
      });

      // Step: Verify deployment
      steps.push({
        id: `step_${order++}`,
        order: steps.length + 1,
        type: 'verify',
        description: 'Verify deployed infrastructure',
        action: 'verify_deployment',
        parameters: {
          components: task.context.components,
          environment: task.context.environment,
        },
        status: 'pending',
        depends_on: [steps[steps.length - 1].id],
      });
    }

    // Final step: Generate documentation
    steps.push({
      id: `step_${order++}`,
      order: steps.length + 1,
      type: 'generate',
      description: 'Generate infrastructure documentation',
      action: 'generate_documentation',
      parameters: {
        components: task.context.components,
        include_diagrams: true,
      },
      status: 'pending',
      depends_on: [steps[steps.length - 1].id],
    });

    return steps;
  }

  /**
   * Analyze dependencies between steps
   */
  private analyzeDependencies(steps: PlanStep[]): PlanDependency[] {
    return steps
      .filter(step => step.depends_on && step.depends_on.length > 0)
      .map(step => ({
        step_id: step.id,
        depends_on: step.depends_on!,
        type: (step.depends_on!.length === 1 ? 'sequential' : 'parallel') as
          | 'sequential'
          | 'parallel',
      }));
  }

  /**
   * Assess risks for the plan.
   * Attempts LLM-based assessment first, falls back to heuristic logic.
   */
  private async assessRisks(task: AgentTask, steps: PlanStep[]): Promise<Risk[]> {
    try {
      const llmRisks = await this.assessRisksWithLLM(task, steps);
      if (llmRisks.length > 0) {
        logger.info(`Using LLM-assessed risks (${llmRisks.length} risks)`);
        return llmRisks;
      }
    } catch (error) {
      logger.debug(
        `LLM risk assessment failed, falling back to heuristics: ${(error as Error).message}`
      );
    }

    return this.assessRisksHeuristic(task, steps);
  }

  /**
   * Assess risks using the embedded LLM router.
   */
  private async assessRisksWithLLM(task: AgentTask, steps: PlanStep[]): Promise<Risk[]> {
    const response = await this.router.route({
      messages: [
        { role: 'system', content: RISK_ASSESSMENT_PROMPT },
        {
          role: 'user',
          content: JSON.stringify({
            task: task.context,
            steps: steps.map(s => ({ id: s.id, type: s.type, description: s.description })),
          }),
        },
      ],
    });

    const content = response?.content;
    if (!content) {
      throw new Error('LLM response missing content');
    }

    const parsed: unknown = JSON.parse(content);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('LLM response is not a non-empty array');
    }

    const risks: Risk[] = [];
    for (const item of parsed) {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof item.id !== 'string' ||
        typeof item.description !== 'string' ||
        !VALID_SEVERITIES.has(item.severity) ||
        !VALID_CATEGORIES.has(item.category) ||
        typeof item.probability !== 'number' ||
        typeof item.impact !== 'number'
      ) {
        throw new Error('LLM response contains invalid risk structure');
      }

      risks.push({
        id: item.id,
        severity: item.severity as Risk['severity'],
        category: item.category as Risk['category'],
        description: item.description,
        mitigation: typeof item.mitigation === 'string' ? item.mitigation : undefined,
        probability: item.probability,
        impact: item.impact,
      });
    }

    return risks;
  }

  /**
   * Assess risks using heuristic logic (fallback).
   */
  private assessRisksHeuristic(task: AgentTask, steps: PlanStep[]): Risk[] {
    const risks: Risk[] = [];

    // Security risks
    if (task.context.environment === 'production') {
      risks.push({
        id: 'risk_prod_deploy',
        severity: 'high',
        category: 'availability',
        description: 'Deploying to production environment',
        mitigation: 'Requires approval, automated testing, and gradual rollout',
        probability: 0.3,
        impact: 0.8,
      });
    }

    // Cost risks
    const hasExpensiveComponents = task.context.components.some(c => ['eks', 'rds'].includes(c));
    if (hasExpensiveComponents) {
      risks.push({
        id: 'risk_high_cost',
        severity: 'medium',
        category: 'cost',
        description: 'Infrastructure includes high-cost components',
        mitigation: 'Review instance types and enable autoscaling',
        probability: 0.6,
        impact: 0.5,
      });
    }

    // Compliance risks
    if (task.context.components.includes('s3')) {
      risks.push({
        id: 'risk_data_security',
        severity: 'high',
        category: 'security',
        description: 'Storage component requires encryption and access controls',
        mitigation: 'Enable encryption at rest and in transit, implement least privilege access',
        probability: 0.4,
        impact: 0.9,
      });
    }

    // Deployment risks
    const hasDeploymentSteps = steps.some(s => s.type === 'deploy');
    if (hasDeploymentSteps && !task.context.requirements?.backup_enabled) {
      risks.push({
        id: 'risk_no_backup',
        severity: 'high',
        category: 'availability',
        description: 'No backup strategy defined',
        mitigation: 'Enable automated backups and test restoration procedures',
        probability: 0.5,
        impact: 0.7,
      });
    }

    return risks;
  }

  /**
   * Calculate overall risk level
   */
  private calculateOverallRiskLevel(risks: Risk[]): 'low' | 'medium' | 'high' | 'critical' {
    if (risks.length === 0) {
      return 'low';
    }

    const hasCritical = risks.some(r => r.severity === 'critical');
    if (hasCritical) {
      return 'critical';
    }

    const highRisks = risks.filter(r => r.severity === 'high');
    if (highRisks.length >= 2) {
      return 'high';
    }
    if (highRisks.length === 1) {
      return 'high';
    }

    const mediumRisks = risks.filter(r => r.severity === 'medium');
    if (mediumRisks.length >= 3) {
      return 'high';
    }
    if (mediumRisks.length >= 1) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Estimate duration in seconds
   */
  private estimateDuration(steps: PlanStep[]): number {
    const durations: Record<string, number> = {
      validate: 30,
      generate: 60,
      deploy: 600, // 10 minutes for deployment
      verify: 120,
    };

    return steps.reduce((total, step) => {
      return total + (durations[step.type] || 60);
    }, 0);
  }

  /**
   * Estimate cost in USD
   */
  private async estimateCost(task: AgentTask, _steps: PlanStep[]): Promise<number> {
    let monthlyCost = 0;

    const componentCosts: Record<string, number> = {
      vpc: 0, // VPC itself is free, NAT gateway costs ~$32/month
      eks: 73, // $0.10/hour * 730 hours
      rds: 50, // t3.micro ~$15/month + storage
      s3: 5, // Minimal storage estimate
    };

    for (const component of task.context.components) {
      monthlyCost += componentCosts[component] || 0;
    }

    // Add NAT gateway cost if VPC is included
    if (task.context.components.includes('vpc')) {
      monthlyCost += 32;
    }

    return Math.round(monthlyCost);
  }

  /**
   * Optimize plan for parallel execution
   */
  optimizePlan(plan: AgentPlan): AgentPlan {
    // Identify steps that can run in parallel
    const optimized = { ...plan };

    // Group independent generation steps
    const generationSteps = plan.steps.filter(s => s.type === 'generate' && s.component);

    // Mark independent steps as parallelizable
    for (let i = 0; i < generationSteps.length; i++) {
      const step = generationSteps[i];
      // If steps don't have interdependencies, they can run in parallel
      if (!this.hasInterdependency(step, generationSteps, i)) {
        step.parameters.parallel_group = 'generation';
      }
    }

    return optimized;
  }

  /**
   * Check if step has interdependency with others
   */
  private hasInterdependency(step: PlanStep, steps: PlanStep[], _index: number): boolean {
    // Check if this step's output is needed by another step in the group
    // Simplified: assume VPC must be created before EKS/RDS
    if (step.component === 'vpc') {
      return false;
    }
    if (step.component === 'eks' || step.component === 'rds') {
      return steps.some(s => s.component === 'vpc');
    }
    return false;
  }

  /**
   * Validate plan is executable
   */
  validatePlan(plan: AgentPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for circular dependencies
    if (this.hasCircularDependencies(plan)) {
      errors.push('Plan contains circular dependencies');
    }

    // Check all dependencies exist
    const stepIds = new Set(plan.steps.map(s => s.id));
    for (const step of plan.steps) {
      if (step.depends_on) {
        for (const depId of step.depends_on) {
          if (!stepIds.has(depId)) {
            errors.push(`Step ${step.id} depends on non-existent step ${depId}`);
          }
        }
      }
    }

    // Check step order matches dependencies
    for (const step of plan.steps) {
      if (step.depends_on) {
        for (const depId of step.depends_on) {
          const depStep = plan.steps.find(s => s.id === depId);
          if (depStep && depStep.order >= step.order) {
            errors.push(`Step ${step.id} has invalid order relative to dependency ${depId}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check for circular dependencies
   */
  private hasCircularDependencies(plan: AgentPlan): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (stepId: string): boolean => {
      visited.add(stepId);
      recursionStack.add(stepId);

      const step = plan.steps.find(s => s.id === stepId);
      if (step?.depends_on) {
        for (const depId of step.depends_on) {
          if (!visited.has(depId)) {
            if (hasCycle(depId)) {
              return true;
            }
          } else if (recursionStack.has(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(stepId);
      return false;
    };

    for (const step of plan.steps) {
      if (!visited.has(step.id)) {
        if (hasCycle(step.id)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Generate plan ID
   */
  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
