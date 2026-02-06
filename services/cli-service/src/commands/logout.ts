/**
 * Logout Command
 *
 * Clear authentication credentials
 *
 * Usage: nimbus logout
 */

import { logger } from '@nimbus/shared-utils';
import { ui, confirm } from '../wizard';
import { authStore } from '../auth';

/**
 * Command options
 */
export interface LogoutOptions {
  force?: boolean;
}

/**
 * Run the logout command
 */
export async function logoutCommand(options: LogoutOptions = {}): Promise<boolean> {
  logger.info('Starting logout');

  // Get current auth status
  const status = authStore.getStatus();

  if (!status.hasIdentity && !status.hasProviders) {
    ui.info('You are not logged in.');
    return true;
  }

  // Display current state
  ui.section('Current Authentication State');

  if (status.identity) {
    ui.print(`  GitHub Identity: ${status.identity.username}${status.identity.name ? ` (${status.identity.name})` : ''}`);
  }

  if (status.providers.length > 0) {
    ui.print('  Configured Providers:');
    for (const provider of status.providers) {
      const defaultMarker = provider.isDefault ? ' (default)' : '';
      ui.print(`    • ${provider.name}${defaultMarker} - ${provider.model}`);
    }
  }

  ui.newLine();

  // Confirm logout
  if (!options.force) {
    const shouldLogout = await confirm({
      message: 'Are you sure you want to log out and clear all credentials?',
      defaultValue: false,
    });

    if (!shouldLogout) {
      ui.info('Logout cancelled');
      return false;
    }
  }

  // Clear credentials
  try {
    const authPath = authStore.getAuthPath();
    authStore.clear();

    ui.newLine();
    ui.success('Successfully logged out');
    ui.info(`Credentials removed from ${authPath}`);

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    ui.error(`Failed to log out: ${message}`);
    return false;
  }
}

export default logoutCommand;
