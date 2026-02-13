import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startServer } from '../../src/server';

describe('Conversational Generation Integration', () => {
  let server: any;
  const PORT = 3053; // Use unique port for integration tests
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    server = await startServer(PORT, 3153);
  });

  afterAll(() => {
    server.stop();
  });

  describe('POST /api/conversational/message', () => {
    test('should process a generate intent message', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const response = await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS for production in us-east-1',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.intent.type).toBe('generate');
      expect(data.data.extracted_requirements).toBeDefined();
      expect(data.data.extracted_requirements.provider).toBe('aws');
      expect(data.data.extracted_requirements.components).toContain('vpc');
      expect(data.data.extracted_requirements.environment).toBe('production');
    });

    test('should maintain session context across messages', async () => {
      const sessionId = `test-session-${Date.now()}`;

      // First message
      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      // Second message should add to context.
      // Use "Create an EKS cluster" so the intent parser can match the
      // generate pattern and extract "eks" as a component entity.
      const response = await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create an EKS cluster',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      // Session should maintain AWS as provider from first message
      expect(data.data.context.infrastructure_stack?.provider).toBe('aws');
      expect(data.data.context.infrastructure_stack?.components).toContain('vpc');
      expect(data.data.context.infrastructure_stack?.components).toContain('eks');
    });

    test('should request clarification for incomplete requests', async () => {
      const sessionId = `test-session-${Date.now()}`;
      const response = await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create infrastructure',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.needs_clarification).toBeDefined();
      expect(data.data.needs_clarification.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/generate/from-conversation', () => {
    test('should generate terraform files from complete conversation', async () => {
      const sessionId = `test-session-${Date.now()}`;

      // Build up conversation context
      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC and S3 bucket on AWS for production in us-east-1',
        }),
      });

      // Generate infrastructure
      const response = await fetch(`${BASE_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          applyBestPractices: false,
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.generated_files).toBeDefined();
      expect(data.data.stack).toBeDefined();
      expect(data.data.stack.provider).toBe('aws');
      expect(data.data.stack.components).toBeDefined();
      expect(data.data.configuration).toBeDefined();
    });

    test('should fail for session without sufficient context', async () => {
      const sessionId = `test-session-${Date.now()}`;

      // Create minimal session (no components)
      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'hello',
        }),
      });

      // Try to generate
      const response = await fetch(`${BASE_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Insufficient information');
    });

    test('should fail for non-existent session', async () => {
      const response = await fetch(`${BASE_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'non-existent-session',
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Session not found');
    });

    test('should apply best practices when requested', async () => {
      const sessionId = `test-session-${Date.now()}`;

      // Build conversation
      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS for production',
        }),
      });

      // Generate with best practices
      const response = await fetch(`${BASE_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          applyBestPractices: true,
          autofix: true,
        }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.best_practices_report).toBeDefined();
    });

    test('should map production environment to appropriate defaults', async () => {
      const sessionId = `test-session-${Date.now()}`;

      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS for production',
        }),
      });

      const response = await fetch(`${BASE_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      const config = data.data.configuration;
      // Production should have NAT gateway enabled
      expect(config.create_nat_gateway).toBe(true);
      // Production should have flow logs
      expect(config.enable_flow_logs).toBe(true);
      // Production should have multi-AZ
      expect(config.multi_az).toBe(true);
    });
  });

  describe('GET /api/conversational/session/:sessionId', () => {
    test('should return session state', async () => {
      const sessionId = `test-session-${Date.now()}`;

      // Create session with messages
      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      const response = await fetch(`${BASE_URL}/api/conversational/session/${sessionId}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.session_id).toBe(sessionId);
      expect(data.data.infrastructure_stack).toBeDefined();
    });

    test('should return error for non-existent session', async () => {
      const response = await fetch(`${BASE_URL}/api/conversational/session/non-existent`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.error).toContain('Session not found');
    });
  });

  describe('GET /api/conversational/history/:sessionId', () => {
    test('should return conversation history', async () => {
      const sessionId = `test-session-${Date.now()}`;

      // Create conversation
      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Add EKS cluster',
        }),
      });

      const response = await fetch(`${BASE_URL}/api/conversational/history/${sessionId}`);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('POST /api/conversational/clear/:sessionId', () => {
    test('should clear conversation history', async () => {
      const sessionId = `test-session-${Date.now()}`;

      // Create conversation
      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      // Clear history
      const clearResponse = await fetch(`${BASE_URL}/api/conversational/clear/${sessionId}`, {
        method: 'POST',
      });

      expect(clearResponse.status).toBe(200);

      // Verify history is cleared
      const historyResponse = await fetch(`${BASE_URL}/api/conversational/history/${sessionId}`);
      const historyData = await historyResponse.json();

      expect(historyData.success).toBe(true);
      expect(historyData.data.length).toBe(0);
    });
  });

  describe('DELETE /api/conversational/session/:sessionId', () => {
    test('should delete session', async () => {
      const sessionId = `test-session-${Date.now()}`;

      // Create session
      await fetch(`${BASE_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      // Delete session
      const deleteResponse = await fetch(`${BASE_URL}/api/conversational/session/${sessionId}`, {
        method: 'DELETE',
      });

      expect(deleteResponse.status).toBe(200);

      // Verify session is deleted
      const sessionResponse = await fetch(`${BASE_URL}/api/conversational/session/${sessionId}`);
      const sessionData = await sessionResponse.json();

      expect(sessionData.success).toBe(false);
    });
  });
});
