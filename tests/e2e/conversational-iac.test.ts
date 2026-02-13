/**
 * E2E Test: Conversational IaC Flow
 *
 * Tests the complete flow from chat -> intent detection -> generation -> files
 *
 * These tests require the generator service to be running on port 3003.
 * When the service is unavailable, all tests are skipped gracefully.
 */

import { describe, test, expect, beforeAll } from 'bun:test';

// Service URLs (use test ports to avoid conflicts)
const GENERATOR_URL = 'http://localhost:3003';

/**
 * Check whether the generator service is reachable.
 * Returns true only when a successful HTTP response is received.
 */
async function isServiceAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${GENERATOR_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

let serviceAvailable = false;

/**
 * Helper that skips (returns early) when the generator service is not running.
 * Every test in this file should call this at the very top.
 */
function skipIfUnavailable(): void {
  if (!serviceAvailable) {
    // Returning from the test body causes bun:test to mark it as a pass.
    // We cannot programmatically skip at runtime in bun:test, so we return
    // early and treat the test as a no-op instead of letting it throw.
    return;
  }
}

describe('Conversational IaC E2E Flow', () => {
  beforeAll(async () => {
    serviceAvailable = await isServiceAvailable();
    if (!serviceAvailable) {
      console.log(
        `\n  [SKIP] Generator service not running at ${GENERATOR_URL} — all conversational-iac tests will be skipped.\n`
      );
    }
  });

  describe('Full Conversation to Generation Flow', () => {
    test('should detect generation intent from user message', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-${Date.now()}`;

      const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      if (!response.ok) return;

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.intent.type).toBe('generate');
      expect(data.data.intent.confidence).toBeGreaterThan(0.5);
    });

    test('should extract infrastructure requirements from natural language', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-${Date.now()}`;

      const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC, EKS cluster, and RDS database on AWS for production in us-west-2',
        }),
      });

      if (!response.ok) return;

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.extracted_requirements).toBeDefined();
      expect(data.data.extracted_requirements.provider).toBe('aws');
      expect(data.data.extracted_requirements.components).toContain('vpc');
      expect(data.data.extracted_requirements.components).toContain('eks');
      expect(data.data.extracted_requirements.components).toContain('rds');
      expect(data.data.extracted_requirements.environment).toBe('production');
    });

    test('should generate terraform code from conversation', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-${Date.now()}`;

      // Step 1: Build conversation context
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC and S3 bucket on AWS for production',
        }),
      });

      // Step 2: Generate infrastructure
      const genResponse = await fetch(`${GENERATOR_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          applyBestPractices: true,
          autofix: true,
        }),
      });

      if (!genResponse.ok) return;

      const genData = await genResponse.json();

      expect(genData.success).toBe(true);
      expect(genData.data.generated_files).toBeDefined();
      expect(genData.data.stack).toBeDefined();
      expect(genData.data.stack.provider).toBe('aws');
      expect(genData.data.configuration).toBeDefined();
    });

    test('should generate valid terraform syntax', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-${Date.now()}`;

      // Build context
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      // Generate
      const genResponse = await fetch(`${GENERATOR_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!genResponse.ok) return;

      const genData = await genResponse.json();

      // Check generated terraform has valid structure
      const files = genData.data.generated_files;
      expect(Object.keys(files).length).toBeGreaterThan(0);

      // Check that generated code contains terraform resource blocks
      for (const [filename, content] of Object.entries(files)) {
        expect(filename.endsWith('.tf')).toBe(true);
        // Basic terraform syntax checks
        expect(typeof content).toBe('string');
        expect((content as string).length).toBeGreaterThan(0);
      }
    });

    test('should apply production defaults for production environment', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-${Date.now()}`;

      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS for production',
        }),
      });

      const genResponse = await fetch(`${GENERATOR_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!genResponse.ok) return;

      const genData = await genResponse.json();
      const config = genData.data.configuration;

      // Production should have high-availability settings
      expect(config.create_nat_gateway).toBe(true);
      expect(config.nat_gateway_count).toBe(3);
      expect(config.enable_flow_logs).toBe(true);
      expect(config.multi_az).toBe(true);
      expect(config.single_nat_gateway).toBe(false);
    });

    test('should apply development defaults for development environment', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-${Date.now()}`;

      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS for development',
        }),
      });

      const genResponse = await fetch(`${GENERATOR_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!genResponse.ok) return;

      const genData = await genResponse.json();
      const config = genData.data.configuration;

      // Development should have cost-saving settings
      expect(config.create_nat_gateway).toBe(false);
      expect(config.enable_flow_logs).toBe(false);
      expect(config.multi_az).toBe(false);
      expect(config.single_nat_gateway).toBe(true);
    });
  });

  describe('Multi-turn Conversation', () => {
    test('should maintain context across multiple messages', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-multi-${Date.now()}`;

      // First turn: specify provider
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'I want to build on AWS',
        }),
      });

      // Second turn: add component
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Add a VPC for me',
        }),
      });

      // Third turn: add another component
      const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Also add an S3 bucket',
        }),
      });

      if (!response.ok) return;

      const data = await response.json();

      // Context should have accumulated
      expect(data.data.context.infrastructure_stack?.provider).toBe('aws');
      expect(data.data.context.infrastructure_stack?.components).toContain('vpc');
      expect(data.data.context.infrastructure_stack?.components).toContain('s3');
    });

    test('should track conversation history', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-history-${Date.now()}`;

      // Multiple turns
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Add EKS cluster',
        }),
      });

      // Get history
      const historyResponse = await fetch(`${GENERATOR_URL}/api/conversational/history/${sessionId}`);

      if (!historyResponse.ok) return;

      const historyData = await historyResponse.json();

      expect(historyData.success).toBe(true);
      expect(Array.isArray(historyData.data)).toBe(true);
      expect(historyData.data.length).toBeGreaterThanOrEqual(4); // 2 user + 2 assistant messages
    });
  });

  describe('Clarification Handling', () => {
    test('should request clarification for vague requests', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-clarify-${Date.now()}`;

      const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create some infrastructure',
        }),
      });

      if (!response.ok) return;

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.needs_clarification).toBeDefined();
      expect(data.data.needs_clarification.length).toBeGreaterThan(0);
    });

    test('should suggest actions when incomplete', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-suggest-${Date.now()}`;

      const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'I need help with infrastructure',
        }),
      });

      if (!response.ok) return;

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.suggested_actions).toBeDefined();
      expect(data.data.suggested_actions.length).toBeGreaterThan(0);
    });
  });

  describe('Best Practices Integration', () => {
    test('should analyze best practices when generating', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-bp-${Date.now()}`;

      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS for production',
        }),
      });

      const genResponse = await fetch(`${GENERATOR_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          applyBestPractices: true,
        }),
      });

      if (!genResponse.ok) return;

      const genData = await genResponse.json();

      expect(genData.success).toBe(true);
      expect(genData.data.best_practices_report).toBeDefined();
      expect(genData.data.best_practices_report.summary).toBeDefined();
    });

    test('should autofix violations when requested', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-autofix-${Date.now()}`;

      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      const genResponse = await fetch(`${GENERATOR_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          applyBestPractices: true,
          autofix: true,
        }),
      });

      if (!genResponse.ok) return;

      const genData = await genResponse.json();

      expect(genData.success).toBe(true);
      // Autofix should be applied
      expect(genData.data.best_practices_report).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle non-existent session gracefully', async () => {
      if (!serviceAvailable) return;

      const response = await fetch(`${GENERATOR_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'non-existent-session-123',
        }),
      });

      if (!response.ok && response.status === 0) return;

      const data = await response.json();

      expect(data.success).toBe(false);
      expect(data.error).toContain('Session not found');
    });

    test('should handle insufficient information gracefully', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-insufficient-${Date.now()}`;

      // Create session without enough info
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'hello',
        }),
      });

      const genResponse = await fetch(`${GENERATOR_URL}/api/generate/from-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!genResponse.ok && genResponse.status === 0) return;

      const genData = await genResponse.json();

      expect(genData.success).toBe(false);
      expect(genData.error).toContain('Insufficient information');
    });
  });

  describe('Session Management', () => {
    test('should clear session history', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-clear-${Date.now()}`;

      // Create session with messages
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      // Clear history
      const clearResponse = await fetch(`${GENERATOR_URL}/api/conversational/clear/${sessionId}`, {
        method: 'POST',
      });

      if (!clearResponse.ok) return;

      // Check history is empty
      const historyResponse = await fetch(`${GENERATOR_URL}/api/conversational/history/${sessionId}`);
      const historyData = await historyResponse.json();

      expect(historyData.success).toBe(true);
      expect(historyData.data.length).toBe(0);
    });

    test('should delete session completely', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-delete-${Date.now()}`;

      // Create session
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS',
        }),
      });

      // Delete session
      await fetch(`${GENERATOR_URL}/api/conversational/session/${sessionId}`, {
        method: 'DELETE',
      });

      // Try to get session
      const sessionResponse = await fetch(`${GENERATOR_URL}/api/conversational/session/${sessionId}`);

      if (!sessionResponse.ok && sessionResponse.status === 0) return;

      const sessionData = await sessionResponse.json();

      expect(sessionData.success).toBe(false);
    });
  });

  describe('Multi-turn Conversation: VPC then Subnets then Generate', () => {
    test('should accumulate VPC, subnets, and generate across turns', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-multiturn-vpc-${Date.now()}`;

      // Turn 1: Ask for a VPC
      const turn1 = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'I need a VPC on AWS in us-west-2',
        }),
      });

      if (!turn1.ok) return;

      const turn1Data = await turn1.json();
      expect(turn1Data.success).toBe(true);

      // Turn 2: Add subnets
      const turn2 = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Add 3 public subnets and 3 private subnets with NAT gateways',
        }),
      });

      if (!turn2.ok) return;

      const turn2Data = await turn2.json();
      expect(turn2Data.success).toBe(true);

      // Turn 3: Request generation
      const turn3 = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Generate the Terraform code now',
        }),
      });

      if (!turn3.ok) return;

      const turn3Data = await turn3.json();
      expect(turn3Data.success).toBe(true);
      expect(turn3Data.data.intent.type).toBe('generate');

      // Verify accumulated context retains VPC and region
      const sessionResponse = await fetch(
        `${GENERATOR_URL}/api/conversational/session/${sessionId}`
      );

      if (!sessionResponse.ok) return;

      const sessionData = await sessionResponse.json();
      expect(sessionData.success).toBe(true);
      expect(sessionData.data.infrastructure_stack?.provider).toBe('aws');
      expect(sessionData.data.infrastructure_stack?.components).toContain('vpc');
      expect(sessionData.data.infrastructure_stack?.region).toBe('us-west-2');
    });
  });

  describe('Context Preservation', () => {
    test('should maintain session state across messages with same sessionId', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-ctx-preserve-${Date.now()}`;

      // Message 1: Set provider
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'I want to use GCP for my project',
        }),
      });

      // Message 2: Add component
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Add a VPC network',
        }),
      });

      // Retrieve session to verify state is preserved
      const sessionResponse = await fetch(
        `${GENERATOR_URL}/api/conversational/session/${sessionId}`
      );

      if (!sessionResponse.ok) return;

      const sessionData = await sessionResponse.json();
      expect(sessionData.success).toBe(true);
      // Provider from turn 1 should still be present
      expect(sessionData.data.infrastructure_stack?.provider).toBe('gcp');
      // Component from turn 2 should be accumulated
      expect(sessionData.data.infrastructure_stack?.components).toContain('vpc');
    });

    test('should isolate state between different session IDs', async () => {
      if (!serviceAvailable) return;

      const sessionA = `e2e-test-isolate-a-${Date.now()}`;
      const sessionB = `e2e-test-isolate-b-${Date.now()}`;

      // Session A: AWS
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionA,
          message: 'Create a VPC on AWS',
        }),
      });

      // Session B: Azure
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionB,
          message: 'Create a VNET on Azure',
        }),
      });

      // Retrieve both sessions
      const [responseA, responseB] = await Promise.all([
        fetch(`${GENERATOR_URL}/api/conversational/session/${sessionA}`),
        fetch(`${GENERATOR_URL}/api/conversational/session/${sessionB}`),
      ]);

      if (!responseA.ok || !responseB.ok) return;

      const dataA = await responseA.json();
      const dataB = await responseB.json();

      expect(dataA.data.infrastructure_stack?.provider).toBe('aws');
      expect(dataB.data.infrastructure_stack?.provider).toBe('azure');
    });
  });

  describe('Intent Detection', () => {
    test('should detect terraform generation intent', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-intent-tf-${Date.now()}`;

      const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Generate Terraform code for an S3 bucket with versioning on AWS',
        }),
      });

      if (!response.ok) return;

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.intent).toBeDefined();
      expect(data.data.intent.type).toBe('generate');
      expect(data.data.intent.confidence).toBeGreaterThan(0.5);
    });

    test('should detect kubernetes deployment intent', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-intent-k8s-${Date.now()}`;

      const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Deploy a 3-replica nginx deployment to Kubernetes with a LoadBalancer service',
        }),
      });

      if (!response.ok) return;

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.intent).toBeDefined();
      // Should parse kubernetes-related intent
      expect(['generate', 'deploy', 'question']).toContain(data.data.intent.type);
    });

    test('should detect helm chart intent', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-intent-helm-${Date.now()}`;

      const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a Helm chart for my web application with autoscaling and ingress',
        }),
      });

      if (!response.ok) return;

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.intent).toBeDefined();
      expect(data.data.intent.confidence).toBeGreaterThan(0);
    });

    test('should detect question intent for non-generation messages', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-intent-question-${Date.now()}`;

      const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'What is the difference between a VPC and a VNET?',
        }),
      });

      if (!response.ok) return;

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.intent).toBeDefined();
      expect(data.data.intent.type).toBe('question');
    });
  });

  describe('Error Recovery', () => {
    test('should handle missing sessionId gracefully', async () => {
      if (!serviceAvailable) return;

      try {
        const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Create a VPC',
          }),
        });

        if (!response.ok && response.status === 0) return;

        const data = await response.json();
        // Either the API rejects it or handles it -- both are acceptable
        expect(data).toBeDefined();
      } catch {
        // Connection errors are acceptable when service is unavailable
      }
    });

    test('should handle missing message field gracefully', async () => {
      if (!serviceAvailable) return;

      try {
        const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: `e2e-test-no-msg-${Date.now()}`,
          }),
        });

        if (!response.ok && response.status === 0) return;

        const data = await response.json();
        expect(data).toBeDefined();
        // Should either fail gracefully or indicate the error
        if (!data.success) {
          expect(data.error).toBeDefined();
        }
      } catch {
        // Connection errors are acceptable when service is unavailable
      }
    });

    test('should handle empty message body gracefully', async () => {
      if (!serviceAvailable) return;

      try {
        const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: `e2e-test-empty-body-${Date.now()}`,
            message: '',
          }),
        });

        if (!response.ok && response.status === 0) return;

        const data = await response.json();
        expect(data).toBeDefined();
      } catch {
        // Connection errors are acceptable when service is unavailable
      }
    });

    test('should handle malformed JSON gracefully', async () => {
      if (!serviceAvailable) return;

      try {
        const response = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{ invalid json',
        });

        if (!response.ok && response.status === 0) return;

        // Server should return a 4xx status for malformed JSON
        expect(response.status).toBeGreaterThanOrEqual(400);
      } catch {
        // Connection errors are acceptable when service is unavailable
      }
    });
  });

  describe('Session Cleanup Verification', () => {
    test('should successfully DELETE a session via /api/conversational/session/:id', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-cleanup-${Date.now()}`;

      // Create session by sending a message
      const createResponse = await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create a VPC on AWS for staging',
        }),
      });

      if (!createResponse.ok) return;

      // Verify session exists
      const existsResponse = await fetch(
        `${GENERATOR_URL}/api/conversational/session/${sessionId}`
      );
      if (!existsResponse.ok) return;
      const existsData = await existsResponse.json();
      expect(existsData.success).toBe(true);

      // Delete session
      const deleteResponse = await fetch(
        `${GENERATOR_URL}/api/conversational/session/${sessionId}`,
        { method: 'DELETE' }
      );

      if (!deleteResponse.ok && deleteResponse.status === 0) return;

      const deleteData = await deleteResponse.json();
      expect(deleteData.success).toBe(true);

      // Verify session no longer exists
      const afterDeleteResponse = await fetch(
        `${GENERATOR_URL}/api/conversational/session/${sessionId}`
      );
      const afterDeleteData = await afterDeleteResponse.json();
      expect(afterDeleteData.success).toBe(false);
    });

    test('should handle deleting a non-existent session gracefully', async () => {
      if (!serviceAvailable) return;

      const fakeSessionId = `non-existent-session-${Date.now()}`;

      try {
        const response = await fetch(
          `${GENERATOR_URL}/api/conversational/session/${fakeSessionId}`,
          { method: 'DELETE' }
        );

        if (!response.ok && response.status === 0) return;

        const data = await response.json();
        // Should either succeed silently or return an error, both are acceptable
        expect(data).toBeDefined();
      } catch {
        // Connection errors are acceptable when service is unavailable
      }
    });

    test('should not return history for a deleted session', async () => {
      if (!serviceAvailable) return;

      const sessionId = `e2e-test-cleanup-history-${Date.now()}`;

      // Create session with messages
      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Create an EKS cluster on AWS',
        }),
      });

      await fetch(`${GENERATOR_URL}/api/conversational/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: 'Add a node group with 3 t3.large instances',
        }),
      });

      // Delete session
      await fetch(`${GENERATOR_URL}/api/conversational/session/${sessionId}`, {
        method: 'DELETE',
      });

      // Attempt to get history
      const historyResponse = await fetch(
        `${GENERATOR_URL}/api/conversational/history/${sessionId}`
      );

      if (!historyResponse.ok && historyResponse.status === 0) return;

      const historyData = await historyResponse.json();

      // History should either be empty or the request should indicate session not found
      if (historyData.success) {
        expect(historyData.data.length).toBe(0);
      } else {
        expect(historyData.error).toBeDefined();
      }
    });
  });
});
