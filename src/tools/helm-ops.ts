/**
 * Helm Operations — Embedded tool (stripped HTTP wrappers)
 *
 * Copied from services/helm-tools-service/src/helm/operations.ts
 * Uses child_process instead of Bun.$ for portability in the embedded binary.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils';

const execAsync = promisify(exec);

export interface HelmConfig {
  kubeconfig?: string;
  kubeContext?: string;
  namespace?: string;
}

export interface InstallOptions {
  name: string;
  chart: string;
  namespace?: string;
  values?: string;
  valuesFiles?: string[];
  set?: Record<string, string>;
  setString?: Record<string, string>;
  version?: string;
  createNamespace?: boolean;
  dryRun?: boolean;
  wait?: boolean;
  timeout?: string;
  atomic?: boolean;
}

export interface UpgradeOptions {
  name: string;
  chart: string;
  namespace?: string;
  values?: string;
  valuesFiles?: string[];
  set?: Record<string, string>;
  setString?: Record<string, string>;
  version?: string;
  install?: boolean;
  createNamespace?: boolean;
  dryRun?: boolean;
  wait?: boolean;
  timeout?: string;
  atomic?: boolean;
  reuseValues?: boolean;
  resetValues?: boolean;
}

export interface UninstallOptions {
  name: string;
  namespace?: string;
  keepHistory?: boolean;
  dryRun?: boolean;
  wait?: boolean;
  timeout?: string;
}

export interface ListOptions {
  namespace?: string;
  allNamespaces?: boolean;
  filter?: string;
  maxResults?: number;
  offset?: number;
  pending?: boolean;
  deployed?: boolean;
  failed?: boolean;
  uninstalling?: boolean;
  superseded?: boolean;
}

export interface RollbackOptions {
  name: string;
  revision: number;
  namespace?: string;
  dryRun?: boolean;
  wait?: boolean;
  timeout?: string;
  force?: boolean;
}

export interface GetValuesOptions {
  name: string;
  namespace?: string;
  allValues?: boolean;
  revision?: number;
}

export interface HistoryOptions {
  name: string;
  namespace?: string;
  maxResults?: number;
}

export interface RepoOptions {
  action: 'add' | 'remove' | 'list' | 'update';
  name?: string;
  url?: string;
  username?: string;
  password?: string;
}

export interface SearchOptions {
  keyword: string;
  repo?: string;
  version?: string;
  versions?: boolean;
  regexp?: boolean;
  maxResults?: number;
}

export interface ShowOptions {
  chart: string;
  subcommand: 'all' | 'chart' | 'readme' | 'values' | 'crds';
  version?: string;
}

export interface TemplateOptions {
  name: string;
  chart: string;
  namespace?: string;
  values?: string;
  valuesFiles?: string[];
  set?: Record<string, string>;
  setString?: Record<string, string>;
  version?: string;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

export interface TestOptions {
  name: string;
  namespace?: string;
  timeout?: string;
  filter?: string;
  logs?: boolean;
}

export interface PackageOptions {
  destination?: string;
  version?: string;
  appVersion?: string;
  dependencyUpdate?: boolean;
}

/**
 * Helm operations class wrapping helm CLI
 */
export class HelmOperations {
  private helmPath: string;
  private kubeconfig?: string;
  private kubeContext?: string;
  private defaultNamespace: string;

  constructor(config: HelmConfig = {}) {
    this.helmPath = 'helm';
    this.kubeconfig = config.kubeconfig;
    this.kubeContext = config.kubeContext;
    this.defaultNamespace = config.namespace || 'default';
  }

  /**
   * Build base helm command with common flags
   */
  private buildBaseArgs(): string[] {
    const args: string[] = [];
    if (this.kubeconfig) {
      args.push('--kubeconfig', this.kubeconfig);
    }
    if (this.kubeContext) {
      args.push('--kube-context', this.kubeContext);
    }
    return args;
  }

  /**
   * Execute helm command
   */
  private async execute(args: string[]): Promise<CommandResult> {
    const baseArgs = this.buildBaseArgs();
    const fullArgs = [...baseArgs, ...args];
    const command = `${this.helmPath} ${fullArgs.join(' ')}`;

    logger.debug(`Executing helm command: ${command}`);

    try {
      const result = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000,
      });
      return {
        success: true,
        output: result.stdout.trim(),
        exitCode: 0,
      };
    } catch (error: any) {
      const exitCode = error.code ?? 1;
      const stderr = error.stderr?.trim() || error.message;
      const stdout = error.stdout?.trim() || '';

      logger.error(`helm command failed: ${command}`, { exitCode, stderr });

      return {
        success: false,
        output: stdout,
        error: stderr,
        exitCode,
      };
    }
  }

  /**
   * Build set arguments from Record
   */
  private buildSetArgs(
    set: Record<string, string> | undefined,
    prefix: string = '--set'
  ): string[] {
    if (!set) {
      return [];
    }
    return Object.entries(set).flatMap(([key, value]) => [prefix, `${key}=${value}`]);
  }

  /**
   * Install a Helm chart
   */
  async install(options: InstallOptions): Promise<CommandResult> {
    const args = ['install', options.name, options.chart];

    const namespace = options.namespace || this.defaultNamespace;
    args.push('-n', namespace);

    if (options.createNamespace) {
      args.push('--create-namespace');
    }

    if (options.version) {
      args.push('--version', options.version);
    }

    if (options.values) {
      args.push('-f', '-');
    }

    if (options.valuesFiles) {
      for (const file of options.valuesFiles) {
        args.push('-f', file);
      }
    }

    args.push(...this.buildSetArgs(options.set));
    args.push(...this.buildSetArgs(options.setString, '--set-string'));

    if (options.dryRun) {
      args.push('--dry-run');
    }

    if (options.wait) {
      args.push('--wait');
    }

    if (options.timeout) {
      args.push('--timeout', options.timeout);
    }

    if (options.atomic) {
      args.push('--atomic');
    }

    args.push('-o', 'json');

    // If values are provided as string, pipe them
    if (options.values) {
      const baseArgs = this.buildBaseArgs();
      const fullArgs = [...baseArgs, ...args];
      try {
        const result = await execAsync(
          `echo '${options.values.replace(/'/g, "'\\''")}' | ${this.helmPath} ${fullArgs.join(' ')}`,
          { maxBuffer: 10 * 1024 * 1024, timeout: 300000 }
        );
        return {
          success: true,
          output: result.stdout.trim(),
          exitCode: 0,
        };
      } catch (error: any) {
        return {
          success: false,
          output: '',
          error: error.stderr?.trim() || error.message,
          exitCode: error.code ?? 1,
        };
      }
    }

    return this.execute(args);
  }

  /**
   * Upgrade a Helm release
   */
  async upgrade(options: UpgradeOptions): Promise<CommandResult> {
    const args = ['upgrade', options.name, options.chart];

    const namespace = options.namespace || this.defaultNamespace;
    args.push('-n', namespace);

    if (options.install) {
      args.push('--install');
    }

    if (options.createNamespace) {
      args.push('--create-namespace');
    }

    if (options.version) {
      args.push('--version', options.version);
    }

    if (options.values) {
      args.push('-f', '-');
    }

    if (options.valuesFiles) {
      for (const file of options.valuesFiles) {
        args.push('-f', file);
      }
    }

    args.push(...this.buildSetArgs(options.set));
    args.push(...this.buildSetArgs(options.setString, '--set-string'));

    if (options.reuseValues) {
      args.push('--reuse-values');
    }

    if (options.resetValues) {
      args.push('--reset-values');
    }

    if (options.dryRun) {
      args.push('--dry-run');
    }

    if (options.wait) {
      args.push('--wait');
    }

    if (options.timeout) {
      args.push('--timeout', options.timeout);
    }

    if (options.atomic) {
      args.push('--atomic');
    }

    args.push('-o', 'json');

    // If values are provided as string, pipe them
    if (options.values) {
      const baseArgs = this.buildBaseArgs();
      const fullArgs = [...baseArgs, ...args];
      try {
        const result = await execAsync(
          `echo '${options.values.replace(/'/g, "'\\''")}' | ${this.helmPath} ${fullArgs.join(' ')}`,
          { maxBuffer: 10 * 1024 * 1024, timeout: 300000 }
        );
        return {
          success: true,
          output: result.stdout.trim(),
          exitCode: 0,
        };
      } catch (error: any) {
        return {
          success: false,
          output: '',
          error: error.stderr?.trim() || error.message,
          exitCode: error.code ?? 1,
        };
      }
    }

    return this.execute(args);
  }

  /**
   * Uninstall a Helm release
   */
  async uninstall(options: UninstallOptions): Promise<CommandResult> {
    const args = ['uninstall', options.name];

    const namespace = options.namespace || this.defaultNamespace;
    args.push('-n', namespace);

    if (options.keepHistory) {
      args.push('--keep-history');
    }

    if (options.dryRun) {
      args.push('--dry-run');
    }

    if (options.wait) {
      args.push('--wait');
    }

    if (options.timeout) {
      args.push('--timeout', options.timeout);
    }

    return this.execute(args);
  }

  /**
   * List Helm releases
   */
  async list(options: ListOptions = {}): Promise<CommandResult> {
    const args = ['list', '-o', 'json'];

    if (options.allNamespaces) {
      args.push('-A');
    } else if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (options.filter) {
      args.push('-f', options.filter);
    }

    if (options.maxResults) {
      args.push('-m', options.maxResults.toString());
    }

    if (options.offset) {
      args.push('--offset', options.offset.toString());
    }

    if (options.pending) {
      args.push('--pending');
    }

    if (options.deployed) {
      args.push('--deployed');
    }

    if (options.failed) {
      args.push('--failed');
    }

    if (options.uninstalling) {
      args.push('--uninstalling');
    }

    if (options.superseded) {
      args.push('--superseded');
    }

    return this.execute(args);
  }

  /**
   * Rollback a Helm release
   */
  async rollback(options: RollbackOptions): Promise<CommandResult> {
    const args = ['rollback', options.name, options.revision.toString()];

    const namespace = options.namespace || this.defaultNamespace;
    args.push('-n', namespace);

    if (options.dryRun) {
      args.push('--dry-run');
    }

    if (options.wait) {
      args.push('--wait');
    }

    if (options.timeout) {
      args.push('--timeout', options.timeout);
    }

    if (options.force) {
      args.push('--force');
    }

    return this.execute(args);
  }

  /**
   * Get values for a release
   */
  async getValues(options: GetValuesOptions): Promise<CommandResult> {
    const args = ['get', 'values', options.name, '-o', 'yaml'];

    const namespace = options.namespace || this.defaultNamespace;
    args.push('-n', namespace);

    if (options.allValues) {
      args.push('-a');
    }

    if (options.revision) {
      args.push('--revision', options.revision.toString());
    }

    return this.execute(args);
  }

  /**
   * Get manifest for a release
   */
  async getManifest(name: string, namespace?: string, revision?: number): Promise<CommandResult> {
    const args = ['get', 'manifest', name];

    args.push('-n', namespace || this.defaultNamespace);

    if (revision) {
      args.push('--revision', revision.toString());
    }

    return this.execute(args);
  }

  /**
   * Get hooks for a release
   */
  async getHooks(name: string, namespace?: string, revision?: number): Promise<CommandResult> {
    const args = ['get', 'hooks', name];

    args.push('-n', namespace || this.defaultNamespace);

    if (revision) {
      args.push('--revision', revision.toString());
    }

    return this.execute(args);
  }

  /**
   * Get notes for a release
   */
  async getNotes(name: string, namespace?: string, revision?: number): Promise<CommandResult> {
    const args = ['get', 'notes', name];

    args.push('-n', namespace || this.defaultNamespace);

    if (revision) {
      args.push('--revision', revision.toString());
    }

    return this.execute(args);
  }

  /**
   * Get release history
   */
  async history(options: HistoryOptions): Promise<CommandResult> {
    const args = ['history', options.name, '-o', 'json'];

    const namespace = options.namespace || this.defaultNamespace;
    args.push('-n', namespace);

    if (options.maxResults) {
      args.push('-m', options.maxResults.toString());
    }

    return this.execute(args);
  }

  /**
   * Get release status
   */
  async status(name: string, namespace?: string, revision?: number): Promise<CommandResult> {
    const args = ['status', name, '-o', 'json'];

    args.push('-n', namespace || this.defaultNamespace);

    if (revision) {
      args.push('--revision', revision.toString());
    }

    return this.execute(args);
  }

  /**
   * Manage Helm repositories
   */
  async repo(options: RepoOptions): Promise<CommandResult> {
    const args = ['repo', options.action];

    switch (options.action) {
      case 'add':
        if (!options.name || !options.url) {
          return {
            success: false,
            output: '',
            error: 'Name and URL are required for repo add',
            exitCode: 1,
          };
        }
        args.push(options.name, options.url);
        if (options.username) {
          args.push('--username', options.username);
        }
        if (options.password) {
          args.push('--password', options.password);
        }
        break;

      case 'remove':
        if (!options.name) {
          return {
            success: false,
            output: '',
            error: 'Name is required for repo remove',
            exitCode: 1,
          };
        }
        args.push(options.name);
        break;

      case 'list':
        args.push('-o', 'json');
        break;

      case 'update':
        // No additional args needed
        break;
    }

    return this.execute(args);
  }

  /**
   * Search for charts
   */
  async search(options: SearchOptions): Promise<CommandResult> {
    const args = ['search', 'repo', options.keyword, '-o', 'json'];

    if (options.version) {
      args.push('--version', options.version);
    }

    if (options.versions) {
      args.push('--versions');
    }

    if (options.regexp) {
      args.push('--regexp');
    }

    if (options.maxResults) {
      args.push('-m', options.maxResults.toString());
    }

    return this.execute(args);
  }

  /**
   * Search hub for charts
   */
  async searchHub(keyword: string, maxResults?: number): Promise<CommandResult> {
    const args = ['search', 'hub', keyword, '-o', 'json'];

    if (maxResults) {
      args.push('-m', maxResults.toString());
    }

    return this.execute(args);
  }

  /**
   * Show chart information
   */
  async show(options: ShowOptions): Promise<CommandResult> {
    const args = ['show', options.subcommand, options.chart];

    if (options.version) {
      args.push('--version', options.version);
    }

    return this.execute(args);
  }

  /**
   * Template a chart locally
   */
  async template(options: TemplateOptions): Promise<CommandResult> {
    const args = ['template', options.name, options.chart];

    if (options.namespace) {
      args.push('-n', options.namespace);
    }

    if (options.version) {
      args.push('--version', options.version);
    }

    if (options.values) {
      args.push('-f', '-');
    }

    if (options.valuesFiles) {
      for (const file of options.valuesFiles) {
        args.push('-f', file);
      }
    }

    args.push(...this.buildSetArgs(options.set));
    args.push(...this.buildSetArgs(options.setString, '--set-string'));

    // If values are provided as string, pipe them
    if (options.values) {
      const baseArgs = this.buildBaseArgs();
      const fullArgs = [...baseArgs, ...args];
      try {
        const result = await execAsync(
          `echo '${options.values.replace(/'/g, "'\\''")}' | ${this.helmPath} ${fullArgs.join(' ')}`,
          { maxBuffer: 10 * 1024 * 1024, timeout: 300000 }
        );
        return {
          success: true,
          output: result.stdout.trim(),
          exitCode: 0,
        };
      } catch (error: any) {
        return {
          success: false,
          output: '',
          error: error.stderr?.trim() || error.message,
          exitCode: error.code ?? 1,
        };
      }
    }

    return this.execute(args);
  }

  /**
   * Verify Helm is installed and get version
   */
  async version(): Promise<CommandResult> {
    return this.execute(['version', '--short']);
  }

  /**
   * Pull a chart from a repository
   */
  async pull(
    chart: string,
    version?: string,
    destination?: string,
    untar?: boolean
  ): Promise<CommandResult> {
    const args = ['pull', chart];

    if (version) {
      args.push('--version', version);
    }

    if (destination) {
      args.push('-d', destination);
    }

    if (untar) {
      args.push('--untar');
    }

    return this.execute(args);
  }

  /**
   * Lint a chart
   */
  async lint(chartPath: string, strict?: boolean, valuesFiles?: string[]): Promise<CommandResult> {
    const args = ['lint', chartPath];

    if (strict) {
      args.push('--strict');
    }

    if (valuesFiles) {
      for (const file of valuesFiles) {
        args.push('-f', file);
      }
    }

    return this.execute(args);
  }

  /**
   * Run tests for a release
   */
  async test(options: TestOptions): Promise<CommandResult> {
    const args = ['test', options.name];

    const namespace = options.namespace || this.defaultNamespace;
    args.push('-n', namespace);

    if (options.timeout) {
      args.push('--timeout', options.timeout);
    }

    if (options.filter) {
      args.push('--filter', options.filter);
    }

    if (options.logs) {
      args.push('--logs');
    }

    return this.execute(args);
  }

  /**
   * Package a chart
   */
  async package(chartPath: string, options?: PackageOptions): Promise<CommandResult> {
    const args = ['package', chartPath];

    if (options?.destination) {
      args.push('-d', options.destination);
    }

    if (options?.version) {
      args.push('--version', options.version);
    }

    if (options?.appVersion) {
      args.push('--app-version', options.appVersion);
    }

    if (options?.dependencyUpdate) {
      args.push('--dependency-update');
    }

    return this.execute(args);
  }

  /**
   * Update chart dependencies
   */
  async dependencyUpdate(chartPath: string): Promise<CommandResult> {
    return this.execute(['dependency', 'update', chartPath]);
  }

  /**
   * Build chart dependencies
   */
  async dependencyBuild(chartPath: string): Promise<CommandResult> {
    return this.execute(['dependency', 'build', chartPath]);
  }

  /**
   * List chart dependencies
   */
  async dependencyList(chartPath: string): Promise<CommandResult> {
    return this.execute(['dependency', 'list', chartPath]);
  }

  /**
   * Verify a chart
   */
  async verify(chartPath: string, keyring?: string): Promise<CommandResult> {
    const args = ['verify', chartPath];

    if (keyring) {
      args.push('--keyring', keyring);
    }

    return this.execute(args);
  }

  /**
   * Get all release information
   */
  async getAll(name: string, namespace?: string, revision?: number): Promise<CommandResult> {
    const args = ['get', 'all', name];

    args.push('-n', namespace || this.defaultNamespace);

    if (revision) {
      args.push('--revision', revision.toString());
    }

    return this.execute(args);
  }

  /**
   * Create a new chart
   */
  async create(name: string, starterChart?: string): Promise<CommandResult> {
    const args = ['create', name];

    if (starterChart) {
      args.push('--starter', starterChart);
    }

    return this.execute(args);
  }

  /**
   * Push a chart to a registry
   */
  async push(chartPath: string, remote: string): Promise<CommandResult> {
    return this.execute(['push', chartPath, remote]);
  }

  /**
   * Login to a registry
   */
  async registryLogin(host: string, username: string, password: string): Promise<CommandResult> {
    return this.execute([
      'registry',
      'login',
      host,
      '--username',
      username,
      '--password',
      password,
    ]);
  }

  /**
   * Logout from a registry
   */
  async registryLogout(host: string): Promise<CommandResult> {
    return this.execute(['registry', 'logout', host]);
  }
}
