/**
 * Kubernetes Operations — Embedded tool (stripped HTTP wrappers)
 *
 * Copied from services/k8s-tools-service/src/k8s/operations.ts
 * Uses child_process instead of Bun.$ for portability in the embedded binary.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils';

const execAsync = promisify(exec);

export interface KubernetesConfig {
  kubeconfig?: string;
  context?: string;
  namespace?: string;
}

export interface GetOptions {
  resource: string;
  name?: string;
  namespace?: string;
  selector?: string;
  allNamespaces?: boolean;
  output?: 'json' | 'yaml' | 'wide' | 'name';
}

export interface ApplyOptions {
  manifest: string;
  namespace?: string;
  dryRun?: boolean;
  force?: boolean;
  serverSide?: boolean;
}

export interface DeleteOptions {
  resource: string;
  name?: string;
  namespace?: string;
  selector?: string;
  force?: boolean;
  gracePeriod?: number;
}

export interface LogsOptions {
  pod: string;
  namespace?: string;
  container?: string;
  follow?: boolean;
  tail?: number;
  previous?: boolean;
  since?: string;
  timestamps?: boolean;
}

export interface ExecOptions {
  pod: string;
  namespace?: string;
  container?: string;
  command: string[];
  stdin?: boolean;
  tty?: boolean;
}

export interface DescribeOptions {
  resource: string;
  name?: string;
  namespace?: string;
  selector?: string;
  allNamespaces?: boolean;
}

export interface PortForwardOptions {
  resource: string;
  name: string;
  namespace?: string;
  ports: string[];
  address?: string;
}

export interface ScaleOptions {
  resource: string;
  name: string;
  namespace?: string;
  replicas: number;
}

export interface RolloutOptions {
  resource: string;
  name: string;
  namespace?: string;
  action: 'status' | 'history' | 'restart' | 'undo' | 'pause' | 'resume';
  revision?: number;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
  exitCode: number;
}

export interface PortForwardResult {
  success: boolean;
  resource: string;
  ports: string[];
  namespace: string;
  address: string;
  message: string;
  pid?: number;
}

export interface CopyOptions {
  source: string;
  destination: string;
  namespace?: string;
  container?: string;
}

export interface LabelOptions {
  resource: string;
  name: string;
  namespace?: string;
  labels: Record<string, string | null>;
  overwrite?: boolean;
}

export interface AnnotateOptions {
  resource: string;
  name: string;
  namespace?: string;
  annotations: Record<string, string | null>;
  overwrite?: boolean;
}

export interface PatchOptions {
  resource: string;
  name: string;
  namespace?: string;
  patch: Record<string, unknown>;
  type?: 'json' | 'merge' | 'strategic';
}

export interface DrainOptions {
  force?: boolean;
  ignoreDaemonsets?: boolean;
  deleteEmptyDirData?: boolean;
  gracePeriod?: number;
  timeout?: string;
}

/**
 * Kubernetes operations class wrapping kubectl CLI
 */
export class KubernetesOperations {
  private kubectlPath: string;
  private kubeconfig?: string;
  private context?: string;
  private defaultNamespace: string;

  constructor(config: KubernetesConfig = {}) {
    this.kubectlPath = 'kubectl';
    this.kubeconfig = config.kubeconfig;
    this.context = config.context;
    this.defaultNamespace = config.namespace || 'default';
  }

  /**
   * Build base kubectl command with common flags
   */
  private buildBaseArgs(): string[] {
    const args: string[] = [];
    if (this.kubeconfig) {
      args.push('--kubeconfig', this.kubeconfig);
    }
    if (this.context) {
      args.push('--context', this.context);
    }
    return args;
  }

  /**
   * Execute kubectl command
   */
  private async execute(args: string[]): Promise<CommandResult> {
    const baseArgs = this.buildBaseArgs();
    const fullArgs = [...baseArgs, ...args];
    const command = `${this.kubectlPath} ${fullArgs.join(' ')}`;

    logger.debug(`Executing kubectl command: ${command}`);

    try {
      const result = await execAsync(command, {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120000,
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

      logger.error(`kubectl command failed: ${command}`, { exitCode, stderr });

      return {
        success: false,
        output: stdout,
        error: stderr,
        exitCode,
      };
    }
  }

  /**
   * Get Kubernetes resources
   */
  async get(options: GetOptions): Promise<CommandResult> {
    const args = ['get', options.resource];

    if (options.name) {
      args.push(options.name);
    }

    if (options.allNamespaces) {
      args.push('--all-namespaces');
    } else if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (options.selector) {
      args.push('-l', options.selector);
    }

    if (options.output) {
      args.push('-o', options.output);
    }

    return this.execute(args);
  }

  /**
   * Apply a manifest to the cluster
   */
  async apply(options: ApplyOptions): Promise<CommandResult> {
    const args = ['apply', '-f', '-'];

    if (options.namespace) {
      args.push('-n', options.namespace);
    }

    if (options.dryRun) {
      args.push('--dry-run=client');
    }

    if (options.force) {
      args.push('--force');
    }

    if (options.serverSide) {
      args.push('--server-side');
    }

    const baseArgs = this.buildBaseArgs();
    const fullArgs = [...baseArgs, ...args];

    logger.debug(`Applying manifest with kubectl`);

    try {
      const result = await execAsync(
        `echo '${options.manifest.replace(/'/g, "'\\''")}' | ${this.kubectlPath} ${fullArgs.join(' ')}`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 120000 }
      );
      return {
        success: true,
        output: result.stdout.trim(),
        exitCode: 0,
      };
    } catch (error: any) {
      const exitCode = error.code ?? 1;
      const stderr = error.stderr?.trim() || error.message;

      return {
        success: false,
        output: '',
        error: stderr,
        exitCode,
      };
    }
  }

  /**
   * Delete Kubernetes resources
   */
  async delete(options: DeleteOptions): Promise<CommandResult> {
    const args = ['delete', options.resource];

    if (options.name) {
      args.push(options.name);
    }

    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (options.selector) {
      args.push('-l', options.selector);
    }

    if (options.force) {
      args.push('--force');
    }

    if (options.gracePeriod !== undefined) {
      args.push('--grace-period', options.gracePeriod.toString());
    }

    return this.execute(args);
  }

  /**
   * Get logs from a pod
   */
  async logs(options: LogsOptions): Promise<CommandResult> {
    const args = ['logs', options.pod];

    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (options.container) {
      args.push('-c', options.container);
    }

    if (options.follow) {
      args.push('-f');
    }

    if (options.tail !== undefined) {
      args.push('--tail', options.tail.toString());
    }

    if (options.previous) {
      args.push('--previous');
    }

    if (options.since) {
      args.push('--since', options.since);
    }

    if (options.timestamps) {
      args.push('--timestamps');
    }

    return this.execute(args);
  }

  /**
   * Execute command in a pod
   */
  async exec(options: ExecOptions): Promise<CommandResult> {
    const args = ['exec', options.pod];

    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (options.container) {
      args.push('-c', options.container);
    }

    if (options.stdin) {
      args.push('-i');
    }

    if (options.tty) {
      args.push('-t');
    }

    args.push('--');
    args.push(...options.command);

    return this.execute(args);
  }

  /**
   * Describe Kubernetes resources
   */
  async describe(options: DescribeOptions): Promise<CommandResult> {
    const args = ['describe', options.resource];

    if (options.name) {
      args.push(options.name);
    }

    if (options.allNamespaces) {
      args.push('--all-namespaces');
    } else if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (options.selector) {
      args.push('-l', options.selector);
    }

    return this.execute(args);
  }

  /**
   * Scale a deployment, replicaset, or statefulset
   */
  async scale(options: ScaleOptions): Promise<CommandResult> {
    const args = [
      'scale',
      `${options.resource}/${options.name}`,
      '--replicas',
      options.replicas.toString(),
    ];

    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    return this.execute(args);
  }

  /**
   * Manage rollouts
   */
  async rollout(options: RolloutOptions): Promise<CommandResult> {
    const args = ['rollout', options.action, `${options.resource}/${options.name}`];

    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (options.action === 'undo' && options.revision !== undefined) {
      args.push('--to-revision', options.revision.toString());
    }

    return this.execute(args);
  }

  /**
   * Get cluster information
   */
  async clusterInfo(): Promise<CommandResult> {
    return this.execute(['cluster-info']);
  }

  /**
   * Get current context
   */
  async currentContext(): Promise<CommandResult> {
    return this.execute(['config', 'current-context']);
  }

  /**
   * Get list of contexts
   */
  async getContexts(): Promise<CommandResult> {
    return this.execute(['config', 'get-contexts', '-o', 'name']);
  }

  /**
   * Set current context
   */
  async useContext(context: string): Promise<CommandResult> {
    return this.execute(['config', 'use-context', context]);
  }

  /**
   * Get namespaces
   */
  async getNamespaces(): Promise<CommandResult> {
    return this.execute(['get', 'namespaces', '-o', 'json']);
  }

  /**
   * Create namespace
   */
  async createNamespace(name: string): Promise<CommandResult> {
    return this.execute(['create', 'namespace', name]);
  }

  /**
   * Delete namespace
   */
  async deleteNamespace(name: string): Promise<CommandResult> {
    return this.execute(['delete', 'namespace', name]);
  }

  /**
   * Get events in a namespace
   */
  async getEvents(namespace?: string, fieldSelector?: string): Promise<CommandResult> {
    const args = ['get', 'events', '-o', 'json'];

    if (namespace) {
      args.push('-n', namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (fieldSelector) {
      args.push('--field-selector', fieldSelector);
    }

    return this.execute(args);
  }

  /**
   * Top pods - show resource usage
   */
  async topPods(namespace?: string, selector?: string): Promise<CommandResult> {
    const args = ['top', 'pods'];

    if (namespace) {
      args.push('-n', namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (selector) {
      args.push('-l', selector);
    }

    return this.execute(args);
  }

  /**
   * Top nodes - show node resource usage
   */
  async topNodes(): Promise<CommandResult> {
    return this.execute(['top', 'nodes']);
  }

  /**
   * Get API resources
   */
  async apiResources(): Promise<CommandResult> {
    return this.execute(['api-resources', '-o', 'wide']);
  }

  /**
   * Get version information
   */
  async version(): Promise<CommandResult> {
    return this.execute(['version', '-o', 'json']);
  }

  /**
   * Port forward to a pod or service
   * Note: This starts a background process and returns immediately
   */
  async portForward(options: PortForwardOptions): Promise<PortForwardResult> {
    const args = ['port-forward'];

    // Resource type and name
    const resourceSpec = `${options.resource}/${options.name}`;
    args.push(resourceSpec);

    // Add ports
    for (const port of options.ports) {
      args.push(port);
    }

    // Namespace
    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    // Address to listen on
    if (options.address) {
      args.push('--address', options.address);
    }

    const baseArgs = this.buildBaseArgs();
    const fullArgs = [...baseArgs, ...args];

    logger.info(`Starting port-forward: ${this.kubectlPath} ${fullArgs.join(' ')}`);

    // Spawn the port-forward as a background process
    const proc = spawn(this.kubectlPath, fullArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Wait briefly for the "Forwarding from..." confirmation or an error
    const result = await new Promise<PortForwardResult>(resolve => {
      let stderr = '';

      const timeout = setTimeout(() => {
        // If no output after 5s, assume it started
        proc.unref();
        resolve({
          success: true,
          resource: resourceSpec,
          ports: options.ports,
          namespace: options.namespace || this.defaultNamespace,
          address: options.address || '127.0.0.1',
          message: `Port-forward started for ${resourceSpec}`,
          pid: proc.pid,
        });
      }, 5000);

      proc.stdout?.on('data', (data: Buffer) => {
        const output = data.toString();
        if (output.includes('Forwarding from')) {
          clearTimeout(timeout);
          proc.unref();
          resolve({
            success: true,
            resource: resourceSpec,
            ports: options.ports,
            namespace: options.namespace || this.defaultNamespace,
            address: options.address || '127.0.0.1',
            message: output.trim(),
            pid: proc.pid,
          });
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('error', err => {
        clearTimeout(timeout);
        resolve({
          success: false,
          resource: resourceSpec,
          ports: options.ports,
          namespace: options.namespace || this.defaultNamespace,
          address: options.address || '127.0.0.1',
          message: `Port-forward failed: ${err.message}`,
        });
      });

      proc.on('close', code => {
        if (code !== 0) {
          clearTimeout(timeout);
          resolve({
            success: false,
            resource: resourceSpec,
            ports: options.ports,
            namespace: options.namespace || this.defaultNamespace,
            address: options.address || '127.0.0.1',
            message: stderr.trim() || `Port-forward exited with code ${code}`,
          });
        }
      });
    });

    return result;
  }

  /**
   * Copy files to/from a pod
   */
  async cp(options: CopyOptions): Promise<CommandResult> {
    const args = ['cp'];

    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    if (options.container) {
      args.push('-c', options.container);
    }

    // Source and destination
    args.push(options.source, options.destination);

    return this.execute(args);
  }

  /**
   * Label a resource
   */
  async label(options: LabelOptions): Promise<CommandResult> {
    const args = ['label', `${options.resource}/${options.name}`];

    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    // Add labels
    for (const [key, value] of Object.entries(options.labels)) {
      if (value === null) {
        args.push(`${key}-`); // Remove label
      } else {
        args.push(`${key}=${value}`);
      }
    }

    if (options.overwrite) {
      args.push('--overwrite');
    }

    return this.execute(args);
  }

  /**
   * Annotate a resource
   */
  async annotate(options: AnnotateOptions): Promise<CommandResult> {
    const args = ['annotate', `${options.resource}/${options.name}`];

    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    // Add annotations
    for (const [key, value] of Object.entries(options.annotations)) {
      if (value === null) {
        args.push(`${key}-`); // Remove annotation
      } else {
        args.push(`${key}=${value}`);
      }
    }

    if (options.overwrite) {
      args.push('--overwrite');
    }

    return this.execute(args);
  }

  /**
   * Patch a resource
   */
  async patch(options: PatchOptions): Promise<CommandResult> {
    const args = ['patch', options.resource, options.name];

    if (options.namespace) {
      args.push('-n', options.namespace);
    } else {
      args.push('-n', this.defaultNamespace);
    }

    args.push('--type', options.type || 'strategic');
    args.push('-p', JSON.stringify(options.patch));

    return this.execute(args);
  }

  /**
   * Cordon a node (mark as unschedulable)
   */
  async cordon(nodeName: string): Promise<CommandResult> {
    return this.execute(['cordon', nodeName]);
  }

  /**
   * Uncordon a node (mark as schedulable)
   */
  async uncordon(nodeName: string): Promise<CommandResult> {
    return this.execute(['uncordon', nodeName]);
  }

  /**
   * Drain a node
   */
  async drain(nodeName: string, options?: DrainOptions): Promise<CommandResult> {
    const args = ['drain', nodeName];

    if (options?.force) {
      args.push('--force');
    }
    if (options?.ignoreDaemonsets) {
      args.push('--ignore-daemonsets');
    }
    if (options?.deleteEmptyDirData) {
      args.push('--delete-emptydir-data');
    }
    if (options?.gracePeriod !== undefined) {
      args.push('--grace-period', options.gracePeriod.toString());
    }
    if (options?.timeout) {
      args.push('--timeout', options.timeout);
    }

    return this.execute(args);
  }

  /**
   * Taint a node
   */
  async taint(nodeName: string, taints: string[]): Promise<CommandResult> {
    const args = ['taint', 'nodes', nodeName, ...taints];
    return this.execute(args);
  }
}
