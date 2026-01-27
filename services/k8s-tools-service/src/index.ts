import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const PORT = parseInt(process.env.PORT || '3007');


async function main() {
  try {
    await startServer(PORT);
    logger.info(`Kubernetes Tools Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to start Kubernetes Tools Service', error);
    process.exit(1);
  }
}

main();
