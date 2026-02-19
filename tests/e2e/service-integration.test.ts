/**
 * E2E Test: Service Integration
 *
 * Starts actual service instances on ephemeral test ports and exercises real
 * HTTP calls between them. No fetch mocking, no deterministic stubs -- every
 * assertion validates a genuine request/response cycle.
 *
 * Services under test:
 *   - State Service   (config, conversations, history, artifacts)
 *   - Generator Service (questionnaire, best-practices, conversational, templates)
 *   - Core Engine Service (tasks, plans, safety, statistics)
 *   - Audit Service   (log creation, querying, export)
 *   - Auth Service    (device flow, health)
 *
 * All services are started in `beforeAll` and torn down in `afterAll`.
 * Each test is self-contained and cleans up any resources it creates.
 *
 * NOTE: The LLM service is NOT started. Services that attempt LLM calls
 * (conversational engine, planner) fall back to heuristic mode automatically.
 * We set LLM_SERVICE_URL to a closed port so fetch rejects immediately
 * instead of hanging for minutes.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import {
  waitForService,
  createTestClient,
  getTestPorts,
} from '../utils/test-helpers';

// ---------------------------------------------------------------------------
// LLM stub: start a tiny server that returns 503 for all requests BEFORE
// importing service modules, so classes that capture LLM_SERVICE_URL at
// module load time pick up the stub URL.
// ---------------------------------------------------------------------------

const llmStubPorts = getTestPorts();
const llmStubServer = Bun.serve({
  port: llmStubPorts.http,
  fetch() {
    return new Response(JSON.stringify({ error: 'LLM stub: not available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});
process.env.LLM_SERVICE_URL = `http://localhost:${llmStubPorts.http}`;

// Ensure no INTERNAL_SERVICE_TOKEN is set so auth middleware is a no-op
delete process.env.INTERNAL_SERVICE_TOKEN;

// Use an in-memory SQLite database for the state service so tests do not
// touch the user's real ~/.nimbus/nimbus.db file.
process.env.DATABASE_PATH = ':memory:';

// Point the State Service config manager at an isolated temp file so it does
// not load the user's real ~/.nimbus/config.yaml (which may have an
// incompatible schema). The manager will create a fresh config with defaults.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const testHome = mkdtempSync(join(tmpdir(), 'nimbus-e2e-svc-'));
process.env.NIMBUS_CONFIG_PATH = join(testHome, '.nimbus', 'config.yaml');

// Service modules are imported dynamically inside beforeAll so that the
// env vars above are already in place when classes capture them.

// ---------------------------------------------------------------------------
// Port allocation -- each service gets a unique pair of HTTP + WS ports
// ---------------------------------------------------------------------------

const statePorts = getTestPorts();
const generatorPorts = getTestPorts();
const corePorts = getTestPorts();
const auditPorts = getTestPorts();
const authPorts = getTestPorts();

const STATE_URL = `http://localhost:${statePorts.http}`;
const GENERATOR_URL = `http://localhost:${generatorPorts.http}`;
const CORE_URL = `http://localhost:${corePorts.http}`;
const AUDIT_URL = `http://localhost:${auditPorts.http}`;
const AUTH_URL = `http://localhost:${authPorts.http}`;

// ---------------------------------------------------------------------------
// Service handles for lifecycle management
// ---------------------------------------------------------------------------

let stateServer: any;
let generatorServer: any;
let coreServer: any;
let auditServer: any;
let authServer: any;

// Typed test clients
let stateClient: ReturnType<typeof createTestClient>;
let generatorClient: ReturnType<typeof createTestClient>;
let coreClient: ReturnType<typeof createTestClient>;
let auditClient: ReturnType<typeof createTestClient>;
let authClient: ReturnType<typeof createTestClient>;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Dynamic imports so that env vars (LLM_SERVICE_URL, DATABASE_PATH, etc.)
  // are captured by module-level singletons at import time, not earlier.
  const [
    { startServer: startStateService },
    { startServer: startGeneratorService },
    { startServer: startCoreEngineService },
    { startServer: startAuditService },
    { startServer: startAuthService },
  ] = await Promise.all([
    import('../../services/state-service/src/server'),
    import('../../services/generator-service/src/server'),
    import('../../services/core-engine-service/src/server'),
    import('../../services/audit-service/src/server'),
    import('../../services/auth-service/src/server'),
  ]);

  // Start all services concurrently for faster setup
  const [state, generator, core, audit, auth] = await Promise.all([
    startStateService(statePorts.http),
    startGeneratorService(generatorPorts.http, generatorPorts.ws),
    startCoreEngineService(corePorts.http, corePorts.ws),
    startAuditService(auditPorts.http),
    startAuthService(authPorts.http),
  ]);

  stateServer = state;
  generatorServer = generator;
  coreServer = core;
  auditServer = audit;
  authServer = auth;

  // Wait for every service to become healthy before running tests
  const readiness = await Promise.all([
    waitForService(STATE_URL),
    waitForService(GENERATOR_URL),
    waitForService(CORE_URL),
    waitForService(AUDIT_URL),
    waitForService(AUTH_URL),
  ]);

  const serviceNames = ['State', 'Generator', 'Core Engine', 'Audit', 'Auth'];
  for (let i = 0; i < readiness.length; i++) {
    if (!readiness[i]) {
      throw new Error(`${serviceNames[i]} Service failed to become healthy`);
    }
  }

  // Build typed clients
  stateClient = createTestClient(STATE_URL);
  generatorClient = createTestClient(GENERATOR_URL);
  coreClient = createTestClient(CORE_URL);
  auditClient = createTestClient(AUDIT_URL);
  authClient = createTestClient(AUTH_URL);
}, 30_000);

afterAll(() => {
  const { rmSync } = require('node:fs');
  const stopFns: Array<() => void> = [
    () => stateServer?.stop?.(),
    () => generatorServer?.stop?.(),
    () => { coreServer?.stop?.(); },
    () => auditServer?.stop?.(),
    () => authServer?.stop?.(),
    () => llmStubServer?.stop?.(),
  ];
  for (const stop of stopFns) {
    try { stop(); } catch { /* ignore shutdown errors */ }
  }
  // Clean up the temporary HOME directory
  try { rmSync(testHome, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ===========================================================================
// A. Health checks -- verify every service responds on /health
// ===========================================================================

describe('A. Service health checks', () => {
  const services = [
    { name: 'State Service', url: STATE_URL },
    { name: 'Generator Service', url: GENERATOR_URL },
    { name: 'Core Engine Service', url: CORE_URL },
    { name: 'Audit Service', url: AUDIT_URL },
    { name: 'Auth Service', url: AUTH_URL },
  ] as const;

  for (const { name, url } of services) {
    test(`${name} /health returns healthy`, async () => {
      const response = await fetch(`${url}/health`);
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        status: string;
        service?: string;
        timestamp?: string;
      };
      expect(body.status).toBe('healthy');
    });
  }

  test('health responses include a timestamp', async () => {
    const response = await fetch(`${STATE_URL}/health`);
    const body = (await response.json()) as { timestamp?: string };
    expect(body.timestamp).toBeDefined();
    // ISO-8601 timestamps always contain "T"
    expect(body.timestamp!).toContain('T');
  });
});

// ===========================================================================
// B. State Service -- config CRUD
// ===========================================================================

describe('B. State Service config CRUD', () => {
  test('GET /api/state/config returns initial configuration', async () => {
    const { status, data } = await stateClient.get('/api/state/config');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  test('PUT /api/state/config updates and returns new config', async () => {
    const update = { custom: { testKey: 'testValue-' + Date.now() } };
    const { status, data } = await stateClient.put('/api/state/config', update);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('updated');
  });

  test('PUT /api/state/config/:path sets a specific config key', async () => {
    const uniqueValue = `e2e-${Date.now()}`;
    const { status, data } = await stateClient.put(
      '/api/state/config/custom.testSpecific',
      { value: uniqueValue },
    );
    // The service may return 200 on success
    expect([200, 201]).toContain(status);
    expect(data.success).toBe(true);
  });

  test('POST /api/state/config/reset restores defaults', async () => {
    const { status, data } = await stateClient.post('/api/state/config/reset');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('reset');
  });

  test('invalid API path returns 404 with structured error', async () => {
    const { status, data } = await stateClient.get('/api/nonexistent');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });
});

// ===========================================================================
// C. State Service -- conversations lifecycle
// ===========================================================================

describe('C. State Service conversations lifecycle', () => {
  const conversationId = `conv-e2e-${Date.now()}`;

  test('POST /api/state/conversations creates a conversation', async () => {
    const payload = {
      id: conversationId,
      title: 'E2E Test Conversation',
      messages: [
        { role: 'user', content: 'Hello from E2E test' },
        { role: 'assistant', content: 'Hello! How can I help?' },
      ],
      model: 'test-model',
      metadata: { source: 'e2e-test' },
    };

    const { status, data } = await stateClient.post(
      '/api/state/conversations',
      payload,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(conversationId);
  });

  test('GET /api/state/conversations lists conversations', async () => {
    const { status, data } = await stateClient.get('/api/state/conversations');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/state/conversations/:id retrieves the conversation', async () => {
    const { status, data } = await stateClient.get(
      `/api/state/conversations/${conversationId}`,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.title).toBe('E2E Test Conversation');
    // Verify message content round-trips correctly
    const messages = typeof data.data.messages === 'string'
      ? JSON.parse(data.data.messages)
      : data.data.messages;
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].content).toContain('How can I help');
  });

  test('GET /api/state/conversations/:id returns 404 for unknown ID', async () => {
    const { status, data } = await stateClient.get(
      '/api/state/conversations/does-not-exist',
    );
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('POST then overwrite updates conversation content', async () => {
    const updatedPayload = {
      id: conversationId,
      title: 'E2E Test Conversation (updated)',
      messages: [
        { role: 'user', content: 'Hello from E2E test' },
        { role: 'assistant', content: 'Hello! How can I help?' },
        { role: 'user', content: 'Generate Terraform for me' },
      ],
      model: 'test-model-v2',
    };

    const { status: createStatus } = await stateClient.post(
      '/api/state/conversations',
      updatedPayload,
    );
    expect(createStatus).toBe(200);

    // Re-read and verify the update persisted
    const { data } = await stateClient.get(
      `/api/state/conversations/${conversationId}`,
    );
    expect(data.success).toBe(true);
    const messages = typeof data.data.messages === 'string'
      ? JSON.parse(data.data.messages)
      : data.data.messages;
    expect(messages.length).toBe(3);
  });

  test('DELETE /api/state/conversations/:id removes the conversation', async () => {
    const { status, data } = await stateClient.delete(
      `/api/state/conversations/${conversationId}`,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Confirm it is gone
    const { status: getStatus } = await stateClient.get(
      `/api/state/conversations/${conversationId}`,
    );
    expect(getStatus).toBe(404);
  });

  test('POST /api/state/conversations with missing fields returns 400', async () => {
    const { status, data } = await stateClient.post(
      '/api/state/conversations',
      { title: 'No ID' },
    );
    expect(status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('required');
  });
});

// ===========================================================================
// D. Generator Service -- questionnaire flow
// ===========================================================================

describe('D. Generator Service questionnaire flow', () => {
  let sessionId: string;

  test('POST /api/questionnaire/start begins a Terraform questionnaire', async () => {
    const { status, data } = await generatorClient.post(
      '/api/questionnaire/start',
      { type: 'terraform' },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // The response wraps the session inside data.session (not data.sessionId)
    expect(data.data.session).toBeDefined();
    expect(data.data.session.id).toBeDefined();
    expect(data.data.currentStep).toBeDefined();

    sessionId = data.data.session.id;
  });

  test('GET /api/questionnaire/session/:id returns session state', async () => {
    const { status, data } = await generatorClient.get(
      `/api/questionnaire/session/${sessionId}`,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  test('POST /api/questionnaire/answer submits answers and advances', async () => {
    // Fetch session to learn the current step structure
    const { data: sessionData } = await generatorClient.get(
      `/api/questionnaire/session/${sessionId}`,
    );

    // The current step contains questions -- get the first question's ID
    const currentStep = sessionData.data.currentStep;
    expect(currentStep).toBeDefined();

    const firstQuestion = currentStep.questions?.[0];
    expect(firstQuestion).toBeDefined();

    const questionId = firstQuestion.id;

    // Determine an appropriate answer based on the question type
    const value = firstQuestion.options
      ? firstQuestion.options[0]?.value ?? firstQuestion.options[0] ?? 'aws'
      : 'aws';

    const { status, data } = await generatorClient.post(
      '/api/questionnaire/answer',
      {
        sessionId,
        questionId,
        value,
      },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    // After answering, the engine should return session progress info
    expect(data.data.progress).toBeDefined();
    expect(typeof data.data.progress.current).toBe('number');
    expect(typeof data.data.progress.total).toBe('number');
  });

  test('DELETE /api/questionnaire/session/:id removes the session', async () => {
    const { status, data } = await generatorClient.delete(
      `/api/questionnaire/session/${sessionId}`,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});

// ===========================================================================
// E. Generator Service -- best practices analysis
// ===========================================================================

describe('E. Generator Service best practices', () => {
  test('POST /api/best-practices/analyze returns a report', async () => {
    const { status, data } = await generatorClient.post(
      '/api/best-practices/analyze',
      {
        component: 'ec2',
        config: {
          instance_type: 't3.micro',
          ami: 'ami-0c55b159cbfafe1f0',
        },
      },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    // The report has a summary with violations_found (not total_violations)
    expect(data.data.summary).toBeDefined();
    expect(typeof data.data.summary.violations_found).toBe('number');
    expect(typeof data.data.summary.total_rules_checked).toBe('number');
    expect(typeof data.data.summary.autofixable_violations).toBe('number');
    // Violations array should be present
    expect(Array.isArray(data.data.violations)).toBe(true);
  });

  test('GET /api/best-practices/rules lists available rules', async () => {
    const { status, data } = await generatorClient.get(
      '/api/best-practices/rules',
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('POST /api/best-practices/autofix returns fixed config', async () => {
    const { status, data } = await generatorClient.post(
      '/api/best-practices/autofix',
      {
        component: 'ec2',
        config: {
          instance_type: 't3.micro',
        },
      },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.fixed_config).toBeDefined();
  });
});

// ===========================================================================
// F. Generator Service -- templates
// ===========================================================================

describe('F. Generator Service templates', () => {
  test('GET /api/templates lists available templates', async () => {
    const { status, data } = await generatorClient.get('/api/templates');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('POST /api/templates/validate validates template syntax', async () => {
    const { status, data } = await generatorClient.post(
      '/api/templates/validate',
      { template: 'resource "aws_instance" "{{ name }}" {\n  ami = "{{ ami }}"\n}' },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('POST /api/templates/extract-variables extracts variables', async () => {
    const { status, data } = await generatorClient.post(
      '/api/templates/extract-variables',
      { template: 'provider "aws" {\n  region = "{{ region }}"\n}\nresource "{{ resource_type }}" "main" {}' },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.variables).toBeDefined();
    expect(Array.isArray(data.data.variables)).toBe(true);
  });
});

// ===========================================================================
// G. Generator Service -- Terraform project generation
// ===========================================================================

describe('G. Generator Service Terraform project generation', () => {
  test('POST /api/generators/terraform/project generates a complete project', async () => {
    const { status, data } = await generatorClient.post(
      '/api/generators/terraform/project',
      {
        projectName: 'e2e-test-project',
        provider: 'aws',
        region: 'us-east-1',
        components: ['vpc'],
        environment: 'staging',
        tags: { ManagedBy: 'nimbus-e2e' },
      },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Verify generated file structure
    expect(data.data.files).toBeDefined();
    expect(Array.isArray(data.data.files)).toBe(true);
    expect(data.data.files.length).toBeGreaterThan(0);

    // Verify at least one .tf file is present
    const tfFiles = data.data.files.filter(
      (f: { path: string }) => f.path.endsWith('.tf'),
    );
    expect(tfFiles.length).toBeGreaterThan(0);

    // Verify validation report exists
    expect(data.data.validation).toBeDefined();
  });

  test('POST /api/generators/terraform/validate validates file set', async () => {
    const { status, data } = await generatorClient.post(
      '/api/generators/terraform/validate',
      {
        files: [
          {
            path: 'main.tf',
            content: 'terraform {\n  required_version = ">= 1.0"\n}\nprovider "aws" {\n  region = "us-east-1"\n}\n',
          },
        ],
      },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });
});

// ===========================================================================
// H. Core Engine Service -- task and plan lifecycle
// ===========================================================================

describe('H. Core Engine task and plan lifecycle', () => {
  let taskId: string;

  test('POST /api/tasks creates a new task', async () => {
    const { status, data } = await coreClient.post('/api/tasks', {
      type: 'generate',
      user_id: 'e2e-test-user',
      priority: 'medium',
      context: {
        provider: 'aws',
        environment: 'staging',
        region: 'us-east-1',
        components: ['vpc', 'ec2'],
      },
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBeDefined();
    expect(data.data.type).toBe('generate');
    expect(data.data.status).toBeDefined();

    taskId = data.data.id;
  });

  test('GET /api/tasks/:taskId retrieves the task', async () => {
    const { status, data } = await coreClient.get(`/api/tasks/${taskId}`);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.id).toBe(taskId);
    expect(data.data.context.provider).toBe('aws');
    expect(data.data.context.components).toContain('vpc');
  });

  test('GET /api/tasks lists all tasks', async () => {
    const { status, data } = await coreClient.get('/api/tasks');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/plans/generate creates a plan from context', async () => {
    // The planner will try LLM first but falls back to heuristics because
    // LLM_SERVICE_URL points to a closed port.
    const { status, data } = await coreClient.post('/api/plans/generate', {
      type: 'generate',
      context: {
        provider: 'aws',
        environment: 'production',
        region: 'us-west-2',
        components: ['vpc', 'ec2', 's3'],
      },
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Verify plan structure
    const plan = data.data;
    expect(plan.id).toBeDefined();
    expect(plan.steps).toBeDefined();
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(plan.steps.length).toBeGreaterThan(0);
  }, 15_000);

  test('GET /api/statistics returns engine statistics', async () => {
    const { status, data } = await coreClient.get('/api/statistics');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  test('GET /api/safety/checks lists available safety checks', async () => {
    const { status, data } = await coreClient.get('/api/safety/checks');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
    // Verify each check has expected fields
    if (data.data.length > 0) {
      const check = data.data[0];
      expect(check.id).toBeDefined();
      expect(check.name).toBeDefined();
      expect(check.severity).toBeDefined();
    }
  });

  test('POST /api/tasks/:taskId/cancel cancels the task', async () => {
    const { status, data } = await coreClient.post(`/api/tasks/${taskId}/cancel`);
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });
});

// ===========================================================================
// I. Audit Service -- log creation and querying
// ===========================================================================

describe('I. Audit Service log lifecycle', () => {
  test('POST /api/audit/logs creates an audit log entry', async () => {
    const { status, data } = await auditClient.post('/api/audit/logs', {
      action: 'terraform.plan',
      status: 'success',
      userId: 'e2e-test-user',
      resourceType: 'terraform',
      resourceId: 'vpc-123',
      details: { region: 'us-east-1', components: ['vpc'] },
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('POST /api/audit/logs creates a second entry for query testing', async () => {
    const { status, data } = await auditClient.post('/api/audit/logs', {
      action: 'terraform.apply',
      status: 'failure',
      userId: 'e2e-test-user',
      resourceType: 'terraform',
      resourceId: 'ec2-456',
      details: { error: 'access denied' },
    });
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('GET /api/audit/logs returns all logs', async () => {
    const { status, data } = await auditClient.get('/api/audit/logs');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    // The audit query returns { logs: [...], total, limit, offset } inside data.data
    expect(data.data).toBeDefined();
    expect(data.data.logs).toBeDefined();
    expect(Array.isArray(data.data.logs)).toBe(true);
    expect(data.data.logs.length).toBeGreaterThanOrEqual(2);
  });

  test('GET /api/audit/logs?status=failure filters by status', async () => {
    const { status, data } = await auditClient.get(
      '/api/audit/logs?status=failure',
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    // Every returned entry should have failure status
    const logs = data.data.logs;
    expect(Array.isArray(logs)).toBe(true);
    for (const entry of logs) {
      expect(entry.status).toBe('failure');
    }
  });

  test('GET /api/audit/export?format=json exports logs as JSON', async () => {
    const response = await fetch(`${AUDIT_URL}/api/audit/export?format=json`);
    expect(response.status).toBe(200);
    const contentType = response.headers.get('content-type') || '';
    expect(contentType).toContain('application/json');
  });
});

// ===========================================================================
// J. Auth Service -- device code flow
// ===========================================================================

describe('J. Auth Service device code flow', () => {
  test('POST /api/auth/device/initiate starts a device code flow', async () => {
    const { status, data } = await authClient.post(
      '/api/auth/device/initiate',
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    // Device flow should return a device code and user code
    expect(data.data.deviceCode || data.data.device_code).toBeDefined();
    expect(data.data.userCode || data.data.user_code).toBeDefined();
  });
});

// ===========================================================================
// K. Cross-service data flow: create in state, verify independently
// ===========================================================================

describe('K. Cross-service data consistency', () => {
  test('conversation created via state service is retrievable in a fresh request', async () => {
    const id = `cross-svc-${Date.now()}`;
    // Create
    await stateClient.post('/api/state/conversations', {
      id,
      title: 'Cross-service check',
      messages: [{ role: 'user', content: 'ping' }],
    });

    // Retrieve with raw fetch (bypasses client caching if any)
    const response = await fetch(
      `${STATE_URL}/api/state/conversations/${id}`,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Cross-service check');

    // Cleanup
    await stateClient.delete(`/api/state/conversations/${id}`);
  });

  test('generator questionnaire session persists across requests', async () => {
    // Start a session
    const { data: startData } = await generatorClient.post(
      '/api/questionnaire/start',
      { type: 'terraform' },
    );
    // Session ID is inside data.session.id
    const sid = startData.data.session.id;

    // Fetch session from a different client call
    const sessionResp = await fetch(
      `${GENERATOR_URL}/api/questionnaire/session/${sid}`,
    );
    expect(sessionResp.status).toBe(200);
    const sessionBody = (await sessionResp.json()) as any;
    expect(sessionBody.success).toBe(true);

    // Cleanup
    await generatorClient.delete(`/api/questionnaire/session/${sid}`);
  });

  test('core engine task persists between create and get', async () => {
    const { data: createData } = await coreClient.post('/api/tasks', {
      type: 'analyze',
      user_id: 'cross-svc-user',
      context: {
        provider: 'gcp',
        environment: 'dev',
        components: ['compute'],
      },
    });
    const tid = createData.data.id;

    // Retrieve via raw fetch
    const response = await fetch(`${CORE_URL}/api/tasks/${tid}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.type).toBe('analyze');
    expect(body.data.context.provider).toBe('gcp');
  });
});

// ===========================================================================
// L. Generator Service -- conversational engine (falls back to heuristics)
// ===========================================================================

describe('L. Generator Service conversational engine', () => {
  const sessionId = `conv-e2e-${Date.now()}`;

  test('POST /api/conversational/message processes a message', async () => {
    // The conversational engine will try LLM intent parsing first, get
    // ECONNREFUSED, then fall back to heuristic intent classification.
    const { status, data } = await generatorClient.post(
      '/api/conversational/message',
      {
        sessionId,
        message: 'I want to deploy an EC2 instance on AWS in us-east-1',
      },
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
    // The response should contain an intent classification
    if (data.data.intent) {
      expect(data.data.intent.type).toBeDefined();
    }
  }, 15_000);

  test('GET /api/conversational/session/:id returns session context', async () => {
    const { status, data } = await generatorClient.get(
      `/api/conversational/session/${sessionId}`,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('GET /api/conversational/history/:id returns conversation history', async () => {
    const { status, data } = await generatorClient.get(
      `/api/conversational/history/${sessionId}`,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    // History should be an array (may contain entries from the session)
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('POST /api/conversational/clear/:id clears history', async () => {
    const { status, data } = await generatorClient.post(
      `/api/conversational/clear/${sessionId}`,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);
  });

  test('DELETE /api/conversational/session/:id removes the session', async () => {
    const { status, data } = await generatorClient.delete(
      `/api/conversational/session/${sessionId}`,
    );
    expect(status).toBe(200);
    expect(data.success).toBe(true);

    // Verify session is gone
    const { data: getResp } = await generatorClient.get(
      `/api/conversational/session/${sessionId}`,
    );
    expect(getResp.success).toBe(false);
  });
});

// ===========================================================================
// M. State Service -- history entries
// ===========================================================================

describe('M. State Service history entries', () => {
  test('POST /api/state/history records a history entry', async () => {
    // The history endpoint requires: id, type, command (not just command/status)
    const { status, data } = await stateClient.post('/api/state/history', {
      id: `hist-e2e-${Date.now()}`,
      type: 'generate',
      command: 'generate terraform',
      status: 'success',
      durationMs: 1234,
      metadata: { provider: 'aws', region: 'us-east-1' },
    });
    // Some implementations return 200 or 201
    expect([200, 201]).toContain(status);
    expect(data.success).toBe(true);
  });

  test('GET /api/state/history lists history entries', async () => {
    const { status, data } = await stateClient.get('/api/state/history');
    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);
  });
});

// ===========================================================================
// N. Error handling and edge cases
// ===========================================================================

describe('N. Error handling and edge cases', () => {
  test('state service rejects requests to unknown API paths', async () => {
    const { status, data } = await stateClient.get('/api/state/unknown-route');
    expect(status).toBe(404);
    expect(data.success).toBe(false);
  });

  test('core engine returns error for non-existent task', async () => {
    const { status, data } = await coreClient.get('/api/tasks/non-existent-id');
    expect(status).toBe(200); // Elysia routes return 200 with success: false
    expect(data.success).toBe(false);
  });

  test('generator service returns error for non-existent questionnaire session', async () => {
    const { data } = await generatorClient.get(
      '/api/questionnaire/session/non-existent',
    );
    expect(data.success).toBe(false);
  });

  test('audit service handles invalid query params gracefully', async () => {
    const { status } = await auditClient.get(
      '/api/audit/logs?limit=not-a-number',
    );
    // Should not crash -- either returns 200 with default limit or 400
    expect([200, 400]).toContain(status);
  });

  test('state service rejects conversation creation with empty body', async () => {
    const { status, data } = await stateClient.post(
      '/api/state/conversations',
      {},
    );
    expect(status).toBe(400);
    expect(data.success).toBe(false);
  });
});
