import { logger } from '@nimbus/shared-utils';
import { CredentialsManager } from '../credentials/manager';

// Singleton instance
let credentialsManager: CredentialsManager | null = null;

function getCredentialsManager(): CredentialsManager {
  if (!credentialsManager) {
    credentialsManager = new CredentialsManager();
  }
  return credentialsManager;
}

/**
 * Simple authentication check for credentials endpoints
 * Validates Bearer token from Authorization header against NIMBUS_API_KEY env var
 */
function authenticateRequest(req: Request): boolean {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const apiKey = process.env.NIMBUS_API_KEY;

  // If no API key is configured, allow access (development mode)
  // In production, NIMBUS_API_KEY must be set
  if (!apiKey) {
    logger.warn(
      'NIMBUS_API_KEY not set - credentials endpoints are unprotected. Set NIMBUS_API_KEY in production.'
    );
    return true;
  }

  return token === apiKey;
}

export async function credentialsRouter(req: Request, path: string): Promise<Response> {
  // Authentication check
  if (!authenticateRequest(req)) {
    return Response.json(
      {
        success: false,
        error: 'Unauthorized. Provide valid Bearer token in Authorization header.',
      },
      { status: 401 }
    );
  }

  try {
    const manager = getCredentialsManager();

    // POST /credentials/:provider - Store credentials for provider
    if (req.method === 'POST' && path.match(/^\/credentials\/[a-z]+$/) && !path.startsWith('/credentials/validate/')) {
      const parts = path.split('/');
      const provider = parts[2];

      if (!provider) {
        return Response.json(
          {
            success: false,
            error: 'Provider is required',
          },
          { status: 400 }
        );
      }

      let body: { data?: Record<string, string> };
      try {
        body = await req.json();
      } catch {
        return Response.json(
          {
            success: false,
            error: 'Invalid JSON body',
          },
          { status: 400 }
        );
      }

      if (!body.data || typeof body.data !== 'object') {
        return Response.json(
          {
            success: false,
            error: 'Request body must contain a "data" object with string key-value pairs',
          },
          { status: 400 }
        );
      }

      await manager.storeCredential(provider, body.data);

      return Response.json({
        success: true,
        message: `Credentials stored for ${provider}`,
      });
    }

    // GET /credentials/:provider - Get credentials for provider
    if (req.method === 'GET' && path.startsWith('/credentials/')) {
      const parts = path.split('/');
      const provider = parts[2] as 'aws' | 'gcp' | 'azure';

      if (!['aws', 'gcp', 'azure'].includes(provider)) {
        return Response.json(
          {
            success: false,
            error: `Invalid provider: ${provider}. Must be one of: aws, gcp, azure`,
          },
          { status: 400 }
        );
      }

      // Parse query parameters for AWS profile
      const url = new URL(req.url);
      const profile = url.searchParams.get('profile') || 'default';

      const credentials = await manager.getCredentials(provider, { profile });

      // Sanitize credentials (don't send secrets in response)
      const sanitized = sanitizeCredentials(credentials);

      return Response.json({
        success: true,
        data: sanitized,
      });
    }

    // POST /credentials/validate/:provider - Validate credentials
    if (req.method === 'POST' && path.startsWith('/credentials/validate/')) {
      const parts = path.split('/');
      const provider = parts[3] as 'aws' | 'gcp' | 'azure';

      if (!['aws', 'gcp', 'azure'].includes(provider)) {
        return Response.json(
          {
            success: false,
            error: `Invalid provider: ${provider}. Must be one of: aws, gcp, azure`,
          },
          { status: 400 }
        );
      }

      const url = new URL(req.url);
      const profile = url.searchParams.get('profile') || 'default';

      const credentials = await manager.getCredentials(provider, { profile });

      let isValid = false;
      switch (provider) {
        case 'aws':
          isValid = await manager.validateAWSCredentials(credentials as any);
          break;
        case 'gcp':
          isValid = await manager.validateGCPCredentials(credentials as any);
          break;
        case 'azure':
          isValid = await manager.validateAzureCredentials(credentials as any);
          break;
      }

      return Response.json({
        success: true,
        data: {
          provider,
          valid: isValid,
        },
      });
    }

    // Method not allowed
    return Response.json(
      {
        success: false,
        error: 'Method not allowed',
      },
      { status: 405 }
    );
  } catch (error) {
    logger.error('Credentials route error', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * Sanitize credentials to remove sensitive data
 */
function sanitizeCredentials(credentials: any): any {
  const sanitized = { ...credentials };

  // Remove sensitive fields
  delete sanitized.secretAccessKey;
  delete sanitized.sessionToken;
  delete sanitized.clientSecret;
  delete sanitized.credentials;

  // Mask access keys
  if (sanitized.accessKeyId) {
    sanitized.accessKeyId = maskString(sanitized.accessKeyId);
  }

  if (sanitized.keyFile) {
    sanitized.keyFile = maskString(sanitized.keyFile);
  }

  return sanitized;
}

/**
 * Mask a string (show first 4 and last 4 characters)
 */
function maskString(str: string): string {
  if (str.length <= 8) {
    return '****';
  }
  return `${str.slice(0, 4)}****${str.slice(-4)}`;
}
