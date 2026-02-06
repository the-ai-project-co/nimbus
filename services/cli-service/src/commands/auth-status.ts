/**
 * Auth Status Command
 *
 * Display current authentication status
 *
 * Usage: nimbus auth status
 */

import { logger } from '@nimbus/shared-utils';
import { ui } from '../wizard';
import { authStore, AuthStore, getProviderInfo } from '../auth';

/**
 * Command options
 */
export interface AuthStatusOptions {
  json?: boolean;
}

/**
 * Run the auth status command
 */
export async function authStatusCommand(options: AuthStatusOptions = {}): Promise<void> {
  logger.info('Checking auth status');

  const status = authStore.getStatus();

  // JSON output mode
  if (options.json) {
    // Build safe JSON output (no raw API keys)
    const safeOutput = {
      isConfigured: status.isConfigured,
      identity: status.identity
        ? {
            provider: status.identity.provider,
            username: status.identity.username,
            name: status.identity.name,
            authenticatedAt: status.identity.authenticatedAt,
          }
        : null,
      providers: status.providers.map((p) => ({
        name: p.name,
        model: p.model,
        isDefault: p.isDefault,
        validatedAt: p.validatedAt,
      })),
      defaultProvider: status.defaultProvider,
    };

    // Output sanitized JSON (no sensitive data included)
    ui.print(JSON.stringify(safeOutput, null, 2));
    return;
  }

  // Human-readable output
  ui.newLine();
  ui.section('Authentication Status');

  // Overall status
  if (status.isConfigured) {
    ui.success('Nimbus is configured and ready to use');
  } else {
    ui.warning('Nimbus is not configured. Run `nimbus login` to get started.');
  }
  ui.newLine();

  // Identity section
  ui.print(ui.bold('Identity'));

  if (status.identity) {
    const identity = status.identity;
    ui.print(`  Provider:     GitHub`);
    ui.print(`  Username:     ${identity.username}`);
    if (identity.name) {
      ui.print(`  Name:         ${identity.name}`);
    }
    ui.print(`  Signed in:    ${formatDate(identity.authenticatedAt)}`);
  } else {
    ui.print(ui.dim('  Not signed in'));
    ui.print(ui.dim('  Run `nimbus login` to sign in with GitHub'));
  }
  ui.newLine();

  // Providers section
  ui.print(ui.bold('LLM Providers'));

  if (status.providers.length > 0) {
    for (const provider of status.providers) {
      const info = getProviderInfo(provider.name);
      const defaultMarker = provider.isDefault ? ui.color(' (default)', 'green') : '';

      ui.print(`  ${info.displayName}${defaultMarker}`);
      ui.print(`    Model:      ${provider.model}`);

      // Get the actual credential to show masked key
      const credential = authStore.getProvider(provider.name);
      if (credential?.apiKey) {
        ui.print(`    API Key:    ${AuthStore.maskApiKey(credential.apiKey)}`);
      } else if (!info.requiresApiKey) {
        ui.print(`    API Key:    ${ui.dim('(not required)')}`);
      } else {
        ui.print(`    API Key:    ${ui.dim('(from environment)')}`);
      }

      if (credential?.baseUrl) {
        ui.print(`    Base URL:   ${credential.baseUrl}`);
      }

      if (provider.validatedAt) {
        ui.print(`    Validated:  ${formatDate(provider.validatedAt)}`);
      }
      ui.newLine();
    }
  } else {
    ui.print(ui.dim('  No providers configured'));
    ui.print(ui.dim('  Run `nimbus login` to configure LLM providers'));
    ui.newLine();
  }

  // Auth file location
  ui.print(ui.dim(`Config: ${authStore.getAuthPath()}`));
  ui.newLine();
}

/**
 * Format ISO date string for display
 */
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

export default authStatusCommand;
