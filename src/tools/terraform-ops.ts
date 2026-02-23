/**
 * Terraform Operations — Embedded tool (stripped HTTP wrappers)
 *
 * Copied from services/terraform-tools-service/src/terraform/operations.ts
 * Provides direct terraform CLI operations for the embedded CLI binary.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../utils';

const execAsync = promisify(exec);

export interface TerraformInitOptions {
  backend?: boolean;
  upgrade?: boolean;
  reconfigure?: boolean;
  backendConfig?: Record<string, string>;
}

export interface TerraformPlanOptions {
  varFile?: string;
  out?: string;
  destroy?: boolean;
  target?: string[];
  var?: Record<string, string>;
  refresh?: boolean;
}

export interface TerraformApplyOptions {
  autoApprove?: boolean;
  varFile?: string;
  planFile?: string;
  target?: string[];
  var?: Record<string, string>;
  parallelism?: number;
}

export interface TerraformDestroyOptions {
  autoApprove?: boolean;
  varFile?: string;
  target?: string[];
  var?: Record<string, string>;
}

export interface TerraformOutputOptions {
  name?: string;
  json?: boolean;
}

export interface TerraformValidateResult {
  valid: boolean;
  errorCount: number;
  warningCount: number;
  diagnostics: Array<{
    severity: 'error' | 'warning';
    summary: string;
    detail?: string;
  }>;
}

export interface TerraformWorkspaceResult {
  current: string;
  workspaces: string[];
}

export class TerraformOperations {
  private workingDir: string;
  private terraformPath: string;

  constructor(workingDir: string = process.cwd(), terraformPath: string = 'terraform') {
    this.workingDir = workingDir;
    this.terraformPath = terraformPath;
  }

  /**
   * Build command arguments array
   */
  private buildArgs(baseArgs: string[], options?: Record<string, any>): string[] {
    const args = [...baseArgs];

    if (options) {
      for (const [key, value] of Object.entries(options)) {
        if (value === undefined || value === null) continue;

        if (key === 'var' && typeof value === 'object') {
          for (const [varName, varValue] of Object.entries(value)) {
            args.push('-var', `${varName}=${varValue}`);
          }
        } else if (key === 'backendConfig' && typeof value === 'object') {
          for (const [configKey, configValue] of Object.entries(value)) {
            args.push('-backend-config', `${configKey}=${configValue}`);
          }
        } else if (key === 'target' && Array.isArray(value)) {
          for (const target of value) {
            args.push('-target', target);
          }
        } else if (typeof value === 'boolean') {
          if (value) {
            args.push(`-${key}`);
          } else if (key === 'backend') {
            args.push('-backend=false');
          }
        } else if (typeof value === 'number') {
          args.push(`-${key}=${value}`);
        } else if (typeof value === 'string') {
          args.push(`-${key}=${value}`);
        }
      }
    }

    return args;
  }

  /**
   * Execute terraform command
   */
  private async execute(args: string[], options?: { timeout?: number }): Promise<{ stdout: string; stderr: string }> {
    const command = `${this.terraformPath} ${args.join(' ')}`;
    logger.info(`Executing: ${command} in ${this.workingDir}`);

    try {
      const result = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
        timeout: options?.timeout || 600000, // 10 minute default timeout
        env: {
          ...process.env,
          TF_IN_AUTOMATION: 'true',
          TF_INPUT: 'false',
        },
      });

      return result;
    } catch (error: any) {
      // Terraform often writes useful info to stderr even on failure
      if (error.stdout || error.stderr) {
        throw new Error(error.stderr || error.stdout || error.message);
      }
      throw error;
    }
  }

  /**
   * Initialize terraform working directory
   */
  async init(options: TerraformInitOptions = {}): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform init in ${this.workingDir}`);

    const args = this.buildArgs(['init', '-no-color'], {
      backend: options.backend,
      upgrade: options.upgrade,
      reconfigure: options.reconfigure,
      backendConfig: options.backendConfig,
    });

    const result = await this.execute(args);

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Create execution plan
   */
  async plan(options: TerraformPlanOptions = {}): Promise<{ success: boolean; output: string; hasChanges: boolean }> {
    logger.info(`Terraform plan in ${this.workingDir}`);

    const args = this.buildArgs(['plan', '-no-color', '-detailed-exitcode'], {
      'var-file': options.varFile,
      out: options.out,
      destroy: options.destroy,
      target: options.target,
      var: options.var,
      refresh: options.refresh,
    });

    try {
      const result = await this.execute(args);
      return { success: true, output: result.stdout, hasChanges: false };
    } catch (error: any) {
      // Exit code 2 means there are changes
      if (error.message?.includes('exit code 2') || error.code === 2) {
        return { success: true, output: error.stdout || error.message, hasChanges: true };
      }
      throw error;
    }
  }

  /**
   * Apply changes
   */
  async apply(options: TerraformApplyOptions = {}): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform apply in ${this.workingDir}`);

    const args = this.buildArgs(['apply', '-no-color'], {
      'auto-approve': options.autoApprove,
      'var-file': options.varFile,
      target: options.target,
      var: options.var,
      parallelism: options.parallelism,
    });

    // If a plan file is provided, append it at the end
    if (options.planFile) {
      args.push(options.planFile);
    }

    const result = await this.execute(args, { timeout: 1800000 }); // 30 minute timeout for apply

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Destroy infrastructure
   */
  async destroy(options: TerraformDestroyOptions = {}): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform destroy in ${this.workingDir}`);

    const args = this.buildArgs(['destroy', '-no-color'], {
      'auto-approve': options.autoApprove,
      'var-file': options.varFile,
      target: options.target,
      var: options.var,
    });

    const result = await this.execute(args, { timeout: 1800000 }); // 30 minute timeout

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Get outputs
   */
  async output(options: TerraformOutputOptions = {}): Promise<any> {
    logger.info(`Terraform output in ${this.workingDir}`);

    const args = ['output', '-no-color'];

    if (options.json !== false) {
      args.push('-json');
    }

    if (options.name) {
      args.push(options.name);
    }

    const result = await this.execute(args);

    if (options.json !== false) {
      try {
        return JSON.parse(result.stdout);
      } catch {
        return result.stdout;
      }
    }

    return result.stdout;
  }

  /**
   * Show state or plan
   */
  async show(planFile?: string): Promise<{ output: string; json?: any }> {
    logger.info(`Terraform show in ${this.workingDir}`);

    const args = ['show', '-no-color'];

    if (planFile) {
      args.push('-json', planFile);
    }

    const result = await this.execute(args);

    if (planFile) {
      try {
        return { output: result.stdout, json: JSON.parse(result.stdout) };
      } catch {
        return { output: result.stdout };
      }
    }

    return { output: result.stdout };
  }

  /**
   * Validate configuration
   */
  async validate(): Promise<TerraformValidateResult> {
    logger.info(`Terraform validate in ${this.workingDir}`);

    try {
      const result = await this.execute(['validate', '-json']);
      const parsed = JSON.parse(result.stdout);

      return {
        valid: parsed.valid,
        errorCount: parsed.error_count || 0,
        warningCount: parsed.warning_count || 0,
        diagnostics: (parsed.diagnostics || []).map((d: any) => ({
          severity: d.severity,
          summary: d.summary,
          detail: d.detail,
        })),
      };
    } catch (error: any) {
      try {
        const parsed = JSON.parse(error.message);
        return {
          valid: false,
          errorCount: parsed.error_count || 1,
          warningCount: parsed.warning_count || 0,
          diagnostics: (parsed.diagnostics || []).map((d: any) => ({
            severity: d.severity,
            summary: d.summary,
            detail: d.detail,
          })),
        };
      } catch {
        return {
          valid: false,
          errorCount: 1,
          warningCount: 0,
          diagnostics: [{ severity: 'error', summary: error.message }],
        };
      }
    }
  }

  /**
   * Format configuration files
   */
  async fmt(options?: { check?: boolean; recursive?: boolean; diff?: boolean }): Promise<{ success: boolean; output: string; formatted?: string[] }> {
    logger.info(`Terraform fmt in ${this.workingDir}`);

    const args = ['fmt', '-no-color'];

    if (options?.check) {
      args.push('-check');
    }

    if (options?.recursive) {
      args.push('-recursive');
    }

    if (options?.diff) {
      args.push('-diff');
    }

    try {
      const result = await this.execute(args);
      const formatted = result.stdout.split('\n').filter(f => f.trim());

      return { success: true, output: result.stdout, formatted };
    } catch (error: any) {
      // Exit code 3 means files need formatting
      if (error.code === 3) {
        return { success: false, output: error.stdout || 'Files need formatting' };
      }
      throw error;
    }
  }

  /**
   * Run tflint and/or checkov linting
   */
  async lint(options?: { tflint?: boolean; checkov?: boolean }): Promise<{
    tflint?: { available: boolean; success: boolean; issues: Array<{ rule: string; severity: string; message: string; file?: string; line?: number }> };
    checkov?: { available: boolean; success: boolean; passed: number; failed: number; skipped: number; checks: Array<{ id: string; name: string; result: string; file?: string }> };
  }> {
    const runTflint = options?.tflint !== false;
    const runCheckov = options?.checkov !== false;
    const result: {
      tflint?: { available: boolean; success: boolean; issues: Array<{ rule: string; severity: string; message: string; file?: string; line?: number }> };
      checkov?: { available: boolean; success: boolean; passed: number; failed: number; skipped: number; checks: Array<{ id: string; name: string; result: string; file?: string }> };
    } = {};

    if (runTflint) {
      try {
        const tflintResult = await execAsync('tflint --format json --no-color', {
          cwd: this.workingDir,
          timeout: 120000,
        });

        const parsed = JSON.parse(tflintResult.stdout || '{}');
        const issues = (parsed.issues || []).map((issue: any) => ({
          rule: issue.rule?.name || 'unknown',
          severity: issue.rule?.severity || 'warning',
          message: issue.message || '',
          file: issue.range?.filename,
          line: issue.range?.start?.line,
        }));

        result.tflint = {
          available: true,
          success: issues.length === 0 || !issues.some((i: any) => i.severity === 'error'),
          issues,
        };
      } catch (err: any) {
        if (err.code === 'ENOENT' || err.message?.includes('ENOENT') || err.message?.includes('not found')) {
          result.tflint = { available: false, success: false, issues: [] };
        } else {
          try {
            const parsed = JSON.parse(err.stdout || '{}');
            const issues = (parsed.issues || []).map((issue: any) => ({
              rule: issue.rule?.name || 'unknown',
              severity: issue.rule?.severity || 'warning',
              message: issue.message || '',
              file: issue.range?.filename,
              line: issue.range?.start?.line,
            }));
            result.tflint = {
              available: true,
              success: false,
              issues,
            };
          } catch {
            result.tflint = {
              available: true,
              success: false,
              issues: [{ rule: 'unknown', severity: 'error', message: err.message }],
            };
          }
        }
      }
    }

    if (runCheckov) {
      try {
        const checkovResult = await execAsync(
          `checkov -d ${this.workingDir} --framework terraform --output json --compact`,
          { cwd: this.workingDir, timeout: 300000 }
        );

        const parsed = JSON.parse(checkovResult.stdout || '{}');
        const summary = parsed.summary || {};
        const checks = (parsed.results?.passed_checks || [])
          .map((c: any) => ({ id: c.check_id, name: c.check_name || c.name, result: 'passed', file: c.file_path }))
          .concat(
            (parsed.results?.failed_checks || []).map((c: any) => ({
              id: c.check_id,
              name: c.check_name || c.name,
              result: 'failed',
              file: c.file_path,
            }))
          );

        result.checkov = {
          available: true,
          success: (summary.failed || 0) === 0,
          passed: summary.passed || 0,
          failed: summary.failed || 0,
          skipped: summary.skipped || 0,
          checks,
        };
      } catch (err: any) {
        if (err.code === 'ENOENT' || err.message?.includes('ENOENT') || err.message?.includes('not found')) {
          result.checkov = { available: false, success: false, passed: 0, failed: 0, skipped: 0, checks: [] };
        } else {
          try {
            const parsed = JSON.parse(err.stdout || '{}');
            const summary = parsed.summary || {};
            const checks = (parsed.results?.passed_checks || [])
              .map((c: any) => ({ id: c.check_id, name: c.check_name || c.name, result: 'passed', file: c.file_path }))
              .concat(
                (parsed.results?.failed_checks || []).map((c: any) => ({
                  id: c.check_id,
                  name: c.check_name || c.name,
                  result: 'failed',
                  file: c.file_path,
                }))
              );
            result.checkov = {
              available: true,
              success: false,
              passed: summary.passed || 0,
              failed: summary.failed || 0,
              skipped: summary.skipped || 0,
              checks,
            };
          } catch {
            result.checkov = {
              available: true,
              success: false,
              passed: 0,
              failed: 0,
              skipped: 0,
              checks: [{ id: 'unknown', name: 'checkov error', result: 'failed', file: undefined }],
            };
          }
        }
      }
    }

    return result;
  }

  /**
   * List workspaces
   */
  async workspaceList(): Promise<TerraformWorkspaceResult> {
    logger.info(`Terraform workspace list in ${this.workingDir}`);

    const result = await this.execute(['workspace', 'list']);

    const lines = result.stdout.split('\n').filter(line => line.trim());
    let current = 'default';
    const workspaces: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('*')) {
        current = trimmed.replace(/\*/g, '').trim();
        workspaces.push(current);
      } else if (trimmed) {
        workspaces.push(trimmed);
      }
    }

    return { current, workspaces };
  }

  /**
   * Select workspace
   */
  async workspaceSelect(name: string): Promise<{ success: boolean; workspace: string }> {
    logger.info(`Terraform workspace select ${name} in ${this.workingDir}`);

    await this.execute(['workspace', 'select', name]);

    return { success: true, workspace: name };
  }

  /**
   * Create new workspace
   */
  async workspaceNew(name: string): Promise<{ success: boolean; workspace: string }> {
    logger.info(`Terraform workspace new ${name} in ${this.workingDir}`);

    await this.execute(['workspace', 'new', name]);

    return { success: true, workspace: name };
  }

  /**
   * Delete workspace
   */
  async workspaceDelete(name: string, force: boolean = false): Promise<{ success: boolean }> {
    logger.info(`Terraform workspace delete ${name} in ${this.workingDir}`);

    const args = ['workspace', 'delete'];
    if (force) {
      args.push('-force');
    }
    args.push(name);

    await this.execute(args);

    return { success: true };
  }

  /**
   * Get state list
   */
  async stateList(): Promise<string[]> {
    logger.info(`Terraform state list in ${this.workingDir}`);

    const result = await this.execute(['state', 'list']);

    return result.stdout.split('\n').filter(line => line.trim());
  }

  /**
   * Show specific resource in state
   */
  async stateShow(address: string): Promise<string> {
    logger.info(`Terraform state show ${address} in ${this.workingDir}`);

    const result = await this.execute(['state', 'show', address]);

    return result.stdout;
  }

  /**
   * Remove resource from state
   */
  async stateRm(address: string): Promise<{ success: boolean }> {
    logger.info(`Terraform state rm ${address} in ${this.workingDir}`);

    await this.execute(['state', 'rm', address]);

    return { success: true };
  }

  /**
   * Import existing resource
   */
  async import(address: string, id: string, options?: { varFile?: string }): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform import ${address} ${id} in ${this.workingDir}`);

    const args = this.buildArgs(['import', '-no-color'], {
      'var-file': options?.varFile,
    });

    args.push(address, id);

    const result = await this.execute(args);

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Refresh state
   */
  async refresh(options?: { varFile?: string }): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform refresh in ${this.workingDir}`);

    const args = this.buildArgs(['refresh', '-no-color'], {
      'var-file': options?.varFile,
    });

    const result = await this.execute(args);

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Get providers
   */
  async providers(): Promise<string> {
    logger.info(`Terraform providers in ${this.workingDir}`);

    const result = await this.execute(['providers']);

    return result.stdout;
  }

  /**
   * Get version
   */
  async version(): Promise<{ terraform: string; providers: Record<string, string> }> {
    logger.info('Terraform version');

    const result = await this.execute(['version', '-json']);

    const parsed = JSON.parse(result.stdout);

    return {
      terraform: parsed.terraform_version,
      providers: parsed.provider_selections || {},
    };
  }

  /**
   * Check if terraform is initialized
   */
  async isInitialized(): Promise<boolean> {
    const tfDir = path.join(this.workingDir, '.terraform');

    try {
      await fs.access(tfDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Move a resource in state
   */
  async stateMove(source: string, destination: string): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform state mv ${source} ${destination} in ${this.workingDir}`);

    const result = await this.execute(['state', 'mv', source, destination]);

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Taint a resource (mark for recreation)
   */
  async taint(address: string): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform taint ${address} in ${this.workingDir}`);

    const result = await this.execute(['taint', address]);

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Untaint a resource (unmark for recreation)
   */
  async untaint(address: string): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform untaint ${address} in ${this.workingDir}`);

    const result = await this.execute(['untaint', address]);

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Pull remote state
   */
  async statePull(): Promise<{ success: boolean; state: string }> {
    logger.info(`Terraform state pull in ${this.workingDir}`);

    const result = await this.execute(['state', 'pull']);

    return { success: true, state: result.stdout };
  }

  /**
   * Push local state to remote
   */
  async statePush(stateFile?: string, force?: boolean): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform state push in ${this.workingDir}`);

    const args = ['state', 'push'];
    if (force) {
      args.push('-force');
    }
    if (stateFile) {
      args.push(stateFile);
    }

    const result = await this.execute(args);

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Replace a provider in state
   */
  async stateReplaceProvider(
    fromProvider: string,
    toProvider: string
  ): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform state replace-provider ${fromProvider} ${toProvider} in ${this.workingDir}`);

    const result = await this.execute([
      'state',
      'replace-provider',
      '-auto-approve',
      fromProvider,
      toProvider,
    ]);

    return { success: true, output: result.stdout || result.stderr };
  }

  /**
   * Get graph of resources
   */
  async graph(type?: 'plan' | 'apply'): Promise<{ success: boolean; graph: string }> {
    logger.info(`Terraform graph in ${this.workingDir}`);

    const args = ['graph'];
    if (type) {
      args.push('-type', type);
    }

    const result = await this.execute(args);

    return { success: true, graph: result.stdout };
  }

  /**
   * Force unlock state
   */
  async forceUnlock(lockId: string): Promise<{ success: boolean; output: string }> {
    logger.info(`Terraform force-unlock ${lockId} in ${this.workingDir}`);

    const result = await this.execute(['force-unlock', '-force', lockId]);

    return { success: true, output: result.stdout || result.stderr };
  }
}
