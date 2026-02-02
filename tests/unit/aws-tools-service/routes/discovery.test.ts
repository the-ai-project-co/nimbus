/**
 * Discovery API Routes Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { startServer, type ServerInstances } from '../../../../services/aws-tools-service/src/server';

const TEST_PORT = 13011;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let server: ServerInstances;

describe('Discovery API Routes', () => {
  beforeAll(async () => {
    server = await startServer(TEST_PORT);
  });

  afterAll(() => {
    server.stop();
  });

  describe('GET /api/aws/profiles', () => {
    it('returns list of AWS profiles', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/profiles`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.profiles).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/aws/profiles/validate', () => {
    it('validates credentials (may fail without real AWS creds)', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/profiles/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // This will either succeed (with valid credentials) or return validation result
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('valid');
    });
  });

  describe('GET /api/aws/regions', () => {
    it('returns list of AWS regions', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/regions`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.regions).toBeInstanceOf(Array);
      expect(data.data.total).toBeGreaterThan(0);
    });

    it('supports grouped parameter', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/regions?grouped=true`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.regions).toBeDefined();
    });
  });

  describe('POST /api/aws/regions/validate', () => {
    it('validates provided regions', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/regions/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          regions: ['us-east-1', 'us-west-2', 'invalid-region'],
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.valid).toBeInstanceOf(Array);
      expect(data.data.invalid).toBeInstanceOf(Array);
      expect(data.data.valid).toContain('us-east-1');
      expect(data.data.valid).toContain('us-west-2');
      expect(data.data.invalid).toContain('invalid-region');
    });

    it('returns error when regions not provided', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/regions/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('regions');
    });
  });

  describe('POST /api/aws/discover', () => {
    it('returns error when regions not provided', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('regions');
    });

    // Note: Full discovery tests require valid AWS credentials
    // These are integration tests that should be run separately
  });

  describe('GET /api/aws/discover/:sessionId', () => {
    it('returns 404 for non-existent session', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/discover/non-existent-session`);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('not found');
    });
  });

  describe('POST /api/aws/discover/:sessionId/cancel', () => {
    it('returns error for non-existent session', async () => {
      const response = await fetch(`${BASE_URL}/api/aws/discover/non-existent-session/cancel`, {
        method: 'POST',
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });
});
