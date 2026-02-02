import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../../services/k8s-tools-service/src/server';

describe('Kubernetes Tools Service', () => {
  let server: any;
  const PORT = 3207; // Unique port for health tests

  beforeAll(async () => {
    server = await startServer(PORT);
  });

  afterAll(() => {
    server.stop();
  });

  test('health endpoint returns healthy status', async () => {
    const response = await fetch(`http://localhost:${PORT}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('k8s-tools-service');
  });
});
