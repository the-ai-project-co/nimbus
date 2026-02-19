import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const HTTP_PORT = parseInt(process.env.PORT || '3016');

async function main() {
  try {
    const servers = await startServer({ httpPort: HTTP_PORT });
    logger.info(`GCP Tools Service started on port ${HTTP_PORT}`);
  } catch (error) {
    logger.error('Failed to start GCP Tools Service', error);
    process.exit(1);
  }
}

main();
