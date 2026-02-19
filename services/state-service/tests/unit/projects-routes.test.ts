import { describe, test, expect, mock, beforeEach, beforeAll, afterAll, spyOn } from 'bun:test';

// Mock storage before importing router
const mockAdapter = {
  listProjects: mock(() => [] as any[]),
  getProject: mock((id: string) => null as any),
  getProjectByPath: mock((path: string) => null as any),
  saveProject: mock(() => {}),
  deleteProject: mock(() => {}),
};

mock.module('../../src/storage', () => ({
  getAdapter: mock(() => mockAdapter),
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
}));

mock.module('uuid', () => ({
  v4: mock(() => 'generated-uuid-1234'),
}));

import projectsRouter from '../../src/routes/projects';

function makeRequest(method: string, path: string, body?: any): Request {
  const url = `http://localhost:3011/api/state${path}`;
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, init);
}

describe('Projects Routes', () => {
  beforeEach(() => {
    mockAdapter.listProjects.mockClear();
    mockAdapter.getProject.mockClear();
    mockAdapter.getProjectByPath.mockClear();
    mockAdapter.saveProject.mockClear();
    mockAdapter.deleteProject.mockClear();
  });

  describe('GET /api/state/projects', () => {
    test('lists all projects', async () => {
      const projects = [
        { id: 'proj-001', name: 'MyApp', path: '/home/user/myapp' },
        { id: 'proj-002', name: 'Backend', path: '/home/user/backend' },
      ];
      mockAdapter.listProjects.mockImplementation(() => projects);

      const req = makeRequest('GET', '/projects');
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.projects).toHaveLength(2);
    });

    test('returns empty array when no projects exist', async () => {
      mockAdapter.listProjects.mockImplementation(() => []);

      const req = makeRequest('GET', '/projects');
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.projects).toHaveLength(0);
    });
  });

  describe('GET /api/state/projects/:id', () => {
    test('returns project by ID', async () => {
      const project = { id: 'proj-001', name: 'MyApp', path: '/home/user/myapp', config: {} };
      mockAdapter.getProject.mockImplementation(() => project);

      const req = makeRequest('GET', '/projects/proj-001');
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.project.id).toBe('proj-001');
    });

    test('returns 404 when project not found', async () => {
      mockAdapter.getProject.mockImplementation(() => null);

      const req = makeRequest('GET', '/projects/nonexistent');
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });
  });

  describe('POST /api/state/projects', () => {
    test('creates a new project', async () => {
      const req = makeRequest('POST', '/projects', {
        name: 'MyApp',
        path: '/home/user/myapp',
        config: { cloud: 'aws', region: 'us-east-1' },
      });
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();
      expect(mockAdapter.saveProject).toHaveBeenCalledTimes(1);
    });

    test('returns 400 when name is missing', async () => {
      const req = makeRequest('POST', '/projects', {
        path: '/home/user/myapp',
        config: {},
      });
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('required');
    });

    test('returns 400 when path is missing', async () => {
      const req = makeRequest('POST', '/projects', {
        name: 'MyApp',
        config: {},
      });
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 when config is missing', async () => {
      const req = makeRequest('POST', '/projects', {
        name: 'MyApp',
        path: '/home/user/myapp',
      });
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('uses provided ID when given', async () => {
      const req = makeRequest('POST', '/projects', {
        id: 'custom-id-123',
        name: 'MyApp',
        path: '/home/user/myapp',
        config: {},
      });
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.id).toBe('custom-id-123');
      expect(mockAdapter.saveProject).toHaveBeenCalledWith('custom-id-123', 'MyApp', '/home/user/myapp', {});
    });
  });

  describe('PUT /api/state/projects/:id', () => {
    test('updates an existing project', async () => {
      const req = makeRequest('PUT', '/projects/proj-001', {
        name: 'MyApp Updated',
        path: '/home/user/myapp',
        config: { cloud: 'aws', region: 'us-west-2' },
      });
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toBe('proj-001');
      expect(mockAdapter.saveProject).toHaveBeenCalledWith(
        'proj-001',
        'MyApp Updated',
        '/home/user/myapp',
        { cloud: 'aws', region: 'us-west-2' }
      );
    });

    test('returns 400 when required fields are missing on update', async () => {
      const req = makeRequest('PUT', '/projects/proj-001', {
        name: 'MyApp',
        // missing path and config
      });
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('DELETE /api/state/projects/:id', () => {
    test('deletes project successfully', async () => {
      const req = makeRequest('DELETE', '/projects/proj-001');
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAdapter.deleteProject).toHaveBeenCalledWith('proj-001');
    });

    test('handles storage errors gracefully', async () => {
      mockAdapter.deleteProject.mockImplementation(() => {
        throw new Error('DB error');
      });

      const req = makeRequest('DELETE', '/projects/proj-999');
      const res = await projectsRouter.fetch(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
    });
  });
});
