/**
 * Enterprise module barrel re-exports.
 *
 * Provides a single import point for all embedded enterprise functionality:
 *   - Auth: device flow and token management (replaces auth-service)
 *   - Teams: team CRUD and member management (replaces team-service)
 *   - Billing: subscriptions and usage tracking (replaces billing-service)
 *   - Audit: audit logging and export (replaces audit-service)
 *
 * Usage:
 *   import { initiateDeviceFlow, createTeam, subscribe, createLog } from '../enterprise';
 */

export * from './auth';
export * from './teams';
export * from './billing';
export * from './audit';
