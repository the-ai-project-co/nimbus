/**
 * Deploy Command
 *
 * Orchestrates a full deployment workflow without LLM involvement:
 *   1. Run `terraform plan` and show summary
 *   2. Ask user to confirm (or auto-approve with --auto-approve / -y)
 *   3. Run `terraform apply` with the plan
 *   4. Run `kubectl rollout status` to verify pods come up
 *   5. Print success/failure summary
 *
 * Usage:
 *   nimbus deploy [--auto-approve] [--workspace <ws>] [--namespace <ns>]
 *                 [--dry-run] [--no-apply]
 */

import { spawnSync } from 'node:child_process';
import * as readline from 'node:readline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeployOptions {
  autoApprove?: boolean;
  workspace?: string;
  namespace?: string;
  dryRun?: boolean;
  noApply?: boolean;
  cwd?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function banner(step: string, total: string, label: string): void {
  process.stdout.write(`\n[${step}/${total}] ${label}\n`);
}

function ok(msg: string): void {
  process.stdout.write(`[OK] ${msg}\n`);
}

function warn(msg: string): void {
  process.stdout.write(`[!!] ${msg}\n`);
}

function fail(msg: string): void {
  process.stdout.write(`[XX] ${msg}\n`);
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? process.cwd(),
    env: opts.env ?? process.env,
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  return {
    stdout: (result.stdout as string) ?? '',
    stderr: (result.stderr as string) ?? '',
    status: result.status ?? 1,
  };
}

async function askConfirm(question: string): Promise<boolean> {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });
    rl.question(`${question} [y/N] `, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------

export function parseDeployArgs(args: string[]): DeployOptions {
  const opts: DeployOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--auto-approve' || arg === '-y') {
      opts.autoApprove = true;
    } else if (arg === '--workspace' && args[i + 1]) {
      opts.workspace = args[++i];
    } else if ((arg === '--namespace' || arg === '-n') && args[i + 1]) {
      opts.namespace = args[++i];
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--no-apply') {
      opts.noApply = true;
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

export async function deployCommand(args: string[]): Promise<void> {
  const opts = parseDeployArgs(args);
  const cwd = opts.cwd ?? process.cwd();

  const totalSteps = opts.noApply ? '2' : '4';
  let step = 1;

  // ------------------------------------------------------------------
  // Step 1: Select Terraform workspace (if requested)
  // ------------------------------------------------------------------
  if (opts.workspace) {
    banner(String(step++), totalSteps, `Selecting Terraform workspace: ${opts.workspace}`);
    const wsResult = run('terraform', ['workspace', 'select', opts.workspace], { cwd });
    if (wsResult.status !== 0) {
      warn(`Workspace '${opts.workspace}' not found — attempting to create it.`);
      const newWsResult = run('terraform', ['workspace', 'new', opts.workspace], { cwd });
      if (newWsResult.status !== 0) {
        fail(`Failed to select or create workspace '${opts.workspace}':\n${newWsResult.stderr}`);
        process.exit(1);
      }
    }
    ok(`Workspace set to '${opts.workspace}'`);
  }

  // ------------------------------------------------------------------
  // Step 2/1: Terraform plan
  // ------------------------------------------------------------------
  banner(String(step++), totalSteps, 'Planning infrastructure changes...');

  if (opts.dryRun) {
    process.stdout.write('  [dry-run] Would run: terraform plan -out=nimbus-deploy.tfplan\n');
  } else {
    const planResult = run('terraform', ['plan', '-out=nimbus-deploy.tfplan', '-no-color'], { cwd });

    // Always print plan output so the user can review it
    if (planResult.stdout) process.stdout.write(planResult.stdout + '\n');
    if (planResult.stderr) process.stderr.write(planResult.stderr + '\n');

    if (planResult.status !== 0) {
      fail('terraform plan failed. Fix the errors above before deploying.');
      process.exit(1);
    }

    // Quick summary: count resource changes
    const creates = (planResult.stdout.match(/\+ resource/g) ?? []).length;
    const updates = (planResult.stdout.match(/~ resource/g) ?? []).length;
    const destroys = (planResult.stdout.match(/- resource/g) ?? []).length;
    process.stdout.write(
      `\n  Plan summary: ${creates} to add, ${updates} to change, ${destroys} to destroy.\n`
    );

    if (opts.noApply) {
      ok('--no-apply flag set. Stopping after plan.');
      return;
    }

    // ------------------------------------------------------------------
    // Step 3: Confirm before apply
    // ------------------------------------------------------------------
    if (!opts.autoApprove) {
      const confirmed = await askConfirm('\nProceed with terraform apply?');
      if (!confirmed) {
        warn('Deployment cancelled by user.');
        process.exit(0);
      }
    } else {
      process.stdout.write('  --auto-approve set — skipping confirmation.\n');
    }

    // ------------------------------------------------------------------
    // Step 4: Terraform apply
    // ------------------------------------------------------------------
    banner(String(step++), totalSteps, 'Applying infrastructure changes...');

    const applyResult = run('terraform', ['apply', '-auto-approve', '-no-color', 'nimbus-deploy.tfplan'], { cwd });

    if (applyResult.stdout) process.stdout.write(applyResult.stdout + '\n');
    if (applyResult.stderr) process.stderr.write(applyResult.stderr + '\n');

    // Clean up plan file regardless of success/failure
    try {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(`${cwd}/nimbus-deploy.tfplan`);
    } catch { /* non-critical */ }

    if (applyResult.status !== 0) {
      fail('terraform apply failed.');
      process.stdout.write('\n  Rollback hint: Run `nimbus tf rollback` to restore previous state.\n\n');
      process.exit(1);
    }

    ok('Terraform apply succeeded.');
  }

  // ------------------------------------------------------------------
  // Step 5: kubectl rollout status
  // ------------------------------------------------------------------
  banner(String(step++), totalSteps, 'Verifying Kubernetes rollout status...');

  const nsArgs = opts.namespace ? ['--namespace', opts.namespace] : [];

  // Collect deployments in the namespace (or all namespaces)
  const getResult = run('kubectl', ['get', 'deployments', '-o', 'name', ...nsArgs], { cwd });

  if (getResult.status !== 0) {
    // kubectl may not be available or no cluster is configured — warn but do not fail
    warn('Could not query kubectl deployments. Skipping rollout status check.');
    warn('Ensure kubectl is configured and pointing to the correct cluster.');
  } else {
    const deployments = getResult.stdout.trim().split('\n').filter(Boolean);

    if (deployments.length === 0) {
      warn('No deployments found to verify. Pods may still be starting up.');
    } else {
      let allHealthy = true;

      for (const deployment of deployments) {
        // deployment looks like "deployment.apps/my-app"
        const rolloutResult = run(
          'kubectl',
          ['rollout', 'status', deployment, '--timeout=120s', ...nsArgs],
          { cwd }
        );

        if (rolloutResult.stdout) process.stdout.write(rolloutResult.stdout + '\n');

        if (rolloutResult.status !== 0) {
          warn(`Rollout timeout or error for ${deployment}: ${rolloutResult.stderr.trim()}`);
          warn('Pods may still be coming up. Check with: kubectl get pods');
          allHealthy = false;
        }
      }

      if (allHealthy) {
        ok(`All ${deployments.length} deployment(s) are healthy.`);
      } else {
        // Non-fatal: pods may still be starting
        warn('Some deployments did not complete rollout within the timeout window.');
        warn('The deploy itself succeeded — pods may still be starting up.');
      }
    }
  }

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  process.stdout.write('\n');
  ok('Deployment workflow complete.');
  process.stdout.write('\n');
}
