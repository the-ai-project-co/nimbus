/**
 * Integration tests for LLM Service
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';

const HTTP_PORT = 3002;
const WS_PORT = 3102;
const BASE_URL = `http://localhost:${HTTP_PORT}`;
const WS_URL = `ws://localhost:${WS_PORT}`;

let serviceProcess: any;

beforeAll(async () => {
  // Note: In real tests, you would start the service here
  // For now, we assume the service is running
});

afterAll(async () => {
  // Cleanup
});

describe('LLM Service - HTTP Endpoints', () => {
  test('health endpoint returns healthy status', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('llm-service');
    expect(data.uptime).toBeGreaterThan(0);
  });

  test('models endpoint returns available models', async () => {
    const response = await fetch(`${BASE_URL}/api/llm/models`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.models).toBeDefined();
    expect(data.providers).toBeDefined();
    expect(Array.isArray(data.providers)).toBe(true);
  });

  test('chat endpoint requires messages', async () => {
    const response = await fetch(`${BASE_URL}/api/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  test('token count endpoint counts tokens', async () => {
    const response = await fetch(`${BASE_URL}/api/llm/tokens/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello, world!',
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.tokenCount).toBeGreaterThan(0);
    expect(data.textLength).toBe(13);
  });
});

describe('LLM Service - WebSocket', () => {
  test('websocket health endpoint returns healthy status', async () => {
    const response = await fetch(`http://localhost:${WS_PORT}/health`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('healthy');
    expect(data.service).toBe('llm-service-websocket');
    expect(data.connectedClients).toBeGreaterThanOrEqual(0);
  });
});
