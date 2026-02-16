import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../src/server';

describe('CLI Service', () => {
  let server: any;
  const PORT = 30000 + Math.floor(Math.random() * 10000);
  const WS_PORT = PORT + 100;

  beforeAll(async () => {
    server = await startServer(PORT, WS_PORT);
  });

  afterAll(() => {
    try { server?.stop(); } catch { /* ignore */ }
  });

  test('health endpoint returns healthy status', async () => {
    const response = await fetch(`http://localhost:${PORT}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('cli-service');
  });
});
