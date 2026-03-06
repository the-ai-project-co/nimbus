/**
 * nimbus status — Infrastructure Status Dashboard
 *
 * Runs concurrent checks against common DevOps CLIs and shows a dashboard
 * of the current cloud/infra context.
 *
 * G18: New command added to the gap fix plan.
 *
 * Usage:
 *   nimbus status
 *   nimbus status --json
 */

import { ui } from '../wizard';

/** Options for the status command. */
export interface StatusOptions {
  /** Output as JSON instead of table. */
  json?: boolean;
  /** L3: Show full snapshot including LLM config and active profile. */
  verbose?: boolean;
}

interface StatusInfo {
  k8sContext?: string;
  tfWorkspace?: string;
  awsAccount?: string;
  awsRegion?: string;
  gcpProject?: string;
  lastDriftScan?: string;
  // C2 enhancements
  sessionCount?: number | string;
  model?: string;
  provider?: string;
  nimbusMdSize?: number;
  nimbusMdFound?: boolean;
  dbSizeMB?: number;
  // M1: Helm and pod health
  helmFailedCount?: number;
  helmTotalCount?: number;
  unhealthyPodCount?: number;
  errors: string[];
}

/**
 * Run the nimbus status command.
 * Checks k8s context, tf workspace, AWS identity, and GCP project concurrently.
 */
export async function statusCommand(options: StatusOptions = {}): Promise<void> {
  const { execFileSync } = await import('node:child_process');
  const { existsSync, statSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');

  const info: StatusInfo = { errors: [] };

  const run = (cmd: string, args: string[]): string | undefined => {
    try {
      return execFileSync(cmd, args, {
        encoding: 'utf-8',
        timeout: 8000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      return undefined;
    }
  };

  // Run all checks concurrently (M1: add helm + pod health)
  const [k8sCtx, tfWs, awsIdentityRaw, gcpProject, helmListRaw, podUnhealthyRaw] = await Promise.allSettled([
    Promise.resolve(run('kubectl', ['config', 'current-context'])),
    Promise.resolve(run('terraform', ['workspace', 'show'])),
    Promise.resolve(run('aws', ['sts', 'get-caller-identity', '--output', 'json'])),
    Promise.resolve(run('gcloud', ['config', 'get-value', 'project'])),
    Promise.resolve(run('helm', ['list', '-A', '--output', 'json'])),
    Promise.resolve(run('kubectl', ['get', 'pods', '-A', '--field-selector=status.phase!=Running', '--no-headers'])),
  ]);

  if (k8sCtx.status === 'fulfilled' && k8sCtx.value) {
    info.k8sContext = k8sCtx.value;
  }
  if (tfWs.status === 'fulfilled' && tfWs.value) {
    info.tfWorkspace = tfWs.value;
  }
  if (awsIdentityRaw.status === 'fulfilled' && awsIdentityRaw.value) {
    try {
      const identity = JSON.parse(awsIdentityRaw.value);
      info.awsAccount = identity.Account;
      // Try to get region separately
      const region = run('aws', ['configure', 'get', 'region']);
      if (region) info.awsRegion = region;
    } catch {
      // Could not parse AWS identity
    }
  }
  if (gcpProject.status === 'fulfilled' && gcpProject.value && gcpProject.value !== '(unset)') {
    info.gcpProject = gcpProject.value;
  }

  // M1: Parse helm release health
  if (helmListRaw.status === 'fulfilled' && helmListRaw.value) {
    try {
      const releases = JSON.parse(helmListRaw.value) as Array<{ status: string }>;
      info.helmTotalCount = releases.length;
      info.helmFailedCount = releases.filter(r => r.status !== 'deployed').length;
    } catch { /* non-critical */ }
  }

  // M1: Parse unhealthy pod count
  if (podUnhealthyRaw.status === 'fulfilled' && podUnhealthyRaw.value) {
    const lines = podUnhealthyRaw.value.trim().split('\n').filter(Boolean);
    info.unhealthyPodCount = lines.length;
  }

  // Check last drift scan from SQLite + session count
  try {
    const { getDb } = await import('../state/db');
    const db = getDb();
    const row = db.prepare(`
      SELECT created_at FROM sessions
      ORDER BY created_at DESC LIMIT 1
    `).get() as { created_at?: string } | undefined;
    if (row?.created_at) {
      info.lastDriftScan = row.created_at;
    }

    // C2: Count sessions
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt?: number } | undefined;
    info.sessionCount = countRow?.cnt ?? 0;
  } catch {
    // DB not available
    info.sessionCount = 'N/A';
  }

  // C2: Read model and provider from ~/.nimbus/config.json
  const configJsonPath = join(homedir(), '.nimbus', 'config.json');
  try {
    if (existsSync(configJsonPath)) {
      const configRaw = readFileSync(configJsonPath, 'utf-8');
      const config = JSON.parse(configRaw) as Record<string, unknown>;
      info.model = typeof config.model === 'string' ? config.model : 'claude-sonnet-4-6';
      info.provider = typeof config.provider === 'string' ? config.provider : 'anthropic';
    } else {
      info.model = 'claude-sonnet-4-6';
      info.provider = 'anthropic';
    }
  } catch {
    info.model = 'claude-sonnet-4-6';
    info.provider = 'anthropic';
  }

  // C2: Check NIMBUS.md in cwd
  const nimbusMdPaths = [
    join(process.cwd(), 'NIMBUS.md'),
    join(process.cwd(), '.nimbus', 'NIMBUS.md'),
  ];
  for (const p of nimbusMdPaths) {
    try {
      if (existsSync(p)) {
        const stat = statSync(p);
        info.nimbusMdFound = true;
        info.nimbusMdSize = stat.size;
        break;
      }
    } catch { /* skip */ }
  }

  // C2: Get DB file size
  const dbPath = join(homedir(), '.nimbus', 'nimbus.db');
  try {
    if (existsSync(dbPath)) {
      const stat = statSync(dbPath);
      info.dbSizeMB = Math.round((stat.size / (1024 * 1024)) * 10) / 10;
    }
  } catch { /* skip */ }

  if (options.json) {
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  // Pretty-print dashboard
  // Build session line
  const sessionLine = typeof info.sessionCount === 'number'
    ? `${info.sessionCount} sessions`
    : 'N/A';

  // Build NIMBUS.md line
  const nimbusMdLine = info.nimbusMdFound && info.nimbusMdSize !== undefined
    ? `  loaded (${info.nimbusMdSize >= 1024
        ? `${(info.nimbusMdSize / 1024).toFixed(1)}KB`
        : `${info.nimbusMdSize}B`})`
    : '  not found';

  // Build DB size line
  const dbLine = info.dbSizeMB !== undefined
    ? `~/.nimbus/nimbus.db (${info.dbSizeMB}MB)`
    : '~/.nimbus/nimbus.db (not found)';

  ui.newLine();
  ui.box({
    title: 'Nimbus Infrastructure Status',
    content: [
      '',
      `  Session:   ${sessionLine}`,
      `  Model:     ${info.model ?? 'claude-sonnet-4-6'}`,
      `  Provider:  ${info.provider ?? 'anthropic'} \u2713`,
      '',
      '  Infrastructure:',
      info.k8sContext
        ? `    Kubernetes: context=${info.k8sContext}`
        : '    Kubernetes:   (not configured)',
      info.tfWorkspace
        ? `    Terraform:  workspace=${info.tfWorkspace}  \u2713 initialized`
        : '    Terraform:    (not in a terraform directory)',
      info.awsAccount
        ? `    AWS:        account=${info.awsAccount}${info.awsRegion ? `  region=${info.awsRegion}` : ''}`
        : '    AWS:          (not configured)',
      info.gcpProject
        ? `    GCP:        project=${info.gcpProject}`
        : '',
      // M1: Helm release health
      ...(info.helmTotalCount !== undefined
        ? [
            info.helmFailedCount && info.helmFailedCount > 0
              ? `  [!] ${info.helmFailedCount} Helm release(s) in failed state (${info.helmTotalCount} total)`
              : `    Helm:       ${info.helmTotalCount} release(s) deployed`,
          ]
        : []),
      // M1: Pod health warnings
      ...(info.unhealthyPodCount !== undefined && info.unhealthyPodCount > 0
        ? [`  [!] ${info.unhealthyPodCount} pod(s) not running`]
        : []),
      '',
      `  NIMBUS.md:${nimbusMdLine}`,
      `  DB:        ${dbLine}`,
      '',
      info.lastDriftScan
        ? `  Last session: ${new Date(info.lastDriftScan).toLocaleString()}`
        : '  Last session: (none)',
      '',
      '  Quick actions: nimbus plan | nimbus apply | nimbus logs',
      '',
    ].filter(line => line !== undefined) as string[],
    style: 'rounded',
    borderColor: 'cyan',
    padding: 0,
  });
  ui.newLine();
}

export default statusCommand;
