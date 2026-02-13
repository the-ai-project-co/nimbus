import { logger } from '@nimbus/shared-utils';
import { Planner } from './planner';
import { Executor } from './executor';
import { Verifier } from './verifier';
import { SafetyManager } from './safety-manager';
import type { AgentTask, AgentPlan, AgentEvent, ExecutionResult, VerificationResult } from '../types/agent';

export class AgentOrchestrator {
  private planner: Planner;
  private executor: Executor;
  private verifier: Verifier;
  private safetyManager: SafetyManager;

  private tasks: Map<string, AgentTask>;
  private plans: Map<string, AgentPlan>;
  private events: AgentEvent[];

  constructor() {
    this.planner = new Planner();
    this.executor = new Executor();
    this.verifier = new Verifier();
    this.safetyManager = new SafetyManager();

    this.tasks = new Map();
    this.plans = new Map();
    this.events = [];

    logger.info('Agent Orchestrator initialized');
  }

  /**
   * Create a new task
   */
  async createTask(taskInput: {
    type: 'generate' | 'deploy' | 'verify' | 'rollback' | 'analyze';
    user_id: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    context: {
      provider: 'aws' | 'gcp' | 'azure';
      environment: string;
      region?: string;
      components: string[];
      requirements?: Record<string, unknown>;
    };
    metadata?: Record<string, unknown>;
  }): Promise<AgentTask> {
    const task: AgentTask = {
      id: this.generateTaskId(),
      type: taskInput.type,
      status: 'pending',
      priority: taskInput.priority || 'medium',
      user_id: taskInput.user_id,
      created_at: new Date(),
      updated_at: new Date(),
      context: taskInput.context,
      execution: {},
      metadata: taskInput.metadata,
    };

    this.tasks.set(task.id, task);
    this.emitEvent({
      id: this.generateEventId(),
      task_id: task.id,
      type: 'task_created',
      timestamp: new Date(),
      user_id: task.user_id,
      data: { task },
    });

    logger.info(`Created task ${task.id}: ${task.type} for ${task.context.components.join(', ')}`);

    return task;
  }

  /**
   * Execute a task (full workflow)
   */
  async executeTask(taskId: string): Promise<{
    task: AgentTask;
    plan: AgentPlan;
    executionResults: ExecutionResult[];
    verificationResult: VerificationResult;
  }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    logger.info(`Starting task execution: ${taskId}`);

    try {
      // Step 1: Generate plan
      task.status = 'planning';
      task.updated_at = new Date();

      const plan = await this.planner.generatePlan(task);
      this.plans.set(plan.id, plan);
      task.execution.plan_id = plan.id;

      this.emitEvent({
        id: this.generateEventId(),
        task_id: task.id,
        type: 'plan_generated',
        timestamp: new Date(),
        data: { plan_id: plan.id, steps: plan.steps.length },
      });

      logger.info(`Generated plan ${plan.id} with ${plan.steps.length} steps`);

      // Step 2: Run pre-execution safety checks
      const safetyChecks = await this.safetyManager.runPreExecutionChecks(task, plan);

      if (!safetyChecks.passed) {
        task.status = 'failed';
        task.result = {
          success: false,
          errors: safetyChecks.blockers.map((b) => b.message),
        };
        task.updated_at = new Date();

        logger.error(`Safety checks failed for task ${taskId}`, safetyChecks.blockers);
        throw new Error('Pre-execution safety checks failed');
      }

      // Step 3: Approve plan if required
      if (plan.requires_approval && !plan.approved_by) {
        task.status = 'pending';
        task.updated_at = new Date();

        logger.info(`Task ${taskId} requires approval before execution`);
        // In production, this would notify user and wait for approval
        // For now, auto-approve non-critical tasks
        if (plan.risk_level !== 'critical') {
          plan.approved_by = 'system';
          plan.approved_at = new Date();
          plan.status = 'approved';

          this.emitEvent({
            id: this.generateEventId(),
            task_id: task.id,
            type: 'plan_approved',
            timestamp: new Date(),
            data: { plan_id: plan.id, approved_by: 'system' },
          });
        } else {
          throw new Error('Critical plan requires manual approval');
        }
      }

      // Step 4: Execute plan
      task.status = 'executing';
      task.updated_at = new Date();

      this.emitEvent({
        id: this.generateEventId(),
        task_id: task.id,
        type: 'execution_started',
        timestamp: new Date(),
        data: { plan_id: plan.id },
      });

      logger.info(`Executing plan ${plan.id}`);

      const executionResults = await this.executor.executePlan(plan);
      task.execution.execution_id = executionResults[0]?.id;

      // Check if execution succeeded
      const executionFailed = executionResults.some((r) => r.status === 'failure');

      if (executionFailed) {
        task.status = 'failed';
        task.result = {
          success: false,
          errors: executionResults
            .filter((r) => r.error)
            .map((r) => r.error!.message),
        };
        task.updated_at = new Date();

        logger.error(`Execution failed for task ${taskId}`);
        throw new Error('Execution failed');
      }

      // Emit step completed events
      for (const result of executionResults) {
        this.emitEvent({
          id: this.generateEventId(),
          task_id: task.id,
          type: 'step_completed',
          timestamp: new Date(),
          data: {
            step_id: result.step_id,
            status: result.status,
            duration: result.duration,
          },
        });
      }

      // Step 5: Verify execution
      task.status = 'verifying';
      task.updated_at = new Date();

      logger.info(`Verifying execution results`);

      const verificationResult = await this.verifier.verifyExecution(executionResults, {
        ...task.context,
        environment: task.context.environment,
      });
      task.execution.verification_id = verificationResult.id;

      this.emitEvent({
        id: this.generateEventId(),
        task_id: task.id,
        type: 'verification_completed',
        timestamp: new Date(),
        data: {
          verification_id: verificationResult.id,
          status: verificationResult.status,
          checks_passed: verificationResult.summary.passed,
          checks_failed: verificationResult.summary.failed,
        },
      });

      // Step 6: Run post-execution safety checks
      await this.safetyManager.runPostExecutionChecks({
        task,
        plan,
        execution_results: executionResults,
        verification_result: verificationResult,
      });

      // Step 7: Complete task
      task.status = 'completed';
      task.completed_at = new Date();
      task.updated_at = new Date();
      task.result = {
        success: true,
        outputs: executionResults.reduce((acc, r) => ({ ...acc, ...r.outputs }), {}),
        artifacts: executionResults.flatMap((r) => r.artifacts?.map((a) => a.name) || []),
      };

      plan.status = 'completed';

      this.emitEvent({
        id: this.generateEventId(),
        task_id: task.id,
        type: 'task_completed',
        timestamp: new Date(),
        data: {
          duration: task.completed_at.getTime() - task.created_at.getTime(),
          verification_status: verificationResult.status,
        },
      });

      logger.info(`Task ${taskId} completed successfully`);

      return {
        task,
        plan,
        executionResults,
        verificationResult,
      };
    } catch (error) {
      task.status = 'failed';
      task.updated_at = new Date();
      task.result = {
        success: false,
        errors: [(error as Error).message],
      };

      this.emitEvent({
        id: this.generateEventId(),
        task_id: task.id,
        type: 'task_failed',
        timestamp: new Date(),
        data: {
          error: (error as Error).message,
        },
      });

      logger.error(`Task ${taskId} failed`, error);
      throw error;
    }
  }

  /**
   * Resume a task from its last checkpoint
   */
  async resumeTask(taskId: string): Promise<{
    task: AgentTask;
    executionResults: ExecutionResult[];
  }> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.execution.plan_id) {
      throw new Error(`Task ${taskId} has no associated plan. Cannot resume.`);
    }

    const plan = this.plans.get(task.execution.plan_id);
    if (!plan) {
      throw new Error(`Plan ${task.execution.plan_id} not found. Cannot resume.`);
    }

    logger.info(`Resuming task ${taskId} with plan ${plan.id}`);

    // Update task status
    task.status = 'executing';
    task.updated_at = new Date();

    this.emitEvent({
      id: this.generateEventId(),
      task_id: task.id,
      type: 'execution_started',
      timestamp: new Date(),
      data: { plan_id: plan.id, resumed: true },
    });

    // Re-execute the plan; the executor will pick up from the checkpoint
    const executionResults = await this.executor.executePlan(plan);

    // Check if execution succeeded
    const executionFailed = executionResults.some((r) => r.status === 'failure');

    if (executionFailed) {
      task.status = 'failed';
      task.result = {
        success: false,
        errors: executionResults
          .filter((r) => r.error)
          .map((r) => r.error!.message),
      };
      task.updated_at = new Date();

      this.emitEvent({
        id: this.generateEventId(),
        task_id: task.id,
        type: 'task_failed',
        timestamp: new Date(),
        data: { error: 'Resumed execution failed' },
      });

      throw new Error('Resumed execution failed');
    }

    // Mark task as completed
    task.status = 'completed';
    task.completed_at = new Date();
    task.updated_at = new Date();
    task.result = {
      success: true,
      outputs: executionResults.reduce((acc, r) => ({ ...acc, ...r.outputs }), {}),
      artifacts: executionResults.flatMap((r) => r.artifacts?.map((a) => a.name) || []),
    };

    this.emitEvent({
      id: this.generateEventId(),
      task_id: task.id,
      type: 'task_completed',
      timestamp: new Date(),
      data: {
        duration: task.completed_at.getTime() - task.created_at.getTime(),
        resumed: true,
      },
    });

    logger.info(`Resumed task ${taskId} completed successfully`);

    return {
      task,
      executionResults,
    };
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): AgentTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get plan by ID
   */
  getPlan(planId: string): AgentPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * List all tasks
   */
  listTasks(filters?: {
    user_id?: string;
    status?: AgentTask['status'];
    type?: AgentTask['type'];
  }): AgentTask[] {
    let tasks = Array.from(this.tasks.values());

    if (filters?.user_id) {
      tasks = tasks.filter((t) => t.user_id === filters.user_id);
    }

    if (filters?.status) {
      tasks = tasks.filter((t) => t.status === filters.status);
    }

    if (filters?.type) {
      tasks = tasks.filter((t) => t.type === filters.type);
    }

    return tasks.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status === 'completed' || task.status === 'failed') {
      throw new Error(`Cannot cancel task in ${task.status} status`);
    }

    task.status = 'cancelled';
    task.updated_at = new Date();

    this.emitEvent({
      id: this.generateEventId(),
      task_id: task.id,
      type: 'task_cancelled',
      timestamp: new Date(),
    });

    logger.info(`Task ${taskId} cancelled`);
  }

  /**
   * Get task events
   */
  getTaskEvents(taskId: string): AgentEvent[] {
    return this.events.filter((e) => e.task_id === taskId);
  }

  /**
   * Get all events
   */
  getAllEvents(): AgentEvent[] {
    return [...this.events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get task statistics
   */
  getStatistics(): {
    total_tasks: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
    average_duration: number;
    success_rate: number;
  } {
    const tasks = Array.from(this.tasks.values());

    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalDuration = 0;
    let completedTasks = 0;
    let successfulTasks = 0;

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] || 0) + 1;
      byType[task.type] = (byType[task.type] || 0) + 1;

      if (task.completed_at) {
        completedTasks++;
        totalDuration += task.completed_at.getTime() - task.created_at.getTime();

        if (task.result?.success) {
          successfulTasks++;
        }
      }
    }

    return {
      total_tasks: tasks.length,
      by_status: byStatus,
      by_type: byType,
      average_duration: completedTasks > 0 ? totalDuration / completedTasks : 0,
      success_rate: completedTasks > 0 ? (successfulTasks / completedTasks) * 100 : 0,
    };
  }

  /**
   * Emit event
   */
  private emitEvent(event: AgentEvent): void {
    this.events.push(event);

    // Keep only last 1000 events
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000);
    }
  }

  /**
   * Generate task ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get planner instance (for direct access)
   */
  getPlanner(): Planner {
    return this.planner;
  }

  /**
   * Get executor instance (for direct access)
   */
  getExecutor(): Executor {
    return this.executor;
  }

  /**
   * Get verifier instance (for direct access)
   */
  getVerifier(): Verifier {
    return this.verifier;
  }

  /**
   * Get safety manager instance (for direct access)
   */
  getSafetyManager(): SafetyManager {
    return this.safetyManager;
  }
}
