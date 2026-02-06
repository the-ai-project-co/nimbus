/**
 * Login Command - Login Wizard
 *
 * Interactive wizard for authenticating with GitHub and configuring LLM providers
 *
 * Usage: nimbus login
 */

import { logger } from '@nimbus/shared-utils';
import {
  createWizard,
  ui,
  select,
  confirm,
  input,
  type WizardStep,
  type StepResult,
} from '../wizard';
import {
  authStore,
  AuthStore,
  getProviderInfo,
  getProviderNames,
  getDefaultModel,
  validateProviderApiKey,
  GitHubDeviceFlow,
  completeGitHubAuth,
  type LoginWizardContext,
  type LLMProviderName,
  type LLMProviderCredential,
} from '../auth';

/**
 * Command options
 */
export interface LoginOptions {
  skipGitHub?: boolean;
  provider?: LLMProviderName;
  apiKey?: string;
  model?: string;
  nonInteractive?: boolean;
}

/**
 * Run the login command
 */
export async function loginCommand(options: LoginOptions = {}): Promise<boolean> {
  logger.info('Starting login wizard');

  // Non-interactive mode
  if (options.nonInteractive) {
    return await runNonInteractive(options);
  }

  // Interactive wizard mode
  const wizard = createWizard<LoginWizardContext>({
    title: 'nimbus login',
    description: 'Set up authentication and LLM providers',
    initialContext: {
      skipGitHub: options.skipGitHub,
      configuredProviders: [],
    },
    steps: createWizardSteps(),
    onEvent: (event) => {
      logger.debug('Wizard event', { type: event.type });
    },
  });

  const result = await wizard.run();

  if (result.success && result.context.completed) {
    return true;
  } else if (result.context.cancelled) {
    ui.warning('Login cancelled');
    return false;
  } else {
    ui.error(`Login failed: ${result.error?.message || 'Unknown error'}`);
    return false;
  }
}

/**
 * Create wizard steps
 */
function createWizardSteps(): WizardStep<LoginWizardContext>[] {
  return [
    // Step 1: Welcome
    {
      id: 'welcome',
      title: 'Welcome',
      execute: welcomeStep,
    },

    // Step 2: GitHub Identity (optional)
    {
      id: 'github-identity',
      title: 'GitHub Identity',
      execute: githubIdentityStep,
      canSkip: true,
    },

    // Step 3: LLM Provider Configuration Loop
    {
      id: 'providers-loop',
      title: 'LLM Provider Configuration',
      execute: providersLoopStep,
    },

    // Step 4: Set Default Provider
    {
      id: 'set-default',
      title: 'Set Default Provider',
      execute: setDefaultStep,
      condition: (ctx) => ctx.configuredProviders.length > 1,
    },

    // Step 5: Complete
    {
      id: 'complete',
      title: 'Setup Complete',
      execute: completeStep,
    },
  ];
}

/**
 * Step 1: Welcome
 */
async function welcomeStep(ctx: LoginWizardContext): Promise<StepResult> {
  ui.newLine();
  ui.box({
    title: 'Welcome to Nimbus',
    content: [
      'AI-Powered Cloud Engineering Agent',
      '',
      "Let's get you set up with authentication",
      'and LLM provider configuration.',
    ],
    style: 'rounded',
    borderColor: 'cyan',
    padding: 1,
  });
  ui.newLine();

  // Check existing auth state
  const status = authStore.getStatus();

  if (status.hasProviders) {
    ui.info('You already have configured providers:');
    for (const provider of status.providers) {
      const icon = provider.isDefault ? '★' : '•';
      ui.print(`    ${icon} ${provider.name} (${provider.model})`);
    }
    ui.newLine();

    const shouldContinue = await confirm({
      message: 'Do you want to reconfigure?',
      defaultValue: false,
    });

    if (!shouldContinue) {
      return { success: true, data: { cancelled: true }, skipRemaining: true };
    }

    // Clear existing providers when reconfiguring
    for (const provider of status.providers) {
      authStore.removeProvider(provider.name);
    }
    ui.info('Cleared existing provider configurations');
    ui.newLine();
  }

  return { success: true };
}

/**
 * Step 2: GitHub Identity (optional)
 */
async function githubIdentityStep(ctx: LoginWizardContext): Promise<StepResult> {
  ui.section('GitHub Identity (Optional)');

  // Check if already authenticated
  const existingIdentity = authStore.getIdentity();
  if (existingIdentity) {
    ui.info(`Currently signed in as: ${existingIdentity.username}`);
    const useExisting = await confirm({
      message: 'Keep existing GitHub identity?',
      defaultValue: true,
    });

    if (useExisting) {
      return { success: true, data: { githubIdentity: existingIdentity } };
    }
  }

  // Ask if they want to sign in with GitHub
  const shouldSignIn = await confirm({
    message: 'Sign in with GitHub?',
    defaultValue: true,
  });

  if (!shouldSignIn) {
    ui.info('Skipping GitHub sign-in');
    return { success: true, data: { skipGitHub: true } };
  }

  // GitHub Device Flow
  ui.newLine();
  ui.info('Starting GitHub Device Flow authentication...');
  ui.newLine();

  try {
    const deviceFlow = new GitHubDeviceFlow();

    // Request device code
    ui.startSpinner({ message: 'Requesting authorization code...' });
    const deviceCode = await deviceFlow.requestDeviceCode();
    ui.stopSpinnerSuccess('Authorization code received');

    // Display code for user
    ui.newLine();
    ui.box({
      title: 'GitHub Authorization',
      content: [
        `Open ${deviceCode.verification_uri} in your browser`,
        'and enter this code:',
        '',
        `    ${deviceCode.user_code}`,
        '',
        'Waiting for authorization...',
      ],
      style: 'rounded',
      borderColor: 'yellow',
      padding: 1,
    });
    ui.newLine();

    // Poll for authorization
    ui.startSpinner({ message: 'Waiting for authorization...' });

    const accessToken = await deviceFlow.waitForAuthorization(() => {
      // This callback is called on each poll
    });

    ui.stopSpinnerSuccess('Authorization successful');

    // Fetch user profile
    ui.startSpinner({ message: 'Fetching user profile...' });
    const identity = await completeGitHubAuth(accessToken);
    ui.stopSpinnerSuccess(`Signed in as ${identity.username}${identity.name ? ` (${identity.name})` : ''}`);

    // Save identity
    authStore.setIdentity(identity);

    return { success: true, data: { githubIdentity: identity } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    ui.stopSpinnerFail(`GitHub authentication failed: ${message}`);

    const skipGitHub = await confirm({
      message: 'Continue without GitHub sign-in?',
      defaultValue: true,
    });

    if (skipGitHub) {
      return { success: true, data: { skipGitHub: true } };
    }

    return { success: false, error: message };
  }
}

/**
 * Step 3: LLM Provider Configuration Loop
 */
async function providersLoopStep(ctx: LoginWizardContext): Promise<StepResult> {
  ui.section('LLM Provider Configuration');
  ui.print('Configure at least one LLM provider to use Nimbus.');
  ui.newLine();

  const configuredProviders: LoginWizardContext['configuredProviders'] = [];

  // Keep track of which providers are configured
  const configuredNames = new Set<LLMProviderName>();

  // Add loop - configure providers
  let addMore = true;

  while (addMore) {
    // Build provider options
    const providerOptions = getProviderNames().map((name) => {
      const info = getProviderInfo(name);
      const isConfigured = configuredNames.has(name);

      return {
        value: name,
        label: `${isConfigured ? '✓ ' : ''}${info.displayName}`,
        description: info.description,
        disabled: false,
      };
    });

    // Select provider
    const selectedProvider = await select<LLMProviderName>({
      message: 'Select an LLM provider:',
      options: providerOptions,
    });

    if (!selectedProvider) {
      if (configuredProviders.length === 0) {
        ui.error('At least one provider is required');
        continue;
      }
      break;
    }

    const providerInfo = getProviderInfo(selectedProvider);

    // Configure the selected provider
    let apiKey: string | undefined;
    let baseUrl: string | undefined;

    // Handle API key for providers that need it
    if (providerInfo.requiresApiKey) {
      ui.newLine();
      if (providerInfo.apiKeyUrl) {
        ui.info(`Get your key at: ${providerInfo.apiKeyUrl}`);
      }

      // Check for existing key in env
      const envKey = process.env[providerInfo.envVarName || ''];
      if (envKey) {
        ui.info(`Found ${providerInfo.envVarName} in environment`);
        const useEnvKey = await confirm({
          message: 'Use API key from environment variable?',
          defaultValue: true,
        });

        if (useEnvKey) {
          apiKey = envKey;
        }
      }

      // Prompt for API key if not using env
      if (!apiKey) {
        apiKey = await input({
          message: `Paste your ${providerInfo.displayName} API key:`,
        });

        if (!apiKey) {
          ui.error('API key is required');
          continue;
        }
      }

      // Validate API key
      ui.newLine();
      ui.startSpinner({ message: 'Validating API key...' });

      const validation = await validateProviderApiKey(selectedProvider, apiKey);

      if (!validation.valid) {
        ui.stopSpinnerFail(`Validation failed: ${validation.error}`);

        const retry = await confirm({
          message: 'Try again?',
          defaultValue: true,
        });

        if (retry) {
          continue;
        } else {
          // Skip this provider
          ui.info(`Skipping ${providerInfo.displayName}`);
          continue;
        }
      }

      ui.stopSpinnerSuccess('API key validated successfully');
    }

    // Handle base URL for Ollama
    if (providerInfo.supportsBaseUrl) {
      ui.newLine();
      const defaultUrl = providerInfo.defaultBaseUrl || 'http://localhost:11434';

      const customUrl = await confirm({
        message: `Use custom Ollama URL? (default: ${defaultUrl})`,
        defaultValue: false,
      });

      if (customUrl) {
        baseUrl = await input({
          message: 'Enter Ollama base URL:',
          defaultValue: defaultUrl,
        });
      } else {
        baseUrl = defaultUrl;
      }

      // Validate Ollama connection
      ui.startSpinner({ message: 'Checking Ollama connection...' });
      const validation = await validateProviderApiKey(selectedProvider, undefined, baseUrl);

      if (!validation.valid) {
        ui.stopSpinnerFail(`Connection failed: ${validation.error}`);

        const retry = await confirm({
          message: 'Try again?',
          defaultValue: true,
        });

        if (retry) {
          continue;
        } else {
          ui.info(`Skipping ${providerInfo.displayName}`);
          continue;
        }
      }

      ui.stopSpinnerSuccess('Ollama connected successfully');
    }

    // Select model
    ui.newLine();
    const modelOptions = providerInfo.models.map((m) => ({
      value: m.id,
      label: m.name + (m.isDefault ? ' (default)' : ''),
    }));

    const selectedModel = await select<string>({
      message: `Select default model for ${providerInfo.displayName}:`,
      options: modelOptions,
      defaultValue: getDefaultModel(selectedProvider),
    });

    const model = selectedModel || getDefaultModel(selectedProvider);

    // Add to configured providers
    configuredProviders.push({
      name: selectedProvider,
      apiKey,
      baseUrl,
      model,
    });
    configuredNames.add(selectedProvider);

    // Save provider credentials
    const credential: LLMProviderCredential = {
      model,
      validatedAt: new Date().toISOString(),
    };

    if (apiKey) {
      credential.apiKey = apiKey;
    }

    if (baseUrl) {
      credential.baseUrl = baseUrl;
    }

    authStore.setProvider(selectedProvider, credential);

    ui.newLine();
    ui.success(`${providerInfo.displayName} configured successfully`);
    ui.newLine();

    // Ask to add another provider
    addMore = await confirm({
      message: 'Add another LLM provider?',
      defaultValue: false,
    });
  }

  if (configuredProviders.length === 0) {
    return { success: false, error: 'At least one provider is required' };
  }

  return {
    success: true,
    data: { configuredProviders },
  };
}

/**
 * Step 4: Set Default Provider
 */
async function setDefaultStep(ctx: LoginWizardContext): Promise<StepResult> {
  ui.section('Set Default Provider');

  const providerOptions = ctx.configuredProviders.map((p) => {
    const info = getProviderInfo(p.name);
    return {
      value: p.name,
      label: info.displayName,
      description: `Model: ${p.model}`,
    };
  });

  const selectedDefault = await select<LLMProviderName>({
    message: 'Select your default LLM provider:',
    options: providerOptions,
    defaultValue: ctx.configuredProviders[0]?.name,
  });

  if (selectedDefault) {
    authStore.setDefaultProvider(selectedDefault);
    return { success: true, data: { defaultProvider: selectedDefault } };
  }

  // Use first provider as default
  const firstProvider = ctx.configuredProviders[0]?.name;
  if (firstProvider) {
    authStore.setDefaultProvider(firstProvider);
  }

  return { success: true, data: { defaultProvider: firstProvider } };
}

/**
 * Step 5: Complete
 */
async function completeStep(ctx: LoginWizardContext): Promise<StepResult> {
  ui.newLine();

  // Build summary content
  const content: string[] = [''];

  // Identity section
  if (ctx.githubIdentity) {
    content.push(`Identity: ${ctx.githubIdentity.username}${ctx.githubIdentity.name ? ` (${ctx.githubIdentity.name})` : ''}`);
  } else {
    content.push('Identity: (not configured)');
  }
  content.push('');

  // Providers section
  content.push('Providers:');
  for (const provider of ctx.configuredProviders) {
    const info = getProviderInfo(provider.name);
    const isDefault = ctx.defaultProvider === provider.name || ctx.configuredProviders.length === 1;
    const defaultMarker = isDefault ? ' (default)' : '';
    const maskedKey = provider.apiKey ? AuthStore.maskApiKey(provider.apiKey) : '(no key needed)';
    content.push(`  • ${info.displayName}${defaultMarker}`);
    content.push(`    Key: ${maskedKey}`);
    content.push(`    Model: ${provider.model}`);
  }
  content.push('');

  // Next steps
  content.push('Run `nimbus generate terraform` to get started!');
  content.push('');

  ui.box({
    title: '✓ Setup Complete',
    content,
    style: 'rounded',
    borderColor: 'green',
    padding: 1,
  });
  ui.newLine();

  return { success: true, data: { completed: true } };
}

/**
 * Run in non-interactive mode
 */
async function runNonInteractive(options: LoginOptions): Promise<boolean> {
  ui.header('nimbus login', 'Non-interactive mode');

  // Validate required options
  if (!options.provider) {
    ui.error('Provider is required in non-interactive mode (--provider)');
    return false;
  }

  const providerInfo = getProviderInfo(options.provider);
  if (!providerInfo) {
    ui.error(`Unknown provider: ${options.provider}`);
    return false;
  }

  // Get API key
  let apiKey = options.apiKey;
  if (providerInfo.requiresApiKey && !apiKey) {
    // Try environment variable
    apiKey = process.env[providerInfo.envVarName || ''];
    if (!apiKey) {
      ui.error(`API key is required. Set --api-key or ${providerInfo.envVarName} environment variable.`);
      return false;
    }
  }

  // Validate
  ui.startSpinner({ message: 'Validating credentials...' });

  const validation = await validateProviderApiKey(options.provider, apiKey);

  if (!validation.valid) {
    ui.stopSpinnerFail(`Validation failed: ${validation.error}`);
    return false;
  }

  ui.stopSpinnerSuccess('Credentials validated');

  // Save credentials
  const model = options.model || getDefaultModel(options.provider);
  const credential: LLMProviderCredential = {
    model,
    validatedAt: new Date().toISOString(),
  };

  if (apiKey) {
    credential.apiKey = apiKey;
  }

  authStore.setProvider(options.provider, credential);

  ui.success(`${providerInfo.displayName} configured with model ${model}`);
  return true;
}

export default loginCommand;
