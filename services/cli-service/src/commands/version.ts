/**
 * Version Command
 *
 * Display CLI and component version information
 *
 * Usage: nimbus version [options]
 */

import { logger } from '@nimbus/shared-utils';
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
 * Fetch component versions from services (for verbose mode)
 */
async function fetchComponentVersions(): Promise<Record<string, string>> {
  const components: Record<string, string> = {};
  const services = [
    { name: 'core-engine', url: process.env.CORE_ENGINE_URL || 'http://localhost:3001' },
    { name: 'llm-service', url: process.env.LLM_SERVICE_URL || 'http://localhost:3002' },
    { name: 'generator-service', url: process.env.GENERATOR_SERVICE_URL || 'http://localhost:3003' },
    { name: 'terraform-tools', url: process.env.TERRAFORM_TOOLS_URL || 'http://localhost:3006' },
    { name: 'k8s-tools', url: process.env.K8S_TOOLS_URL || 'http://localhost:3007' },
    { name: 'helm-tools', url: process.env.HELM_TOOLS_URL || 'http://localhost:3008' },
  ];

  const fetchWithTimeout = async (url: string, timeout = 2000): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch {
      clearTimeout(timeoutId);
      throw new Error('Timeout');
    }
  };

  await Promise.all(
    services.map(async (service) => {
      try {
        const response = await fetchWithTimeout(`${service.url}/health`);
        if (response.ok) {
          const data = await response.json() as { version?: string; status?: string };
          components[service.name] = data.version || 'running';
        } else {
          components[service.name] = 'unavailable';
        }
      } catch {
        components[service.name] = 'unavailable';
      }
    })
  );

  return components;
}

/**
 * Run the version command
 */
export async function versionCommand(options: VersionOptions = {}): Promise<void> {
  logger.debug('Running version command', { options });

  const versionInfo: VersionInfo = {
    cli: getCliVersion(),
    node: process.version,
    bun: getBunVersion(),
    platform: process.platform,
    arch: process.arch,
  };

  // Fetch component versions in verbose mode
  if (options.verbose) {
    ui.startSpinner({ message: 'Fetching component versions...' });
    versionInfo.components = await fetchComponentVersions();
    ui.stopSpinnerSuccess('');
  }

  // JSON output
  if (options.json) {
    console.log(JSON.stringify(versionInfo, null, 2));
    return;
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
      ui.print(`Components:`);
      for (const [name, version] of Object.entries(versionInfo.components)) {
        const status = version === 'unavailable' ? ui.color(version, 'red') : ui.color(version, 'green');
        ui.print(`  ${name.padEnd(18)} ${status}`);
      }
    }
  }
}

// Export as default command
export default versionCommand;
