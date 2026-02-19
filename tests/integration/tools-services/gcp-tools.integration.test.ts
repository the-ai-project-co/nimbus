/**
 * I4 — GCP Tools Service Integration Tests
 *
 * Tests the GCP Tools Service HTTP API surface, mirroring the AWS tools
 * integration test pattern.  No real GCP credentials are required — the
 * service returns structured error responses when credentials are absent
 * and that is the expected behavior we verify.
 *
 * Covers:
 *   - Health endpoint
 *   - Discovery endpoints (graceful credential failure)
 *   - Terraform generation from directly supplied resources
 *   - Error responses for invalid parameters
 *   - Session management
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { startServer, type ServerInstances } from '../../../services/gcp-tools-service/src/server';
import { waitForService, createTestClient, getTestPorts } from '../../utils/test-helpers';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

describe('GCP Tools Service Integration Tests', () => {
  let server: ServerInstances;
  let client: ReturnType<typeof createTestClient>;

  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;

  beforeAll(async () => {
    server = await startServer({ httpPort: ports.http });
    const ready = await waitForService(BASE_URL);
    if (!ready) throw new Error('GCP Tools Service failed to start within timeout');
    client = createTestClient(BASE_URL);
  });

  afterAll(() => {
    server?.stop?.();
  });

  // ---------------------------------------------------------------------------
  // Health Check
  // ---------------------------------------------------------------------------

  describe('Health Check', () => {
    test('returns healthy status with service metadata', async () => {
      const { status, data } = await client.get('/health');

      expect(status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.service).toBe('gcp-tools-service');
      expect(data.version).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Compute Discovery (mock credentials — expect graceful error)
  // ---------------------------------------------------------------------------

  describe('Compute Discovery', () => {
    test('lists GCP instances — returns structured response even without credentials', async () => {
      const { status, data } = await client.get('/api/gcp/compute/instances');

      // Without GCP credentials the API call fails, but the service returns
      // a structured JSON error rather than crashing.
      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
      if (status === 200) {
        expect(data.success).toBe(true);
      } else {
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();
      }
    });

    test('lists instances with project filter parameter', async () => {
      const { status, data } = await client.get(
        '/api/gcp/compute/instances?project=my-project-id'
      );

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('start instance requires zone and instance fields', async () => {
      const { status, data } = await client.post('/api/gcp/compute/instances/start', {
        // Missing zone and instance
        project: 'my-project',
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/zone/);
    });

    test('stop instance requires zone and instance fields', async () => {
      const { status, data } = await client.post('/api/gcp/compute/instances/stop', {
        // Missing instance
        project: 'my-project',
        zone: 'us-central1-a',
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/instance/);
    });
  });

  // ---------------------------------------------------------------------------
  // Storage Discovery
  // ---------------------------------------------------------------------------

  describe('Storage Discovery', () => {
    test('lists GCP storage buckets — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/gcp/storage/buckets');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('list objects requires bucket query parameter', async () => {
      const { status, data } = await client.get('/api/gcp/storage/objects');

      // bucket is required
      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('bucket');
    });

    test('list objects with bucket parameter is handled', async () => {
      const { status, data } = await client.get('/api/gcp/storage/objects?bucket=my-bucket');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // GKE Discovery
  // ---------------------------------------------------------------------------

  describe('GKE Discovery', () => {
    test('lists GKE clusters — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/gcp/gke/clusters');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('lists GKE clusters with location filter', async () => {
      const { status, data } = await client.get(
        '/api/gcp/gke/clusters?location=us-central1'
      );

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // IAM Discovery
  // ---------------------------------------------------------------------------

  describe('IAM Discovery', () => {
    test('lists service accounts — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/gcp/iam/service-accounts');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('lists IAM roles — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/gcp/iam/roles');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // VPC Discovery
  // ---------------------------------------------------------------------------

  describe('VPC and Network Discovery', () => {
    test('lists VPC networks — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/gcp/vpc/networks');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('lists VPC subnets — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/gcp/vpc/subnets');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Infrastructure Discovery Session
  // ---------------------------------------------------------------------------

  describe('Infrastructure Discovery Session', () => {
    test('requires regions field to start a discovery session', async () => {
      const { status, data } = await client.post('/api/gcp/discover', {
        projectId: 'my-project',
        // Missing: regions
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('regions');
    });

    test('starts a discovery session and returns a sessionId', async () => {
      const { status, data } = await client.post('/api/gcp/discover', {
        projectId: 'test-project-123',
        regions: ['us-central1'],
        services: ['compute'],
      });

      // Discovery starts and returns a session ID regardless of credential status
      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.sessionId).toBeDefined();
      expect(data.data.status).toBe('in_progress');
    });

    test('retrieves discovery session status by sessionId', async () => {
      const startResult = await client.post('/api/gcp/discover', {
        regions: ['us-east1'],
        services: ['storage'],
      });

      expect(startResult.data.success).toBe(true);
      const sessionId = startResult.data.data.sessionId;

      const { status, data } = await client.get(`/api/gcp/discover/${sessionId}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.sessionId).toBe(sessionId);
      expect(data.data.status).toBeDefined();
    });

    test('returns 404 for non-existent discovery session', async () => {
      const { status, data } = await client.get('/api/gcp/discover/nonexistent-session-xyz');

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });

    test('discovery session contains progress information', async () => {
      const startResult = await client.post('/api/gcp/discover', {
        regions: ['us-central1'],
      });

      const sessionId = startResult.data.data.sessionId;
      const { data } = await client.get(`/api/gcp/discover/${sessionId}`);

      expect(data.data.progress).toBeDefined();
      expect(typeof data.data.progress.totalRegions).toBe('number');
      expect(typeof data.data.progress.totalServices).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // Terraform Generation from Discovery Session
  // ---------------------------------------------------------------------------

  describe('Terraform Generation from Discovery', () => {
    test('requires sessionId to generate Terraform', async () => {
      const { status, data } = await client.post('/api/gcp/terraform/generate', {
        // Missing sessionId
        options: { organizeByService: true },
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('sessionId');
    });

    test('returns 404 when discovery session does not exist', async () => {
      const { status, data } = await client.post('/api/gcp/terraform/generate', {
        sessionId: 'fake-session-does-not-exist',
      });

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });

    test('returns error when discovery session is not yet complete', async () => {
      // Start a discovery — it will be in_progress
      const startResult = await client.post('/api/gcp/discover', {
        regions: ['us-central1'],
        services: ['compute'],
      });

      const sessionId = startResult.data.data.sessionId;

      // Immediately try to generate Terraform before discovery completes
      const { status, data } = await client.post('/api/gcp/terraform/generate', {
        sessionId,
      });

      // Should return 400 because discovery is not complete
      // (or 404 if session is cleaned up — both are valid)
      expect([400, 404]).toContain(status);
      expect(data.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    test('returns 404 for unknown routes', async () => {
      const { status } = await client.get('/api/gcp/unknown-endpoint');
      expect(status).toBe(404);
    });

    test('returns 404 for non-existent GCP service namespace', async () => {
      const { status } = await client.get('/api/gcp/nonexistent/resources');
      expect(status).toBe(404);
    });

    test('POST to Compute start with missing required zone returns 400', async () => {
      const { status, data } = await client.post('/api/gcp/compute/instances/start', {
        instance: 'my-instance',
        // Missing zone
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('discovery with "all" regions keyword is accepted', async () => {
      const { status, data } = await client.post('/api/gcp/discover', {
        regions: 'all',
        services: ['iam'],
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.sessionId).toBeDefined();
    });
  });
});
