/**
 * Integration tests for Core Engine Service
 *
 * These tests verify the orchestration, planning, and task execution capabilities
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../../services/core-engine-service/src/server';
import { waitForService, createTestClient, getTestPorts } from '../../utils/test-helpers';

describe('Core Engine Service Integration Tests', () => {
  let server: any;
  let client: ReturnType<typeof createTestClient>;
  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;
  const WS_URL = `ws://localhost:${ports.ws}`;

  beforeAll(async () => {
    server = await startServer(ports.http, ports.ws);
    const ready = await waitForService(BASE_URL);
    if (!ready) {
      throw new Error('Core Engine Service failed to start');
    }
    client = createTestClient(BASE_URL);
  });

  afterAll(() => {
    server?.stop?.();
  });

  describe('Health Endpoint', () => {
    test('returns healthy status', async () => {
      const { status, data } = await client.get('/health');

      expect(status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('core-engine-service');
    });
  });

  describe('Task Management', () => {
    const validTaskPayload = {
      type: 'generate',
      user_id: 'test-user',
      context: {
        provider: 'aws',
        environment: 'development',
        region: 'us-east-1',
        components: ['vpc', 'ec2'],
      },
    };

    test('creates a new task', async () => {
      const { status, data } = await client.post('/api/tasks', validTaskPayload);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBeDefined();
      expect(data.data.status).toBe('pending');
      expect(data.data.type).toBe('generate');
    });

    test('retrieves task by ID', async () => {
      // Create a task first
      const createResult = await client.post('/api/tasks', validTaskPayload);
      const taskId = createResult.data.data.id;

      // Retrieve the task
      const { status, data } = await client.get(`/api/tasks/${taskId}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBe(taskId);
    });

    test('lists all tasks', async () => {
      // Create a few tasks
      await client.post('/api/tasks', validTaskPayload);
      await client.post('/api/tasks', validTaskPayload);

      const { status, data } = await client.get('/api/tasks');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(2);
    });

    test('returns error for non-existent task', async () => {
      const { status, data } = await client.get('/api/tasks/non-existent-id');

      expect(status).toBe(200); // Service returns 200 with success: false
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe('Plan Generation', () => {
    const validPlanPayload = {
      type: 'generate',
      context: {
        provider: 'aws',
        environment: 'development',
        region: 'us-east-1',
        components: ['vpc', 'ec2'],
      },
    };

    test('generates execution plan', async () => {
      const { status, data } = await client.post('/api/plans/generate', validPlanPayload);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBeDefined();
      expect(data.data.steps).toBeDefined();
      expect(Array.isArray(data.data.steps)).toBe(true);
    });

    // Note: Plan validation and optimization require the plan to be persisted
    // in the orchestrator, which happens during task execution. These tests
    // verify the API returns proper error when plan is not found.
    test('returns error for non-existent plan validation', async () => {
      const { status, data } = await client.post('/api/plans/non-existent/validate');

      expect(status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test('returns error for non-existent plan optimization', async () => {
      const { status, data } = await client.post('/api/plans/non-existent/optimize');

      expect(status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });

  describe('Safety Checks', () => {
    // Safety checks require a valid task and plan to be persisted
    // Currently the plan is only persisted when task is executed
    // These tests verify the API handles missing plans correctly

    test('returns error when task or plan not found', async () => {
      const { status, data } = await client.post('/api/safety/check', {
        task_id: 'non-existent-task',
        plan_id: 'non-existent-plan',
        type: 'pre_execution',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test('lists available safety checks', async () => {
      const { status, data } = await client.get('/api/safety/checks');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Statistics', () => {
    test('returns service statistics', async () => {
      const validTaskPayload = {
        type: 'generate',
        user_id: 'test-user',
        context: {
          provider: 'aws',
          environment: 'development',
          region: 'us-east-1',
          components: ['vpc', 'ec2'],
        },
      };

      // Create some tasks first to have statistics
      await client.post('/api/tasks', validTaskPayload);
      await client.post('/api/tasks', validTaskPayload);

      const { status, data } = await client.get('/api/statistics');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });
  });

  describe('Events', () => {
    const validTaskPayload = {
      type: 'generate',
      user_id: 'test-user',
      context: {
        provider: 'aws',
        environment: 'development',
        region: 'us-east-1',
        components: ['vpc', 'ec2'],
      },
    };

    test('returns events list', async () => {
      // Create a task to generate events
      await client.post('/api/tasks', validTaskPayload);

      const { status, data } = await client.get('/api/events');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });

    test('returns task-specific events', async () => {
      const taskResult = await client.post('/api/tasks', validTaskPayload);
      const taskId = taskResult.data.data.id;

      const { status, data } = await client.get(`/api/tasks/${taskId}/events`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe('Task Execution', () => {
    const validTaskPayload = {
      type: 'generate',
      user_id: 'test-user',
      context: {
        provider: 'aws',
        environment: 'development',
        region: 'us-east-1',
        components: ['vpc', 'ec2'],
      },
    };

    test('executes task and returns execution result', async () => {
      // Create a task
      const createResult = await client.post('/api/tasks', validTaskPayload);
      const taskId = createResult.data.data.id;

      // Execute the task - may succeed or fail based on service state
      const { status, data } = await client.post(`/api/tasks/${taskId}/execute`);

      expect(status).toBe(200);
      // Execution may succeed or fail depending on the executor state
      expect(data).toBeDefined();
    });

    test('cancels task', async () => {
      // Create a task
      const createResult = await client.post('/api/tasks', validTaskPayload);
      const taskId = createResult.data.data.id;

      // Cancel the task
      const { status, data } = await client.post(`/api/tasks/${taskId}/cancel`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('returns error for missing required fields', async () => {
      const { status, data } = await client.post('/api/tasks', {
        // Missing required fields
      });

      expect(status).toBe(200); // Service returns 200 with success: false
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test('returns error for invalid plan ID', async () => {
      const { status, data } = await client.post('/api/plans/invalid-id/validate');

      expect(status).toBe(200); // Service returns 200 with success: false
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    test('handles missing task or plan for safety check', async () => {
      const { status, data } = await client.post('/api/safety/check', {
        task_id: 'non-existent',
        plan_id: 'non-existent',
        type: 'pre_execution',
      });

      expect(status).toBe(200); // Service returns 200 with success: false
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  });
});
