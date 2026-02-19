/**
 * Auth Profile Commands
 *
 * CLI commands for managing authentication profiles and switching providers
 */

import { AuthStore } from '../auth/store';
import { ui } from '../wizard/ui';

/**
 * List all configured providers
 */
async function authProfileListCommand(): Promise<void> {
  ui.header('Auth Profiles');

  const authStore = new AuthStore();
  const status = authStore.getStatus();

  if (!status.hasProviders) {
    ui.warning('No providers configured. Run "nimbus login" to set up authentication.');
    return;
  }

  ui.table({
    columns: [
      { key: 'name', header: 'Provider' },
      { key: 'model', header: 'Model' },
      { key: 'default', header: 'Default' },
      { key: 'validatedAt', header: 'Validated' },
    ],
    data: status.providers.map((p) => ({
      name: p.name,
      model: p.model || '-',
      default: p.isDefault ? 'Yes' : '',
      validatedAt: p.validatedAt ? new Date(p.validatedAt).toLocaleDateString() : '-',
    })),
  });
}

/**
 * Show the current default provider
 */
async function authProfileShowCommand(): Promise<void> {
  ui.header('Current Auth Profile');

  const authStore = new AuthStore();
  const defaultProvider = authStore.getDefaultProvider();

  if (!defaultProvider) {
    ui.warning('No default provider set. Run "nimbus login" to configure.');
    return;
  }

  const status = authStore.getStatus();
  const providerInfo = status.providers.find((p) => p.name === defaultProvider);

  ui.print(`  ${ui.color('Provider:', 'cyan')} ${defaultProvider}`);
  if (providerInfo) {
    ui.print(`  ${ui.color('Model:', 'cyan')} ${providerInfo.model || '-'}`);
    ui.print(`  ${ui.color('Validated:', 'cyan')} ${providerInfo.validatedAt ? new Date(providerInfo.validatedAt).toLocaleDateString() : '-'}`);
  }
}

/**
 * Switch the default provider
 */
async function authProfileSwitchCommand(provider: string): Promise<void> {
  ui.header(`Switch Auth Profile`);

  const authStore = new AuthStore();

  try {
    authStore.setDefaultProvider(provider as any);
    ui.success(`Default provider switched to "${provider}"`);
    ui.info(`Persisted to ${authStore.getAuthPath()}`);
  } catch (error: any) {
    ui.error(error.message);
    ui.info('Available providers:');
    const status = authStore.getStatus();
    status.providers.forEach((p) => {
      ui.print(`  - ${p.name}${p.isDefault ? ' (current default)' : ''}`);
    });
  }
}

/**
 * Main auth-profile command router
 */
export async function authProfileCommand(subcommand: string, args: string[]): Promise<void> {
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  switch (subcommand) {
    case 'list':
    case 'ls':
      await authProfileListCommand();
      break;
    case 'show':
      await authProfileShowCommand();
      break;
    case 'switch':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus auth-profile switch <provider>');
        ui.info('Example: nimbus auth-profile switch openai');
        return;
      }
      await authProfileSwitchCommand(positionalArgs[0]);
      break;
    default:
      ui.error(`Unknown auth-profile subcommand: ${subcommand || '(none)'}`);
      ui.info('Available commands: list, show, switch <provider>');
  }
}
