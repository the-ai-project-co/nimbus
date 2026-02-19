import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Mock dependencies before importing the router
const mockAdapter = {
  getSafetyChecksForOperation: mock((operationId: string) => [] as any[]),
  saveSafetyCheck: mock(() => {}),
  recordApproval: mock(() => {}),
};

mock.module('../../src/storage', () => ({
  getAdapter: mock(() => mockAdapter),
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
}));

mock.module('uuid', () => ({
  v4: mock(() => 'safety-uuid-5678'),
}));

import safetyRouter from '../../src/routes/safety';

function makeRequest(method: string, path: string, body?: any): Request {
  const url = `http://localhost:3011/api/state${path}`;
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, init);
}

describe('Safety Routes', () => {
  beforeEach(() => {
    mockAdapter.getSafetyChecksForOperation.mockClear();
    mockAdapter.saveSafetyCheck.mockClear();
    mockAdapter.recordApproval.mockClear();
  });

  describe('GET /api/state/safety/:operationId', () => {
    test('returns safety checks for an operation', async () => {
      const checks = [
        { id: 'check-001', operationId: 'op-001', checkType: 'cost', checkName: 'cost-limit', passed: true },
        { id: 'check-002', operationId: 'op-001', checkType: 'safety', checkName: 'no-delete', passed: false },
      ];
      mockAdapter.getSafetyChecksForOperation.mockImplementation(() => checks);

      const req = makeRequest('GET', '/safety/op-001');
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.checks).toHaveLength(2);
      expect(data.count).toBe(2);
    });

    test('returns empty checks when operation has none', async () => {
      mockAdapter.getSafetyChecksForOperation.mockImplementation(() => []);

      const req = makeRequest('GET', '/safety/op-no-checks');
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.checks).toHaveLength(0);
      expect(data.count).toBe(0);
    });

    test('handles adapter errors gracefully', async () => {
      mockAdapter.getSafetyChecksForOperation.mockImplementation(() => {
        throw new Error('DB unavailable');
      });

      const req = makeRequest('GET', '/safety/op-error');
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('DB unavailable');
    });
  });

  describe('POST /api/state/safety', () => {
    test('creates a safety check record', async () => {
      const req = makeRequest('POST', '/safety', {
        operationId: 'op-001',
        checkType: 'cost',
        checkName: 'monthly-cost-limit',
        passed: true,
        severity: 'warning',
        message: 'Cost within limits',
        requiresApproval: false,
      });
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();
      expect(mockAdapter.saveSafetyCheck).toHaveBeenCalledTimes(1);
    });

    test('creates a check that requires approval', async () => {
      const req = makeRequest('POST', '/safety', {
        id: 'custom-check-id',
        operationId: 'op-002',
        checkType: 'destructive',
        checkName: 'delete-production-db',
        passed: false,
        severity: 'critical',
        message: 'This will delete production data',
        requiresApproval: true,
      });
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toBe('custom-check-id');
      expect(mockAdapter.saveSafetyCheck).toHaveBeenCalledWith({
        id: 'custom-check-id',
        operationId: 'op-002',
        checkType: 'destructive',
        checkName: 'delete-production-db',
        passed: false,
        severity: 'critical',
        message: 'This will delete production data',
        requiresApproval: true,
      });
    });

    test('returns 400 when checkType is missing', async () => {
      const req = makeRequest('POST', '/safety', {
        operationId: 'op-001',
        // missing checkType
        checkName: 'test',
        passed: true,
      });
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('required');
    });

    test('returns 400 when checkName is missing', async () => {
      const req = makeRequest('POST', '/safety', {
        operationId: 'op-001',
        checkType: 'cost',
        // missing checkName
        passed: true,
      });
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 when passed field is missing', async () => {
      const req = makeRequest('POST', '/safety', {
        operationId: 'op-001',
        checkType: 'cost',
        checkName: 'test-check',
        // missing passed
      });
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('accepts passed=false as a valid value', async () => {
      const req = makeRequest('POST', '/safety', {
        operationId: 'op-003',
        checkType: 'policy',
        checkName: 'no-public-s3',
        passed: false,
      });
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('POST /api/state/safety/:checkId/approve', () => {
    test('records approval for a safety check', async () => {
      const req = makeRequest('POST', '/safety/check-001/approve', {
        approvedBy: 'alice@company.com',
      });
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAdapter.recordApproval).toHaveBeenCalledWith('check-001', 'alice@company.com');
    });

    test('returns 400 when approvedBy is missing', async () => {
      const req = makeRequest('POST', '/safety/check-001/approve', {
        // missing approvedBy
      });
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('approvedBy');
    });

    test('handles adapter error on approval', async () => {
      mockAdapter.recordApproval.mockImplementation(() => {
        throw new Error('Check not found in DB');
      });

      const req = makeRequest('POST', '/safety/nonexistent-check/approve', {
        approvedBy: 'bob@company.com',
      });
      const res = await safetyRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
