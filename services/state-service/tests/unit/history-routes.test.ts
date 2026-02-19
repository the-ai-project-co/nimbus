import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { historyRouter } from '../../src/routes/history';

const mockAdapter = {
  saveOperation: mock(() => {}),
  getOperation: mock((id: string) => null as any),
  listOperations: mock((limit: number, offset: number) => [] as any[]),
  listOperationsByType: mock((type: string, limit: number, offset: number) => [] as any[]),
};

mock.module('../../src/db/init', () => ({
  initDatabase: mock(async () => ({ adapter: mockAdapter })),
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
}));

mock.module('@nimbus/shared-types', () => ({}));

function makeRequest(method: string, path: string, body?: any, query?: Record<string, string>): Request {
  let url = `http://localhost:3011/api/state${path}`;
  if (query) {
    const params = new URLSearchParams(query);
    url += `?${params.toString()}`;
  }
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, init);
}

describe('History Routes', () => {
  beforeEach(() => {
    mockAdapter.saveOperation.mockClear();
    mockAdapter.getOperation.mockClear();
    mockAdapter.listOperations.mockClear();
    mockAdapter.listOperationsByType.mockClear();
  });

  describe('POST /history', () => {
    test('saves a valid operation', async () => {
      const req = makeRequest('POST', '/history', {
        id: 'op-001',
        type: 'terraform',
        command: 'terraform apply',
        status: 'success',
      });
      const res = await historyRouter(req, '/history');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('op-001');
      expect(mockAdapter.saveOperation).toHaveBeenCalledTimes(1);
    });

    test('returns 400 when required fields are missing', async () => {
      const req = makeRequest('POST', '/history', {
        id: 'op-002',
        // missing type and command
      });
      const res = await historyRouter(req, '/history');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required fields');
    });

    test('uses current timestamp when not provided', async () => {
      const req = makeRequest('POST', '/history', {
        id: 'op-003',
        type: 'helm',
        command: 'helm install',
      });
      const res = await historyRouter(req, '/history');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      // Verify saveOperation was called with a Date timestamp
      const callArgs = mockAdapter.saveOperation.mock.calls[0];
      expect(callArgs[0].timestamp).toBeInstanceOf(Date);
    });

    test('accepts operation with all optional fields', async () => {
      const req = makeRequest('POST', '/history', {
        id: 'op-004',
        type: 'k8s',
        command: 'kubectl apply',
        input: '{"manifest":"..."}',
        output: 'created',
        status: 'success',
        durationMs: 1200,
        model: 'claude-3',
        tokensUsed: 500,
        costUsd: 0.01,
        metadata: { env: 'prod' },
      });
      const res = await historyRouter(req, '/history');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('GET /history', () => {
    test('lists operations with default pagination', async () => {
      const ops = [
        { id: 'op-001', type: 'terraform', command: 'apply', status: 'success' },
        { id: 'op-002', type: 'helm', command: 'install', status: 'success' },
      ];
      mockAdapter.listOperations.mockImplementation(() => ops);

      const req = makeRequest('GET', '/history');
      const res = await historyRouter(req, '/history');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.pagination.limit).toBe(50);
      expect(data.pagination.offset).toBe(0);
    });

    test('filters by type when provided', async () => {
      const ops = [{ id: 'op-001', type: 'terraform', command: 'apply', status: 'success' }];
      mockAdapter.listOperationsByType.mockImplementation(() => ops);

      const req = makeRequest('GET', '/history', undefined, { type: 'terraform' });
      const res = await historyRouter(req, '/history');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAdapter.listOperationsByType).toHaveBeenCalledWith('terraform', 50, 0);
      expect(data.filters.type).toBe('terraform');
    });

    test('respects custom limit and offset', async () => {
      mockAdapter.listOperations.mockImplementation(() => []);

      const req = makeRequest('GET', '/history', undefined, { limit: '10', offset: '20' });
      const res = await historyRouter(req, '/history');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.offset).toBe(20);
      expect(mockAdapter.listOperations).toHaveBeenCalledWith(10, 20);
    });
  });

  describe('GET /history/:id', () => {
    test('returns operation by ID', async () => {
      const op = { id: 'op-001', type: 'terraform', command: 'apply', status: 'success' };
      mockAdapter.getOperation.mockImplementation(() => op);

      const req = makeRequest('GET', '/history/op-001');
      const res = await historyRouter(req, '/history/op-001');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('op-001');
    });

    test('returns 404 when operation not found', async () => {
      mockAdapter.getOperation.mockImplementation(() => null);

      const req = makeRequest('GET', '/history/nonexistent');
      const res = await historyRouter(req, '/history/nonexistent');
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });
  });

  describe('Method not allowed', () => {
    test('returns 405 for unsupported methods', async () => {
      const req = makeRequest('DELETE', '/history');
      const res = await historyRouter(req, '/history');
      const data = await res.json();

      expect(res.status).toBe(405);
      expect(data.success).toBe(false);
    });
  });
});
