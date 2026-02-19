import { describe, test, expect, mock } from 'bun:test';

/**
 * GCP Tools Service — Route Handler Tests
 *
 * We test each route by calling the exported `router` function with a
 * synthetic Request object. All cloud SDK modules and the discovery
 * InfrastructureScanner are mocked so no real API calls are made.
 */

// ---------------------------------------------------------------------------
// Mock all cloud SDK dependencies before any module imports
// ---------------------------------------------------------------------------

mock.module('@nimbus/shared-utils', () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  },
}));

// Mock GCP compute SDK (used by ComputeOperations and VPCOperations)
mock.module('@google-cloud/compute', () => ({
  InstancesClient: class {
    async list() {
      return [[{ name: 'test-vm', status: 'RUNNING', zone: 'zones/us-central1-a' }], null, null];
    }
    async start() { return [{ done: true }]; }
    async stop() { return [{ done: true }]; }
  },
  NetworksClient: class {
    async list() { return [[{ name: 'default', autoCreateSubnetworks: true }]]; }
  },
  SubnetworksClient: class {
    async list() { return [[{ name: 'default', ipCidrRange: '10.0.0.0/20' }]]; }
    aggregatedListAsync() {
      return (async function* () {})();
    }
  },
}));

// Mock GCP storage SDK (used by StorageOperations)
mock.module('@google-cloud/storage', () => ({
  Storage: class {
    async getBuckets() {
      return [[{ name: 'test-bucket', metadata: { location: 'US', storageClass: 'STANDARD' } }]];
    }
    bucket(name: string) {
      return {
        getFiles: async () => [[{ name: 'file.txt', metadata: { size: '1024', contentType: 'text/plain' } }]],
      };
    }
  },
}));

// Mock GCP container SDK (used by GKEOperations)
mock.module('@google-cloud/container', () => ({
  ClusterManagerClient: class {
    async listClusters() {
      return [{ clusters: [{ name: 'my-cluster', status: 'RUNNING', location: 'us-central1' }] }];
    }
    async getCluster() {
      return [{ name: 'my-cluster', status: 'RUNNING', location: 'us-central1', nodePools: [] }];
    }
  },
}));

// Mock GCP IAM SDK
mock.module('@google-cloud/iam', () => {
  async function* emptyAsync() {}
  async function* serviceAccountsAsync() {
    yield { name: 'projects/p/serviceAccounts/sa@p.iam.gserviceaccount.com', email: 'sa@p.iam.gserviceaccount.com', disabled: false };
  }
  async function* rolesAsync() {
    yield { name: 'roles/viewer', title: 'Viewer' };
  }
  return {
    IAMClient: class {
      listServiceAccountsAsync() { return serviceAccountsAsync(); }
      listRolesAsync() { return rolesAsync(); }
    },
  };
});

// Mock Cloud Functions SDK
mock.module('@google-cloud/functions', () => ({
  FunctionServiceClient: class {
    async listFunctions() {
      return [{ functions: [{ name: 'my-function', state: 'ACTIVE' }] }];
    }
  },
}));

// Mock discovery modules to avoid real GCP credential lookups
mock.module('../discovery', () => ({
  CredentialManager: class {
    async validateCredentials() {
      return { valid: true, credential: { projectId: 'test-project', authenticated: true } };
    }
  },
  RegionManager: class {
    async filterRegions() { return ['us-central1']; }
  },
  InfrastructureScanner: class {
    startDiscovery() { return Promise.resolve('session-123'); }
    getSession(id: string) {
      if (id === 'session-123') {
        return {
          id: 'session-123',
          progress: {
            status: 'completed',
            regionsScanned: 1,
            totalRegions: 1,
            servicesScanned: 5,
            totalServices: 5,
            resourcesFound: 2,
            errors: [],
            startedAt: new Date(),
            updatedAt: new Date(),
          },
          inventory: {
            resources: [],
            projectId: 'test-project',
            regions: ['us-central1'],
          },
        };
      }
      return undefined;
    }
  },
}));

// Mock terraform module
mock.module('../terraform', () => ({
  createGCPTerraformGenerator: () => ({
    generate: () => ({
      files: new Map([
        ['providers.tf', '# providers'],
        ['main.tf', '# resources'],
      ]),
      summary: { totalResources: 0, mappedResources: 0, unmappedResources: 0, resourcesByService: {}, variablesGenerated: 2, outputsGenerated: 0 },
      unmappedResources: [],
      variables: [],
      outputs: [],
      imports: [],
      importScript: '#!/bin/bash',
    }),
  }),
}));

import { router, healthHandler } from '../routes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: string, path: string, body?: any, params?: Record<string, string>): Request {
  const url = new URL(`http://localhost${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url.toString(), init);
}

async function json(res: Response) {
  return res.json();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GCP Routes', () => {
  describe('healthHandler', () => {
    test('should return healthy status', async () => {
      const res = healthHandler();
      const body = await json(res);

      expect(res.status).toBe(200);
      expect(body.status).toBe('healthy');
      expect(body.service).toBe('gcp-tools-service');
    });

    test('should include timestamp', async () => {
      const res = healthHandler();
      const body = await json(res);

      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /health', () => {
    test('should return 200 healthy', async () => {
      const req = makeRequest('GET', '/health');
      const res = await router(req);
      const body = await json(res);

      expect(res.status).toBe(200);
      expect(body.status).toBe('healthy');
    });
  });

  describe('GET /api/gcp/compute/instances', () => {
    test('should return 200 with instance data when project provided', async () => {
      const req = makeRequest('GET', '/api/gcp/compute/instances', undefined, { project: 'test-project' });
      const res = await router(req);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/gcp/compute/instances/start', () => {
    test('should return 400 when zone is missing', async () => {
      const req = makeRequest('POST', '/api/gcp/compute/instances/start', {
        project: 'test-project',
        instance: 'my-vm',
      });
      const res = await router(req);

      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('zone');
    });

    test('should return 400 when instance is missing', async () => {
      const req = makeRequest('POST', '/api/gcp/compute/instances/start', {
        project: 'test-project',
        zone: 'us-central1-a',
      });
      const res = await router(req);

      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('instance');
    });
  });

  describe('POST /api/gcp/compute/instances/stop', () => {
    test('should return 400 when zone is missing', async () => {
      const req = makeRequest('POST', '/api/gcp/compute/instances/stop', {
        instance: 'my-vm',
      });
      const res = await router(req);

      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/gcp/storage/buckets', () => {
    test('should return 200 with bucket data when project provided', async () => {
      const req = makeRequest('GET', '/api/gcp/storage/buckets', undefined, { project: 'test-project' });
      const res = await router(req);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/gcp/storage/objects', () => {
    test('should return 400 when bucket query param is missing', async () => {
      const req = makeRequest('GET', '/api/gcp/storage/objects');
      const res = await router(req);

      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('bucket');
    });

    test('should return 200 when bucket param is provided', async () => {
      const req = makeRequest('GET', '/api/gcp/storage/objects', undefined, { bucket: 'my-bucket' });
      const res = await router(req);

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/gcp/gke/clusters', () => {
    test('should return 200 with cluster data when project provided', async () => {
      const req = makeRequest('GET', '/api/gcp/gke/clusters', undefined, { project: 'test-project' });
      const res = await router(req);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/gcp/iam/service-accounts', () => {
    test('should return 200 with service account list', async () => {
      const req = makeRequest('GET', '/api/gcp/iam/service-accounts', undefined, { project: 'test-project' });
      const res = await router(req);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/gcp/iam/roles', () => {
    test('should return 200 with role list', async () => {
      const req = makeRequest('GET', '/api/gcp/iam/roles', undefined, { project: 'test-project' });
      const res = await router(req);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/gcp/vpc/networks', () => {
    test('should return 200 with network data when project provided', async () => {
      const req = makeRequest('GET', '/api/gcp/vpc/networks', undefined, { project: 'test-project' });
      const res = await router(req);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/gcp/vpc/subnets', () => {
    test('should return 200 with subnet data', async () => {
      const req = makeRequest('GET', '/api/gcp/vpc/subnets', undefined, {
        project: 'test-project',
        region: 'us-central1',
      });
      const res = await router(req);

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/gcp/discover', () => {
    test('should return 400 when regions field is missing', async () => {
      const req = makeRequest('POST', '/api/gcp/discover', { projectId: 'test-project' });
      const res = await router(req);

      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('regions');
    });

    test('should return 200 with sessionId when valid request is sent', async () => {
      const req = makeRequest('POST', '/api/gcp/discover', {
        projectId: 'test-project',
        regions: ['us-central1'],
      });
      const res = await router(req);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
      expect(body.data.sessionId).toBeDefined();
    });
  });

  describe('GET /api/gcp/discover/:sessionId', () => {
    test('should return 404 for unknown session ID', async () => {
      const req = makeRequest('GET', '/api/gcp/discover/unknown-session-id');
      const res = await router(req);

      expect(res.status).toBe(404);
    });

    test('should return 200 with session data for known session', async () => {
      const req = makeRequest('GET', '/api/gcp/discover/session-123');
      const res = await router(req);

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.success).toBe(true);
      expect(body.data.sessionId).toBe('session-123');
    });
  });

  describe('POST /api/gcp/terraform/generate', () => {
    test('should return 400 when sessionId is missing', async () => {
      const req = makeRequest('POST', '/api/gcp/terraform/generate', {});
      const res = await router(req);

      expect(res.status).toBe(400);
      const body = await json(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('sessionId');
    });

    test('should return 404 when session does not exist', async () => {
      const req = makeRequest('POST', '/api/gcp/terraform/generate', {
        sessionId: 'non-existent-session',
      });
      const res = await router(req);

      expect(res.status).toBe(404);
    });
  });

  describe('Unknown routes', () => {
    test('should return 404 for unknown paths', async () => {
      const req = makeRequest('GET', '/api/gcp/unknown-endpoint');
      const res = await router(req);

      expect(res.status).toBe(404);
    });

    test('should return 404 for root path', async () => {
      const req = makeRequest('GET', '/');
      const res = await router(req);

      expect(res.status).toBe(404);
    });
  });
});
