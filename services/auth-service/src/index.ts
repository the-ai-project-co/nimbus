/**
 * Auth Service Entry Point
 * Handles SSO, device code flow, and token management
 */

import { startServer } from './server';
import { logger } from '@nimbus/shared-utils';

const PORT = parseInt(process.env.AUTH_SERVICE_PORT || '3012', 10);

logger.info('Starting Auth Service...');
await startServer(PORT);
