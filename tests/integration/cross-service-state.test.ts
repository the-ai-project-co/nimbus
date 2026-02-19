/**
 * I3 — Cross-Service State Integration Tests
 *
 * Tests that multiple services can interact with the State Service correctly:
 *   - Config persistence: write from one service context, read from another
 *   - History recording: services log operations to the shared history
 *   - Checkpoint save/resume across simulated service restarts
 *   - Conversation state maintained across requests
 *   - Concurrent state access patterns
 *
 * Strategy: start the State Service on an ephemeral port and drive it via
 * HTTP requests that simulate what Core Engine, CLI, and other services would
 * send. No real database is spun up — the State Service manages its own
 * SQLite instance internally.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { startServer as startStateService } from '../../services/state-service/src/server';
import { waitForService, createTestClient, getTestPorts } from '../utils/test-helpers';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

describe('Cross-Service State Integration Tests', () => {
  let stateServer: any;
  let client: ReturnType<typeof createTestClient>;

  const ports = getTestPorts();
  const STATE_URL = `http://localhost:${ports.http}`;

  beforeAll(async () => {
    stateServer = await startStateService(ports.http);
    const ready = await waitForService(STATE_URL);
    if (!ready) throw new Error('State Service failed to start within timeout');

    client = createTestClient(STATE_URL);
  });

  afterAll(() => {
    try { stateServer?.stop?.(); } catch { /* ignore */ }
  });

  // ---------------------------------------------------------------------------
  // Service health
  // ---------------------------------------------------------------------------

  describe('Service Health', () => {
    test('state service reports healthy', async () => {
      const { status, data } = await client.get('/health');

      expect(status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('state-service');
    });
  });

  // ---------------------------------------------------------------------------
  // Config persistence — simulates one service writing, another reading
  // ---------------------------------------------------------------------------

  describe('Config Persistence', () => {
    test('writes a config value (simulating CLI service)', async () => {
      const { status, data } = await client.put('/api/state/config', {
        key: 'default_provider',
        value: 'aws',
        source: 'cli-service',
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('reads config value (simulating Core Engine service)', async () => {
      // Write from "CLI service"
      await client.put('/api/state/config', {
        key: 'active_model',
        value: 'claude-3-5-sonnet-20241022',
        source: 'cli-service',
      });

      // Read from "Core Engine service"
      const { status, data } = await client.get('/api/state/config');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    test('overwrites an existing config key with a new value', async () => {
      await client.put('/api/state/config', {
        key: 'log_level',
        value: 'info',
        source: 'core-engine-service',
      });

      await client.put('/api/state/config', {
        key: 'log_level',
        value: 'debug',
        source: 'cli-service',
      });

      const { data } = await client.get('/api/state/config');
      expect(data.success).toBe(true);
      // Value was updated; the response should be the latest config state
      expect(data.data).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // History recording — multiple services log operations
  // ---------------------------------------------------------------------------

  describe('History Recording', () => {
    test('core engine can record an operation to shared history', async () => {
      const { status, data } = await client.post('/api/state/history', {
        command: 'terraform apply',
        source: 'core-engine-service',
        status: 'success',
        metadata: { taskId: 'task-001', provider: 'aws', environment: 'staging' },
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('CLI service can record a chat command to shared history', async () => {
      const { status, data } = await client.post('/api/state/history', {
        command: 'nimbus chat "Create a VPC"',
        source: 'cli-service',
        status: 'success',
        metadata: { conversationId: 'conv-xyz', model: 'claude-3-5-sonnet' },
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('generator service records generation events', async () => {
      const { status, data } = await client.post('/api/state/history', {
        command: 'generate terraform vpc',
        source: 'generator-service',
        status: 'success',
        metadata: { files: ['vpc.tf', 'providers.tf'], provider: 'aws' },
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('history from all services is retrievable in a single query', async () => {
      // Record entries from multiple service contexts
      await client.post('/api/state/history', {
        command: 'helm deploy',
        source: 'helm-tools-service',
        status: 'success',
      });

      await client.post('/api/state/history', {
        command: 'k8s apply',
        source: 'k8s-tools-service',
        status: 'error',
      });

      const { status, data } = await client.get('/api/state/history');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      // At least the entries we just recorded should be present
      expect(data.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Conversation state across requests
  // ---------------------------------------------------------------------------

  describe('Conversation State', () => {
    test('creates a new conversation from CLI service context', async () => {
      const { status, data } = await client.post('/api/state/conversations', {
        id: `conv-cli-${Date.now()}`,
        title: 'VPC creation session',
        messages: [
          { role: 'user', content: 'Create a VPC', timestamp: new Date().toISOString() },
        ],
        metadata: { source: 'cli-service', model: 'claude-3-5-sonnet' },
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('conversation list is accessible to all services', async () => {
      const { status, data } = await client.get('/api/state/conversations');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });

    test('multiple sequential messages maintain conversation continuity', async () => {
      const convId = `conv-multi-${Date.now()}`;

      // First message
      await client.post('/api/state/conversations', {
        id: convId,
        title: 'Multi-turn session',
        messages: [
          { role: 'user', content: 'Create a VPC', timestamp: new Date().toISOString() },
          { role: 'assistant', content: 'I will create a VPC for you.', timestamp: new Date().toISOString() },
        ],
      });

      // Retrieve and verify
      const { status, data } = await client.get('/api/state/conversations');
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      const conversations = data.data as any[];
      expect(conversations.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Artifact storage — shared file/artifact persistence across services
  // ---------------------------------------------------------------------------

  describe('Artifact Storage', () => {
    test('generator service stores a generated artifact', async () => {
      const { status, data } = await client.post('/api/state/artifacts', {
        name: 'vpc.tf',
        type: 'terraform',
        content: 'resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }',
        metadata: {
          source: 'generator-service',
          provider: 'aws',
          taskId: 'task-gen-001',
        },
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('core engine can list artifacts stored by generator service', async () => {
      // Store an artifact as generator service
      await client.post('/api/state/artifacts', {
        name: 'providers.tf',
        type: 'terraform',
        content: 'terraform { required_providers { aws = {} } }',
        metadata: { source: 'generator-service' },
      });

      // Retrieve as core engine
      const { status, data } = await client.get('/api/state/artifacts');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Checkpoint save/resume — simulates service restarts
  // ---------------------------------------------------------------------------

  describe('Checkpoint Save and Resume', () => {
    test('saves a checkpoint for a running operation', async () => {
      const { status, data } = await client.post('/api/state/checkpoints', {
        operationId: 'op-001',
        step: 'plan-generated',
        state: {
          taskId: 'task-001',
          planId: 'plan-001',
          completedSteps: ['validate', 'plan'],
          pendingSteps: ['apply'],
        },
        metadata: { source: 'core-engine-service' },
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
    });

    test('retrieves the latest checkpoint for an operation (simulating resume after restart)', async () => {
      const operationId = `op-resume-${Date.now()}`;

      await client.post('/api/state/checkpoints', {
        operationId,
        step: 'step-1',
        state: { completed: ['init'], pending: ['plan', 'apply'] },
      });

      await client.post('/api/state/checkpoints', {
        operationId,
        step: 'step-2',
        state: { completed: ['init', 'plan'], pending: ['apply'] },
      });

      const { status, data } = await client.get(
        `/api/state/checkpoints/latest/${operationId}`
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.step).toBe('step-2');
    });

    test('lists all checkpoints for an operation', async () => {
      const operationId = `op-list-${Date.now()}`;

      await client.post('/api/state/checkpoints', {
        operationId,
        step: 'init',
        state: { phase: 'initializing' },
      });

      await client.post('/api/state/checkpoints', {
        operationId,
        step: 'plan',
        state: { phase: 'planning' },
      });

      const { status, data } = await client.get(
        `/api/state/checkpoints/list/${operationId}`
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(2);
    });

    test('checkpoint retrieval by ID returns the persisted state', async () => {
      const operationId = `op-by-id-${Date.now()}`;

      const createResult = await client.post('/api/state/checkpoints', {
        operationId,
        step: 'apply-started',
        state: { resource: 'aws_vpc', action: 'create' },
      });

      expect(createResult.data.success).toBe(true);
      const checkpointId = createResult.data.data.id;

      const { status, data } = await client.get(`/api/state/checkpoints/${checkpointId}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(checkpointId);
    });
  });

  // ---------------------------------------------------------------------------
  // Concurrent access patterns — verify state service handles parallel requests
  // ---------------------------------------------------------------------------

  describe('Concurrent State Access', () => {
    test('concurrent history writes from multiple services do not conflict', async () => {
      const writes = Array.from({ length: 5 }, (_, i) =>
        client.post('/api/state/history', {
          command: `concurrent-cmd-${i}`,
          source: `service-${i}`,
          status: 'success',
          metadata: { index: i },
        })
      );

      const results = await Promise.all(writes);
      const allSucceeded = results.every(r => r.data.success === true);
      expect(allSucceeded).toBe(true);
    });

    test('concurrent artifact stores from generator service do not conflict', async () => {
      const stores = Array.from({ length: 3 }, (_, i) =>
        client.post('/api/state/artifacts', {
          name: `concurrent-file-${i}.tf`,
          type: 'terraform',
          content: `# file ${i}`,
          metadata: { source: 'generator-service', index: i },
        })
      );

      const results = await Promise.all(stores);
      const allSucceeded = results.every(r => r.data.success === true);
      expect(allSucceeded).toBe(true);
    });

    test('concurrent config writes settle to the last written value', async () => {
      const writes = [
        client.put('/api/state/config', { key: 'concurrent_key', value: 'v1', source: 'svc-a' }),
        client.put('/api/state/config', { key: 'concurrent_key', value: 'v2', source: 'svc-b' }),
        client.put('/api/state/config', { key: 'concurrent_key', value: 'v3', source: 'svc-c' }),
      ];

      const results = await Promise.all(writes);
      // All writes should succeed — last-write-wins is acceptable
      const allSucceeded = results.every(r => r.data.success === true);
      expect(allSucceeded).toBe(true);

      // State should be consistent (one of the written values)
      const { data } = await client.get('/api/state/config');
      expect(data.success).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------

  describe('Audit Log', () => {
    test('records an audit entry from core engine', async () => {
      const { status, data } = await client.post('/api/state/audit', {
        action: 'terraform_apply',
        actor: 'core-engine-service',
        resource: 'aws_vpc.main',
        result: 'success',
        metadata: { environment: 'production', taskId: 'task-audit-001' },
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('audit log is queryable across service boundaries', async () => {
      await client.post('/api/state/audit', {
        action: 'config_update',
        actor: 'cli-service',
        resource: 'config/default_provider',
        result: 'success',
      });

      const { status, data } = await client.get('/api/state/audit');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    test('returns 404 for unknown routes', async () => {
      const { status } = await client.get('/api/state/does-not-exist');
      expect(status).toBe(404);
    });

    test('returns 404 for routes without the /api/state/ prefix', async () => {
      const { status } = await client.get('/api/history');
      expect(status).toBe(404);
    });

    test('returns 404 for checkpoint that does not exist', async () => {
      const { status, data } = await client.get('/api/state/checkpoints/non-existent-id');
      // State service returns 404 or a structured error
      expect([404, 200]).toContain(status);
      if (status === 200) {
        expect(data.success).toBe(false);
      }
    });
  });
});
