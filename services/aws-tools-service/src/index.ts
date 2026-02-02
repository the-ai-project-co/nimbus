import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const HTTP_PORT = parseInt(process.env.PORT || '3009');
const WS_PORT = parseInt(process.env.WS_PORT || '3010');
const ENABLE_WS = process.env.ENABLE_WS === 'true';

async function main() {
  try {
    const servers = await startServer({
      httpPort: HTTP_PORT,
      wsPort: WS_PORT,
      enableWebSocket: ENABLE_WS,
    });

    logger.info(`AWS Tools Service started on port ${HTTP_PORT}`);
    if (ENABLE_WS) {
      logger.info(`AWS Tools Service WebSocket server started on port ${WS_PORT}`);
    }
  } catch (error) {
    logger.error('Failed to start AWS Tools Service', error);
    process.exit(1);
  }
}

main();
