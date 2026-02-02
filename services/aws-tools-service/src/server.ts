import { logger } from '@nimbus/shared-utils';
import { router } from './routes';
import { createWebSocketServer } from './websocket';

export interface ServerOptions {
  httpPort: number;
  wsPort?: number;
  enableWebSocket?: boolean;
}

export interface ServerInstances {
  http: ReturnType<typeof Bun.serve>;
  ws?: ReturnType<typeof Bun.serve>;
  stop: () => void;
}

export async function startServer(portOrOptions: number | ServerOptions): Promise<ServerInstances> {
  const options: ServerOptions = typeof portOrOptions === 'number'
    ? { httpPort: portOrOptions, enableWebSocket: false }
    : portOrOptions;

  const { httpPort, wsPort, enableWebSocket = false } = options;

  // Start HTTP server
  const httpServer = Bun.serve({
    port: httpPort,
    async fetch(req) {
      try {
        return await router(req);
      } catch (error: any) {
        logger.error('Request handler error', error);
        return Response.json(
          { success: false, error: error.message || 'Internal server error' },
          { status: 500 }
        );
      }
    },
  });

  logger.info(`AWS Tools Service HTTP server listening on port ${httpPort}`);

  // Optionally start WebSocket server
  let wsServer: ReturnType<typeof Bun.serve> | undefined;
  if (enableWebSocket && wsPort) {
    wsServer = createWebSocketServer(wsPort);
  }

  return {
    http: httpServer,
    ws: wsServer,
    stop: () => {
      httpServer.stop();
      if (wsServer) {
        wsServer.stop();
      }
    },
  };
}
