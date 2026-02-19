import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { templatesRouter } from '../../src/routes/templates';

const mockAdapter = {
  saveTemplate: mock(() => {}),
  getTemplate: mock((id: string) => null as any),
  listTemplates: mock((type?: string) => [] as any[]),
  deleteTemplate: mock(() => {}),
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

describe('Templates Routes', () => {
  beforeEach(() => {
    mockAdapter.saveTemplate.mockClear();
    mockAdapter.getTemplate.mockClear();
    mockAdapter.listTemplates.mockClear();
    mockAdapter.deleteTemplate.mockClear();
  });

  describe('POST /templates', () => {
    test('saves a valid template', async () => {
      const req = makeRequest('POST', '/templates', {
        id: 'tpl-001',
        name: 'ECS Service',
        type: 'terraform',
        content: 'resource "aws_ecs_service" "{{name}}" {}',
        variables: { name: 'my-service' },
      });
      const res = await templatesRouter(req, '/templates');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('tpl-001');
      expect(mockAdapter.saveTemplate).toHaveBeenCalledTimes(1);
    });

    test('returns 400 when id is missing', async () => {
      const req = makeRequest('POST', '/templates', {
        name: 'ECS Service',
        type: 'terraform',
        content: 'resource {}',
      });
      const res = await templatesRouter(req, '/templates');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required fields');
    });

    test('returns 400 when name is missing', async () => {
      const req = makeRequest('POST', '/templates', {
        id: 'tpl-002',
        type: 'terraform',
        content: 'resource {}',
      });
      const res = await templatesRouter(req, '/templates');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 when type is missing', async () => {
      const req = makeRequest('POST', '/templates', {
        id: 'tpl-003',
        name: 'ECS',
        content: 'resource {}',
      });
      const res = await templatesRouter(req, '/templates');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 when content is missing', async () => {
      const req = makeRequest('POST', '/templates', {
        id: 'tpl-004',
        name: 'ECS',
        type: 'terraform',
      });
      const res = await templatesRouter(req, '/templates');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('saves template without optional variables', async () => {
      const req = makeRequest('POST', '/templates', {
        id: 'tpl-005',
        name: 'Simple S3',
        type: 'terraform',
        content: 'resource "aws_s3_bucket" "b" {}',
      });
      const res = await templatesRouter(req, '/templates');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAdapter.saveTemplate).toHaveBeenCalledWith(
        'tpl-005',
        'Simple S3',
        'terraform',
        'resource "aws_s3_bucket" "b" {}',
        undefined
      );
    });
  });

  describe('GET /templates', () => {
    test('lists all templates', async () => {
      const templates = [
        { id: 'tpl-001', name: 'ECS Service', type: 'terraform' },
        { id: 'tpl-002', name: 'K8s Deployment', type: 'kubernetes' },
      ];
      mockAdapter.listTemplates.mockImplementation(() => templates);

      const req = makeRequest('GET', '/templates');
      const res = await templatesRouter(req, '/templates');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.filters.type).toBeNull();
    });

    test('filters templates by type', async () => {
      mockAdapter.listTemplates.mockImplementation(() => [
        { id: 'tpl-001', name: 'ECS Service', type: 'terraform' },
      ]);

      const req = makeRequest('GET', '/templates', undefined, { type: 'terraform' });
      const res = await templatesRouter(req, '/templates');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.filters.type).toBe('terraform');
      expect(mockAdapter.listTemplates).toHaveBeenCalledWith('terraform');
    });
  });

  describe('GET /templates/:id', () => {
    test('returns template by ID', async () => {
      const tpl = { id: 'tpl-001', name: 'ECS', type: 'terraform', content: '...' };
      mockAdapter.getTemplate.mockImplementation(() => tpl);

      const req = makeRequest('GET', '/templates/tpl-001');
      const res = await templatesRouter(req, '/templates/tpl-001');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('tpl-001');
    });

    test('returns 404 when template not found', async () => {
      mockAdapter.getTemplate.mockImplementation(() => null);

      const req = makeRequest('GET', '/templates/nonexistent');
      const res = await templatesRouter(req, '/templates/nonexistent');
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });
  });

  describe('DELETE /templates/:id', () => {
    test('deletes template successfully', async () => {
      const req = makeRequest('DELETE', '/templates/tpl-001');
      const res = await templatesRouter(req, '/templates/tpl-001');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('tpl-001');
      expect(mockAdapter.deleteTemplate).toHaveBeenCalledWith('tpl-001');
    });

    test('returns 400 for invalid template ID with nested slashes', async () => {
      const req = makeRequest('DELETE', '/templates/tpl/bad/id');
      const res = await templatesRouter(req, '/templates/tpl/bad/id');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Method not allowed', () => {
    test('returns 405 for PATCH requests', async () => {
      const req = makeRequest('PATCH', '/templates');
      const res = await templatesRouter(req, '/templates');
      const data = await res.json();

      expect(res.status).toBe(405);
      expect(data.success).toBe(false);
    });
  });
});
