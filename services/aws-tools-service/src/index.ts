import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const PORT = parseInt(process.env.PORT || '3009');


async function main() {
  try {
    await startServer(PORT);
    logger.info(`AWS Tools Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to start AWS Tools Service', error);
    process.exit(1);
  }
}

main();
