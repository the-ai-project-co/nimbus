import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const PORT = parseInt(process.env.PORT || '3008');


async function main() {
  try {
    await startServer(PORT);
    logger.info(`Helm Tools Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to start Helm Tools Service', error);
    process.exit(1);
  }
}

main();
