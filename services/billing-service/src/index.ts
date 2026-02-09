/**
 * Billing Service Entry Point
 * Handles Stripe integration, subscriptions, and usage tracking
 */

import { startServer } from './server';
import { logger } from '@nimbus/shared-utils';

const PORT = parseInt(process.env.BILLING_SERVICE_PORT || '3014', 10);

logger.info('Starting Billing Service...');
await startServer(PORT);
