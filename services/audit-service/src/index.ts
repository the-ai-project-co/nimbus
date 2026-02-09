/**
 * Audit Service Entry Point
 * Handles audit logging and compliance reporting
 */

import { startServer } from './server';
import { logger } from '@nimbus/shared-utils';

const PORT = parseInt(process.env.AUDIT_SERVICE_PORT || '3015', 10);

logger.info('Starting Audit Service...');
await startServer(PORT);
