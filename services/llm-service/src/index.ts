import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const PORT = parseInt(process.env.PORT || '3002');
const WS_PORT = parseInt(process.env.WS_PORT || '3102');

async function main() {
  try {
    await startServer(PORT, WS_PORT);
    logger.info(`LLM Service started on port ${PORT} (WS: ${WS_PORT})`);
  } catch (error) {
    logger.error('Failed to start LLM Service', error);
    process.exit(1);
  }
}

main();
