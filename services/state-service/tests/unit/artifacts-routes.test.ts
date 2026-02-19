import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { artifactsRouter } from '../../src/routes/artifacts';

const mockAdapter = {
  saveArtifact: mock(() => {}),
  getArtifact: mock((id: string) => null as any),
  listArtifacts: mock(() => [] as any[]),
  deleteArtifact: mock(() => {}),
};

mock.module('../../src/db/init', () => ({
  initDatabase: mock(async () => ({ adapter: mockAdapter })),
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
}));

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

describe('Artifacts Routes', () => {
  beforeEach(() => {
    mockAdapter.saveArtifact.mockClear();
    mockAdapter.getArtifact.mockClear();
    mockAdapter.listArtifacts.mockClear();
    mockAdapter.deleteArtifact.mockClear();
  });

  describe('POST /artifacts', () => {
    test('saves a valid artifact', async () => {
      const req = makeRequest('POST', '/artifacts', {
        id: 'art-001',
        name: 'main.tf',
        type: 'terraform',
        content: 'resource "aws_instance" "web" {}',
        language: 'hcl',
      });
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('art-001');
      expect(mockAdapter.saveArtifact).toHaveBeenCalledTimes(1);
    });

    test('returns 400 when id is missing', async () => {
      const req = makeRequest('POST', '/artifacts', {
        name: 'main.tf',
        type: 'terraform',
        content: 'resource "aws_instance" {}',
      });
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required fields');
    });

    test('returns 400 when name is missing', async () => {
      const req = makeRequest('POST', '/artifacts', {
        id: 'art-002',
        type: 'terraform',
        content: 'resource {}',
      });
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 when type is missing', async () => {
      const req = makeRequest('POST', '/artifacts', {
        id: 'art-003',
        name: 'main.tf',
        content: 'resource {}',
      });
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 when content is missing', async () => {
      const req = makeRequest('POST', '/artifacts', {
        id: 'art-004',
        name: 'main.tf',
        type: 'terraform',
      });
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('saves artifact with conversation association', async () => {
      const req = makeRequest('POST', '/artifacts', {
        id: 'art-005',
        conversationId: 'conv-001',
        name: 'deployment.yaml',
        type: 'kubernetes',
        content: 'apiVersion: apps/v1',
        language: 'yaml',
        metadata: { cluster: 'prod' },
      });
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAdapter.saveArtifact).toHaveBeenCalledWith(
        'art-005',
        'conv-001',
        'deployment.yaml',
        'kubernetes',
        'apiVersion: apps/v1',
        'yaml',
        expect.any(Object)
      );
    });
  });

  describe('GET /artifacts', () => {
    test('lists all artifacts with defaults', async () => {
      const arts = [
        { id: 'art-001', name: 'main.tf', type: 'terraform' },
        { id: 'art-002', name: 'deploy.yaml', type: 'kubernetes' },
      ];
      mockAdapter.listArtifacts.mockImplementation(() => arts);

      const req = makeRequest('GET', '/artifacts');
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.pagination.limit).toBe(50);
      expect(data.pagination.offset).toBe(0);
    });

    test('filters by type', async () => {
      mockAdapter.listArtifacts.mockImplementation(() => [
        { id: 'art-001', name: 'main.tf', type: 'terraform' },
      ]);

      const req = makeRequest('GET', '/artifacts', undefined, { type: 'terraform' });
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.filters.type).toBe('terraform');
      expect(mockAdapter.listArtifacts).toHaveBeenCalledWith('terraform', undefined, 50, 0);
    });

    test('filters by conversationId', async () => {
      mockAdapter.listArtifacts.mockImplementation(() => []);

      const req = makeRequest('GET', '/artifacts', undefined, { conversationId: 'conv-001' });
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.filters.conversationId).toBe('conv-001');
      expect(mockAdapter.listArtifacts).toHaveBeenCalledWith(undefined, 'conv-001', 50, 0);
    });

    test('respects custom pagination', async () => {
      mockAdapter.listArtifacts.mockImplementation(() => []);

      const req = makeRequest('GET', '/artifacts', undefined, { limit: '10', offset: '5' });
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(data.pagination.limit).toBe(10);
      expect(data.pagination.offset).toBe(5);
    });
  });

  describe('GET /artifacts/:id', () => {
    test('returns artifact by ID', async () => {
      const art = { id: 'art-001', name: 'main.tf', type: 'terraform', content: '...' };
      mockAdapter.getArtifact.mockImplementation(() => art);

      const req = makeRequest('GET', '/artifacts/art-001');
      const res = await artifactsRouter(req, '/artifacts/art-001');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('art-001');
    });

    test('returns 404 when artifact not found', async () => {
      mockAdapter.getArtifact.mockImplementation(() => null);

      const req = makeRequest('GET', '/artifacts/nonexistent');
      const res = await artifactsRouter(req, '/artifacts/nonexistent');
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });
  });

  describe('DELETE /artifacts/:id', () => {
    test('deletes artifact successfully', async () => {
      const req = makeRequest('DELETE', '/artifacts/art-001');
      const res = await artifactsRouter(req, '/artifacts/art-001');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAdapter.deleteArtifact).toHaveBeenCalledWith('art-001');
    });

    test('returns 400 for invalid artifact ID', async () => {
      const req = makeRequest('DELETE', '/artifacts/art/bad');
      const res = await artifactsRouter(req, '/artifacts/art/bad');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Method not allowed', () => {
    test('returns 405 for PUT requests', async () => {
      const req = makeRequest('PUT', '/artifacts');
      const res = await artifactsRouter(req, '/artifacts');
      const data = await res.json();

      expect(res.status).toBe(405);
      expect(data.success).toBe(false);
    });
  });
});
