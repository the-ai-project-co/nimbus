/**
 * Version Command
 *
 * Display CLI and component version information
 *
 * Usage: nimbus version [options]
 */

import { logger } from '../utils';
import { ui } from '../wizard';

/**
 * Command options
 */
export interface VersionOptions {
  verbose?: boolean;
  json?: boolean;
}

/**
 * Version information structure
 */
interface VersionInfo {
  cli: string;
  node: string;
  bun?: string;
  platform: string;
  arch: string;
  components?: Record<string, string>;
}

/**
 * Get the CLI version from package.json or environment
 */
function getCliVersion(): string {
  // Try environment variable first (set during build)
  if (process.env.NIMBUS_VERSION) {
    return process.env.NIMBUS_VERSION;
  }

  // Try npm_package_version (available when run via npm/bun)
  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }

  // Fallback to reading package.json
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json');
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

/**
 * Get Bun version if running under Bun
 */
function getBunVersion(): string | undefined {
  // Check for Bun global
  const globalAny = globalThis as any;
  if (typeof globalAny.Bun !== 'undefined') {
    return globalAny.Bun.version;
  }
  return undefined;
}

/**
 * Fetch DevOps CLI tool versions (for verbose mode)
 */
async function fetchDevOpsVersions(): Promise<Record<string, string>> {
  const { execFileSync } = await import('child_process');
  const tools = [
    { name: 'terraform', args: ['version', '-json'] },
    { name: 'kubectl', args: ['version', '--client', '--output=json'] },
    { name: 'helm', args: ['version', '--short'] },
    { name: 'aws', args: ['--version'] },
    { name: 'gcloud', args: ['version'] },
    { name: 'az', args: ['version'] },
  ];

  const versions: Record<string, string> = {};
  for (const tool of tools) {
    try {
      const output = execFileSync(tool.name, tool.args, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      // Try to parse version string from JSON output
      let version = 'installed';
      try {
        const parsed = JSON.parse(output);
        version =
          parsed.terraform_version ||
          parsed.clientVersion?.gitVersion ||
          'installed';
      } catch {
        const match = output.match(/[\d]+\.[\d]+\.[\d]+/);
        if (match) version = `v${match[0]}`;
      }
      versions[tool.name] = version;
    } catch {
      versions[tool.name] = 'not installed';
    }
  }
  return versions;
}

/**
 * Run the version command
 */
export async function versionCommand(options: VersionOptions = {}): Promise<void> {
  logger.debug('Running version command', { options });

  const cliVersion = getCliVersion();
  const versionInfo: VersionInfo = {
    cli: cliVersion,
    node: process.version,
    bun: getBunVersion(),
    platform: process.platform,
    arch: process.arch,
  };

  // Fetch DevOps tool versions in verbose mode
  if (options.verbose) {
    ui.startSpinner({ message: 'Checking DevOps tool versions...' });
    versionInfo.components = await fetchDevOpsVersions();
    ui.stopSpinnerSuccess('');
  }

  // JSON output — expose `version` field (alias for `cli`) for L3 compatibility
  if (options.json) {
    const jsonOutput: Record<string, unknown> = {
      version: cliVersion,
      node: versionInfo.node,
      platform: versionInfo.platform,
      arch: versionInfo.arch,
      cli: versionInfo.cli,
    };
    if (versionInfo.bun) jsonOutput.bun = versionInfo.bun;
    if (versionInfo.components) jsonOutput.components = versionInfo.components;
    console.log(JSON.stringify(jsonOutput, null, 2));
    process.exit(0);
  }

  // Human-readable output
  ui.print(`nimbus version ${versionInfo.cli}`);

  if (options.verbose) {
    ui.newLine();
    ui.print(`Runtime:`);
    if (versionInfo.bun) {
      ui.print(`  Bun:      ${versionInfo.bun}`);
    }
    ui.print(`  Node:     ${versionInfo.node}`);
    ui.print(`  Platform: ${versionInfo.platform}`);
    ui.print(`  Arch:     ${versionInfo.arch}`);

    if (versionInfo.components) {
      ui.newLine();
      ui.print(`DevOps Tools:`);
      for (const [name, version] of Object.entries(versionInfo.components)) {
        const isInstalled = version !== 'not installed';
        const icon = isInstalled ? '[+]' : '[-]';
        const color = isInstalled ? 'green' : 'red';
        ui.print(`  ${ui.color(icon, color)} ${name.padEnd(12)} ${version}`);
      }
    }
  }
}

// Export as default command
export default versionCommand;
