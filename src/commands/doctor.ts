/**
 * Doctor Command
 *
 * Run diagnostic checks on Nimbus installation and configuration
 *
 * Usage: nimbus doctor [options]
 */

import { logger } from '../utils';
import { ui } from '../wizard';

/**
 * Command options
 */
export interface DoctorOptions {
  fix?: boolean;
  verbose?: boolean;
  json?: boolean;
  metrics?: boolean;
  quiet?: boolean;
}

/**
 * Check result structure
 */
interface CheckResult {
  name: string;
  passed: boolean;
  message?: string;
  error?: string;
  details?: Record<string, unknown>;
  fix?: string;
  runFix?: () => Promise<void>;
}

/**
 * Diagnostic check function type
 */
type DiagnosticCheck = (options: DoctorOptions) => Promise<CheckResult>;

/**
 * Check configuration files
 */
async function checkConfiguration(options: DoctorOptions): Promise<CheckResult> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const configDir = path.join(os.homedir(), '.nimbus');
  const configFile = path.join(configDir, 'config.json');

  try {
    await fs.access(configDir);
  } catch {
    return {
      name: 'Configuration',
      passed: false,
      error: 'Configuration directory not found',
      fix: 'Run "nimbus init" to create configuration',
      runFix: async () => {
        await fs.mkdir(configDir, { recursive: true });
      },
    };
  }

  try {
    await fs.access(configFile);
    const content = await fs.readFile(configFile, 'utf-8');
    JSON.parse(content); // Validate JSON
    return {
      name: 'Configuration',
      passed: true,
      message: 'Configuration file valid',
      details: options.verbose ? { path: configFile } : undefined,
    };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {
        name: 'Configuration',
        passed: false,
        error: 'Configuration file not found',
        fix: 'Run "nimbus config init" to create configuration',
      };
    }
    return {
      name: 'Configuration',
      passed: false,
      error: `Invalid configuration: ${error.message}`,
      fix: 'Run "nimbus config reset" to reset configuration',
    };
  }
}

/**
 * Check LLM provider configuration
 */
async function checkLLMProvider(options: DoctorOptions): Promise<CheckResult> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  // Check for API keys
  const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AWS_ACCESS_KEY_ID'];
  const foundKeys: string[] = [];

  for (const key of envKeys) {
    if (process.env[key]) {
      foundKeys.push(key);
    }
  }

  // Check credentials file
  const credentialsFile = path.join(os.homedir(), '.nimbus', 'credentials.json');
  let hasStoredCredentials = false;

  try {
    await fs.access(credentialsFile);
    const content = await fs.readFile(credentialsFile, 'utf-8');
    const creds = JSON.parse(content);
    hasStoredCredentials = Object.keys(creds.providers || {}).length > 0;
  } catch {
    // No stored credentials
  }

  if (foundKeys.length === 0 && !hasStoredCredentials) {
    return {
      name: 'LLM Provider',
      passed: false,
      error: 'No LLM provider configured',
      fix: 'Run "nimbus login" to configure an LLM provider',
      runFix: async () => {
        const { loginCommand } = await import('./login');
        await loginCommand();
      },
    };
  }

  return {
    name: 'LLM Provider',
    passed: true,
    message: hasStoredCredentials ? 'Credentials configured' : `Using ${foundKeys.join(', ')}`,
    details: options.verbose
      ? {
          envKeys: foundKeys,
          hasStoredCredentials,
        }
      : undefined,
  };
}

/**
 * Check cloud credentials (AWS, etc.)
 */
async function checkCloudCredentials(options: DoctorOptions): Promise<CheckResult> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const checks: string[] = [];

  // Check AWS credentials
  const awsConfigDir = path.join(os.homedir(), '.aws');

  try {
    await fs.access(path.join(awsConfigDir, 'credentials'));
    checks.push('AWS credentials');
  } catch {
    // Check environment variables
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      checks.push('AWS (env vars)');
    }
  }

  // Check GCP credentials
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      await fs.access(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      checks.push('GCP credentials');
    } catch {
      // Invalid path
    }
  }

  // Check Azure credentials
  if (process.env.AZURE_CLIENT_ID || process.env.AZURE_SUBSCRIPTION_ID) {
    checks.push('Azure (env vars)');
  }

  // Check kubeconfig
  const kubeconfigPath = process.env.KUBECONFIG || path.join(os.homedir(), '.kube', 'config');
  try {
    await fs.access(kubeconfigPath);
    checks.push('Kubernetes');
  } catch {
    // No kubeconfig
  }

  if (checks.length === 0) {
    return {
      name: 'Cloud Credentials',
      passed: false,
      error: 'No cloud credentials found',
      fix: 'Configure AWS credentials (~/.aws/credentials) or set environment variables',
      runFix: async () => {
        ui.info('To configure cloud credentials, run one of:');
        ui.print('  AWS:   nimbus login --cloud aws    (runs aws configure)');
        ui.print('  GCP:   nimbus login --cloud gcp    (runs gcloud auth login)');
        ui.print('  Azure: nimbus login --cloud azure  (runs az login)');
      },
    };
  }

  return {
    name: 'Cloud Credentials',
    passed: true,
    message: `Found: ${checks.join(', ')}`,
    details: options.verbose ? { providers: checks } : undefined,
  };
}

/**
 * Check cloud connectivity (real API calls)
 */
async function checkCloudConnectivity(options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');

  const results: Array<{ provider: string; status: string; details?: string }> = [];

  // AWS: try sts get-caller-identity
  try {
    const output = execFileSync('aws', ['sts', 'get-caller-identity', '--output', 'json'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const identity = JSON.parse(output);
    results.push({
      provider: 'AWS',
      status: 'connected',
      details: `Account: ${identity.Account}, User: ${identity.UserId}`,
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      results.push({
        provider: 'AWS',
        status: 'not installed',
        details: 'Install AWS CLI: https://aws.amazon.com/cli/',
      });
    } else {
      results.push({
        provider: 'AWS',
        status: 'failed',
        details: 'Run "aws configure" or check credentials',
      });
    }
  }

  // GCP: try gcloud auth print-access-token
  try {
    const output = execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (output.trim().length > 0) {
      results.push({ provider: 'GCP', status: 'connected', details: 'Access token valid' });
    } else {
      results.push({ provider: 'GCP', status: 'failed', details: 'Run "gcloud auth login"' });
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      results.push({
        provider: 'GCP',
        status: 'not installed',
        details: 'Install gcloud: https://cloud.google.com/sdk/docs/install',
      });
    } else {
      results.push({ provider: 'GCP', status: 'failed', details: 'Run "gcloud auth login"' });
    }
  }

  // Azure: try az account show
  try {
    const output = execFileSync('az', ['account', 'show', '--output', 'json'], {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const account = JSON.parse(output);
    results.push({
      provider: 'Azure',
      status: 'connected',
      details: `Subscription: ${account.name || account.id}`,
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      results.push({
        provider: 'Azure',
        status: 'not installed',
        details: 'Install Azure CLI: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli',
      });
    } else {
      results.push({ provider: 'Azure', status: 'failed', details: 'Run "az login"' });
    }
  }

  const connected = results.filter(r => r.status === 'connected');

  if (connected.length === 0) {
    const installed = results.filter(r => r.status !== 'not installed');
    if (installed.length === 0) {
      return {
        name: 'Cloud Connectivity',
        passed: true,
        message: 'No cloud CLIs installed (optional)',
        details: options.verbose ? { providers: results } : undefined,
      };
    }
    return {
      name: 'Cloud Connectivity',
      passed: false,
      error: 'No cloud provider connected',
      fix: results
        .map(r => r.details)
        .filter(Boolean)
        .join('; '),
      details: options.verbose ? { providers: results } : undefined,
      runFix: async () => {
        const { execFileSync } = await import('child_process');
        // Try AWS SSO refresh
        const awsFailed = results.find(r => r.provider === 'AWS' && r.status === 'failed');
        if (awsFailed) {
          ui.info('Attempting AWS SSO login...');
          try {
            execFileSync('aws', ['sso', 'login'], { stdio: 'inherit', timeout: 120000 });
          } catch { ui.warning('AWS SSO login failed. Run `aws configure` manually.'); }
        }
        // Try GCP refresh
        const gcpFailed = results.find(r => r.provider === 'GCP' && r.status === 'failed');
        if (gcpFailed) {
          ui.info('Attempting GCP application-default login...');
          try {
            execFileSync('gcloud', ['auth', 'application-default', 'login'], { stdio: 'inherit', timeout: 120000 });
          } catch { ui.warning('GCP login failed. Run `gcloud auth login` manually.'); }
        }
      },
    };
  }

  return {
    name: 'Cloud Connectivity',
    passed: true,
    message: connected.map(r => `${r.provider}: ${r.details}`).join(', '),
    details: options.verbose ? { providers: results } : undefined,
  };
}

/**
 * Check embedded core systems (SQLite database + LLM auth + tool registry)
 */
async function checkCoreServices(options: DoctorOptions): Promise<CheckResult> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const results: Array<{ name: string; status: string; details?: string }> = [];

  // Check SQLite database
  const dbPath = path.join(os.homedir(), '.nimbus', 'nimbus.db');
  try {
    await fs.access(dbPath);
    const stat = await fs.stat(dbPath);
    results.push({
      name: 'SQLite DB',
      status: 'ok',
      details: options.verbose ? `${dbPath} (${(stat.size / 1024).toFixed(1)} KB)` : undefined,
    });
  } catch {
    results.push({
      name: 'SQLite DB',
      status: 'not initialized',
      details: 'Will be created on first use',
    });
  }

  // Check LLM credentials
  const credFile = path.join(os.homedir(), '.nimbus', 'credentials.json');
  let llmStatus = 'not configured';
  let llmDetails: string | undefined;
  try {
    const content = await fs.readFile(credFile, 'utf-8');
    const creds = JSON.parse(content);
    const providers = Object.keys(creds.providers || {});
    if (providers.length > 0) {
      llmStatus = 'configured';
      llmDetails = options.verbose ? `Providers: ${providers.join(', ')}` : undefined;
    }
  } catch {
    // Check env vars as fallback
    const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'AWS_ACCESS_KEY_ID'];
    const found = envKeys.filter(k => process.env[k]);
    if (found.length > 0) {
      llmStatus = 'via env vars';
      llmDetails = options.verbose ? found.join(', ') : undefined;
    }
  }
  results.push({ name: 'LLM Auth', status: llmStatus, details: llmDetails });

  // Check tool registry (Nimbus built-in tools)
  try {
    const { standardTools } = await import('../tools/schemas/standard');
    const { devopsTools } = await import('../tools/schemas/devops');
    // Count expected tools
    const expectedCount = standardTools.length + devopsTools.length;
    results.push({
      name: 'Tool Registry',
      status: 'ok',
      details: options.verbose ? `${expectedCount} tools available` : undefined,
    });
  } catch (e: any) {
    results.push({ name: 'Tool Registry', status: 'error', details: e.message });
  }

  const failed = results.filter(r => r.status === 'error' || r.status === 'not configured');
  const passed = failed.length === 0;

  const summary = results.map(r => `${r.name}: ${r.status}`).join(', ');

  return {
    name: 'Core Systems',
    passed,
    message: passed ? summary : `Issues: ${failed.map(r => r.name).join(', ')}`,
    details: options.verbose ? { systems: results } : undefined,
  };
}

/**
 * Check DevOps CLI tools availability (terraform, kubectl, helm, aws)
 */
async function checkToolServices(options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');

  const devopsTools = [
    { name: 'terraform', cmd: 'terraform', args: ['version', '-json'] },
    { name: 'kubectl', cmd: 'kubectl', args: ['version', '--client', '--output=json'] },
    { name: 'helm', cmd: 'helm', args: ['version', '--short'] },
    { name: 'aws', cmd: 'aws', args: ['--version'] },
    { name: 'gcloud', cmd: 'gcloud', args: ['version', '--format=json'] },
    { name: 'az', cmd: 'az', args: ['version', '--output=json'] },
  ];

  const results: Array<{ name: string; version: string; available: boolean }> = [];

  for (const tool of devopsTools) {
    try {
      const output = execFileSync(tool.cmd, tool.args, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Extract version number
      let version = 'installed';
      try {
        const parsed = JSON.parse(output);
        // terraform: { terraform_version: "1.7.0" }, kubectl: { clientVersion: { gitVersion: "v1.28.0" } }
        version = parsed.terraform_version || parsed.clientVersion?.gitVersion || 'installed';
      } catch {
        const match = output.match(/[\d]+\.[\d]+\.[\d]+/);
        if (match) version = match[0];
      }
      results.push({ name: tool.name, version, available: true });
    } catch {
      results.push({ name: tool.name, version: 'not found', available: false });
    }
  }

  const available = results.filter(r => r.available);
  const missing = results.filter(r => !r.available);

  // GAP-12: OS-aware runFix — actually installs missing tools via Homebrew on macOS
  const BREW_INSTALL: Record<string, string> = {
    terraform: 'terraform',
    kubectl: 'kubernetes-cli',
    helm: 'helm',
    aws: 'awscli',
    gcloud: '--cask google-cloud-sdk',
    az: 'azure-cli',
  };
  const INSTALL_URLS: Record<string, string> = {
    terraform: 'https://developer.hashicorp.com/terraform/install',
    kubectl: 'https://kubernetes.io/docs/tasks/tools/',
    helm: 'https://helm.sh/docs/intro/install/',
    aws: 'https://aws.amazon.com/cli/',
    gcloud: 'https://cloud.google.com/sdk/docs/install',
    az: 'https://learn.microsoft.com/en-us/cli/azure/install-azure-cli',
  };
  const osAwareRunFix = async () => {
    const { execFileSync: brew } = await import('child_process');
    const isMac = process.platform === 'darwin';
    const isLinux = process.platform === 'linux';
    for (const tool of missing) {
      const toolName = tool.name;
      if (isMac && BREW_INSTALL[toolName]) {
        // M9: macOS — install via Homebrew
        ui.print(`Fix: brew install ${BREW_INSTALL[toolName] ?? toolName}`);
        ui.print(`Installing ${toolName} via Homebrew...`);
        try {
          const brewArgs = ['install', ...BREW_INSTALL[toolName].split(' ')];
          brew('brew', brewArgs, { stdio: 'inherit', timeout: 120_000 });
          ui.success(`${toolName} installed successfully`);
        } catch (brewErr) {
          ui.warning(`brew install failed for ${toolName}: ${brewErr instanceof Error ? brewErr.message : String(brewErr)}`);
          ui.print(`  Manual install: ${INSTALL_URLS[toolName] ?? 'check official docs'}`);
        }
      } else if (isLinux) {
        // M9: Detect Linux distro for specific package manager
        let linuxPkgCmd = '';
        try {
          const { readFileSync } = await import('node:fs');
          const osRelease = readFileSync('/etc/os-release', 'utf-8');
          if (osRelease.includes('Ubuntu') || osRelease.includes('Debian')) {
            linuxPkgCmd = `apt-get install ${toolName}`;
          } else if (osRelease.includes('Fedora') || osRelease.includes('RHEL') || osRelease.includes('CentOS')) {
            linuxPkgCmd = `dnf install ${toolName}`;
          }
        } catch { /* ignore */ }
        if (linuxPkgCmd) {
          ui.print(`  ${toolName}: ${linuxPkgCmd}`);
        } else {
          ui.print(`  ${toolName}: ${INSTALL_URLS[toolName] ?? 'check official docs'}`);
        }
      } else {
        ui.print(`  ${toolName}: ${INSTALL_URLS[toolName] ?? 'check official docs'}`);
      }
    }
  };

  if (available.length === 0) {
    return {
      name: 'DevOps Tools',
      passed: false,
      error: 'No DevOps CLI tools found (terraform, kubectl, helm, aws, gcloud, az)',
      fix: 'Install at least one: terraform, kubectl, or helm',
      details: options.verbose ? { tools: results } : undefined,
      runFix: osAwareRunFix,
    };
  }

  return {
    name: 'DevOps Tools',
    passed: true,
    message: `${available.length}/${devopsTools.length} available: ${available.map(t => `${t.name} ${t.version}`).join(', ')}${missing.length > 0 ? ` | missing: ${missing.map(t => t.name).join(', ')}` : ''}`,
    details: options.verbose ? { tools: results } : undefined,
  };
}

/**
 * Check dependencies (CLI tools)
 */
async function checkDependencies(options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');

  // Use execFileSync with args arrays to prevent shell injection
  const tools = [
    { name: 'git', cmd: 'git', args: ['--version'], required: true },
    { name: 'terraform', cmd: 'terraform', args: ['version'], required: false },
    { name: 'kubectl', cmd: 'kubectl', args: ['version', '--client'], required: false },
    { name: 'helm', cmd: 'helm', args: ['version', '--short'], required: false },
    { name: 'aws', cmd: 'aws', args: ['--version'], required: false },
    { name: 'gcloud', cmd: 'gcloud', args: ['version'], required: false },
    { name: 'az', cmd: 'az', args: ['version'], required: false },
  ];

  const results: Array<{ name: string; version?: string; available: boolean }> = [];
  const requiredMissing: string[] = [];

  for (const tool of tools) {
    try {
      const output = execFileSync(tool.cmd, tool.args, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Extract version from output
      const versionMatch = output.match(/\d+\.\d+(\.\d+)?/);
      results.push({
        name: tool.name,
        version: versionMatch ? versionMatch[0] : 'installed',
        available: true,
      });
    } catch {
      results.push({ name: tool.name, available: false });
      if (tool.required) {
        requiredMissing.push(tool.name);
      }
    }
  }

  if (requiredMissing.length > 0) {
    return {
      name: 'Dependencies',
      passed: false,
      error: `Required tools not found: ${requiredMissing.join(', ')}`,
      fix: `Install missing tools: ${requiredMissing.join(', ')}`,
    };
  }

  const availableCount = results.filter(r => r.available).length;

  return {
    name: 'Dependencies',
    passed: true,
    message: `${availableCount}/${tools.length} tools available`,
    details: options.verbose ? { tools: results } : undefined,
    // G21: runFix checks for .tf files without .terraform/ and suggests terraform init
    runFix: async () => {
      const fs = await import('fs/promises');
      const path = await import('path');
      const cwd = process.cwd();

      // Check for .tf files without .terraform dir
      try {
        const entries = await fs.readdir(cwd);
        const hasTfFiles = entries.some(e => e.endsWith('.tf'));
        const hasTerraformDir = entries.includes('.terraform');

        if (hasTfFiles && !hasTerraformDir) {
          ui.info('Found .tf files without .terraform/ directory. Run:');
          ui.print('  terraform init');
        }
      } catch { /* ignore */ }
    },
  };
}

/**
 * Check disk space
 */
async function checkDiskSpace(_options: DoctorOptions): Promise<CheckResult> {
  const os = await import('os');
  const { execFileSync } = await import('child_process');

  try {
    // Get disk space for home directory
    const homeDir = os.homedir();
    let available: number | undefined;

    if (process.platform === 'win32') {
      // Windows - use execFileSync with args array to prevent shell injection
      const output = execFileSync('wmic', ['logicaldisk', 'get', 'size,freespace,caption'], {
        encoding: 'utf-8',
      });
      const lines = output.trim().split('\n');
      const drive = homeDir.charAt(0).toUpperCase();
      for (const line of lines) {
        if (line.startsWith(drive)) {
          const parts = line.trim().split(/\s+/);
          available = parseInt(parts[1], 10);
          break;
        }
      }
    } else {
      // Unix-like - use execFileSync with args array to prevent shell injection
      const output = execFileSync('df', ['-k', homeDir], { encoding: 'utf-8' });
      // Skip header line and parse the data line
      const lines = output.trim().split('\n');
      const dataLine = lines[lines.length - 1];
      const parts = dataLine.trim().split(/\s+/);
      available = parseInt(parts[3], 10) * 1024; // Convert KB to bytes
    }

    // Handle case where disk space could not be determined
    if (available === undefined || isNaN(available)) {
      return {
        name: 'Disk Space',
        passed: true,
        message: 'Unable to determine disk space (assuming OK)',
      };
    }

    const availableGB = available / (1024 * 1024 * 1024);
    const minRequired = 1; // 1 GB minimum

    if (availableGB < minRequired) {
      return {
        name: 'Disk Space',
        passed: false,
        error: `Low disk space: ${availableGB.toFixed(1)} GB available`,
        fix: 'Free up disk space (at least 1 GB recommended)',
      };
    }

    return {
      name: 'Disk Space',
      passed: true,
      message: `${availableGB.toFixed(1)} GB available`,
    };
  } catch {
    return {
      name: 'Disk Space',
      passed: true,
      message: 'Unable to check (assuming OK)',
    };
  }
}

/**
 * Check network connectivity
 */
async function checkNetwork(options: DoctorOptions): Promise<CheckResult> {
  const endpoints = [
    { name: 'api.anthropic.com', url: 'https://api.anthropic.com' },
    { name: 'api.openai.com', url: 'https://api.openai.com' },
  ];

  const results: Array<{ name: string; reachable: boolean }> = [];

  for (const endpoint of endpoints) {
    try {
      await fetch(endpoint.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      results.push({ name: endpoint.name, reachable: true });
    } catch {
      results.push({ name: endpoint.name, reachable: false });
    }
  }

  const reachableCount = results.filter(r => r.reachable).length;

  if (reachableCount === 0) {
    return {
      name: 'Network',
      passed: false,
      error: 'Cannot reach LLM APIs',
      fix: 'Check network connection and firewall settings',
      details: options.verbose ? { endpoints: results } : undefined,
    };
  }

  return {
    name: 'Network',
    passed: true,
    message: `${reachableCount}/${endpoints.length} API endpoints reachable`,
    details: options.verbose ? { endpoints: results } : undefined,
  };
}

/**
 * Check Docker daemon availability (C1/L10)
 */
async function checkDockerDaemon(_options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');
  try {
    execFileSync('docker', ['info'], { encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'] });
    return { name: 'Docker Daemon', passed: true, message: 'Docker daemon running' };
  } catch {
    try {
      // Just check if docker binary exists
      execFileSync('docker', ['--version'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
      return {
        name: 'Docker Daemon',
        passed: false,
        error: 'Docker installed but daemon not running',
        fix: 'Start Docker: `open -a Docker` (macOS) or `sudo systemctl start docker` (Linux)',
      };
    } catch {
      return { name: 'Docker Daemon', passed: false, error: 'Docker not installed', fix: 'Install Docker Desktop from https://www.docker.com' };
    }
  }
}

/**
 * Check Vault CLI and status (C2/L10)
 */
async function checkVault(_options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');
  try {
    execFileSync('vault', ['--version'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    if (process.env.VAULT_ADDR) {
      try {
        const out = execFileSync('vault', ['status', '-format=json'], {
          encoding: 'utf-8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: process.env,
        });
        const status = JSON.parse(out);
        if (status.sealed) {
          return { name: 'Vault', passed: false, error: 'Vault is sealed', fix: 'Run `vault operator unseal`' };
        }
        return { name: 'Vault', passed: true, message: `Vault available at ${process.env.VAULT_ADDR} (unsealed)` };
      } catch {
        return { name: 'Vault', passed: false, error: `Cannot reach Vault at ${process.env.VAULT_ADDR}`, fix: 'Check VAULT_ADDR and network connectivity' };
      }
    }
    return { name: 'Vault', passed: true, message: 'vault CLI installed (VAULT_ADDR not set)' };
  } catch {
    return { name: 'Vault', passed: true, message: 'vault CLI not installed (optional)' };
  }
}

/**
 * Check CI/CD CLIs: gh, glab, circleci (C3/L10)
 */
async function checkCICDCLIs(_options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');
  const clis = [
    { name: 'gh (GitHub CLI)', cmd: 'gh', args: ['--version'] },
    { name: 'glab (GitLab CLI)', cmd: 'glab', args: ['--version'] },
    { name: 'circleci CLI', cmd: 'circleci', args: ['--version'] },
  ];
  const found: string[] = [];
  for (const cli of clis) {
    try {
      execFileSync(cli.cmd, cli.args, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
      found.push(cli.name);
    } catch { /* not installed */ }
  }
  return {
    name: 'CI/CD CLIs',
    passed: true,
    message: found.length > 0 ? `Found: ${found.join(', ')}` : 'No CI/CD CLIs installed (gh, glab, circleci are optional)',
  };
}

/**
 * Check GitOps CLIs: argocd, flux (H2/L10)
 */
async function checkGitOpsCLIs(_options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');
  const clis = [
    { name: 'argocd', cmd: 'argocd', args: ['version', '--client'] },
    { name: 'flux', cmd: 'flux', args: ['--version'] },
  ];
  const found: string[] = [];
  for (const cli of clis) {
    try {
      execFileSync(cli.cmd, cli.args, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
      found.push(cli.name);
    } catch { /* not installed */ }
  }
  return {
    name: 'GitOps CLIs',
    passed: true,
    message: found.length > 0 ? `Found: ${found.join(', ')}` : 'No GitOps CLIs installed (argocd, flux are optional)',
  };
}

/**
 * Pre-flight checks for common DevOps issues (L10)
 */
async function checkDevOpsPreFlight(options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');
  const issues: string[] = [];
  const hints: string[] = [];

  // kubectl cluster reachability
  try {
    execFileSync('kubectl', ['cluster-info', '--request-timeout=5s'], {
      encoding: 'utf-8', timeout: 8000, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('not found') && !msg.includes('ENOENT')) {
      issues.push('kubectl: cannot reach cluster');
      hints.push('Check kubectl context: `kubectl config current-context`');
    }
  }

  // helm repos
  try {
    const out = execFileSync('helm', ['repo', 'list', '-o', 'json'], {
      encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const repos = JSON.parse(out || '[]');
    if (!Array.isArray(repos) || repos.length === 0) {
      hints.push('No Helm repos configured. Add one: `helm repo add stable https://charts.helm.sh/stable`');
    }
  } catch { /* helm not installed or no repos */ }

  // GCP project
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.CLOUDSDK_CORE_PROJECT) {
    try {
      const proj = execFileSync('gcloud', ['config', 'get-value', 'project'], {
        encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (!proj || proj === '(unset)') {
        hints.push('GCP project not set. Run: `gcloud config set project <PROJECT_ID>`');
      }
    } catch { /* gcloud not installed */ }
  }

  if (options.fix) {
    // Auto-fix: helm repo update
    try {
      execFileSync('helm', ['repo', 'update'], { encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch { /* ignore */ }
  }

  if (issues.length > 0) {
    return {
      name: 'DevOps Pre-flight',
      passed: false,
      error: issues.join('; '),
      fix: hints.join(' | '),
    };
  }

  return {
    name: 'DevOps Pre-flight',
    passed: true,
    message: hints.length > 0 ? `OK (warnings: ${hints.join('; ')})` : 'All pre-flight checks passed',
  };
}

/** M5: Check helm-secrets plugin and sops availability */
async function checkHelmSecrets(_options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');
  const warnings: string[] = [];

  try {
    const out = execFileSync('helm', ['plugin', 'list'], { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
    if (!out.includes('secrets')) {
      warnings.push('helm-secrets plugin not installed (run: helm plugin install https://github.com/jkroepke/helm-secrets)');
    }
  } catch {
    warnings.push('helm not available — cannot check helm-secrets plugin');
  }

  try {
    execFileSync('sops', ['--version'], { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    warnings.push('sops not installed (run: brew install sops)');
  }

  return {
    name: 'Helm Secrets (M5)',
    passed: true,
    message: warnings.length > 0
      ? `Optional: ${warnings.join('; ')}`
      : 'helm-secrets plugin and sops are available',
  };
}


/**
 * H6: Check Terraform infrastructure context
 */
async function checkInfraContext(): Promise<CheckResult> {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync2 = promisify(exec);

  const cwd = process.cwd();
  const hasTerraformDir = existsSync(join(cwd, '.terraform'));
  const hasTfFiles = existsSync(join(cwd, 'main.tf')) || existsSync(join(cwd, 'variables.tf'));

  if (!hasTfFiles && !hasTerraformDir) {
    return { name: 'Terraform Context', passed: true, message: 'No Terraform configuration in current directory' };
  }

  if (hasTfFiles && !hasTerraformDir) {
    return {
      name: 'Terraform Context',
      passed: false,
      error: 'Terraform files found but not initialized.',
      fix: 'Run: terraform init',
    };
  }

  if (hasTerraformDir) {
    try {
      const { stdout } = await execAsync2('terraform workspace list', { cwd, timeout: 10_000 });
      const workspaces = stdout.trim().split('\n').map((w: string) => w.trim());
      const active = workspaces.find((w: string) => w.startsWith('*')) ?? 'default';
      return { name: 'Terraform Context', passed: true, message: `Terraform initialized. Active workspace: ${active.replace('* ', '')}` };
    } catch {
      return { name: 'Terraform Context', passed: true, message: 'Terraform initialized but workspace check failed (connectivity issue)' };
    }
  }

  return { name: 'Terraform Context', passed: true, message: 'No Terraform context found' };
}

/**
 * H6: Check Kubernetes cluster reachability
 */
async function checkKubeConfig(): Promise<CheckResult> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync2 = promisify(exec);

  try {
    const { stdout: ctx } = await execAsync2('kubectl config current-context', { timeout: 5_000 });
    const context = ctx.trim();
    if (!context) return { name: 'Kubernetes Reachability', passed: true, message: 'kubectl: no active context' };

    try {
      await execAsync2('kubectl cluster-info --request-timeout=3s', { timeout: 8_000 });
      try {
        const { stdout: ns } = await execAsync2('kubectl config view --minify -o jsonpath={..namespace}', { timeout: 3_000 });
        const namespace = ns.trim() || 'default';
        return { name: 'Kubernetes Reachability', passed: true, message: `kubectl: context "${context}", namespace "${namespace}" — cluster reachable` };
      } catch {
        return { name: 'Kubernetes Reachability', passed: true, message: `kubectl: context "${context}" — cluster reachable` };
      }
    } catch {
      return { name: 'Kubernetes Reachability', passed: true, message: `kubectl: context "${context}" — cluster not reachable (check VPN/credentials)` };
    }
  } catch {
    return { name: 'Kubernetes Reachability', passed: true, message: 'kubectl: no context configured (not required)' };
  }
}

/**
 * H6: Check Helm releases
 */
async function checkHelmReleases(): Promise<CheckResult> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync2 = promisify(exec);

  try {
    await execAsync2('which helm', { timeout: 3_000 });
    const { stdout } = await execAsync2('helm list -A --output json', { timeout: 15_000 });
    const releases: unknown[] = JSON.parse(stdout || '[]');
    return { name: 'Helm Releases', passed: true, message: `Helm: ${releases.length} release(s) across all namespaces` };
  } catch {
    return { name: 'Helm Releases', passed: true, message: 'Helm not installed or no releases found' };
  }
}

/**
 * M2: Check LLM connectivity by sending a minimal ping request.
 */
async function checkLLMConnectivity(_options: DoctorOptions): Promise<CheckResult> {
  try {
    const { initApp } = await import('../app');
    const { router } = await initApp();
    let provider = 'unknown';
    try {
      const { loadLLMConfig } = await import('../llm/config-loader');
      const cfg = loadLLMConfig();
      provider = (cfg as unknown as Record<string, unknown>).defaultProvider as string ?? 'anthropic';
    } catch { /* ignore */ }

    await Promise.race([
      router.route({ messages: [{ role: 'user', content: 'ping' }], maxTokens: 1 }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
    ]);
    return { name: 'LLM Connectivity', passed: true, message: `Connected to ${provider}` };
  } catch (e: any) {
    return {
      name: 'LLM Connectivity',
      passed: false,
      error: e.message,
      fix: 'Run nimbus login to reconfigure',
    };
  }
}

/**
 * H4: Check DevOps CLI versions with structured version parsing
 */
async function checkDevOpsCLIs(_options: DoctorOptions): Promise<CheckResult> {
  const { execFileSync } = await import('child_process');

  const tools = [
    { name: 'terraform', args: ['version', '-json'], parse: (o: string) => { try { return JSON.parse(o).terraform_version; } catch { return undefined; } } },
    { name: 'kubectl',   args: ['version', '--client', '--output=json'], parse: (o: string) => { try { return JSON.parse(o).clientVersion?.gitVersion; } catch { return undefined; } } },
    { name: 'helm',      args: ['version', '--short'], parse: (o: string) => o.trim() },
    { name: 'aws',       args: ['--version'], parse: (o: string) => o.split('/')[1]?.split(' ')[0] ?? o.trim() },
    { name: 'docker',    args: ['--version'], parse: (o: string) => o.replace('Docker version ', '').split(',')[0] },
  ];

  const results: string[] = [];
  const missing: string[] = [];

  for (const t of tools) {
    try {
      const out = execFileSync(t.name, t.args, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
      const ver = t.parse(out);
      results.push(`  ${t.name.padEnd(12)} ${ver ?? 'installed'}`);
    } catch {
      missing.push(t.name);
    }
  }

  const passed = missing.length === 0;
  return {
    name: 'DevOps CLIs',
    passed,
    message: passed ? `All CLIs found:\n${results.join('\n')}` : `Installed:\n${results.join('\n')}`,
    error: missing.length > 0 ? `Not found in PATH: ${missing.join(', ')}` : undefined,
    fix: missing.length > 0 ? `Install missing tools: ${missing.join(', ')}` : undefined,
  };
}

/**
 * H7: Check Node.js version (>= 18) and tsx availability
 */
async function checkNodeRuntime(_options: DoctorOptions): Promise<CheckResult> {
  const nodeVersion = process.versions.node;
  const majorStr = nodeVersion.split('.')[0];
  const major = parseInt(majorStr ?? '0', 10);

  if (major < 18) {
    return {
      name: 'Node.js Runtime',
      passed: false,
      error: `Node.js ${nodeVersion} is too old (requires >= 18)`,
      fix: 'Upgrade Node.js: https://nodejs.org/',
    };
  }

  // Check tsx availability
  const { execFileSync } = await import('child_process');
  let tsxVersion: string | undefined;
  try {
    tsxVersion = execFileSync('npx', ['tsx', '--version'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    // tsx may be installed locally without npx
    try {
      const path = await import('path');
      const { existsSync } = await import('fs');
      const localTsx = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
      if (existsSync(localTsx)) {
        tsxVersion = 'installed (local)';
      }
    } catch { /* ignore */ }
  }

  return {
    name: 'Node.js Runtime',
    passed: true,
    message: `Node.js ${nodeVersion}${tsxVersion ? `  tsx: ${tsxVersion}` : '  tsx: not found (install tsx for dev mode)'}`,
  };
}

/**
 * All diagnostic checks
 */
const DIAGNOSTIC_CHECKS: Array<{ name: string; check: DiagnosticCheck }> = [
  { name: 'Node.js Runtime', check: checkNodeRuntime },
  { name: 'Configuration', check: checkConfiguration },
  { name: 'LLM Provider', check: checkLLMProvider },
  { name: 'LLM Connectivity', check: checkLLMConnectivity },
  { name: 'Core Systems', check: checkCoreServices },
  { name: 'DevOps Tools', check: checkToolServices },
  { name: 'Cloud Credentials', check: checkCloudCredentials },
  { name: 'Cloud Connectivity', check: checkCloudConnectivity },
  { name: 'Dependencies', check: checkDependencies },
  { name: 'Disk Space', check: checkDiskSpace },
  { name: 'Network', check: checkNetwork },
  { name: 'Docker Daemon', check: checkDockerDaemon },
  { name: 'Vault', check: checkVault },
  { name: 'CI/CD CLIs', check: checkCICDCLIs },
  { name: 'GitOps CLIs', check: checkGitOpsCLIs },
  { name: 'Helm Secrets', check: checkHelmSecrets },
  { name: 'DevOps Pre-flight', check: checkDevOpsPreFlight },
  { name: 'Terraform Context', check: checkInfraContext },
  { name: 'Kubernetes Reachability', check: checkKubeConfig },
  { name: 'Helm Releases', check: checkHelmReleases },
  { name: 'DevOps CLIs', check: checkDevOpsCLIs },
];

// ---------------------------------------------------------------------------
// Gap 19: Fast startup health checks (subset of doctor, no network calls)
// ---------------------------------------------------------------------------

export interface StartupCheckResult {
  /** Issues that prevent Nimbus from starting (shown as blocking errors). */
  critical: string[];
  /** Non-blocking warnings shown as first system message in TUI. */
  warnings: string[];
}

/**
 * Run a fast pre-flight check before starting the TUI (<500ms per check).
 * Only checks that do NOT require network access are included here.
 *
 * Critical failures prevent TUI startup; warnings are surfaced as system messages.
 */
export async function runStartupChecks(): Promise<StartupCheckResult> {
  const critical: string[] = [];
  const warnings: string[] = [];

  // Critical: LLM credentials must be present
  const llmKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY'];
  const hasLLMKey = llmKeys.some(k => process.env[k]);
  if (!hasLLMKey) {
    // Also check stored credentials file
    try {
      const { join } = await import('node:path');
      const { homedir } = await import('node:os');
      const { readFileSync, existsSync } = await import('node:fs');
      const credsFile = join(homedir(), '.nimbus', 'credentials.json');
      if (existsSync(credsFile)) {
        const creds = JSON.parse(readFileSync(credsFile, 'utf-8'));
        if (Object.keys(creds.providers ?? {}).length === 0) {
          critical.push('No LLM credentials found. Set ANTHROPIC_API_KEY or run `nimbus login`.');
        }
      } else {
        critical.push('No LLM credentials found. Set ANTHROPIC_API_KEY or run `nimbus login`.');
      }
    } catch {
      critical.push('No LLM credentials found. Set ANTHROPIC_API_KEY or run `nimbus login`.');
    }
  }

  // Warning: no NIMBUS.md in CWD
  try {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const hasNimbusMd = existsSync(join(process.cwd(), 'NIMBUS.md')) ||
      existsSync(join(process.cwd(), '.nimbus', 'NIMBUS.md'));
    if (!hasNimbusMd) {
      warnings.push('No NIMBUS.md found. Run `nimbus init` to generate project context.');
    }
  } catch { /* ignore */ }

  // Warning: kubectl context not set
  try {
    const { execSync } = await import('node:child_process');
    execSync('kubectl config current-context', { timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    warnings.push('kubectl not configured or not in PATH. K8s operations will be unavailable.');
  }

  // Warning: terraform not in PATH
  try {
    const { execSync } = await import('node:child_process');
    execSync('terraform version', { timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch {
    warnings.push('terraform not in PATH. Install terraform to use Terraform operations.');
  }

  return { critical, warnings };
}

/**
 * Run the doctor command
 */
export async function doctorCommand(options: DoctorOptions = {}): Promise<void> {
  logger.debug('Running doctor command', { options });

  // In quiet mode, suppress banner/header — only show findings
  if (!options.quiet) {
    ui.header('Nimbus Doctor');
    ui.info('Running diagnostic checks...');
    ui.newLine();
  }

  const results: CheckResult[] = [];
  let allPassed = true;

  for (const { name, check } of DIAGNOSTIC_CHECKS) {
    if (!options.quiet) {
      ui.write(`  ${name.padEnd(20)}`);
    }

    try {
      const result = await check(options);
      results.push(result);

      if (result.passed) {
        if (!options.quiet) {
          ui.print(`${ui.color('✓', 'green')} ${result.message || 'OK'}`);
        }
      } else {
        allPassed = false;

        if (options.quiet) {
          // In quiet mode, only print failures
          ui.print(`FAIL ${name}: ${result.error || 'Failed'}${result.fix ? ` — ${result.fix}` : ''}`);
        } else {
          ui.print(`${ui.color('✗', 'red')} ${result.error || 'Failed'}`);

          if (options.fix && result.runFix) {
            ui.print(`                      → Attempting fix...`);
            try {
              await result.runFix();
              ui.print(`                      → ${ui.color('Fixed', 'green')}`);
            } catch (fixError: any) {
              ui.print(
                `                      → ${ui.color(`Fix failed: ${fixError.message}`, 'red')}`
              );
            }
          } else if (result.fix) {
            ui.print(`                      → ${ui.dim(result.fix)}`);
          }
        }
      }

      // Show details in verbose mode (not quiet)
      if (!options.quiet && options.verbose && result.details) {
        for (const [key, value] of Object.entries(result.details)) {
          if (Array.isArray(value)) {
            ui.print(`                      ${key}:`);
            for (const item of value) {
              if (typeof item === 'object') {
                ui.print(`                        - ${JSON.stringify(item)}`);
              } else {
                ui.print(`                        - ${item}`);
              }
            }
          } else {
            ui.print(`                      ${key}: ${value}`);
          }
        }
      }
    } catch (error: any) {
      if (!options.quiet) {
        ui.print(`${ui.color('✗', 'red')} Error: ${error.message}`);
      } else {
        ui.print(`FAIL ${name}: Error: ${error.message}`);
      }
      results.push({
        name,
        passed: false,
        error: error.message,
      });
      allPassed = false;
    }
  }

  if (!options.quiet) {
    ui.newLine();
  }

  // JSON output
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          passed: allPassed,
          results: results.map(r => ({
            name: r.name,
            passed: r.passed,
            message: r.message,
            error: r.error,
            details: r.details,
          })),
        },
        null,
        2
      )
    );
    if (!allPassed) process.exit(1);
    return;
  }

  // Summary
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  if (allPassed) {
    if (!options.quiet) {
      ui.success(`All checks passed! (${passedCount}/${totalCount})`);
    }
  } else {
    const failedCount = totalCount - passedCount;
    if (!options.quiet) {
      ui.warning(`${failedCount} check(s) failed. ${passedCount}/${totalCount} passed.`);
      ui.newLine();
      ui.info('Run with --fix to attempt automatic fixes');
      ui.info('Run with --verbose for more details');
    }
    process.exit(1);
  }

  // Quality Metrics (suppressed in quiet mode)
  if (options.metrics && !options.quiet) {
    ui.newLine();
    ui.header('Quality Metrics');

    try {
      const { getDb } = await import('../state/db');
      const db = getDb();
      // Get basic usage stats from the local SQLite database
      const sessionsRow = db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number } | undefined;
      const sessionCount = sessionsRow?.count ?? 0;
      ui.newLine();
      ui.print(`  Total sessions        ${sessionCount}`);
      ui.print(`  Database              ~/.nimbus/nimbus.db`);
      ui.print(`  Detailed metrics      nimbus serve (HTTP API)`);
    } catch {
      ui.warning('Could not fetch metrics. Run "nimbus serve" for the full metrics API.');
    }
  }
}

// Export as default command
export default doctorCommand;
