import { logger } from '@nimbus/shared-utils';
import { startServer } from './server';

const PORT = parseInt(process.env.PORT || '3006');


async function main() {
  try {
    await startServer(PORT);
    logger.info(`Terraform Tools Service started on port ${PORT}`);
  } catch (error) {
    logger.error('Failed to start Terraform Tools Service', error);
    process.exit(1);
  }
}

main();
