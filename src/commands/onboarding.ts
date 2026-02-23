/**
 * Onboarding Command
 *
 * First-run wizard that detects missing LLM credentials and guides
 * the user through initial setup. Runs before full app init so it
 * only depends on the auth store and wizard prompts.
 */

import { AuthStore } from '../auth/store';
import {
  PROVIDER_REGISTRY,
  getDefaultModel,
  validateProviderApiKey,
} from '../auth/providers';
import type { LLMProviderName } from '../auth/types';
import { ui } from '../wizard/ui';
import { select, input } from '../wizard/prompts';

export interface OnboardingOptions {
  /** Skip the wizard and exit immediately. */
  skip?: boolean;
}

/**
 * Check whether onboarding is needed.
 *
 * Returns `true` if no LLM credentials are found in the auth store
 * and no provider API key environment variables are set.
 */
export function needsOnboarding(): boolean {
  const store = new AuthStore();
  if (store.exists()) return false;

  const hasEnvKey = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.OPENROUTER_API_KEY
  );

  return !hasEnvKey;
}

/**
 * Run the first-run onboarding wizard.
 */
export async function onboardingCommand(options: OnboardingOptions = {}): Promise<void> {
  if (options.skip) return;

  const store = new AuthStore();

  // Double-check — if credentials exist, skip silently
  if (store.exists()) {
    return;
  }

  // Non-TTY detection: if stdin is not a TTY (piped input, CI, etc.),
  // skip the interactive wizard and show setup instructions instead.
  if (!process.stdin.isTTY) {
    ui.newLine();
    ui.info('No LLM provider configured. Set an API key via environment variable:');
    ui.newLine();
    ui.print('  export ANTHROPIC_API_KEY=sk-ant-...');
    ui.print('  export OPENAI_API_KEY=sk-...');
    ui.print('  export GOOGLE_API_KEY=...');
    ui.print('  export OPENROUTER_API_KEY=sk-or-...');
    ui.newLine();
    ui.info('Or run "nimbus login" in an interactive terminal.');
    ui.newLine();
    return;
  }

  try {
    // Welcome banner
    ui.newLine();
    ui.box({
      title: 'Welcome to Nimbus',
      content: [
        'AI-Powered Cloud Engineering Agent',
        '',
        "Let's get you set up with an LLM provider.",
        'This takes about 30 seconds.',
      ],
      style: 'rounded',
      borderColor: 'cyan',
      titleColor: 'brightCyan',
      padding: 1,
    });
    ui.newLine();

    // Provider selection
    const providerOptions = Object.values(PROVIDER_REGISTRY).map((p) => ({
      label: p.displayName,
      value: p.name,
      description: p.description,
    }));

    const provider = await select<LLMProviderName>({
      message: 'Which LLM provider would you like to use?',
      options: providerOptions,
      required: true,
    });

    if (!provider) {
      ui.newLine();
      ui.info('No provider selected. You can run "nimbus login" later to set up.');
      ui.newLine();
      return;
    }

    const providerInfo = PROVIDER_REGISTRY[provider];

    // API key input (skip for Ollama)
    let apiKey: string | undefined;
    let baseUrl: string | undefined;

    if (providerInfo.requiresApiKey) {
      ui.newLine();
      if (providerInfo.apiKeyUrl) {
        ui.info(`Get your API key at: ${ui.color(providerInfo.apiKeyUrl, 'cyan')}`);
      }
      ui.newLine();

      apiKey = await input({
        message: `Enter your ${providerInfo.displayName} API key`,
      });

      if (!apiKey) {
        ui.newLine();
        ui.warning('No API key entered. You can run "nimbus login" later to set up.');
        ui.newLine();
        return;
      }
    } else if (providerInfo.supportsBaseUrl) {
      // Ollama — ask for base URL
      ui.newLine();
      baseUrl = await input({
        message: 'Ollama server URL',
        defaultValue: providerInfo.defaultBaseUrl || 'http://localhost:11434',
      });
    }

    // Validate credentials
    ui.newLine();
    ui.startSpinner({ message: `Validating ${providerInfo.displayName} credentials...` });

    let validation: { valid: boolean; error?: string };
    try {
      validation = await validateProviderApiKey(provider, apiKey, baseUrl);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      ui.stopSpinnerFail(`Validation error: ${msg}`);
      ui.newLine();
      ui.info('You can retry with "nimbus login" or set the API key via environment variable.');
      ui.newLine();
      return;
    }

    if (!validation.valid) {
      ui.stopSpinnerFail(`Validation failed: ${validation.error}`);
      ui.newLine();
      ui.info('You can retry with "nimbus login" or set the API key via environment variable:');
      if (providerInfo.envVarName) {
        ui.info(`  export ${providerInfo.envVarName}=your-key`);
      }
      ui.newLine();
      return;
    }

    ui.stopSpinnerSuccess(`${providerInfo.displayName} credentials verified!`);

    // Save credentials
    const defaultModel = getDefaultModel(provider);

    store.setProvider(provider, {
      apiKey,
      baseUrl,
      model: defaultModel,
      isDefault: true,
      validatedAt: new Date().toISOString(),
    });

    // Create default config.yaml if it doesn't exist
    try {
      const { configManager } = await import('../config/manager');
      if (!configManager.exists()) {
        configManager.save();
      }
    } catch { /* non-critical */ }

    // Success message
    ui.newLine();
    ui.box({
      title: 'Setup Complete',
      content: [
        `Provider: ${providerInfo.displayName}`,
        `Model:    ${defaultModel}`,
        '',
        'You\'re ready to go! Starting interactive chat...',
      ],
      style: 'rounded',
      borderColor: 'green',
      titleColor: 'brightGreen',
      padding: 1,
    });
    ui.newLine();
  } catch (err: unknown) {
    // Catch-all for prompt failures (stdin closed, terminal not supported, etc.)
    const msg = err instanceof Error ? err.message : String(err);
    ui.newLine();
    ui.warning(`Onboarding wizard failed: ${msg}`);
    ui.newLine();
    ui.info('Set up manually with "nimbus login" or via environment variables:');
    ui.print('  export ANTHROPIC_API_KEY=sk-ant-...');
    ui.print('  export OPENAI_API_KEY=sk-...');
    ui.newLine();
  }
}
