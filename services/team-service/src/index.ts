/**
 * Team Service Entry Point
 * Handles team CRUD, members, and shared templates
 */

import { startServer } from './server';
import { logger } from '@nimbus/shared-utils';

const PORT = parseInt(process.env.TEAM_SERVICE_PORT || '3013', 10);

logger.info('Starting Team Service...');
await startServer(PORT);
