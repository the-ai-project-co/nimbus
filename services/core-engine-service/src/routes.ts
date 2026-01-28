import type { Elysia } from 'elysia';
import { AgentOrchestrator } from './components';
import { logger } from '@nimbus/shared-utils';

// Initialize orchestrator
const orchestrator = new AgentOrchestrator();

/**
 * Setup Core Engine Service routes
 */
export function setupRoutes(app: Elysia) {
  // Health check
  app.get('/health', () => ({
    status: 'healthy',
    service: 'core-engine-service',
    timestamp: new Date().toISOString(),
  }));

  // ===== Task Routes =====

  // Create a new task
  app.post('/api/tasks', async ({ body }) => {
    try {
      const task = await orchestrator.createTask(body as {
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
      });
      return {
        success: true,
        data: task,
      };
    } catch (error) {
      logger.error('Error creating task', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Execute a task
  app.post('/api/tasks/:taskId/execute', async ({ params }: { params: { taskId: string } }) => {
    try {
      const result = await orchestrator.executeTask(params.taskId);
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error('Error executing task', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Get task by ID
  app.get('/api/tasks/:taskId', ({ params }: { params: { taskId: string } }) => {
    try {
      const task = orchestrator.getTask(params.taskId);
      if (!task) {
        return {
          success: false,
          error: 'Task not found',
        };
      }
      return {
        success: true,
        data: task,
      };
    } catch (error) {
      logger.error('Error getting task', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // List tasks
  app.get('/api/tasks', ({ query }: { query: {
    user_id?: string;
    status?: string;
    type?: string;
  }}) => {
    try {
      const tasks = orchestrator.listTasks(query as any);
      return {
        success: true,
        data: tasks,
      };
    } catch (error) {
      logger.error('Error listing tasks', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Cancel a task
  app.post('/api/tasks/:taskId/cancel', async ({ params }: { params: { taskId: string } }) => {
    try {
      await orchestrator.cancelTask(params.taskId);
      return {
        success: true,
        message: 'Task cancelled successfully',
      };
    } catch (error) {
      logger.error('Error cancelling task', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Get task events
  app.get('/api/tasks/:taskId/events', ({ params }: { params: { taskId: string } }) => {
    try {
      const events = orchestrator.getTaskEvents(params.taskId);
      return {
        success: true,
        data: events,
      };
    } catch (error) {
      logger.error('Error getting task events', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // ===== Plan Routes =====

  // Get plan by ID
  app.get('/api/plans/:planId', ({ params }: { params: { planId: string } }) => {
    try {
      const plan = orchestrator.getPlan(params.planId);
      if (!plan) {
        return {
          success: false,
          error: 'Plan not found',
        };
      }
      return {
        success: true,
        data: plan,
      };
    } catch (error) {
      logger.error('Error getting plan', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Generate plan for a task
  app.post('/api/plans/generate', async ({ body }) => {
    const typedBody = body as {
      type: 'generate' | 'deploy' | 'verify' | 'rollback' | 'analyze';
      context: {
        provider: 'aws' | 'gcp' | 'azure';
        environment: string;
        region?: string;
        components: string[];
        requirements?: Record<string, unknown>;
      };
    };

    try {
      // Create temporary task
      const task = await orchestrator.createTask({
        type: typedBody.type,
        user_id: 'system',
        context: typedBody.context,
      });

      // Generate plan
      const planner = orchestrator.getPlanner();
      const plan = await planner.generatePlan(task);

      return {
        success: true,
        data: plan,
      };
    } catch (error) {
      logger.error('Error generating plan', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Validate plan
  app.post('/api/plans/:planId/validate', ({ params }: { params: { planId: string } }) => {
    try {
      const plan = orchestrator.getPlan(params.planId);
      if (!plan) {
        return {
          success: false,
          error: 'Plan not found',
        };
      }

      const planner = orchestrator.getPlanner();
      const validation = planner.validatePlan(plan);

      return {
        success: true,
        data: validation,
      };
    } catch (error) {
      logger.error('Error validating plan', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Optimize plan
  app.post('/api/plans/:planId/optimize', ({ params }: { params: { planId: string } }) => {
    try {
      const plan = orchestrator.getPlan(params.planId);
      if (!plan) {
        return {
          success: false,
          error: 'Plan not found',
        };
      }

      const planner = orchestrator.getPlanner();
      const optimizedPlan = planner.optimizePlan(plan);

      return {
        success: true,
        data: optimizedPlan,
      };
    } catch (error) {
      logger.error('Error optimizing plan', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // ===== Safety Check Routes =====

  // Run safety checks
  app.post('/api/safety/check', async ({ body }) => {
    const typedBody = body as {
      task_id: string;
      plan_id: string;
      type: 'pre_execution' | 'during_execution' | 'post_execution';
    };

    try {
      const task = orchestrator.getTask(typedBody.task_id);
      const plan = orchestrator.getPlan(typedBody.plan_id);

      if (!task || !plan) {
        return {
          success: false,
          error: 'Task or plan not found',
        };
      }

      const safetyManager = orchestrator.getSafetyManager();
      let results;

      switch (typedBody.type) {
        case 'pre_execution':
          results = await safetyManager.runPreExecutionChecks(task, plan);
          break;
        case 'during_execution':
          results = await safetyManager.runDuringExecutionChecks({ task, plan });
          break;
        case 'post_execution':
          results = await safetyManager.runPostExecutionChecks({ task, plan });
          break;
      }

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      logger.error('Error running safety checks', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // List safety checks
  app.get('/api/safety/checks', () => {
    try {
      const safetyManager = orchestrator.getSafetyManager();
      const checks = safetyManager.getAllChecks();

      return {
        success: true,
        data: checks.map(c => ({
          id: c.id,
          type: c.type,
          category: c.category,
          name: c.name,
          description: c.description,
          severity: c.severity,
        })),
      };
    } catch (error) {
      logger.error('Error listing safety checks', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // ===== Statistics Routes =====

  // Get statistics
  app.get('/api/statistics', () => {
    try {
      const stats = orchestrator.getStatistics();
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      logger.error('Error getting statistics', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  // Get all events
  app.get('/api/events', () => {
    try {
      const events = orchestrator.getAllEvents();
      return {
        success: true,
        data: events,
      };
    } catch (error) {
      logger.error('Error getting events', error);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  });

  return app;
}
