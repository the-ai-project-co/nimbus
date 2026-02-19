/**
 * I5 — Azure Tools Service Integration Tests
 *
 * Tests the Azure Tools Service HTTP API surface, mirroring the AWS and GCP
 * integration test patterns.  No real Azure credentials are required — the
 * service returns structured error responses when credentials are absent and
 * that graceful degradation is exactly what we verify.
 *
 * Covers:
 *   - Health endpoint
 *   - Discovery endpoints (graceful credential failure)
 *   - Terraform generation from directly supplied resources
 *   - Error responses for invalid parameters
 *   - AKS, Storage, Network, IAM, and Functions sub-services
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer, type ServerInstances } from '../../../services/azure-tools-service/src/server';
import { waitForService, createTestClient, getTestPorts } from '../../utils/test-helpers';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

describe('Azure Tools Service Integration Tests', () => {
  let server: ServerInstances;
  let client: ReturnType<typeof createTestClient>;

  const ports = getTestPorts();
  const BASE_URL = `http://localhost:${ports.http}`;

  beforeAll(async () => {
    server = await startServer({ httpPort: ports.http });
    const ready = await waitForService(BASE_URL);
    if (!ready) throw new Error('Azure Tools Service failed to start within timeout');
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
      expect(data.service).toBe('azure-tools-service');
      expect(data.version).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Compute (VM) Discovery
  // ---------------------------------------------------------------------------

  describe('Compute (VM) Discovery', () => {
    test('lists Azure VMs — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/azure/compute/vms');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
      if (status !== 200) {
        expect(data.success).toBe(false);
        expect(data.error).toBeDefined();
      }
    });

    test('lists VMs filtered by subscription and resource group', async () => {
      const { status, data } = await client.get(
        '/api/azure/compute/vms?subscriptionId=sub-123&resourceGroup=rg-prod'
      );

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('start VM requires resourceGroup field', async () => {
      const { status, data } = await client.post('/api/azure/compute/vms/start', {
        // Missing resourceGroup
        subscriptionId: 'sub-123',
        vmName: 'my-vm',
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/resourceGroup/);
    });

    test('start VM requires vmName field', async () => {
      const { status, data } = await client.post('/api/azure/compute/vms/start', {
        subscriptionId: 'sub-123',
        resourceGroup: 'rg-prod',
        // Missing vmName
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/vmName/);
    });

    test('stop VM requires resourceGroup and vmName fields', async () => {
      const { status, data } = await client.post('/api/azure/compute/vms/stop', {
        subscriptionId: 'sub-123',
        // Missing both resourceGroup and vmName
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Storage Discovery
  // ---------------------------------------------------------------------------

  describe('Storage Discovery', () => {
    test('lists Azure storage accounts — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/azure/storage/accounts');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('lists storage accounts filtered by subscription and resource group', async () => {
      const { status, data } = await client.get(
        '/api/azure/storage/accounts?subscriptionId=sub-123&resourceGroup=rg-storage'
      );

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('get storage account containers requires resourceGroup query parameter', async () => {
      const { status, data } = await client.get(
        '/api/azure/storage/accounts/mystorageaccount'
        // Missing: resourceGroup query param
      );

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('resourceGroup');
    });
  });

  // ---------------------------------------------------------------------------
  // AKS Discovery
  // ---------------------------------------------------------------------------

  describe('AKS Discovery', () => {
    test('lists AKS clusters — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/azure/aks/clusters');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('lists AKS clusters filtered by resource group', async () => {
      const { status, data } = await client.get(
        '/api/azure/aks/clusters?resourceGroup=rg-k8s'
      );

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('describe AKS cluster requires resourceGroup query parameter', async () => {
      const { status, data } = await client.get(
        '/api/azure/aks/clusters/my-cluster'
        // Missing: resourceGroup query param
      );

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('resourceGroup');
    });
  });

  // ---------------------------------------------------------------------------
  // IAM (Role Assignments)
  // ---------------------------------------------------------------------------

  describe('IAM Discovery', () => {
    test('lists role assignments — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/azure/iam/role-assignments');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('lists role assignments filtered by subscription', async () => {
      const { status, data } = await client.get(
        '/api/azure/iam/role-assignments?subscriptionId=sub-prod'
      );

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Functions Discovery
  // ---------------------------------------------------------------------------

  describe('Azure Functions Discovery', () => {
    test('lists function apps — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/azure/functions/apps');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('lists function apps filtered by resource group', async () => {
      const { status, data } = await client.get(
        '/api/azure/functions/apps?resourceGroup=rg-serverless'
      );

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Network Discovery
  // ---------------------------------------------------------------------------

  describe('Network Discovery', () => {
    test('lists virtual networks — returns structured response without credentials', async () => {
      const { status, data } = await client.get('/api/azure/network/vnets');

      expect([200, 500]).toContain(status);
      expect(data).toBeDefined();
    });

    test('lists subnets requires resourceGroup and vnetName parameters', async () => {
      const { status, data } = await client.get('/api/azure/network/subnets');
      // Missing both resourceGroup and vnetName

      expect(status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('lists subnets requires vnetName when resourceGroup is provided', async () => {
      const { status, data } = await client.get(
        '/api/azure/network/subnets?resourceGroup=rg-net'
        // Missing: vnetName
      );

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('vnetName');
    });
  });

  // ---------------------------------------------------------------------------
  // Infrastructure Discovery Session
  // ---------------------------------------------------------------------------

  describe('Infrastructure Discovery Session', () => {
    test('requires regions field to start a discovery session', async () => {
      const { status, data } = await client.post('/api/azure/discover', {
        subscriptionId: 'sub-123',
        // Missing: regions
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('regions');
    });

    test('starts a discovery session and returns a sessionId', async () => {
      const { status, data } = await client.post('/api/azure/discover', {
        subscriptionId: 'sub-test-123',
        regions: ['eastus'],
        services: ['compute'],
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.sessionId).toBeDefined();
      expect(data.data.status).toBe('in_progress');
    });

    test('retrieves discovery session status by sessionId', async () => {
      const startResult = await client.post('/api/azure/discover', {
        regions: ['westeurope'],
        services: ['storage'],
      });

      expect(startResult.data.success).toBe(true);
      const sessionId = startResult.data.data.sessionId;

      const { status, data } = await client.get(`/api/azure/discover/${sessionId}`);

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.sessionId).toBe(sessionId);
      expect(data.data.status).toBeDefined();
    });

    test('returns 404 for non-existent discovery session', async () => {
      const { status, data } = await client.get('/api/azure/discover/nonexistent-session-abc');

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });

    test('discovery session contains progress information', async () => {
      const startResult = await client.post('/api/azure/discover', {
        regions: ['eastus'],
      });

      const sessionId = startResult.data.data.sessionId;
      const { data } = await client.get(`/api/azure/discover/${sessionId}`);

      expect(data.data.progress).toBeDefined();
      expect(typeof data.data.progress.totalRegions).toBe('number');
    });

    test('discovery with "all" regions keyword is accepted', async () => {
      const { status, data } = await client.post('/api/azure/discover', {
        regions: 'all',
        services: ['aks'],
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.sessionId).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Terraform Generation
  // ---------------------------------------------------------------------------

  describe('Terraform Generation', () => {
    test('requires sessionId or resources to generate Terraform', async () => {
      const { status, data } = await client.post('/api/azure/terraform/generate', {
        // Missing both sessionId and resources
        options: { organizeByService: true },
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('sessionId');
    });

    test('returns 404 when referenced discovery session does not exist', async () => {
      const { status, data } = await client.post('/api/azure/terraform/generate', {
        sessionId: 'fake-azure-session-xyz',
      });

      expect(status).toBe(404);
      expect(data.success).toBe(false);
    });

    test('generates Terraform from directly provided Azure VM resource', async () => {
      const resources = [
        {
          id: 'vm-resource-001',
          resourceId: '/subscriptions/sub-123/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/web-vm',
          type: 'virtual_machine',
          azureType: 'Microsoft.Compute/virtualMachines',
          service: 'compute',
          region: 'eastus',
          resourceGroup: 'rg-prod',
          name: 'web-vm',
          tags: { Environment: 'production', ManagedBy: 'nimbus' },
          properties: {
            vmSize: 'Standard_B2s',
            osType: 'Linux',
          },
        },
      ];

      const { status, data } = await client.post('/api/azure/terraform/generate', {
        resources,
        options: {
          organizeByService: true,
          generateImportBlocks: true,
          generateImportScript: true,
        },
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.terraformSessionId).toBeDefined();
      expect(data.data.files).toBeDefined();
      expect(data.data.summary).toBeDefined();
    });

    test('generates Terraform for multiple Azure resource types', async () => {
      const resources = [
        {
          id: 'vnet-001',
          resourceId: '/subscriptions/sub-123/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/main-vnet',
          type: 'virtual_network',
          azureType: 'Microsoft.Network/virtualNetworks',
          service: 'network',
          region: 'westeurope',
          resourceGroup: 'rg-net',
          name: 'main-vnet',
          tags: {},
          properties: { addressSpace: ['10.0.0.0/16'] },
        },
        {
          id: 'aks-001',
          resourceId: '/subscriptions/sub-123/resourceGroups/rg-k8s/providers/Microsoft.ContainerService/managedClusters/prod-aks',
          type: 'kubernetes_cluster',
          azureType: 'Microsoft.ContainerService/managedClusters',
          service: 'aks',
          region: 'westeurope',
          resourceGroup: 'rg-k8s',
          name: 'prod-aks',
          tags: { Environment: 'production' },
          properties: { kubernetesVersion: '1.28.0', nodeCount: 3 },
        },
      ];

      const { status, data } = await client.post('/api/azure/terraform/generate', {
        resources,
      });

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.summary.totalResources).toBe(2);
    });

    test('generation result includes import script when requested', async () => {
      const resources = [
        {
          id: 'sa-001',
          resourceId: '/subscriptions/sub-123/resourceGroups/rg-storage/providers/Microsoft.Storage/storageAccounts/mystorage',
          type: 'storage_account',
          azureType: 'Microsoft.Storage/storageAccounts',
          service: 'storage',
          region: 'eastus',
          resourceGroup: 'rg-storage',
          name: 'mystorage',
          tags: {},
          properties: { sku: 'Standard_LRS', kind: 'StorageV2' },
        },
      ];

      const { data } = await client.post('/api/azure/terraform/generate', {
        resources,
        options: { generateImportScript: true },
      });

      expect(data.data.importScript).toBeDefined();
    });

    test('returns error when discovery session is not yet complete', async () => {
      const startResult = await client.post('/api/azure/discover', {
        regions: ['eastus'],
        services: ['compute'],
      });

      const sessionId = startResult.data.data.sessionId;

      const { status, data } = await client.post('/api/azure/terraform/generate', {
        sessionId,
      });

      expect([400, 404]).toContain(status);
      expect(data.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling
  // ---------------------------------------------------------------------------

  describe('Error Handling', () => {
    test('returns 404 for unknown routes', async () => {
      const { status } = await client.get('/api/azure/nonexistent-service');
      expect(status).toBe(404);
    });

    test('returns 404 for unknown method on known route', async () => {
      const { status } = await client.post('/api/azure/compute/vms');
      expect(status).toBe(404);
    });

    test('handles malformed JSON body gracefully', async () => {
      const response = await fetch(`${BASE_URL}/api/azure/compute/vms/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json',
      });

      // Service should return an error, not crash
      expect([400, 500]).toContain(response.status);
    });

    test('resources array with empty list returns error', async () => {
      const { status, data } = await client.post('/api/azure/terraform/generate', {
        resources: [],
      });

      expect(status).toBe(400);
      expect(data.success).toBe(false);
    });
  });
});
