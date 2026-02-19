import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { configRouter } from '../../src/routes/config';

// Mock the ConfigurationManager
const mockManager = {
  getAll: mock(() => ({
    llm: {
      providers: {
        anthropic: { apiKey: 'sk-ant-secret', model: 'claude-3' },
      },
    },
    storage: { databaseUrl: 'sqlite://secret.db' },
    ui: { theme: 'dark' },
  })),
  get: mock((key: string) => {
    const data: Record<string, any> = {
      'ui.theme': 'dark',
      'llm.model': 'claude-3',
    };
    return data[key];
  }),
  update: mock(async () => {}),
  set: mock(async () => {}),
  reset: mock(async () => {}),
  load: mock(async () => {}),
};

mock.module('../../src/config/manager', () => ({
  ConfigurationManager: mock(() => mockManager),
}));

mock.module('@nimbus/shared-utils', () => ({
  logger: { info: mock(() => {}), error: mock(() => {}), warn: mock(() => {}), debug: mock(() => {}) },
}));

function makeRequest(method: string, path: string, body?: any): Request {
  const url = `http://localhost:3011/api/state${path}`;
  const init: RequestInit = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return new Request(url, init);
}

describe('Config Routes', () => {
  beforeEach(() => {
    mockManager.getAll.mockClear();
    mockManager.get.mockClear();
    mockManager.update.mockClear();
    mockManager.set.mockClear();
    mockManager.reset.mockClear();
  });

  describe('GET /config', () => {
    test('returns sanitized configuration', async () => {
      const req = makeRequest('GET', '/config');
      const res = await configRouter(req, '/config');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      // API keys should be redacted
      expect(data.data.llm?.providers?.anthropic?.apiKey).toBe('***REDACTED***');
      expect(data.data.storage?.databaseUrl).toBe('***REDACTED***');
    });

    test('non-sensitive config values are preserved', async () => {
      const req = makeRequest('GET', '/config');
      const res = await configRouter(req, '/config');
      const data = await res.json();

      expect(data.data.ui?.theme).toBe('dark');
    });
  });

  describe('GET /config/:path', () => {
    test('returns specific config value', async () => {
      mockManager.get.mockImplementation(() => 'dark');
      const req = makeRequest('GET', '/config/ui.theme');
      const res = await configRouter(req, '/config/ui.theme');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toBe('dark');
    });

    test('returns 404 for unknown config key', async () => {
      mockManager.get.mockImplementation(() => undefined);
      const req = makeRequest('GET', '/config/nonexistent.key');
      const res = await configRouter(req, '/config/nonexistent.key');
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });
  });

  describe('PUT /config', () => {
    test('updates configuration successfully', async () => {
      mockManager.getAll.mockImplementation(() => ({ ui: { theme: 'light' } }));
      const req = makeRequest('PUT', '/config', { ui: { theme: 'light' } });
      const res = await configRouter(req, '/config');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('updated');
      expect(mockManager.update).toHaveBeenCalledTimes(1);
    });

    test('updates a specific config key via path', async () => {
      mockManager.get.mockImplementation(() => 'light');
      const req = makeRequest('PUT', '/config/ui.theme', { value: 'light' });
      const res = await configRouter(req, '/config/ui.theme');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockManager.set).toHaveBeenCalledWith('ui.theme', 'light');
    });
  });

  describe('POST /config/reset', () => {
    test('resets configuration to defaults', async () => {
      mockManager.getAll.mockImplementation(() => ({}));
      const req = makeRequest('POST', '/config/reset');
      const res = await configRouter(req, '/config/reset');
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('reset');
      expect(mockManager.reset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Method not allowed', () => {
    test('returns 405 for DELETE requests', async () => {
      const req = makeRequest('DELETE', '/config');
      const res = await configRouter(req, '/config');
      const data = await res.json();

      expect(res.status).toBe(405);
      expect(data.success).toBe(false);
    });
  });

  describe('Error handling', () => {
    test('handles manager errors gracefully', async () => {
      mockManager.getAll.mockImplementation(() => {
        throw new Error('DB connection failed');
      });
      const req = makeRequest('GET', '/config');
      const res = await configRouter(req, '/config');
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toContain('DB connection failed');
    });
  });
});
