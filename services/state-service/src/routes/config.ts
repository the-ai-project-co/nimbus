import { logger } from '@nimbus/shared-utils';
import { ConfigurationManager } from '../config/manager';

// Singleton instance
let configManager: ConfigurationManager | null = null;

async function getConfigManager(): Promise<ConfigurationManager> {
  if (!configManager) {
    configManager = new ConfigurationManager();
    await configManager.load();
  }
  return configManager;
}

export async function configRouter(req: Request, path: string): Promise<Response> {
  try {
    const manager = await getConfigManager();

    // GET /config - Get all configuration
    if (req.method === 'GET' && path === '/config') {
      const config = manager.getAll();
      return Response.json({
        success: true,
        data: config,
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
