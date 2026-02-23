/**
 * Tests for nimbus serve — Headless API
 *
 * Covers:
 *   - OpenAPI specification structure and completeness
 *   - HTTP Basic Auth middleware behavior (allow/deny/skip)
 *
 * Integration tests that start the actual HTTP server are intentionally
 * excluded here; they belong in the e2e test suite to avoid port conflicts
 * in parallel test runs.
 */

import { describe, it, expect } from 'bun:test';
import { getOpenAPISpec } from '../cli/openapi-spec';
import { createAuthMiddleware } from '../cli/serve-auth';

// ---------------------------------------------------------------------------
// OpenAPI Spec
// ---------------------------------------------------------------------------

describe('OpenAPI Spec', () => {
  const spec = getOpenAPISpec();

  it('should return a valid OpenAPI 3.1 document', () => {
    expect(spec.openapi).toBe('3.1.0');
    expect((spec as any).info.title).toBe('Nimbus API');
    expect((spec as any).info.version).toBe('0.2.0');
  });

  it('should define all required endpoint paths', () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(paths['/api/health']).toBeDefined();
    expect(paths['/api/chat']).toBeDefined();
    expect(paths['/api/run']).toBeDefined();
    expect(paths['/api/sessions']).toBeDefined();
    expect(paths['/api/session/{id}']).toBeDefined();
  });

  it('should define GET and POST for session/:id', () => {
    const paths = spec.paths as any;
    const sessionPath = paths['/api/session/{id}'];
    expect(sessionPath.get).toBeDefined();
    expect(sessionPath.get.operationId).toBe('getSession');
    expect(sessionPath.post).toBeDefined();
    expect(sessionPath.post.operationId).toBe('continueSession');
  });

  it('should define the chat endpoint with SSE response and required message field', () => {
    const paths = spec.paths as any;
    const chatPost = paths['/api/chat'].post;
    expect(chatPost.operationId).toBe('chat');
    expect(chatPost.requestBody.required).toBe(true);

    const schema = chatPost.requestBody.content['application/json'].schema;
    expect(schema.required).toContain('message');
    expect(schema.properties.message.type).toBe('string');
    expect(schema.properties.sessionId).toBeDefined();
    expect(schema.properties.model).toBeDefined();
    expect(schema.properties.mode.enum).toEqual(['plan', 'build', 'deploy']);
  });

  it('should define the run endpoint with JSON response schema', () => {
    const paths = spec.paths as any;
    const runPost = paths['/api/run'].post;
    expect(runPost.operationId).toBe('run');
    expect(runPost.requestBody.required).toBe(true);

    const requestSchema = runPost.requestBody.content['application/json'].schema;
    expect(requestSchema.required).toContain('prompt');

    const responseSchema = runPost.responses['200'].content['application/json'].schema;
    expect(responseSchema.properties.sessionId).toBeDefined();
    expect(responseSchema.properties.response).toBeDefined();
    expect(responseSchema.properties.turns).toBeDefined();
    expect(responseSchema.properties.cost).toBeDefined();
    expect(responseSchema.properties.usage).toBeDefined();
  });

  it('should define the sessions list endpoint', () => {
    const paths = spec.paths as any;
    const sessionsGet = paths['/api/sessions'].get;
    expect(sessionsGet.operationId).toBe('listSessions');

    const responseSchema =
      sessionsGet.responses['200'].content['application/json'].schema;
    expect(responseSchema.properties.sessions.type).toBe('array');
  });

  it('should define the health endpoint with expected properties', () => {
    const paths = spec.paths as any;
    const healthGet = paths['/api/health'].get;
    expect(healthGet.operationId).toBe('getHealth');

    const schema =
      healthGet.responses['200'].content['application/json'].schema;
    expect(schema.properties.status.enum).toEqual(['ok']);
    expect(schema.properties.uptime.type).toBe('number');
    expect(schema.properties.db.type).toBe('boolean');
    expect(schema.properties.llm.type).toBe('boolean');
  });

  it('should define Session schema in components', () => {
    const components = spec.components as any;
    const sessionSchema = components.schemas.Session;
    expect(sessionSchema).toBeDefined();
    expect(sessionSchema.type).toBe('object');
    expect(sessionSchema.properties.id).toBeDefined();
    expect(sessionSchema.properties.name).toBeDefined();
    expect(sessionSchema.properties.status.enum).toContain('active');
    expect(sessionSchema.properties.status.enum).toContain('suspended');
    expect(sessionSchema.properties.status.enum).toContain('completed');
    expect(sessionSchema.properties.mode.enum).toContain('plan');
    expect(sessionSchema.properties.mode.enum).toContain('build');
    expect(sessionSchema.properties.mode.enum).toContain('deploy');
  });

  it('should define Usage schema in components', () => {
    const components = spec.components as any;
    const usageSchema = components.schemas.Usage;
    expect(usageSchema).toBeDefined();
    expect(usageSchema.properties.promptTokens.type).toBe('integer');
    expect(usageSchema.properties.completionTokens.type).toBe('integer');
    expect(usageSchema.properties.totalTokens.type).toBe('integer');
  });

  it('should define Error schema in components', () => {
    const components = spec.components as any;
    const errorSchema = components.schemas.Error;
    expect(errorSchema).toBeDefined();
    expect(errorSchema.properties.error.type).toBe('string');
    expect(errorSchema.required).toContain('error');
  });

  it('should define basicAuth security scheme', () => {
    const components = spec.components as any;
    expect(components.securitySchemes.basicAuth).toBeDefined();
    expect(components.securitySchemes.basicAuth.type).toBe('http');
    expect(components.securitySchemes.basicAuth.scheme).toBe('basic');
  });

  it('should include server definitions', () => {
    const servers = spec.servers as any[];
    expect(servers.length).toBeGreaterThan(0);
    expect(servers[0].url).toBe('http://localhost:4200');
  });
});

// ---------------------------------------------------------------------------
// Auth Middleware
// ---------------------------------------------------------------------------

describe('Auth Middleware', () => {
  const middleware = createAuthMiddleware({
    username: 'admin',
    password: 'secret',
  });

  /**
   * Helper to invoke the middleware with a given URL and optional headers.
   */
  function invokeMiddleware(
    url: string,
    method = 'POST',
    headers: Record<string, string> = {},
  ): { result: { error: string } | undefined; set: any } {
    const request = new Request(url, { method, headers });
    const set: any = {};
    const result = middleware({ request, set });
    return { result, set };
  }

  // -- Public endpoints bypass auth --

  it('should skip auth for GET /api/health', () => {
    const { result } = invokeMiddleware(
      'http://localhost:4200/api/health',
      'GET',
    );
    expect(result).toBeUndefined();
  });

  it('should skip auth for GET /api/openapi.json', () => {
    const { result } = invokeMiddleware(
      'http://localhost:4200/api/openapi.json',
      'GET',
    );
    expect(result).toBeUndefined();
  });

  it('should skip auth for CORS OPTIONS preflight', () => {
    const { result } = invokeMiddleware(
      'http://localhost:4200/api/chat',
      'OPTIONS',
    );
    expect(result).toBeUndefined();
  });

  // -- Protected endpoints require auth --

  it('should reject requests without Authorization header', () => {
    const { result, set } = invokeMiddleware(
      'http://localhost:4200/api/chat',
    );
    expect(set.status).toBe(401);
    expect(result).toEqual({ error: 'Authentication required' });
    expect(set.headers['WWW-Authenticate']).toBe('Basic realm="Nimbus API"');
  });

  it('should reject requests with invalid credentials', () => {
    const { result, set } = invokeMiddleware(
      'http://localhost:4200/api/chat',
      'POST',
      { Authorization: `Basic ${btoa('wrong:creds')}` },
    );
    expect(set.status).toBe(401);
    expect(result).toEqual({ error: 'Invalid credentials' });
  });

  it('should reject requests with malformed Authorization header', () => {
    const { result, set } = invokeMiddleware(
      'http://localhost:4200/api/chat',
      'POST',
      { Authorization: 'Bearer some-token' },
    );
    expect(set.status).toBe(401);
    expect(result).toEqual({ error: 'Invalid credentials' });
  });

  it('should allow requests with valid credentials', () => {
    const { result } = invokeMiddleware(
      'http://localhost:4200/api/chat',
      'POST',
      { Authorization: `Basic ${btoa('admin:secret')}` },
    );
    expect(result).toBeUndefined();
  });

  it('should allow valid credentials for session endpoints', () => {
    const { result } = invokeMiddleware(
      'http://localhost:4200/api/session/abc-123',
      'GET',
      { Authorization: `Basic ${btoa('admin:secret')}` },
    );
    expect(result).toBeUndefined();
  });

  it('should allow valid credentials for the run endpoint', () => {
    const { result } = invokeMiddleware(
      'http://localhost:4200/api/run',
      'POST',
      { Authorization: `Basic ${btoa('admin:secret')}` },
    );
    expect(result).toBeUndefined();
  });

  it('should allow valid credentials for the sessions list endpoint', () => {
    const { result } = invokeMiddleware(
      'http://localhost:4200/api/sessions',
      'GET',
      { Authorization: `Basic ${btoa('admin:secret')}` },
    );
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Additional edge cases
// ---------------------------------------------------------------------------

describe('Auth Middleware — edge cases', () => {
  it('should work with passwords containing colons', () => {
    const mw = createAuthMiddleware({
      username: 'user',
      password: 'pass:with:colons',
    });

    const request = new Request('http://localhost:4200/api/chat', {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa('user:pass:with:colons')}` },
    });
    const set: any = {};
    const result = mw({ request, set });
    expect(result).toBeUndefined();
  });

  it('should reject empty Authorization header', () => {
    const mw = createAuthMiddleware({
      username: 'admin',
      password: 'secret',
    });

    const request = new Request('http://localhost:4200/api/chat', {
      method: 'POST',
      headers: { Authorization: '' },
    });
    const set: any = {};
    const result = mw({ request, set });
    expect(set.status).toBe(401);
  });
});
