/**
 * HTTP Basic Auth Middleware for `nimbus serve`
 *
 * Provides optional HTTP Basic Authentication for the headless API server.
 * Disabled by default for local development; enabled via `--auth user:pass`.
 *
 * Unauthenticated endpoints (always bypassed):
 *   - GET /api/health
 *   - GET /api/openapi.json
 *   - OPTIONS (CORS preflight)
 *
 * @module cli/serve-auth
 */

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Credentials for HTTP Basic Auth. */
export interface ServeAuthOptions {
  /** Username for Basic Auth. */
  readonly username: string;
  /** Password for Basic Auth. */
  readonly password: string;
}

// ---------------------------------------------------------------------------
// Paths that are always public (no auth required)
// ---------------------------------------------------------------------------

const PUBLIC_PATHS = new Set(['/api/health', '/api/openapi.json']);

// ---------------------------------------------------------------------------
// Middleware Factory
// ---------------------------------------------------------------------------

/**
 * Create an Elysia-compatible `onBeforeHandle` function that enforces
 * HTTP Basic Authentication on protected endpoints.
 *
 * @param options - The username and password to validate against.
 * @returns A handler that short-circuits with 401 when credentials are
 *          missing or invalid, or `undefined` to let the request through.
 */
export function createAuthMiddleware(
  options: ServeAuthOptions,
): (ctx: { request: Request; set: any }) => { error: string } | undefined {
  const expectedToken = btoa(`${options.username}:${options.password}`);

  return ({ request, set }: { request: Request; set: any }) => {
    const url = new URL(request.url);

    // Skip auth for public endpoints
    if (PUBLIC_PATHS.has(url.pathname)) {
      return undefined;
    }

    // Skip auth for CORS preflight requests
    if (request.method === 'OPTIONS') {
      return undefined;
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      set.status = 401;
      set.headers = { 'WWW-Authenticate': 'Basic realm="Nimbus API"' };
      return { error: 'Authentication required' };
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Basic' || token !== expectedToken) {
      set.status = 401;
      set.headers = { 'WWW-Authenticate': 'Basic realm="Nimbus API"' };
      return { error: 'Invalid credentials' };
    }

    // Credentials valid -- proceed
    return undefined;
  };
}
