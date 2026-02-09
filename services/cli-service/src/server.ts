import { logger } from '@nimbus/shared-utils';
import { healthHandler } from './routes/health';
import {
  generateTerraformCommand,
  type GenerateTerraformOptions,
  awsDiscoverCommand,
  type AwsDiscoverOptions,
  awsTerraformCommand,
  type AwsTerraformOptions,
  loginCommand,
  type LoginOptions,
  logoutCommand,
  type LogoutOptions,
  authStatusCommand,
  type AuthStatusOptions,
  authListCommand,
  type AuthListOptions,
  chatCommand,
  type ChatOptions,
  configCommand,
  type ConfigSetOptions,
  type ConfigGetOptions,
  type ConfigListOptions,
  type ConfigInitOptions,
  initCommand,
  type InitOptions,
  // Infrastructure tool commands
  tfCommand,
  k8sCommand,
  helmCommand,
  gitCommand,
  // History command
  historyCommand,
  historyShowCommand,
  type HistoryOptions,
  // GitHub CLI commands
  ghCommand,
  // Enterprise commands
  teamCommand,
  parseTeamCreateOptions,
  parseTeamInviteOptions,
  parseTeamMembersOptions,
  parseTeamRemoveOptions,
  parseTeamSwitchOptions,
  billingCommand,
  parseBillingStatusOptions,
  parseBillingUpgradeOptions,
  parseBillingInvoicesOptions,
  usageCommand,
  parseUsageOptions,
  auditCommand,
  parseAuditListOptions,
  parseAuditExportOptions,
  analyzeCommand,
  parseAnalyzeOptions,
  // Generate commands
  generateK8sCommand,
  type GenerateK8sOptions,
  generateHelmCommand,
  type GenerateHelmOptions,
  // Utility commands
  versionCommand,
  type VersionOptions,
  helpCommand,
  type HelpOptions,
  doctorCommand,
  type DoctorOptions,
  // Apply commands
  applyCommand,
  // AI-powered commands
  askCommand,
  type AskOptions,
  explainCommand,
  type ExplainOptions,
  fixCommand,
  type FixOptions,
  // Plan command
  planCommand,
  parsePlanOptions,
} from './commands';
import { requiresAuth, type LLMProviderName } from './auth';

export async function startServer(port: number, wsPort: number) {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      // Health check endpoint
      if (path === '/health') {
        return Response.json(healthHandler());
      }

      // Generate Terraform API endpoint (for triggering from HTTP)
      if (path === '/api/generate/terraform' && method === 'POST') {
        try {
          const body = await req.json() as GenerateTerraformOptions;
          // Run in non-interactive mode for API calls
          body.nonInteractive = true;
          await generateTerraformCommand(body);
          return Response.json({ success: true, message: 'Generation started' });
        } catch (error: any) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }
      }

      // AWS Discover API endpoint
      if (path === '/api/aws/discover' && method === 'POST') {
        try {
          const body = await req.json() as AwsDiscoverOptions;
          body.nonInteractive = true;
          const result = await awsDiscoverCommand(body);
          return Response.json({ success: true, data: result });
        } catch (error: any) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }
      }

      // AWS Terraform API endpoint
      if (path === '/api/aws/terraform' && method === 'POST') {
        try {
          const body = await req.json() as AwsTerraformOptions;
          body.nonInteractive = true;
          await awsTerraformCommand(body);
          return Response.json({ success: true, message: 'Generation started' });
        } catch (error: any) {
          return Response.json({ success: false, error: error.message }, { status: 500 });
        }
      }

      // 404
      return new Response('Not Found', { status: 404 });
    },
  });

  logger.info(`CLI Service HTTP server listening on port ${port}`);
  logger.info(`Available routes:`);
  logger.info(`  - GET  /health`);
  logger.info(`  - POST /api/generate/terraform`);
  logger.info(`  - POST /api/aws/discover`);
  logger.info(`  - POST /api/aws/terraform`);

  // TODO: WebSocket server setup
  logger.info(`CLI Service WebSocket server will listen on port ${wsPort}`);

  return server;
}

/**
 * Run CLI command directly (for `nimbus <command> <subcommand>`)
 */
export async function runCommand(args: string[]): Promise<void> {
  const command = args[0];
  const subcommand = args[1];

  // ==========================================
  // Auth commands (always available, no guard)
  // ==========================================

  // nimbus login
  if (command === 'login') {
    const options: LoginOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--skip-github') {
        options.skipGitHub = true;
      } else if (arg === '--provider' && args[i + 1]) {
        options.provider = args[++i] as LLMProviderName;
      } else if (arg === '--api-key' && args[i + 1]) {
        options.apiKey = args[++i];
      } else if (arg === '--model' && args[i + 1]) {
        options.model = args[++i];
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      } else if (arg === '--sso') {
        options.sso = true;
      }
    }

    await loginCommand(options);
    return;
  }

  // nimbus logout
  if (command === 'logout') {
    const options: LogoutOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--force' || arg === '-f') {
        options.force = true;
      }
    }

    await logoutCommand(options);
    return;
  }

  // nimbus auth status
  if (command === 'auth' && subcommand === 'status') {
    const options: AuthStatusOptions = {};

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--json') {
        options.json = true;
      }
    }

    await authStatusCommand(options);
    return;
  }

  // nimbus auth list
  if (command === 'auth' && subcommand === 'list') {
    const options: AuthListOptions = {};

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--json') {
        options.json = true;
      }
    }

    await authListCommand(options);
    return;
  }

  // nimbus version
  if (command === 'version' || command === '-v' || command === '--version') {
    const options: VersionOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--verbose' || arg === '-v') {
        options.verbose = true;
      } else if (arg === '--json') {
        options.json = true;
      }
    }

    await versionCommand(options);
    return;
  }

  // nimbus help
  if (command === 'help' || command === '-h' || command === '--help') {
    const options: HelpOptions = {};

    // Check for command-specific help
    if (subcommand && !subcommand.startsWith('-')) {
      options.command = subcommand;
    }

    await helpCommand(options);
    return;
  }

  // nimbus doctor
  if (command === 'doctor') {
    const options: DoctorOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--fix') {
        options.fix = true;
      } else if (arg === '--verbose' || arg === '-v') {
        options.verbose = true;
      } else if (arg === '--json') {
        options.json = true;
      }
    }

    await doctorCommand(options);
    return;
  }

  // nimbus init
  if (command === 'init') {
    const options: InitOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--force' || arg === '-f') {
        options.force = true;
      } else if ((arg === '--name' || arg === '-n') && args[i + 1]) {
        options.name = args[++i];
      } else if (arg === '--provider' && args[i + 1]) {
        options.provider = args[++i];
      } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
        options.output = args[++i];
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      }
    }

    await initCommand(options);
    return;
  }

  // ==========================================
  // Auth guard - check authentication for other commands
  // ==========================================
  // Check if running in non-interactive mode
  const isNonInteractive = args.includes('--non-interactive');

  if (requiresAuth()) {
    if (isNonInteractive) {
      console.error('');
      console.error('Error: Authentication required but running in non-interactive mode.');
      console.error('Please run `nimbus login` first, or set provider API keys via environment variables.');
      console.error('');
      process.exit(1);
    }

    console.log('');
    console.log('Welcome to Nimbus! You need to set up authentication first.');
    console.log('');

    const success = await loginCommand({});
    if (!success) {
      process.exit(1);
    }
    console.log('');
  }

  // ==========================================
  // Infrastructure commands (require auth)
  // ==========================================

  // nimbus generate terraform
  if (command === 'generate' && subcommand === 'terraform') {
    const options: GenerateTerraformOptions = {};

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--profile' && args[i + 1]) {
        options.profile = args[++i];
      } else if (arg === '--regions' && args[i + 1]) {
        options.regions = args[++i].split(',');
      } else if (arg === '--services' && args[i + 1]) {
        options.services = args[++i].split(',');
      } else if (arg === '--output' && args[i + 1]) {
        options.output = args[++i];
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      } else if (arg === '--accept-all-improvements') {
        options.acceptAllImprovements = true;
      } else if (arg === '--reject-all-improvements') {
        options.rejectAllImprovements = true;
      } else if (arg === '--mock') {
        options.mock = true;
      }
    }

    await generateTerraformCommand(options);
    return;
  }

  // nimbus generate k8s (or nimbus generate-k8s)
  if ((command === 'generate' && subcommand === 'k8s') || command === 'generate-k8s') {
    const options: GenerateK8sOptions = {};
    const startIdx = command === 'generate-k8s' ? 1 : 2;

    for (let i = startIdx; i < args.length; i++) {
      const arg = args[i];

      if ((arg === '--workload-type' || arg === '--type') && args[i + 1]) {
        options.workloadType = args[++i] as GenerateK8sOptions['workloadType'];
      } else if ((arg === '--namespace' || arg === '-n') && args[i + 1]) {
        options.namespace = args[++i];
      } else if (arg === '--name' && args[i + 1]) {
        options.name = args[++i];
      } else if (arg === '--image' && args[i + 1]) {
        options.image = args[++i];
      } else if (arg === '--replicas' && args[i + 1]) {
        options.replicas = parseInt(args[++i], 10);
      } else if (arg === '--port' && args[i + 1]) {
        options.port = parseInt(args[++i], 10);
      } else if (arg === '--service-type' && args[i + 1]) {
        options.serviceType = args[++i] as GenerateK8sOptions['serviceType'];
      } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
        options.output = args[++i];
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      } else if (arg === '--include-ingress') {
        options.includeIngress = true;
      } else if (arg === '--include-hpa') {
        options.includeHpa = true;
      } else if (arg === '--include-pdb') {
        options.includePdb = true;
      } else if (arg === '--include-configmap') {
        options.includeConfigMap = true;
      } else if (arg === '--include-secret') {
        options.includeSecret = true;
      } else if (arg === '--cpu-request' && args[i + 1]) {
        options.cpuRequest = args[++i];
      } else if (arg === '--cpu-limit' && args[i + 1]) {
        options.cpuLimit = args[++i];
      } else if (arg === '--memory-request' && args[i + 1]) {
        options.memoryRequest = args[++i];
      } else if (arg === '--memory-limit' && args[i + 1]) {
        options.memoryLimit = args[++i];
      }
    }

    await generateK8sCommand(options);
    return;
  }

  // nimbus generate helm (or nimbus generate-helm)
  if ((command === 'generate' && subcommand === 'helm') || command === 'generate-helm') {
    const options: GenerateHelmOptions = {};
    const startIdx = command === 'generate-helm' ? 1 : 2;

    for (let i = startIdx; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--chart' && args[i + 1]) {
        options.chart = args[++i];
      } else if ((arg === '--release' || arg === '--release-name') && args[i + 1]) {
        options.releaseName = args[++i];
      } else if ((arg === '--namespace' || arg === '-n') && args[i + 1]) {
        options.namespace = args[++i];
      } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
        options.output = args[++i];
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      } else if (arg === '--include-secrets') {
        options.includeSecrets = true;
      } else if (arg === '--no-secrets') {
        options.includeSecrets = false;
      } else if (arg === '--environment' && args[i + 1]) {
        options.environment = args[++i] as GenerateHelmOptions['environment'];
      } else if (arg === '--version' && args[i + 1]) {
        options.version = args[++i];
      } else if (arg === '--repo' && args[i + 1]) {
        options.repo = args[++i];
      } else if (arg === '--values-file' && args[i + 1]) {
        options.valuesFile = args[++i];
      }
    }

    await generateHelmCommand(options);
    return;
  }

  // nimbus aws discover
  if (command === 'aws' && subcommand === 'discover') {
    const options: AwsDiscoverOptions = {};

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--profile' && args[i + 1]) {
        options.profile = args[++i];
      } else if (arg === '--regions' && args[i + 1]) {
        options.regions = args[++i].split(',');
      } else if (arg === '--services' && args[i + 1]) {
        options.services = args[++i].split(',');
      } else if (arg === '--exclude-services' && args[i + 1]) {
        options.excludeServices = args[++i].split(',');
      } else if (arg === '--output-format' && args[i + 1]) {
        options.outputFormat = args[++i] as 'json' | 'table' | 'summary';
      } else if (arg === '--output-file' && args[i + 1]) {
        options.outputFile = args[++i];
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      }
    }

    await awsDiscoverCommand(options);
    return;
  }

  // nimbus aws terraform
  if (command === 'aws' && subcommand === 'terraform') {
    const options: AwsTerraformOptions = {};

    for (let i = 2; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--profile' && args[i + 1]) {
        options.profile = args[++i];
      } else if (arg === '--regions' && args[i + 1]) {
        options.regions = args[++i].split(',');
      } else if (arg === '--services' && args[i + 1]) {
        options.services = args[++i].split(',');
      } else if (arg === '--session-id' && args[i + 1]) {
        options.sessionId = args[++i];
      } else if (arg === '--resources-file' && args[i + 1]) {
        options.resourcesFile = args[++i];
      } else if (arg === '--output' && args[i + 1]) {
        options.output = args[++i];
      } else if (arg === '--terraform-version' && args[i + 1]) {
        options.terraformVersion = args[++i];
      } else if (arg === '--organize-by-service') {
        options.organizeByService = true;
      } else if (arg === '--no-organize-by-service') {
        options.organizeByService = false;
      } else if (arg === '--import-blocks') {
        options.importBlocks = true;
      } else if (arg === '--no-import-blocks') {
        options.importBlocks = false;
      } else if (arg === '--import-script') {
        options.importScript = true;
      } else if (arg === '--no-import-script') {
        options.importScript = false;
      } else if (arg === '--starter-kit') {
        options.includeStarterKit = true;
      } else if (arg === '--no-starter-kit') {
        options.includeStarterKit = false;
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      } else if (arg === '--skip-discovery') {
        options.skipDiscovery = true;
      }
    }

    await awsTerraformCommand(options);
    return;
  }

  // nimbus chat
  if (command === 'chat') {
    const options: ChatOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if ((arg === '--model' || arg === '-M') && args[i + 1]) {
        options.model = args[++i];
      } else if ((arg === '--message' || arg === '-m') && args[i + 1]) {
        options.message = args[++i];
        options.nonInteractive = true;
      } else if (arg === '--system-prompt' && args[i + 1]) {
        options.systemPrompt = args[++i];
      } else if (arg === '--show-tokens') {
        options.showTokenCount = true;
      } else if (arg === '--non-interactive') {
        options.nonInteractive = true;
      }
    }

    await chatCommand(options);
    return;
  }

  // nimbus config <subcommand>
  if (command === 'config') {
    const isNonInteractive = args.includes('--non-interactive');

    // nimbus config set <key> <value>
    if (subcommand === 'set') {
      const options: ConfigSetOptions = { nonInteractive: isNonInteractive };

      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('-')) {
          if (!options.key) {
            options.key = arg;
          } else if (!options.value) {
            options.value = arg;
          }
        }
      }

      await configCommand.set(options);
      return;
    }

    // nimbus config get <key>
    if (subcommand === 'get') {
      const options: ConfigGetOptions = { nonInteractive: isNonInteractive };

      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (!arg.startsWith('-') && !options.key) {
          options.key = arg;
        }
      }

      await configCommand.get(options);
      return;
    }

    // nimbus config list
    if (subcommand === 'list') {
      const options: ConfigListOptions = { nonInteractive: isNonInteractive };

      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--json') {
          options.json = true;
        } else if (arg === '--changed') {
          options.changed = true;
        }
      }

      await configCommand.list(options);
      return;
    }

    // nimbus config init
    if (subcommand === 'init') {
      const options: ConfigInitOptions = { nonInteractive: isNonInteractive };

      for (let i = 2; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--force' || arg === '-f') {
          options.force = true;
        }
      }

      await configCommand.init(options);
      return;
    }

    // nimbus config reset
    if (subcommand === 'reset') {
      await configCommand.reset({ nonInteractive: isNonInteractive });
      return;
    }

    // No subcommand - show list
    if (!subcommand) {
      await configCommand.list({ nonInteractive: isNonInteractive });
      return;
    }

    console.error(`Unknown config subcommand: ${subcommand}`);
    console.log('');
    console.log('Available config commands:');
    console.log('  nimbus config list         - List all configuration');
    console.log('  nimbus config get <key>    - Get a configuration value');
    console.log('  nimbus config set <key> <value> - Set a configuration value');
    console.log('  nimbus config init         - Initialize configuration interactively');
    console.log('  nimbus config reset        - Reset configuration to defaults');
    process.exit(1);
  }

  // ==========================================
  // Infrastructure tool commands (require auth)
  // ==========================================

  // nimbus tf <subcommand>
  if (command === 'tf') {
    if (!subcommand) {
      console.error('Usage: nimbus tf <subcommand>');
      console.log('');
      console.log('Available subcommands:');
      console.log('  init      - Initialize Terraform working directory');
      console.log('  plan      - Generate execution plan');
      console.log('  apply     - Apply changes');
      console.log('  validate  - Validate configuration');
      console.log('  destroy   - Destroy infrastructure');
      console.log('  show      - Show state');
      process.exit(1);
    }

    await tfCommand(subcommand, args.slice(2));
    return;
  }

  // nimbus k8s <subcommand>
  if (command === 'k8s') {
    if (!subcommand) {
      console.error('Usage: nimbus k8s <subcommand>');
      console.log('');
      console.log('Available subcommands:');
      console.log('  get <resource> [name]     - Get Kubernetes resources');
      console.log('  apply <manifest>          - Apply manifests');
      console.log('  delete <resource> <name>  - Delete resources');
      console.log('  logs <pod>                - Get pod logs');
      console.log('  describe <resource> <name> - Describe resource');
      console.log('  scale <resource> <name> <replicas> - Scale deployment');
      process.exit(1);
    }

    await k8sCommand(subcommand, args.slice(2));
    return;
  }

  // nimbus helm <subcommand>
  if (command === 'helm') {
    if (!subcommand) {
      console.error('Usage: nimbus helm <subcommand>');
      console.log('');
      console.log('Available subcommands:');
      console.log('  list                      - List releases');
      console.log('  install <name> <chart>    - Install a chart');
      console.log('  upgrade <name> <chart>    - Upgrade a release');
      console.log('  uninstall <name>          - Uninstall a release');
      console.log('  rollback <name> <rev>     - Rollback to revision');
      console.log('  history <name>            - Show release history');
      console.log('  search <keyword>          - Search for charts');
      console.log('  repo add <name> <url>     - Add repository');
      console.log('  repo update               - Update repositories');
      process.exit(1);
    }

    await helmCommand(subcommand, args.slice(2));
    return;
  }

  // nimbus apply <type> [target] [options]
  if (command === 'apply') {
    await applyCommand(subcommand, args.slice(2));
    return;
  }

  // nimbus ask "<question>" [options]
  if (command === 'ask') {
    const options: AskOptions = {};
    let question = '';

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if ((arg === '--context' || arg === '-c') && args[i + 1]) {
        options.context = args[++i];
      } else if (arg === '--context-file' && args[i + 1]) {
        options.contextFile = args[++i];
      } else if (arg === '--model' && args[i + 1]) {
        options.model = args[++i];
      } else if (arg === '--json') {
        options.json = true;
      } else if (!arg.startsWith('-')) {
        question = arg;
      }
    }

    await askCommand(question, options);
    return;
  }

  // nimbus explain <target> [options]
  if (command === 'explain') {
    const options: ExplainOptions = {};
    let target = '';

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--type' && args[i + 1]) {
        options.type = args[++i] as ExplainOptions['type'];
      } else if (arg === '--file' && args[i + 1]) {
        options.file = args[++i];
      } else if (arg === '--verbose' || arg === '-v') {
        options.verbose = true;
      } else if (arg === '--json') {
        options.json = true;
      } else if (!arg.startsWith('-')) {
        target = arg;
      }
    }

    await explainCommand(target, options);
    return;
  }

  // nimbus fix <error-or-file> [options]
  if (command === 'fix') {
    const options: FixOptions = {};
    let errorOrFile = '';

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--file' && args[i + 1]) {
        options.file = args[++i];
      } else if (arg === '--auto-apply' || arg === '-y') {
        options.autoApply = true;
      } else if (arg === '--dry-run') {
        options.dryRun = true;
      } else if (arg === '--json') {
        options.json = true;
      } else if (!arg.startsWith('-')) {
        errorOrFile = arg;
      }
    }

    await fixCommand(errorOrFile, options);
    return;
  }

  // nimbus plan [options]
  if (command === 'plan') {
    const options = parsePlanOptions(args.slice(1));
    await planCommand(options);
    return;
  }

  // nimbus git <subcommand>
  if (command === 'git') {
    if (!subcommand) {
      console.error('Usage: nimbus git <subcommand>');
      console.log('');
      console.log('Available subcommands:');
      console.log('  status                    - Show git status');
      console.log('  add <files...>            - Stage files');
      console.log('  commit -m "message"       - Create commit');
      console.log('  push                      - Push to remote');
      console.log('  pull                      - Pull from remote');
      console.log('  fetch                     - Fetch from remote');
      console.log('  log                       - Show commit log');
      console.log('  branch                    - List branches');
      console.log('  checkout <branch>         - Checkout branch');
      console.log('  diff                      - Show diff');
      process.exit(1);
    }

    await gitCommand(subcommand, args.slice(2));
    return;
  }

  // nimbus history
  if (command === 'history') {
    // nimbus history show <id>
    if (subcommand === 'show' && args[2]) {
      await historyShowCommand(args[2]);
      return;
    }

    // nimbus history [options]
    const options: HistoryOptions = {};

    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if ((arg === '--limit' || arg === '-n') && args[i + 1]) {
        options.limit = parseInt(args[++i], 10);
      } else if ((arg === '--filter' || arg === '-f') && args[i + 1]) {
        options.filter = args[++i];
      } else if (arg === '--since' && args[i + 1]) {
        options.since = args[++i];
      } else if (arg === '--until' && args[i + 1]) {
        options.until = args[++i];
      } else if (arg === '--status' && args[i + 1]) {
        options.status = args[++i] as 'success' | 'failure' | 'pending';
      } else if (arg === '--json') {
        options.json = true;
      } else if (arg === '--clear') {
        options.clear = true;
      }
    }

    await historyCommand(options);
    return;
  }

  // nimbus gh <subcommand>
  if (command === 'gh') {
    if (!subcommand) {
      console.error('Usage: nimbus gh <subcommand>');
      console.log('');
      console.log('Available subcommands:');
      console.log('  pr list                   - List pull requests');
      console.log('  pr view <number>          - View a pull request');
      console.log('  pr create                 - Create a pull request');
      console.log('  pr merge <number>         - Merge a pull request');
      console.log('  issue list                - List issues');
      console.log('  issue view <number>       - View an issue');
      console.log('  issue create              - Create an issue');
      console.log('  issue close <number>      - Close an issue');
      console.log('  issue comment <n>         - Add a comment');
      console.log('  repo info                 - Show repository info');
      console.log('  repo branches             - List branches');
      process.exit(1);
    }

    await ghCommand(subcommand, args.slice(2));
    return;
  }

  // ==========================================
  // Enterprise commands
  // ==========================================

  // nimbus team <subcommand>
  if (command === 'team') {
    await teamCommand(subcommand || '', args.slice(2));
    return;
  }

  // nimbus billing <subcommand>
  if (command === 'billing') {
    await billingCommand(subcommand || '', args.slice(2));
    return;
  }

  // nimbus usage
  if (command === 'usage') {
    await usageCommand(parseUsageOptions(args.slice(1)));
    return;
  }

  // nimbus audit <subcommand>
  if (command === 'audit') {
    await auditCommand(subcommand || '', args.slice(2));
    return;
  }

  // nimbus analyze
  if (command === 'analyze') {
    await analyzeCommand(parseAnalyzeOptions(args.slice(1)));
    return;
  }

  // Unknown command
  console.error(`Unknown command: ${command} ${subcommand || ''}`);
  console.log('');
  console.log('Available commands:');
  console.log('');
  console.log('  Chat & AI:');
  console.log('    nimbus chat              - Start interactive chat with AI');
  console.log('    nimbus chat -m "..."     - Send a single message');
  console.log('    nimbus ask "question"    - Quick question/answer');
  console.log('    nimbus explain <file>    - Explain code or infrastructure');
  console.log('    nimbus fix <error>       - AI-assisted error fixing');
  console.log('');
  console.log('  Workspace:');
  console.log('    nimbus init              - Initialize workspace in current directory');
  console.log('');
  console.log('  Configuration:');
  console.log('    nimbus config            - List all configuration');
  console.log('    nimbus config set <k> <v> - Set a configuration value');
  console.log('    nimbus config get <key>  - Get a configuration value');
  console.log('    nimbus config init       - Initialize global configuration');
  console.log('');
  console.log('  Authentication:');
  console.log('    nimbus login             - Set up authentication and LLM providers');
  console.log('    nimbus logout            - Clear all credentials');
  console.log('    nimbus auth status       - Show current authentication status');
  console.log('    nimbus auth list         - List all available providers');
  console.log('');
  console.log('  Infrastructure Generation:');
  console.log('    nimbus generate terraform  - Generate Terraform from AWS infrastructure (wizard)');
  console.log('    nimbus generate k8s        - Generate Kubernetes manifests (wizard)');
  console.log('    nimbus generate helm       - Generate Helm values files (wizard)');
  console.log('    nimbus aws discover        - Discover AWS infrastructure resources');
  console.log('    nimbus aws terraform       - Generate Terraform from AWS resources');
  console.log('');
  console.log('  Infrastructure Tools:');
  console.log('    nimbus plan              - Preview infrastructure changes');
  console.log('    nimbus apply <type>      - Apply infrastructure (terraform, k8s, helm)');
  console.log('    nimbus tf <cmd>          - Terraform operations (init, plan, apply, validate, destroy, show)');
  console.log('    nimbus k8s <cmd>         - Kubernetes operations (get, apply, delete, logs, describe, scale)');
  console.log('    nimbus helm <cmd>        - Helm operations (list, install, upgrade, uninstall, rollback)');
  console.log('    nimbus git <cmd>         - Git operations (status, add, commit, push, pull, fetch, log)');
  console.log('');
  console.log('  GitHub:');
  console.log('    nimbus gh pr <cmd>       - PR operations (list, view, create, merge)');
  console.log('    nimbus gh issue <cmd>    - Issue operations (list, view, create, close, comment)');
  console.log('    nimbus gh repo <cmd>     - Repo operations (info, branches)');
  console.log('');
  console.log('  History:');
  console.log('    nimbus history           - View command history');
  console.log('    nimbus history show <id> - Show details for a history entry');
  console.log('    nimbus history --clear   - Clear all history');
  console.log('');
  console.log('  Team & Enterprise:');
  console.log('    nimbus team create <name> - Create a team');
  console.log('    nimbus team invite <email> - Invite a member');
  console.log('    nimbus team members       - List team members');
  console.log('    nimbus team switch        - Switch active team');
  console.log('    nimbus billing status     - View billing status');
  console.log('    nimbus billing upgrade    - Upgrade plan');
  console.log('    nimbus usage              - View usage dashboard');
  console.log('    nimbus audit              - View audit logs');
  console.log('');
  console.log('  Analysis:');
  console.log('    nimbus analyze            - Analyze codebase for improvements');
  console.log('');
  console.log('  Utilities:');
  console.log('    nimbus version            - Show version information');
  console.log('    nimbus help               - Show this help message');
  console.log('    nimbus help <command>     - Show help for a specific command');
  console.log('    nimbus doctor             - Run diagnostic checks');
  console.log('');
  console.log('Use --help with any command for more options');
  process.exit(1);
}
