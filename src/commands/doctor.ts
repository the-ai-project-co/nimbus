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
    };
  }

  // Try to verify LLM service is reachable
  const llmUrl = process.env.LLM_SERVICE_URL || 'http://localhost:3002';

  try {
    const response = await fetch(`${llmUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });

    if (response.ok) {
      return {
        name: 'LLM Provider',
        passed: true,
        message: 'LLM service connected',
        details: options.verbose ? {
          envKeys: foundKeys,
          hasStoredCredentials,
          serviceUrl: llmUrl,
        } : undefined,
      };
    }
  } catch {
    // Service not available, but that's okay if we have credentials
  }

  return {
    name: 'LLM Provider',
    passed: true,
    message: hasStoredCredentials ? 'Credentials configured' : `Using ${foundKeys.join(', ')}`,
    details: options.verbose ? {
      envKeys: foundKeys,
      hasStoredCredentials,
    } : undefined,
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
      results.push({ provider: 'AWS', status: 'not installed', details: 'Install AWS CLI: https://aws.amazon.com/cli/' });
    } else {
      results.push({ provider: 'AWS', status: 'failed', details: 'Run "aws configure" or check credentials' });
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
      results.push({ provider: 'GCP', status: 'not installed', details: 'Install gcloud: https://cloud.google.com/sdk/docs/install' });
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
      results.push({ provider: 'Azure', status: 'not installed', details: 'Install Azure CLI: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli' });
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
      fix: results.map(r => r.details).filter(Boolean).join('; '),
      details: options.verbose ? { providers: results } : undefined,
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
 * Check core services
 */
async function checkCoreServices(options: DoctorOptions): Promise<CheckResult> {
  const services = [
    { name: 'Core Engine', url: process.env.CORE_ENGINE_URL || 'http://localhost:3001' },
    { name: 'LLM Service', url: process.env.LLM_SERVICE_URL || 'http://localhost:3002' },
    { name: 'Generator', url: process.env.GENERATOR_SERVICE_URL || 'http://localhost:3003' },
  ];

  const results: Array<{ name: string; status: string; url?: string }> = [];
  let anyAvailable = false;

  for (const service of services) {
    try {
      const response = await fetch(`${service.url}/health`, {
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        results.push({ name: service.name, status: 'running', url: options.verbose ? service.url : undefined });
        anyAvailable = true;
      } else {
        results.push({ name: service.name, status: 'unhealthy' });
      }
    } catch {
      results.push({ name: service.name, status: 'unavailable' });
    }
  }

  // For CLI-only mode, it's okay if services aren't running
  const cliOnlyMode = !anyAvailable;

  if (cliOnlyMode) {
    return {
      name: 'Core Services',
      passed: true,
      message: 'Running in standalone mode (services optional)',
      details: options.verbose ? { services: results } : undefined,
    };
  }

  const runningCount = results.filter(r => r.status === 'running').length;

  return {
    name: 'Core Services',
    passed: runningCount > 0,
    message: `${runningCount}/${services.length} services running`,
    details: options.verbose ? { services: results } : undefined,
  };
}

/**
 * Check tool services
 */
async function checkToolServices(options: DoctorOptions): Promise<CheckResult> {
  const services = [
    { name: 'Git Tools', url: process.env.GIT_TOOLS_URL || 'http://localhost:3004' },
    { name: 'FS Tools', url: process.env.FS_TOOLS_URL || 'http://localhost:3005' },
    { name: 'Terraform Tools', url: process.env.TERRAFORM_TOOLS_URL || 'http://localhost:3006' },
    { name: 'K8s Tools', url: process.env.K8S_TOOLS_URL || 'http://localhost:3007' },
    { name: 'Helm Tools', url: process.env.HELM_TOOLS_URL || 'http://localhost:3008' },
    { name: 'AWS Tools', url: process.env.AWS_TOOLS_URL || 'http://localhost:3009' },
    { name: 'GitHub Tools', url: process.env.GITHUB_TOOLS_URL || 'http://localhost:3010' },
    { name: 'State Service', url: process.env.STATE_SERVICE_URL || 'http://localhost:3011' },
  ];

  const results: Array<{ name: string; status: string }> = [];

  for (const service of services) {
    try {
      const response = await fetch(`${service.url}/health`, {
        signal: AbortSignal.timeout(2000),
      });

      if (response.ok) {
        results.push({ name: service.name, status: 'running' });
      } else {
        results.push({ name: service.name, status: 'unhealthy' });
      }
    } catch {
      results.push({ name: service.name, status: 'unavailable' });
    }
  }

  const runningCount = results.filter(r => r.status === 'running').length;

  // Tool services are optional - the CLI has local fallbacks
  return {
    name: 'Tool Services',
    passed: true,
    message: runningCount > 0
      ? `${runningCount}/${services.length} services running`
      : 'Using local tools (services unavailable)',
    details: options.verbose ? { services: results } : undefined,
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
  let requiredMissing: string[] = [];

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
  };
}

/**
 * Check disk space
 */
async function checkDiskSpace(options: DoctorOptions): Promise<CheckResult> {
  const os = await import('os');
  const { execFileSync } = await import('child_process');

  try {
    // Get disk space for home directory
    const homeDir = os.homedir();
    let available: number | undefined;

    if (process.platform === 'win32') {
      // Windows - use execFileSync with args array to prevent shell injection
      const output = execFileSync('wmic', ['logicaldisk', 'get', 'size,freespace,caption'], { encoding: 'utf-8' });
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
 * All diagnostic checks
 */
const DIAGNOSTIC_CHECKS: Array<{ name: string; check: DiagnosticCheck }> = [
  { name: 'Configuration', check: checkConfiguration },
  { name: 'LLM Provider', check: checkLLMProvider },
  { name: 'Cloud Credentials', check: checkCloudCredentials },
  { name: 'Cloud Connectivity', check: checkCloudConnectivity },
  { name: 'Core Services', check: checkCoreServices },
  { name: 'Tool Services', check: checkToolServices },
  { name: 'Dependencies', check: checkDependencies },
  { name: 'Disk Space', check: checkDiskSpace },
  { name: 'Network', check: checkNetwork },
];

/**
 * Run the doctor command
 */
export async function doctorCommand(options: DoctorOptions = {}): Promise<void> {
  logger.debug('Running doctor command', { options });

  ui.header('Nimbus Doctor');
  ui.info('Running diagnostic checks...');
  ui.newLine();

  const results: CheckResult[] = [];
  let allPassed = true;

  for (const { name, check } of DIAGNOSTIC_CHECKS) {
    ui.write(`  ${name.padEnd(20)}`);

    try {
      const result = await check(options);
      results.push(result);

      if (result.passed) {
        ui.print(ui.color('✓', 'green') + ' ' + (result.message || 'OK'));
      } else {
        ui.print(ui.color('✗', 'red') + ' ' + (result.error || 'Failed'));
        allPassed = false;

        if (options.fix && result.runFix) {
          ui.print(`                      → Attempting fix...`);
          try {
            await result.runFix();
            ui.print(`                      → ${ui.color('Fixed', 'green')}`);
          } catch (fixError: any) {
            ui.print(`                      → ${ui.color(`Fix failed: ${fixError.message}`, 'red')}`);
          }
        } else if (result.fix) {
          ui.print(`                      → ${ui.dim(result.fix)}`);
        }
      }

      // Show details in verbose mode
      if (options.verbose && result.details) {
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
      ui.print(ui.color('✗', 'red') + ` Error: ${error.message}`);
      results.push({
        name,
        passed: false,
        error: error.message,
      });
      allPassed = false;
    }
  }

  ui.newLine();

  // JSON output
  if (options.json) {
    console.log(JSON.stringify({
      passed: allPassed,
      results: results.map(r => ({
        name: r.name,
        passed: r.passed,
        message: r.message,
        error: r.error,
        details: r.details,
      })),
    }, null, 2));
    return;
  }

  // Summary
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  if (allPassed) {
    ui.success(`All checks passed! (${passedCount}/${totalCount})`);
  } else {
    const failedCount = totalCount - passedCount;
    ui.warning(`${failedCount} check(s) failed. ${passedCount}/${totalCount} passed.`);
    ui.newLine();
    ui.info('Run with --fix to attempt automatic fixes');
    ui.info('Run with --verbose for more details');
  }

  // Quality Metrics
  if (options.metrics) {
    ui.newLine();
    ui.header('Quality Metrics');

    const stateUrl = process.env.STATE_SERVICE_URL || 'http://localhost:3011';
    try {
      const response = await fetch(`${stateUrl}/api/state/metrics`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const { data } = await response.json() as any;

        ui.newLine();
        ui.print(`  Response Time (P95)   ${data.responseTime.p95}ms`);
        ui.print(`  Response Time (P50)   ${data.responseTime.p50}ms`);
        ui.print(`  Response Time (Avg)   ${data.responseTime.avg}ms`);
        ui.print(`  Error Rate            ${data.errorRate}%`);
        ui.print(`  Total Operations      ${data.totalOperations}`);
        ui.print(`  Total Tokens Used     ${data.totalTokensUsed.toLocaleString()}`);
        ui.print(`  Total Cost            $${data.totalCostUsd.toFixed(4)}`);

        if (Object.keys(data.operationsByType).length > 0) {
          ui.newLine();
          ui.print('  Operations by type:');
          for (const [type, count] of Object.entries(data.operationsByType)) {
            ui.print(`    ${type.padEnd(20)} ${count}`);
          }
        }
      } else {
        ui.warning('Could not fetch metrics (State service unavailable)');
      }
    } catch {
      ui.warning('Could not fetch metrics (State service unavailable)');
    }
  }
}

// Export as default command
export default doctorCommand;
