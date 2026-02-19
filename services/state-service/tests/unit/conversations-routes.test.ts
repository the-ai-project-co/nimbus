import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { conversationsRouter } from '../../src/routes/conversations';

const mockAdapter = {
  saveConversation: mock(() => {}),
  getConversation: mock((id: string) => null as any),
  listConversations: mock((limit: number, offset: number) => [] as any[]),
  deleteConversation: mock(() => {}),
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

describe('Conversations Routes', () => {
  beforeEach(() => {
    mockAdapter.saveConversation.mockClear();
    mockAdapter.getConversation.mockClear();
    mockAdapter.listConversations.mockClear();
    mockAdapter.deleteConversation.mockClear();
  });

  describe('POST /conversations', () => {
    test('saves a valid conversation', async () => {
      const req = makeRequest('POST', '/conversations', {
        id: 'conv-001',
        title: 'Deploy to production',
        messages: [
          { role: 'user', content: 'deploy my app' },
          { role: 'assistant', content: 'sure, running deploy' },
        ],
        model: 'claude-3',
      });
      const res = await conversationsRouter(req, '/conversations');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('conv-001');
      expect(mockAdapter.saveConversation).toHaveBeenCalledTimes(1);
    });

    test('returns 400 when id is missing', async () => {
      const req = makeRequest('POST', '/conversations', {
        title: 'Test',
        messages: [],
      });
      const res = await conversationsRouter(req, '/conversations');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required fields');
    });

    test('returns 400 when title is missing', async () => {
      const req = makeRequest('POST', '/conversations', {
        id: 'conv-002',
        messages: [],
      });
      const res = await conversationsRouter(req, '/conversations');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('returns 400 when messages is missing', async () => {
      const req = makeRequest('POST', '/conversations', {
        id: 'conv-003',
        title: 'Test',
      });
      const res = await conversationsRouter(req, '/conversations');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('saves conversation with optional metadata', async () => {
      const req = makeRequest('POST', '/conversations', {
        id: 'conv-004',
        title: 'Multi-step deploy',
        messages: [{ role: 'user', content: 'go' }],
        model: 'claude-3-opus',
        metadata: { projectId: 'proj-abc', env: 'staging' },
      });
      const res = await conversationsRouter(req, '/conversations');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockAdapter.saveConversation).toHaveBeenCalledWith(
        'conv-004',
        'Multi-step deploy',
        expect.any(Array),
        'claude-3-opus',
        expect.any(Object)
      );
    });
  });

  describe('GET /conversations', () => {
    test('lists conversations with default pagination', async () => {
      const convs = [
        { id: 'conv-001', title: 'First', messages: [] },
        { id: 'conv-002', title: 'Second', messages: [] },
      ];
      mockAdapter.listConversations.mockImplementation(() => convs);

      const req = makeRequest('GET', '/conversations');
      const res = await conversationsRouter(req, '/conversations');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.pagination.limit).toBe(50);
      expect(data.pagination.offset).toBe(0);
    });

    test('respects custom limit and offset', async () => {
      mockAdapter.listConversations.mockImplementation(() => []);

      const req = makeRequest('GET', '/conversations', undefined, { limit: '5', offset: '10' });
      const res = await conversationsRouter(req, '/conversations');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.pagination.limit).toBe(5);
      expect(data.pagination.offset).toBe(10);
      expect(mockAdapter.listConversations).toHaveBeenCalledWith(5, 10);
    });
  });

  describe('GET /conversations/:id', () => {
    test('returns conversation by ID', async () => {
      const conv = { id: 'conv-001', title: 'Deploy', messages: [] };
      mockAdapter.getConversation.mockImplementation(() => conv);

      const req = makeRequest('GET', '/conversations/conv-001');
      const res = await conversationsRouter(req, '/conversations/conv-001');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('conv-001');
    });

    test('returns 404 when conversation not found', async () => {
      mockAdapter.getConversation.mockImplementation(() => null);

      const req = makeRequest('GET', '/conversations/nonexistent');
      const res = await conversationsRouter(req, '/conversations/nonexistent');
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });
  });

  describe('DELETE /conversations/:id', () => {
    test('deletes conversation successfully', async () => {
      const req = makeRequest('DELETE', '/conversations/conv-001');
      const res = await conversationsRouter(req, '/conversations/conv-001');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('conv-001');
      expect(mockAdapter.deleteConversation).toHaveBeenCalledWith('conv-001');
    });

    test('returns 400 for invalid conversation ID with slashes', async () => {
      const req = makeRequest('DELETE', '/conversations/conv/bad/id');
      const res = await conversationsRouter(req, '/conversations/conv/bad/id');
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.success).toBe(false);
    });
  });

  describe('Method not allowed', () => {
    test('returns 405 for PATCH requests', async () => {
      const req = makeRequest('PATCH', '/conversations');
      const res = await conversationsRouter(req, '/conversations');
      const data = await res.json();

      expect(res.status).toBe(405);
      expect(data.success).toBe(false);
    });
  });
});
