import { logger } from '@nimbus/shared-utils';
import { ConfigurationManager } from '../config/manager';

// Singleton instance
let configManager: ConfigurationManager | null = null;
let loadPromise: Promise<ConfigurationManager> | null = null;

async function getConfigManager(): Promise<ConfigurationManager> {
  // Return cached instance if available
  if (configManager) {
    return configManager;
  }

  // If loading is in progress, wait for it
  if (loadPromise) {
    return loadPromise;
  }

  // Start loading and cache the promise to prevent race condition
  loadPromise = (async () => {
    try {
      const manager = new ConfigurationManager();
      await manager.load();
      configManager = manager; // Only cache on successful load
      loadPromise = null; // Clear promise after completion
      return configManager;
    } catch (error) {
      loadPromise = null; // Clear promise on failure to allow retry
      throw error; // Re-throw to propagate error to caller
    }
  })();

  return loadPromise;
}

/**
 * Sanitize config data by removing sensitive fields
 */
function sanitizeConfig(config: any): any {
  const sanitized = JSON.parse(JSON.stringify(config));

  // Remove API keys and credentials from LLM providers
  if (sanitized.llm?.providers) {
    for (const provider of Object.values(sanitized.llm.providers) as any[]) {
      if (provider?.apiKey) {
        provider.apiKey = '***REDACTED***';
      }
    }
  }

  // Remove any other sensitive fields
  if (sanitized.storage?.databaseUrl) {
    sanitized.storage.databaseUrl = '***REDACTED***';
  }

  return sanitized;
}

export async function configRouter(req: Request, path: string): Promise<Response> {
  try {
    const manager = await getConfigManager();

    // GET /config - Get all configuration (sanitized to prevent credential leaks)
    if (req.method === 'GET' && path === '/config') {
      const config = manager.getAll();
      const sanitized = sanitizeConfig(config);
      return Response.json({
        success: true,
        data: sanitized,
      });
    }

    // GET /config/:path - Get specific config value
    if (req.method === 'GET' && path.startsWith('/config/')) {
      const keyPath = path.replace('/config/', '');
      const value = manager.get(keyPath);

      if (value === undefined) {
        return Response.json(
          {
            success: false,
            error: `Configuration key '${keyPath}' not found`,
          },
          { status: 404 }
        );
      }

      return Response.json({
        success: true,
        data: value,
      });
    }

    // PUT /config - Update configuration
    if (req.method === 'PUT' && path === '/config') {
      const body = await req.json() as any;
      await manager.update(body);

      return Response.json({
        success: true,
        message: 'Configuration updated successfully',
        data: manager.getAll(),
      });
    }

    // PUT /config/:path - Set specific config value
    if (req.method === 'PUT' && path.startsWith('/config/')) {
      const keyPath = path.replace('/config/', '');
      const body = await req.json() as any;

      await manager.set(keyPath, body.value);

      return Response.json({
        success: true,
        message: `Configuration key '${keyPath}' updated successfully`,
        data: manager.get(keyPath),
      });
    }

    // POST /config/reset - Reset to defaults
    if (req.method === 'POST' && path === '/config/reset') {
      await manager.reset();

      return Response.json({
        success: true,
        message: 'Configuration reset to defaults',
        data: manager.getAll(),
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
    logger.error('Config route error', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
