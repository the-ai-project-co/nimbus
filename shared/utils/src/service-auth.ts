/**
 * Service-to-Service Authentication
 *
 * Shared-secret token validation via INTERNAL_SERVICE_TOKEN env var.
 * No-op when env var is unset (keeps local dev working).
 */

import { logger } from './logger';

const SERVICE_TOKEN_HEADER = 'x-internal-service-token';

/**
 * Validate the service token from an incoming request
 */
export function validateServiceToken(req: Request): boolean {
  const expectedToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expectedToken) {
    // No token configured — allow all requests (local dev)
    return true;
  }

  const providedToken = req.headers.get(SERVICE_TOKEN_HEADER);
  return providedToken === expectedToken;
}

/**
 * Middleware that validates service auth on /api/ routes.
 * Skips /health and /swagger endpoints.
 * Returns a 401 Response if invalid, or null to continue.
 */
export function serviceAuthMiddleware(req: Request): Response | null {
  const expectedToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expectedToken) {
    // No token configured — skip auth (local dev)
    return null;
  }

  const url = new URL(req.url);
  const path = url.pathname;

  // Skip health and swagger endpoints
  if (path === '/health' || path.startsWith('/swagger') || path === '/api/openapi.json') {
    return null;
  }

  // Only enforce on /api/ routes
  if (!path.startsWith('/api/')) {
    return null;
  }

  if (!validateServiceToken(req)) {
    logger.warn(`Unauthorized service request to ${path}`);
    return Response.json(
      { success: false, error: 'Unauthorized: invalid or missing service token' },
      { status: 401 },
    );
  }

  return null;
}

/**
 * Get headers to include in outgoing service-to-service requests
 */
export function getServiceAuthHeaders(): Record<string, string> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) return {};
  return { [SERVICE_TOKEN_HEADER]: token };
}
