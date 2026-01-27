import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { RestClient } from '../src/rest-client';

// Mock server for testing
const mockServer = Bun.serve({
  port: 4000,
  fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/health') {
      return Response.json({ status: 'healthy' });
    }

    if (url.pathname === '/echo' && req.method === 'POST') {
      return req.json().then(body => Response.json(body));
    }

    return new Response('Not Found', { status: 404 });
  },
});

describe('RestClient', () => {
  const client = new RestClient('http://localhost:4000');

  afterAll(() => {
    mockServer.stop();
  });

  test('GET request returns successful response', async () => {
    const response = await client.get('/health');

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ status: 'healthy' });
  });

  test('POST request sends and receives data', async () => {
    const testData = { message: 'Hello' };
    const response = await client.post('/echo', testData);

    expect(response.success).toBe(true);
    expect(response.data).toEqual(testData);
  });

  test('healthCheck returns true for healthy service', async () => {
    const isHealthy = await client.healthCheck();
    expect(isHealthy).toBe(true);
  });

  test('GET to unknown endpoint returns error', async () => {
    const response = await client.get('/unknown');

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe('HTTP_404');
  });
});
