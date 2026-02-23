/**
 * Auth List Command
 *
 * Display all available providers and their configuration status
 *
 * Usage: nimbus auth list
 */

import { logger } from '../utils';
import { ui } from '../wizard';
import {
  authStore,
  AuthStore,
  getProviderNames,
  getProviderInfo,
  type LLMProviderName,
} from '../auth';

/**
 * Command options
 */
export interface AuthListOptions {
  json?: boolean;
}

/**
 * Run the auth list command
 */
export async function authListCommand(options: AuthListOptions = {}): Promise<void> {
  logger.info('Listing auth providers');

  const providerNames = getProviderNames();
  const status = authStore.getStatus();
  const configuredProviders = new Set(status.providers.map((p) => p.name));

  // Build provider data
  const providerData = providerNames.map((name) => {
    const info = getProviderInfo(name);
    const credential = authStore.getProvider(name);
    const isConfigured = configuredProviders.has(name);
    const isDefault = status.defaultProvider === name;

    return {
      name,
      displayName: info.displayName,
      description: info.description,
      isConfigured,
      isDefault,
      model: credential?.model || info.models.find((m) => m.isDefault)?.id || info.models[0].id,
      apiKey: credential?.apiKey,
      baseUrl: credential?.baseUrl,
      requiresApiKey: info.requiresApiKey,
      apiKeyUrl: info.apiKeyUrl,
    };
  });

  // JSON output mode
  if (options.json) {
    const safeOutput = providerData.map((p) => ({
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      isConfigured: p.isConfigured,
      isDefault: p.isDefault,
      model: p.model,
      apiKey: p.apiKey ? AuthStore.maskApiKey(p.apiKey) : null,
      baseUrl: p.baseUrl,
      requiresApiKey: p.requiresApiKey,
    }));

    // Output sanitized JSON (API keys are already masked above)
    ui.print(JSON.stringify(safeOutput, null, 2));
    return;
  }

  // Human-readable table output
  ui.newLine();
  ui.section('LLM Providers');

  // Build table data
  const tableData: Array<Record<string, string>> = [];

  for (const provider of providerData) {
    const statusIcon = provider.isConfigured ? ui.color('✓', 'green') : ui.dim('—');
    const statusText = provider.isConfigured ? 'Configured' : 'Not configured';

    let apiKeyDisplay: string;
    if (provider.isConfigured && provider.apiKey) {
      apiKeyDisplay = AuthStore.maskApiKey(provider.apiKey);
    } else if (!provider.requiresApiKey) {
      apiKeyDisplay = ui.dim('(not needed)');
    } else if (provider.isConfigured) {
      apiKeyDisplay = ui.dim('(from env)');
    } else {
      apiKeyDisplay = ui.dim('—');
    }

    const modelDisplay = provider.isConfigured ? provider.model : ui.dim(provider.model);
    const defaultDisplay = provider.isDefault ? ui.color('★', 'yellow') : '';

    tableData.push({
      provider: `${statusIcon} ${provider.displayName}`,
      status: statusText,
      apiKey: apiKeyDisplay,
      model: modelDisplay,
      default: defaultDisplay,
    });
  }

  // Display table
  ui.table({
    columns: [
      { key: 'provider', header: 'Provider', width: 25 },
      { key: 'status', header: 'Status', width: 15 },
      { key: 'apiKey', header: 'API Key', width: 20 },
      { key: 'model', header: 'Model', width: 30 },
      { key: 'default', header: 'Default', width: 8 },
    ],
    data: tableData,
  });

  ui.newLine();

  // Show hints for unconfigured providers
  const unconfigured = providerData.filter((p) => !p.isConfigured);
  if (unconfigured.length > 0) {
    ui.print(ui.dim('To configure a provider, run `nimbus login`'));
    ui.newLine();

    ui.print(ui.dim('API key URLs:'));
    for (const provider of unconfigured) {
      if (provider.apiKeyUrl) {
        ui.print(ui.dim(`  ${provider.displayName}: ${provider.apiKeyUrl}`));
      }
    }
    ui.newLine();
  }
}

export default authListCommand;
