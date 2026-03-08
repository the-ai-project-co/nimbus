/**
 * Onboarding Command
 *
 * First-run wizard that detects missing LLM credentials and guides
 * the user through initial setup. Runs before full app init so it
 * only depends on the auth store and wizard prompts.
 */

import { AuthStore } from '../auth/store';
import { PROVIDER_REGISTRY, getDefaultModel, validateProviderApiKey } from '../auth/providers';
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
  if (store.exists()) {
    return false;
  }

  const hasEnvKey = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.TOGETHER_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.FIREWORKS_API_KEY ||
    process.env.PERPLEXITY_API_KEY ||
    process.env.AWS_ACCESS_KEY_ID
  );

  return !hasEnvKey;
}

/**
 * Run the first-run onboarding wizard.
 */
export async function onboardingCommand(options: OnboardingOptions = {}): Promise<void> {
  if (options.skip) {
    return;
  }

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
    ui.print('  export GROQ_API_KEY=gsk_...');
    ui.print('  export DEEPSEEK_API_KEY=sk-...');
    ui.newLine();
    ui.info('Or run "nimbus login" in an interactive terminal.');
    ui.newLine();
    return;
  }

  try {
    // Welcome banner — DevOps-first identity
    ui.newLine();
    ui.box({
      title: 'Welcome to Nimbus — AI-Powered DevOps Terminal',
      content: [
        'Plan, apply, and manage Terraform, Kubernetes, Helm,',
        'AWS, GCP, and Azure using natural language.',
        '',
        "Let's get you set up. This takes about 30 seconds.",
        '',
        'After setup you can:',
        '  nimbus                          Open interactive DevOps terminal',
        '  nimbus run "tf plan --explain"  Run agent non-interactively',
        '  nimbus status                   Live infra health dashboard',
      ],
      style: 'rounded',
      borderColor: 'cyan',
      titleColor: 'brightCyan',
      padding: 1,
    });
    ui.newLine();

    // Gap 12: Show env var shortcut for power users before the wizard
    ui.print(ui.dim('─────────────────────────────────────────────────────'));
    ui.print(ui.dim('  Quick setup: export an API key and restart nimbus.'));
    ui.print(ui.dim('  export ANTHROPIC_API_KEY=sk-ant-...'));
    ui.print(ui.dim('  export OPENAI_API_KEY=sk-...'));
    ui.print(ui.dim('  export GOOGLE_API_KEY=...'));
    ui.print(ui.dim('─────────────────────────────────────────────────────'));
    ui.newLine();

    // Provider selection
    const providerOptions = Object.values(PROVIDER_REGISTRY).map(p => ({
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

      // Retry loop: re-prompt on invalid key (up to 3 attempts)
      const MAX_ATTEMPTS = 3;
      let attempt = 0;
      let validated = false;

      while (attempt < MAX_ATTEMPTS) {
        attempt++;

        apiKey = await input({
          message:
            attempt === 1
              ? `Enter your ${providerInfo.displayName} API key`
              : `Enter your ${providerInfo.displayName} API key (attempt ${attempt}/${MAX_ATTEMPTS})`,
        });

        if (!apiKey) {
          ui.newLine();
          ui.warning('No API key entered. You can run "nimbus login" later to set up.');
          ui.newLine();
          return;
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
          if (attempt < MAX_ATTEMPTS) {
            ui.warning('Please check your key and try again.');
            ui.newLine();
            continue;
          }
          ui.newLine();
          ui.info('You can retry with "nimbus login" or set the API key via environment variable.');
          ui.newLine();
          return;
        }

        if (!validation.valid) {
          ui.stopSpinnerFail(`Invalid key: ${validation.error}`);
          if (attempt < MAX_ATTEMPTS) {
            ui.warning('Please check your key and try again.');
            ui.newLine();
            continue;
          }
          ui.newLine();
          ui.info('You can retry with "nimbus login" or set the API key via environment variable:');
          if (providerInfo.envVarName) {
            ui.info(`  export ${providerInfo.envVarName}=your-key`);
          }
          ui.newLine();
          return;
        }

        ui.stopSpinnerSuccess(`${providerInfo.displayName} credentials verified!`);
        validated = true;
        break;
      }

      if (!validated) {
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

    // Detect live infra stack from current directory (Terraform, K8s, Helm, etc.)
    let detectedInfraStack: string[] = [];
    try {
      const { existsSync, readdirSync } = await import('node:fs');
      const cwd = process.cwd();
      const files = readdirSync(cwd);
      if (files.some(f => f.endsWith('.tf') || f === 'terraform')) detectedInfraStack.push('terraform');
      if (files.some(f => f === 'Chart.yaml' || f === 'helmfile.yaml')) detectedInfraStack.push('helm');
      if (files.some(f => f.endsWith('.yaml') || f.endsWith('.yml'))) {
        // Check if any yaml looks like K8s
        const yamls = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml')).slice(0, 5);
        for (const y of yamls) {
          try {
            const txt = require('node:fs').readFileSync(require('node:path').join(cwd, y), 'utf-8');
            if (txt.includes('apiVersion:') && txt.includes('kind:')) { detectedInfraStack.push('kubernetes'); break; }
          } catch { /* skip */ }
        }
      }
      if (existsSync(require('node:path').join(cwd, 'docker-compose.yaml')) || existsSync(require('node:path').join(cwd, 'docker-compose.yml')) || existsSync(require('node:path').join(cwd, 'Dockerfile'))) {
        detectedInfraStack.push('docker');
      }
    } catch { /* non-critical */ }

    if (detectedInfraStack.length > 0) {
      ui.newLine();
      ui.print(ui.color(`Detected infrastructure: ${detectedInfraStack.join(', ')}`, 'green'));
      ui.print(ui.dim('Nimbus will use this context to give better DevOps assistance.'));
    }

    // C5: Cloud provider selection step
    let primaryClouds: string[] = [];
    try {
      const cloudInput = await input({
        message: 'Which cloud providers do you primarily use? (comma-separated: aws, gcp, azure, or none)',
        defaultValue: 'none',
      });
      if (cloudInput && cloudInput.trim().toLowerCase() !== 'none') {
        primaryClouds = cloudInput
          .split(',')
          .map((s: string) => s.trim().toLowerCase())
          .filter((s: string) => ['aws', 'gcp', 'azure'].includes(s));
      }
    } catch { /* non-critical — prompt may fail in non-interactive environments */ }

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
    } catch {
      /* non-critical */
    }

    // C5: Save primaryClouds to ~/.nimbus/config.json
    if (primaryClouds.length > 0) {
      try {
        const { existsSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
        const { join } = await import('node:path');
        const { homedir } = await import('node:os');
        const configJsonPath = join(homedir(), '.nimbus', 'config.json');
        mkdirSync(join(homedir(), '.nimbus'), { recursive: true });
        let configData: Record<string, unknown> = {};
        if (existsSync(configJsonPath)) {
          try {
            configData = JSON.parse(readFileSync(configJsonPath, 'utf-8')) as Record<string, unknown>;
          } catch { /* start fresh */ }
        }
        configData.primaryClouds = primaryClouds;
        writeFileSync(configJsonPath, JSON.stringify(configData, null, 2), 'utf-8');
      } catch { /* non-critical */ }
    }

    // Success message
    ui.newLine();
    ui.box({
      title: 'Setup Complete',
      content: [
        `Provider: ${providerInfo.displayName}`,
        `Model:    ${defaultModel}`,
        '',
        "You're ready to go! Starting interactive chat...",
      ],
      style: 'rounded',
      borderColor: 'green',
      titleColor: 'brightGreen',
      padding: 1,
    });
    // G3: DevOps context wizard — offer to run nimbus init after LLM setup
    try {
      const devopsSetup = await select<string>({
        message: 'Would you like to set up your DevOps context now? (recommended)',
        options: [
          { label: 'Yes, detect my infrastructure', value: 'yes' },
          { label: 'No, I\'ll run nimbus init later', value: 'no' },
        ],
      });
      if (devopsSetup === 'yes') {
        ui.newLine();
        ui.startSpinner({ message: 'Detecting infrastructure context...' });
        try {
          const { runInit } = await import('../cli/init');
          await runInit({ cwd: process.cwd(), quiet: false });
          ui.stopSpinnerSuccess('NIMBUS.md generated — your infra context is ready');
        } catch (initErr) {
          ui.stopSpinnerFail('Could not generate NIMBUS.md (run `nimbus init` manually)');
        }
      }
    } catch { /* non-critical — prompt may fail in non-interactive environments */ }

    // GAP-4: Offer to install shell completions with clear success/failure feedback
    try {
      ui.newLine();
      const installCompletions = await select<string>({
        message: 'Install shell completions for nimbus? (adds tab completion)',
        options: [
          { label: 'Yes, install completions', value: 'yes' },
          { label: 'No, skip', value: 'no' },
        ],
      });
      if (installCompletions === 'yes') {
        try {
          const { completionsCommand } = await import('./completions');
          await completionsCommand('install');
          ui.success('Shell completions installed successfully!');
          // Write marker file so nimbus can detect first-run tip
          try {
            const { mkdirSync, writeFileSync } = await import('node:fs');
            const { join } = await import('node:path');
            const { homedir } = await import('node:os');
            mkdirSync(join(homedir(), '.nimbus'), { recursive: true });
            writeFileSync(join(homedir(), '.nimbus', 'completions-installed'), '1', 'utf-8');
          } catch { /* non-critical */ }
        } catch (completionErr) {
          const shell = process.env.SHELL ?? '';
          ui.warning(`Could not auto-install completions: ${completionErr instanceof Error ? completionErr.message : String(completionErr)}`);
          if (/zsh/.test(shell)) {
            ui.print(ui.dim('  Manual install: nimbus completions install'));
            ui.print(ui.dim('  Then add to ~/.zshrc: fpath=(~/.zsh/completions $fpath) && autoload -U compinit && compinit'));
          } else if (/bash/.test(shell)) {
            ui.print(ui.dim('  Manual install: nimbus completions install'));
          } else {
            ui.print(ui.dim('  Manual install: nimbus completions install'));
          }
        }
      }
    } catch { /* non-critical — prompt may fail in non-interactive environments */ }

    // C3/H1: Optional CI/CD and monitoring env vars
    ui.newLine();
    ui.print(ui.dim('Optional: Set these env vars for full DevOps integration:'));
    ui.print(ui.dim('  GITLAB_TOKEN=<token>          # GitLab CI pipeline access'));
    ui.print(ui.dim('  CIRCLECI_TOKEN=<token>        # CircleCI pipeline access'));
    ui.print(ui.dim('  PROMETHEUS_URL=<url>          # Prometheus metrics queries'));
    ui.print(ui.dim('  GRAFANA_URL=<url>             # Grafana dashboard access'));
    ui.print(ui.dim('  GRAFANA_TOKEN=<token>         # Grafana API token'));
    ui.print(ui.dim('  DD_API_KEY=<key>              # Datadog metrics/alerts'));
    ui.print(ui.dim('  PD_API_KEY=<key>              # PagerDuty incident management (Gap 5)'));
    ui.print(ui.dim('  OPSGENIE_API_KEY=<key>        # Opsgenie alert management (Gap 5)'));
    ui.print(ui.dim('  BRAVE_API_KEY=<key>           # Enhanced web search'));
    ui.newLine();

    // C1/C2: Transition message before TUI launches
    ui.print('\x1b[32m  Setup complete! Launching Nimbus DevOps Agent...\x1b[0m');
    ui.print(ui.dim('  (Type ? for help, Tab to switch modes, Ctrl+C to exit)'));
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
