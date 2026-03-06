/**
 * Help Command
 *
 * Display help documentation for CLI commands
 *
 * Usage: nimbus help [command]
 */

import { logger } from '../utils';
import { ui } from '../wizard';

/**
 * Command options
 */
export interface HelpOptions {
  command?: string;
}

/**
 * Command documentation structure
 */
interface CommandDoc {
  name: string;
  description: string;
  usage: string;
  options?: Array<{
    flag: string;
    description: string;
    default?: string;
  }>;
  examples?: string[];
  subcommands?: Array<{
    name: string;
    description: string;
  }>;
}

/**
 * Command documentation
 */
const COMMANDS: Record<string, CommandDoc> = {
  run: {
    name: 'run',
    description: 'Run the Nimbus DevOps agent non-interactively with a prompt',
    usage: 'nimbus run "<prompt>" [options]',
    options: [
      { flag: '--mode <mode>', description: 'Agent mode: plan, build, deploy', default: 'build' },
      { flag: '--format <fmt>', description: 'Output format: text, json', default: 'text' },
      { flag: '--auto-approve, -y', description: 'Auto-approve all tool permissions' },
      { flag: '--stdin', description: 'Read prompt from stdin (pipe support)' },
      { flag: '--model <model>', description: 'Override LLM model' },
      { flag: '--max-turns <n>', description: 'Maximum agent turns', default: '50' },
    ],
    examples: [
      'nimbus run "run terraform plan and summarize changes"',
      'nimbus run "check for k8s pod restarts in production" --mode plan',
      'nimbus run "apply the staging deployment" --mode deploy --auto-approve',
      'echo "review my IAM policies" | nimbus run --stdin --format json',
    ],
  },

  chat: {
    name: 'chat',
    description: 'Interactive DevOps agent — Terraform, Kubernetes, Helm, AWS, GCP, Azure',
    usage: 'nimbus chat [options]',
    options: [
      { flag: '-m, --message <text>', description: 'Send a single message (non-interactive)' },
      { flag: '-M, --model <model>', description: 'Specify LLM model to use' },
      { flag: '--system-prompt <prompt>', description: 'Custom system prompt' },
      { flag: '--show-tokens', description: 'Display token count for each message' },
      {
        flag: '--ui <mode>',
        description: 'UI mode: ink (default rich TUI) or readline (simple)',
        default: 'ink',
      },
      { flag: '--non-interactive', description: 'Run in non-interactive mode' },
    ],
    examples: [
      'nimbus chat',
      'nimbus chat -m "How do I create an S3 bucket?"',
      'nimbus chat --model gpt-4',
      'nimbus chat --ui=readline',
    ],
  },

  'generate-terraform': {
    name: 'generate terraform',
    description: 'Generate Terraform configurations from existing AWS infrastructure',
    usage: 'nimbus generate terraform [options]',
    options: [
      { flag: '--profile <name>', description: 'AWS profile to use' },
      { flag: '--regions <list>', description: 'Comma-separated list of AWS regions' },
      { flag: '--services <list>', description: 'Comma-separated list of services to scan' },
      { flag: '--output <path>', description: 'Output directory for generated files' },
      { flag: '--non-interactive', description: 'Run in non-interactive mode' },
      { flag: '--accept-all-improvements', description: 'Accept all suggested improvements' },
      { flag: '--reject-all-improvements', description: 'Reject all suggested improvements' },
    ],
    examples: [
      'nimbus generate terraform',
      'nimbus generate terraform --profile production --regions us-east-1,us-west-2',
      'nimbus generate terraform --services EC2,S3,RDS --output ./infra',
    ],
  },

  'generate-k8s': {
    name: 'generate k8s',
    description: 'Generate Kubernetes manifests for your application',
    usage: 'nimbus generate k8s [options]',
    options: [
      {
        flag: '--type, --workload-type <type>',
        description: 'Workload type: deployment, statefulset, daemonset, job, cronjob',
        default: 'deployment',
      },
      { flag: '--name <name>', description: 'Application name' },
      { flag: '-n, --namespace <ns>', description: 'Kubernetes namespace', default: 'default' },
      { flag: '--image <image>', description: 'Container image (e.g., nginx:latest)' },
      { flag: '--replicas <count>', description: 'Number of replicas', default: '2' },
      { flag: '--port <port>', description: 'Container port', default: '8080' },
      {
        flag: '--service-type <type>',
        description: 'Service type: ClusterIP, NodePort, LoadBalancer',
        default: 'ClusterIP',
      },
      { flag: '-o, --output <path>', description: 'Output directory' },
      { flag: '--include-ingress', description: 'Generate Ingress resource' },
      { flag: '--include-hpa', description: 'Generate HorizontalPodAutoscaler' },
      { flag: '--include-pdb', description: 'Generate PodDisruptionBudget' },
      { flag: '--include-configmap', description: 'Generate ConfigMap' },
      { flag: '--include-secret', description: 'Generate Secret template' },
      { flag: '--non-interactive', description: 'Run in non-interactive mode' },
    ],
    examples: [
      'nimbus generate k8s',
      'nimbus generate k8s --name myapp --image nginx:latest',
      'nimbus generate k8s --type deployment --name api --image myregistry/api:v1 --replicas 3',
      'nimbus generate-k8s --name myapp --image nginx --non-interactive',
    ],
  },

  'generate-helm': {
    name: 'generate helm',
    description: 'Generate Helm values files for chart deployment',
    usage: 'nimbus generate helm [options]',
    options: [
      { flag: '--chart <name>', description: 'Helm chart name (e.g., bitnami/nginx)' },
      { flag: '--release, --release-name <name>', description: 'Release name' },
      { flag: '-n, --namespace <ns>', description: 'Kubernetes namespace', default: 'default' },
      {
        flag: '--environment <env>',
        description: 'Target environment: dev, staging, production',
        default: 'dev',
      },
      { flag: '--version <version>', description: 'Chart version' },
      { flag: '-o, --output <path>', description: 'Output directory' },
      { flag: '--include-secrets', description: 'Generate separate secrets values file' },
      { flag: '--no-secrets', description: 'Skip secrets file generation' },
      { flag: '--non-interactive', description: 'Run in non-interactive mode' },
    ],
    examples: [
      'nimbus generate helm',
      'nimbus generate helm --chart bitnami/nginx --release my-nginx',
      'nimbus generate helm --chart bitnami/postgresql --release mydb --environment production',
      'nimbus generate-helm --chart bitnami/redis --release cache --non-interactive',
    ],
  },

  apply: {
    name: 'apply',
    description: 'Apply infrastructure changes',
    usage: 'nimbus apply <type> [options]',
    subcommands: [
      { name: 'terraform', description: 'Apply Terraform configuration' },
      { name: 'k8s', description: 'Apply Kubernetes manifests' },
      { name: 'helm', description: 'Install or upgrade Helm release' },
    ],
    options: [
      { flag: '--dry-run', description: 'Show what would be applied without making changes' },
      { flag: '--auto-approve', description: 'Skip confirmation prompts' },
      { flag: '-n, --namespace <ns>', description: 'Kubernetes namespace (for k8s/helm)' },
    ],
    examples: [
      'nimbus apply terraform',
      'nimbus apply k8s ./manifests/',
      'nimbus apply helm myrelease ./chart',
    ],
  },

  plan: {
    name: 'plan',
    description: 'Preview infrastructure changes',
    usage: 'nimbus plan [options]',
    options: [
      {
        flag: '--type <type>',
        description: 'Infrastructure type: terraform, k8s, helm, auto',
        default: 'auto',
      },
      { flag: '--target <path>', description: 'Target directory or file' },
      { flag: '--out <file>', description: 'Save plan to file (Terraform)' },
      { flag: '--detailed', description: 'Show detailed plan output' },
    ],
    examples: [
      'nimbus plan',
      'nimbus plan --type terraform',
      'nimbus plan --type k8s --target ./manifests',
    ],
  },

  ask: {
    name: 'ask',
    description: 'Quick question and answer with AI',
    usage: 'nimbus ask "<question>" [options]',
    options: [
      { flag: '--context <file>', description: 'Include file content as context' },
      { flag: '--model <model>', description: 'Specify LLM model to use' },
    ],
    examples: [
      'nimbus ask "How do I create an EKS cluster?"',
      'nimbus ask "What is the best practice for IAM roles?" --model gpt-4',
      'nimbus ask "Explain this config" --context ./terraform/main.tf',
    ],
  },

  explain: {
    name: 'explain',
    description: 'Get AI explanations for code, infrastructure, or errors',
    usage: 'nimbus explain <target> [options]',
    options: [
      {
        flag: '--type <type>',
        description: 'Content type: code, infra, error, auto',
        default: 'auto',
      },
      { flag: '--file <path>', description: 'Read content from file' },
      { flag: '--verbose', description: 'Show detailed explanations' },
    ],
    examples: [
      'nimbus explain ./main.tf',
      'nimbus explain "Error: resource not found" --type error',
      'nimbus explain --file ./deployment.yaml --verbose',
    ],
  },

  fix: {
    name: 'fix',
    description: 'AI-assisted error fixing',
    usage: 'nimbus fix <error-or-file> [options]',
    options: [
      { flag: '--file <path>', description: 'File to fix' },
      { flag: '--auto-apply', description: 'Automatically apply the fix' },
      { flag: '--dry-run', description: 'Show fix without applying' },
    ],
    examples: [
      'nimbus fix "Error: undefined variable"',
      'nimbus fix ./broken.tf',
      'nimbus fix --file ./app.ts --auto-apply',
    ],
  },

  doctor: {
    name: 'doctor',
    description: 'Run diagnostic checks on your Nimbus installation',
    usage: 'nimbus doctor [options]',
    options: [
      { flag: '--fix', description: 'Attempt to fix issues automatically' },
      { flag: '--verbose', description: 'Show detailed diagnostic information' },
    ],
    examples: ['nimbus doctor', 'nimbus doctor --fix', 'nimbus doctor --verbose'],
  },

  init: {
    name: 'init',
    description: 'Initialize a Nimbus workspace in the current directory',
    usage: 'nimbus init [options]',
    options: [
      { flag: '-n, --name <name>', description: 'Project name' },
      { flag: '--provider <provider>', description: 'Cloud provider' },
      { flag: '-o, --output <path>', description: 'Output directory' },
      { flag: '-f, --force', description: 'Overwrite existing configuration' },
      { flag: '--non-interactive', description: 'Run in non-interactive mode' },
    ],
    examples: ['nimbus init', 'nimbus init --name my-project --provider aws'],
  },

  login: {
    name: 'login',
    description: 'Set up authentication and configure LLM providers',
    usage: 'nimbus login [options]',
    options: [
      { flag: '--provider <name>', description: 'LLM provider: anthropic, openai, bedrock' },
      { flag: '--api-key <key>', description: 'API key for the provider' },
      { flag: '--model <model>', description: 'Default model to use' },
      { flag: '--skip-github', description: 'Skip GitHub authentication' },
      { flag: '--sso', description: 'Use SSO authentication' },
      { flag: '--non-interactive', description: 'Run in non-interactive mode' },
    ],
    examples: ['nimbus login', 'nimbus login --provider anthropic --api-key sk-...'],
  },

  logout: {
    name: 'logout',
    description: 'Clear all stored credentials',
    usage: 'nimbus logout [options]',
    options: [{ flag: '-f, --force', description: 'Skip confirmation prompt' }],
    examples: ['nimbus logout', 'nimbus logout --force'],
  },

  config: {
    name: 'config',
    description: 'Manage Nimbus configuration',
    usage: 'nimbus config <subcommand> [options]',
    subcommands: [
      { name: 'list', description: 'List all configuration values' },
      { name: 'get <key>', description: 'Get a specific configuration value' },
      { name: 'set <key> <value>', description: 'Set a configuration value' },
      { name: 'init', description: 'Initialize configuration interactively' },
      { name: 'reset', description: 'Reset configuration to defaults' },
    ],
    options: [
      { flag: 'default-model <model>', description: 'Default LLM model to use', default: 'anthropic/claude-sonnet-4-6' },
      { flag: 'default-mode <mode>', description: 'Default agent mode: plan | build | deploy', default: 'build' },
      { flag: 'theme <theme>', description: 'TUI color theme: default | dark | light', default: 'default' },
      { flag: 'auto-approve <bool>', description: 'Auto-approve all tool permissions (true/false)', default: 'false' },
      { flag: 'max-tokens <n>', description: 'Maximum output tokens per LLM response', default: '8192' },
      { flag: 'telemetry <bool>', description: 'Enable anonymous usage analytics (true/false)', default: 'true' },
      { flag: 'serve.port <port>', description: 'Default port for nimbus serve', default: '4200' },
      { flag: 'serve.auth <user:pass>', description: 'HTTP Basic Auth for nimbus serve (user:password)' },
    ],
    examples: [
      'nimbus config list',
      'nimbus config get default-model',
      'nimbus config set default-model anthropic/claude-opus-4-6',
      'nimbus config set auto-approve true',
      'nimbus config set serve.port 8080',
    ],
  },

  tf: {
    name: 'tf',
    description: 'Terraform operations',
    usage: 'nimbus tf <subcommand> [options]',
    subcommands: [
      { name: 'init', description: 'Initialize Terraform working directory' },
      { name: 'plan', description: 'Generate execution plan' },
      { name: 'apply', description: 'Apply changes' },
      { name: 'validate', description: 'Validate configuration' },
      { name: 'destroy', description: 'Destroy infrastructure' },
      { name: 'show', description: 'Show state' },
    ],
    examples: ['nimbus tf init', 'nimbus tf plan', 'nimbus tf apply --auto-approve'],
  },

  k8s: {
    name: 'k8s',
    description: 'Kubernetes operations',
    usage: 'nimbus k8s <subcommand> [options]',
    subcommands: [
      { name: 'get <resource>', description: 'Get Kubernetes resources' },
      { name: 'apply <manifest>', description: 'Apply manifests' },
      { name: 'delete <resource> <name>', description: 'Delete resources' },
      { name: 'logs <pod>', description: 'Get pod logs' },
      { name: 'describe <resource> <name>', description: 'Describe resource' },
      { name: 'scale <resource> <name> <replicas>', description: 'Scale deployment' },
    ],
    examples: [
      'nimbus k8s get pods',
      'nimbus k8s apply ./deployment.yaml',
      'nimbus k8s logs my-pod -f',
    ],
  },

  helm: {
    name: 'helm',
    description: 'Helm operations',
    usage: 'nimbus helm <subcommand> [options]',
    subcommands: [
      { name: 'list', description: 'List releases' },
      { name: 'install <name> <chart>', description: 'Install a chart' },
      { name: 'upgrade <name> <chart>', description: 'Upgrade a release' },
      { name: 'uninstall <name>', description: 'Uninstall a release' },
      { name: 'rollback <name> <rev>', description: 'Rollback to revision' },
      { name: 'history <name>', description: 'Show release history' },
      { name: 'search <keyword>', description: 'Search for charts' },
      { name: 'repo add <name> <url>', description: 'Add repository' },
      { name: 'repo update', description: 'Update repositories' },
    ],
    examples: [
      'nimbus helm list',
      'nimbus helm install nginx bitnami/nginx',
      'nimbus helm upgrade nginx bitnami/nginx -f values.yaml',
    ],
  },

  history: {
    name: 'history',
    description: 'View command history',
    usage: 'nimbus history [options]',
    options: [
      { flag: '-n, --limit <count>', description: 'Number of entries to show' },
      { flag: '-f, --filter <term>', description: 'Filter entries by term' },
      { flag: '--since <date>', description: 'Show entries since date' },
      { flag: '--until <date>', description: 'Show entries until date' },
      { flag: '--status <status>', description: 'Filter by status: success, failure, pending' },
      { flag: '--json', description: 'Output as JSON' },
      { flag: '--clear', description: 'Clear all history' },
    ],
    subcommands: [{ name: 'show <id>', description: 'Show details for a specific entry' }],
    examples: ['nimbus history', 'nimbus history -n 20', 'nimbus history show abc123'],
  },

  version: {
    name: 'version',
    description: 'Display version information',
    usage: 'nimbus version [options]',
    options: [
      { flag: '--verbose', description: 'Show detailed version info including components' },
      { flag: '--json', description: 'Output as JSON' },
    ],
    examples: ['nimbus version', 'nimbus version --verbose'],
  },

  team: {
    name: 'team',
    description: 'Team management (Enterprise)',
    usage: 'nimbus team <subcommand> [options]',
    subcommands: [
      { name: 'create <name>', description: 'Create a new team' },
      { name: 'invite <email>', description: 'Invite a member' },
      { name: 'members', description: 'List team members' },
      { name: 'remove <email>', description: 'Remove a member' },
      { name: 'switch', description: 'Switch active team' },
    ],
    examples: [
      'nimbus team create my-team',
      'nimbus team invite user@example.com',
      'nimbus team members',
    ],
  },

  drift: {
    name: 'drift',
    description: 'Detect infrastructure drift between desired state (IaC) and actual cloud state',
    usage: 'nimbus drift [options]',
    options: [
      { flag: '--provider <type>', description: 'IaC provider: terraform, kubernetes, helm', default: 'terraform' },
      { flag: '--workdir <path>', description: 'Working directory with IaC configs', default: '.' },
    ],
    examples: [
      'nimbus drift',
      'nimbus drift --provider kubernetes',
      'nimbus run "check for infrastructure drift" --mode plan',
    ],
  },

  cost: {
    name: 'cost',
    description: 'Estimate infrastructure costs from Terraform plans or working directory',
    usage: 'nimbus cost [options]',
    options: [
      { flag: '--plan-file <file>', description: 'Path to a saved Terraform plan file' },
      { flag: '--workdir <path>', description: 'Working directory containing Terraform config', default: '.' },
    ],
    examples: [
      'nimbus cost',
      'nimbus cost --plan-file tfplan.json',
      'nimbus run "estimate monthly cost for this infrastructure"',
    ],
  },

  'auth-refresh': {
    name: 'auth-refresh',
    description: 'Re-validate and refresh cloud provider credentials (AWS SSO, GCP, Azure)',
    usage: 'nimbus auth-refresh [options]',
    options: [
      { flag: '--provider <name>', description: 'Provider to refresh: aws, gcp, azure, all', default: 'all' },
    ],
    examples: [
      'nimbus auth-refresh',
      'nimbus auth-refresh --provider aws',
      'nimbus auth-refresh --provider gcp',
    ],
  },

  profile: {
    name: 'profile',
    description: 'Manage per-project credential profiles (AWS, kubectl, Terraform, GCP)',
    usage: 'nimbus profile <list|create|set|delete|show> [name]',
    subcommands: [
      { name: 'list', description: 'Show all profiles (current marked with *)' },
      { name: 'create <name>', description: 'Create a new profile (interactive wizard)' },
      { name: 'set <name>', description: 'Switch to a profile atomically (sets AWS_PROFILE, kubectl context, TF workspace)' },
      { name: 'delete <name>', description: 'Delete a profile' },
      { name: 'show [name]', description: 'Display profile details' },
    ],
    examples: [
      'nimbus profile list',
      'nimbus profile create prod',
      'nimbus profile set prod',
      'nimbus profile delete staging',
    ],
  },

  incident: {
    name: 'incident',
    description: 'Launch an incident response session pre-loaded with alert context (G14)',
    usage: 'nimbus incident <pagerduty-url-or-id|description> [--notes "observed behavior"]',
    options: [
      { flag: '--notes <text>', description: 'Observed behavior or additional context' },
    ],
    examples: [
      'nimbus incident https://example.pagerduty.com/incidents/P1234',
      'nimbus incident "high CPU on api-service pods" --notes "started after deploy at 14:00"',
      'nimbus incident PABC123',
    ],
  },

  runbook: {
    name: 'runbook',
    description: 'Load and execute operational runbooks as agent prompts (G15)',
    usage: 'nimbus runbook <list|run|create> [name]',
    subcommands: [
      { name: 'list', description: 'List available runbooks' },
      { name: 'run <name>', description: 'Execute a runbook as an agent session' },
      { name: 'create <name>', description: 'Create a new runbook interactively' },
    ],
    examples: [
      'nimbus runbook list',
      'nimbus runbook run rotate-certs',
      'nimbus runbook run cert-rotation --auto',
      'nimbus runbook create db-backup',
    ],
  },

  schedule: {
    name: 'schedule',
    description: 'Manage periodic DevOps automation tasks (G13)',
    usage: 'nimbus schedule <list|add|remove|run-now>',
    subcommands: [
      { name: 'list', description: 'List configured schedules with next-run times' },
      { name: 'add "<cron>" "<prompt>"', description: 'Add a new periodic task' },
      { name: 'remove <id-or-name>', description: 'Remove a schedule' },
      { name: 'run-now <id-or-name>', description: 'Execute a schedule immediately' },
    ],
    examples: [
      'nimbus schedule list',
      'nimbus schedule add "0 8 * * *" "check for infrastructure drift" --name daily-drift',
      'nimbus schedule add "0 9 * * 1" "generate weekly cost report"',
      'nimbus schedule run-now daily-drift',
      'nimbus schedule remove daily-drift',
    ],
  },

  export: {
    name: 'export',
    description: 'Export session conversation to markdown, HTML, or JSON (G19)',
    usage: 'nimbus export [session-id] [--format md|html|json] [--output file]',
    options: [
      { flag: '--format <fmt>', description: 'Output format: md, html, json', default: 'md' },
      { flag: '--output <file>', description: 'Save to file instead of stdout' },
    ],
    examples: [
      'nimbus export',
      'nimbus export abc123 --format html --output session.html',
      'nimbus export --format json > session.json',
    ],
  },
};

/**
 * Show help for a specific command
 */
function showCommandHelp(commandName: string): void {
  // Normalize command name (handle aliases like "generate k8s" -> "generate-k8s")
  const normalizedName = commandName.replace(/^generate /, 'generate-');

  const doc = COMMANDS[normalizedName] || COMMANDS[commandName];

  if (!doc) {
    ui.error(`Unknown command: ${commandName}`);
    ui.newLine();
    ui.info('Run "nimbus help" to see available commands');
    return;
  }

  ui.header(`nimbus ${doc.name}`);
  ui.print(doc.description);
  ui.newLine();

  ui.print('Usage:');
  ui.print(`  ${doc.usage}`);
  ui.newLine();

  if (doc.subcommands?.length) {
    ui.print('Subcommands:');
    for (const sub of doc.subcommands) {
      ui.print(`  ${sub.name.padEnd(28)} ${sub.description}`);
    }
    ui.newLine();
  }

  if (doc.options?.length) {
    ui.print('Options:');
    for (const opt of doc.options) {
      const flagStr = opt.flag.padEnd(30);
      const defaultStr = opt.default ? ` (default: ${opt.default})` : '';
      ui.print(`  ${flagStr} ${opt.description}${defaultStr}`);
    }
    ui.newLine();
  }

  if (doc.examples?.length) {
    ui.print('Examples:');
    for (const ex of doc.examples) {
      ui.print(`  ${ex}`);
    }
  }
}

/**
 * Show general help
 */
function showGeneralHelp(): void {
  ui.header('Nimbus — AI-Powered DevOps Terminal');
  ui.print('Plan, apply, and manage Terraform, Kubernetes, Helm, AWS, GCP, Azure with natural language.');
  ui.print('Type a DevOps request directly or use any command below.');
  ui.newLine();

  ui.print('Usage:');
  ui.print('  nimbus <command> [options]');
  ui.print('  nimbus                  Open interactive DevOps agent TUI');
  ui.print('  nimbus run "<prompt>"   Run agent non-interactively');
  ui.newLine();

  ui.print('DevOps Operations:');
  ui.print('  plan              Preview infrastructure changes (tf/k8s/helm)');
  ui.print('  apply             Apply infrastructure changes');
  ui.print('  tf <cmd>          Terraform init/plan/apply/validate/destroy');
  ui.print('  k8s <cmd>         Kubernetes get/apply/delete/logs/scale');
  ui.print('  helm <cmd>        Helm install/upgrade/rollback/list');
  ui.print('  drift             Detect infrastructure drift (IaC vs actual)');
  ui.print('  cost              Estimate infrastructure costs');
  ui.print('  status            Live infra health dashboard (TF + K8s + Helm)');
  ui.newLine();

  ui.print('Incident & Automation:');
  ui.print('  incident          Incident response session with alert pre-loading');
  ui.print('  runbook           Load and execute operational runbooks');
  ui.print('  schedule          Manage periodic DevOps automation tasks');
  ui.print('  rollout           Safe rolling deployment management');
  ui.newLine();

  ui.print('Infrastructure Generation:');
  ui.print('  generate terraform   Generate Terraform from live AWS infrastructure');
  ui.print('  generate k8s         Generate Kubernetes manifests for your app');
  ui.print('  generate helm        Generate Helm values files');
  ui.newLine();

  ui.print('Cloud Auth & Profiles:');
  ui.print('  auth-refresh      Refresh AWS SSO, GCP, Azure credentials');
  ui.print('  profile           Manage per-project profiles (AWS, kubectl, TF, GCP)');
  ui.print('  login             Set up LLM provider authentication');
  ui.print('  logout            Clear stored credentials');
  ui.newLine();

  ui.print('AI Agent:');
  ui.print('  chat              Interactive DevOps agent TUI (same as nimbus)');
  ui.print('  run               Run agent non-interactively with a prompt');
  ui.newLine();

  ui.print('Setup & Config:');
  ui.print('  init              Initialize Nimbus workspace (generates NIMBUS.md)');
  ui.print('  config            Manage global configuration');
  ui.print('  doctor            Run diagnostic checks on your installation');
  ui.print('  history           View command history');
  ui.print('  export            Export session to markdown/HTML/JSON');
  ui.print('  version           Show version info');
  ui.print('  audit             View audit logs');
  ui.newLine();

  ui.print('Slash Commands (in TUI):');
  ui.print('  /plan             Run infrastructure plan');
  ui.print('  /apply            Apply infrastructure changes (deploy mode)');
  ui.print('  /k8s-ctx          Switch Kubernetes context');
  ui.print('  /tf-ws            Switch Terraform workspace');
  ui.print('  /mode             Switch agent mode (plan/build/deploy)');
  ui.print('  /model            Switch LLM model');
  ui.print('  /cost             Show session cost');
  ui.print('  /diff             Show file diff modal');
  ui.print('  /tree             Toggle file tree sidebar');
  ui.print('  /terminal         Toggle terminal output pane');
  ui.print('  ?                 Open keyboard shortcuts help');
  ui.newLine();

  ui.print('Get detailed help for a command:');
  ui.print('  nimbus help <command>');
  ui.print('  nimbus <command> --help');
}

/**
 * Run the help command
 */
export async function helpCommand(options: HelpOptions = {}): Promise<void> {
  logger.debug('Running help command', { options });

  if (options.command) {
    showCommandHelp(options.command);
  } else {
    showGeneralHelp();
  }
}

// Export as default command
export default helpCommand;
