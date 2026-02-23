import { logger } from './logger';

const SERVICE_TOKEN_HEADER = 'x-internal-service-token';

export function validateServiceToken(req: Request): boolean {
  const expectedToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expectedToken) {
    return true;
  }

  const providedToken = req.headers.get(SERVICE_TOKEN_HEADER);
  return providedToken === expectedToken;
}

export function serviceAuthMiddleware(req: Request): Response | null {
  const expectedToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (!expectedToken) {
    return null;
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/health' || path.startsWith('/swagger') || path === '/api/openapi.json') {
    return null;
  }

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

export function getServiceAuthHeaders(): Record<string, string> {
  const token = process.env.INTERNAL_SERVICE_TOKEN;
  if (!token) return {};
  return { [SERVICE_TOKEN_HEADER]: token };
}
