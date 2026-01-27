import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const PORT = parseInt(process.env.PORT || '3011');

async function main() {
  try {
    await startServer(PORT);
    logger.info(`State Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to start State Service', error);
    process.exit(1);
  }
}

main();
