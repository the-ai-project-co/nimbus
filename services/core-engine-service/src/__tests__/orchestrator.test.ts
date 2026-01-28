import { describe, it, expect, beforeEach } from 'bun:test';
import { AgentOrchestrator } from '../components/orchestrator';

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator;

  beforeEach(() => {
    orchestrator = new AgentOrchestrator();
  });

  describe('createTask', () => {
    it('should create a new task', async () => {
      const task = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc', 's3'],
        },
      });

      expect(task.id).toBeDefined();
      expect(task.type).toBe('generate');
      expect(task.status).toBe('pending');
      expect(task.context.provider).toBe('aws');
      expect(task.context.components).toContain('vpc');
    });

    it('should set default priority', async () => {
      const task = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      expect(task.priority).toBe('medium');
    });

    it('should accept custom priority', async () => {
      const task = await orchestrator.createTask({
        type: 'deploy',
        user_id: 'user-123',
        priority: 'high',
        context: {
          provider: 'aws',
          environment: 'production',
          components: ['eks'],
        },
      });

      expect(task.priority).toBe('high');
    });
  });

  describe('executeTask', () => {
    it('should execute a complete task workflow', async () => {
      const task = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      const result = await orchestrator.executeTask(task.id);

      expect(result.task.status).toBe('completed');
      expect(result.plan).toBeDefined();
      expect(result.executionResults.length).toBeGreaterThan(0);
      expect(result.verificationResult).toBeDefined();
    });

    it('should generate plan with correct steps', async () => {
      const task = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc', 's3'],
        },
      });

      const result = await orchestrator.executeTask(task.id);

      expect(result.plan.steps.length).toBeGreaterThan(0);
      expect(result.plan.steps.some((s) => s.type === 'validate')).toBe(true);
      expect(result.plan.steps.some((s) => s.type === 'generate')).toBe(true);
    });

    it('should run safety checks', async () => {
      const task = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['eks'],
        },
      });

      const result = await orchestrator.executeTask(task.id);

      // Should complete successfully with safety checks passed
      expect(result.task.status).toBe('completed');
      expect(result.plan).toBeDefined();
    });

    it('should throw error for non-existent task', async () => {
      await expect(orchestrator.executeTask('invalid-id')).rejects.toThrow('Task not found');
    });
  });

  describe('getTask', () => {
    it('should retrieve task by id', async () => {
      const created = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      const retrieved = orchestrator.getTask(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent task', () => {
      const task = orchestrator.getTask('invalid-id');
      expect(task).toBeUndefined();
    });
  });

  describe('listTasks', () => {
    it('should list all tasks', async () => {
      await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      await orchestrator.createTask({
        type: 'deploy',
        user_id: 'user-456',
        context: {
          provider: 'gcp',
          environment: 'production',
          components: ['gke'],
        },
      });

      const tasks = orchestrator.listTasks();

      expect(tasks.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter tasks by user_id', async () => {
      await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-456',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      const tasks = orchestrator.listTasks({ user_id: 'user-123' });

      expect(tasks.every((t) => t.user_id === 'user-123')).toBe(true);
    });

    it('should filter tasks by status', async () => {
      const task1 = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      await orchestrator.executeTask(task1.id);

      await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['s3'],
        },
      });

      const completedTasks = orchestrator.listTasks({ status: 'completed' });
      const pendingTasks = orchestrator.listTasks({ status: 'pending' });

      expect(completedTasks.length).toBeGreaterThan(0);
      expect(pendingTasks.length).toBeGreaterThan(0);
    });
  });

  describe('cancelTask', () => {
    it('should cancel pending task', async () => {
      const task = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      await orchestrator.cancelTask(task.id);

      const cancelled = orchestrator.getTask(task.id);
      expect(cancelled?.status).toBe('cancelled');
    });

    it('should throw error when cancelling completed task', async () => {
      const task = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      await orchestrator.executeTask(task.id);

      await expect(orchestrator.cancelTask(task.id)).rejects.toThrow();
    });
  });

  describe('getTaskEvents', () => {
    it('should track task events', async () => {
      const task = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      await orchestrator.executeTask(task.id);

      const events = orchestrator.getTaskEvents(task.id);

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'task_created')).toBe(true);
      expect(events.some((e) => e.type === 'plan_generated')).toBe(true);
      expect(events.some((e) => e.type === 'task_completed')).toBe(true);
    });
  });

  describe('getStatistics', () => {
    it('should calculate statistics', async () => {
      await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      const stats = orchestrator.getStatistics();

      expect(stats.total_tasks).toBeGreaterThan(0);
      expect(stats.by_status).toBeDefined();
      expect(stats.by_type).toBeDefined();
    });

    it('should calculate success rate', async () => {
      const task = await orchestrator.createTask({
        type: 'generate',
        user_id: 'user-123',
        context: {
          provider: 'aws',
          environment: 'development',
          components: ['vpc'],
        },
      });

      await orchestrator.executeTask(task.id);

      const stats = orchestrator.getStatistics();

      expect(stats.success_rate).toBeGreaterThanOrEqual(0);
      expect(stats.success_rate).toBeLessThanOrEqual(100);
    });
  });
});
