import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const PORT = parseInt(process.env.PORT || '3000');
const WS_PORT = parseInt(process.env.WS_PORT || '3100');

async function main() {
  try {
    await startServer(PORT, WS_PORT);
    logger.info(`CLI Service started on port ${PORT} (WS: ${WS_PORT})`);
  } catch (error) {
    logger.error('Failed to start CLI Service', error);
    process.exit(1);
  }
}

main();
