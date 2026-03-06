/**
 * Pipeline Command — H2
 *
 * View CI/CD pipeline status from GitHub Actions, GitLab CI, or CircleCI.
 *
 * Usage:
 *   nimbus pipeline status [run-id]
 *   nimbus pipeline status --provider github --limit 10
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ui } from '../wizard/ui';

export interface PipelineOptions {
  provider?: 'github' | 'gitlab' | 'circleci' | 'auto';
  format?: 'table' | 'json';
  limit?: number;
}

/**
 * Auto-detect the CI/CD provider by scanning the cwd for config files.
 */
export function detectProvider(cwd: string = process.cwd()): 'github' | 'gitlab' | 'circleci' | null {
  if (fs.existsSync(path.join(cwd, '.github', 'workflows'))) return 'github';
  if (fs.existsSync(path.join(cwd, '.gitlab-ci.yml'))) return 'gitlab';
  if (fs.existsSync(path.join(cwd, '.circleci', 'config.yml'))) return 'circleci';
  return null;
}

interface PipelineRun {
  id: string;
  workflow: string;
  status: string;
  result: string;
  started: string;
  url?: string;
}

function fetchGitHubRuns(limit: number, runId?: string): PipelineRun[] {
  if (runId) {
    const raw = execFileSync(
      'gh',
      ['run', 'view', runId, '--json', 'status,conclusion,name,createdAt,url,databaseId'],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const r = JSON.parse(raw);
    return [{
      id: String(r.databaseId ?? runId),
      workflow: r.name ?? '',
      status: r.status ?? '',
      result: r.conclusion ?? '-',
      started: r.createdAt ?? '',
      url: r.url,
    }];
  }
  const raw = execFileSync(
    'gh',
    ['run', 'list', '--limit', String(limit), '--json', 'status,conclusion,name,createdAt,databaseId'],
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const runs = JSON.parse(raw) as Array<Record<string, unknown>>;
  return runs.map(r => ({
    id: String(r['databaseId'] ?? ''),
    workflow: String(r['name'] ?? ''),
    status: String(r['status'] ?? ''),
    result: String(r['conclusion'] ?? '-'),
    started: String(r['createdAt'] ?? ''),
  }));
}

function fetchGitLabRuns(limit: number): PipelineRun[] {
  const raw = execFileSync(
    'glab',
    ['ci', 'list', '--format', 'json'],
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  const pipelines = JSON.parse(raw) as Array<Record<string, unknown>>;
  return pipelines.slice(0, limit).map(p => ({
    id: String(p['id'] ?? ''),
    workflow: String(p['ref'] ?? ''),
    status: String(p['status'] ?? ''),
    result: String(p['status'] ?? '-'),
    started: String(p['created_at'] ?? ''),
    url: String(p['web_url'] ?? ''),
  }));
}

function fetchCircleCIRuns(): PipelineRun[] {
  const raw = execFileSync(
    'circleci',
    ['pipeline', 'list'],
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  // CircleCI CLI output is not always JSON; do best-effort parse
  try {
    const pipelines = JSON.parse(raw) as Array<Record<string, unknown>>;
    return pipelines.map(p => ({
      id: String(p['id'] ?? ''),
      workflow: String(p['vcs'] ?? ''),
      status: String(p['state'] ?? ''),
      result: String(p['state'] ?? '-'),
      started: String(p['created_at'] ?? ''),
    }));
  } catch {
    return [{ id: '-', workflow: '-', status: raw.trim().slice(0, 40), result: '-', started: '-' }];
  }
}

function printTable(runs: PipelineRun[]): void {
  const COL = { id: 12, workflow: 30, status: 12, result: 12, started: 22 };
  const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
  const divider = `${'-'.repeat(COL.id + 2)}+${'-'.repeat(COL.workflow + 2)}+${'-'.repeat(COL.status + 2)}+${'-'.repeat(COL.result + 2)}+${'-'.repeat(COL.started + 2)}`;
  console.log(divider);
  console.log(`| ${pad('ID', COL.id)} | ${pad('Workflow', COL.workflow)} | ${pad('Status', COL.status)} | ${pad('Result', COL.result)} | ${pad('Started', COL.started)} |`);
  console.log(divider);
  for (const r of runs) {
    console.log(`| ${pad(r.id, COL.id)} | ${pad(r.workflow, COL.workflow)} | ${pad(r.status, COL.status)} | ${pad(r.result, COL.result)} | ${pad(r.started, COL.started)} |`);
  }
  console.log(divider);
}

/**
 * Main pipeline command dispatcher.
 */
export async function pipelineCommand(subcommand: string, args: string[]): Promise<void> {
  const options: PipelineOptions = { format: 'table', limit: 10 };
  let runId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--provider' && args[i + 1]) {
      options.provider = args[++i] as PipelineOptions['provider'];
    } else if (arg === '--format' && args[i + 1]) {
      options.format = args[++i] as 'table' | 'json';
    } else if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--json') {
      options.format = 'json';
    } else if (!arg.startsWith('-') && !runId && subcommand === 'status') {
      runId = arg;
    }
  }

  const provider =
    options.provider === 'auto' || !options.provider
      ? detectProvider()
      : options.provider;

  if (!provider) {
    ui.error('Could not detect CI/CD provider. Use --provider github|gitlab|circleci or run in a repo with CI config.');
    process.exit(1);
  }

  let runs: PipelineRun[];
  try {
    if (provider === 'github') {
      runs = fetchGitHubRuns(options.limit ?? 10, runId);
    } else if (provider === 'gitlab') {
      runs = fetchGitLabRuns(options.limit ?? 10);
    } else {
      runs = fetchCircleCIRuns();
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      const installHints: Record<string, string> = {
        github: 'Install GitHub CLI: https://cli.github.com',
        gitlab: 'Install GitLab CLI: https://gitlab.com/gitlab-org/cli',
        circleci: 'Install CircleCI CLI: https://circleci.com/docs/local-cli/',
      };
      ui.error(`CLI not found for provider "${provider}". ${installHints[provider] ?? ''}`);
    } else {
      ui.error(`Failed to fetch pipeline status: ${error.message}`);
    }
    process.exit(1);
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(runs, null, 2));
    return;
  }

  ui.header(`Pipeline Status (${provider})`);
  printTable(runs);
}
