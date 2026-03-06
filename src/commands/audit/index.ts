/**
 * Audit Commands
 * Audit log viewer and export CLI commands
 */

import { ui } from '../../wizard/ui';
import { auditClient } from '../../clients/enterprise-client';
import * as fs from 'node:fs';
import type { AuditListOptions, AuditExportCommandOptions } from '../../types';

/**
 * Get current team ID from config or environment
 */
function getCurrentTeamId(): string | null {
  return process.env.NIMBUS_TEAM_ID || null;
}

/**
 * Parse relative time string (e.g., "7d", "24h") to ISO date
 */
function parseRelativeTime(timeStr: string): string {
  const now = Date.now();
  const match = timeStr.match(/^(\d+)([dhwm])$/);

  if (!match) {
    return timeStr; // Assume it's already a valid date string
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  let ms: number;
  switch (unit) {
    case 'h':
      ms = value * 60 * 60 * 1000;
      break;
    case 'd':
      ms = value * 24 * 60 * 60 * 1000;
      break;
    case 'w':
      ms = value * 7 * 24 * 60 * 60 * 1000;
      break;
    case 'm':
      ms = value * 30 * 24 * 60 * 60 * 1000;
      break;
    default:
      return timeStr;
  }

  return new Date(now - ms).toISOString();
}

/**
 * Parse audit list options
 */
export function parseAuditListOptions(args: string[]): AuditListOptions {
  const options: AuditListOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--since' && args[i + 1]) {
      options.since = parseRelativeTime(args[++i]);
    } else if (arg === '--until' && args[i + 1]) {
      options.until = parseRelativeTime(args[++i]);
    } else if (arg === '--action' && args[i + 1]) {
      options.action = args[++i];
    } else if (arg === '--user' && args[i + 1]) {
      options.userId = args[++i];
    } else if ((arg === '--limit' || arg === '-n') && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    }
  }

  return options;
}

/**
 * Parse audit export options
 */
export function parseAuditExportOptions(args: string[]): AuditExportCommandOptions {
  const options: AuditExportCommandOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--format' && args[i + 1]) {
      options.format = args[++i] as 'csv' | 'json';
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      options.output = args[++i];
    } else if (arg === '--since' && args[i + 1]) {
      options.since = parseRelativeTime(args[++i]);
    } else if (arg === '--until' && args[i + 1]) {
      options.until = parseRelativeTime(args[++i]);
    } else if (arg === '--non-interactive') {
      options.nonInteractive = true;
    }
  }

  return options;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

/**
 * Audit list command
 */
export async function auditListCommand(options: AuditListOptions): Promise<void> {
  try {
    const teamId = getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      return;
    }

    ui.startSpinner({ message: 'Fetching audit logs...' });
    const result = await auditClient.queryLogs({
      teamId,
      userId: options.userId,
      action: options.action as any,
      since: options.since,
      until: options.until,
      limit: options.limit || 50,
    });
    ui.stopSpinnerSuccess(`Found ${result.total} logs (showing ${result.logs.length})`);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (result.logs.length === 0) {
      ui.info('No audit logs found');
      return;
    }

    ui.newLine();
    ui.table({
      columns: [
        { key: 'timestamp', header: 'Time', width: 20 },
        { key: 'action', header: 'Action', width: 20 },
        { key: 'user', header: 'User', width: 15 },
        { key: 'status', header: 'Status', width: 10 },
        { key: 'resource', header: 'Resource' },
      ],
      data: result.logs.map(log => ({
        timestamp: formatTimestamp(log.timestamp),
        action: log.action,
        user: log.userId || '-',
        status: log.status,
        resource: log.resourceType ? `${log.resourceType}/${log.resourceId || ''}` : '-',
      })),
    });

    if (result.total > result.logs.length) {
      ui.newLine();
      ui.dim(`Showing ${result.logs.length} of ${result.total} logs. Use --limit to show more.`);
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to fetch audit logs');
    ui.error(error.message);
  }
}

/**
 * Audit export command
 */
export async function auditExportCommand(options: AuditExportCommandOptions): Promise<void> {
  try {
    const teamId = getCurrentTeamId();
    if (!teamId) {
      ui.error('No team selected. Run `nimbus team switch <team-id>` first.');
      return;
    }

    const format = options.format || 'json';
    const output =
      options.output || `audit-logs-${new Date().toISOString().split('T')[0]}.${format}`;

    ui.startSpinner({ message: `Exporting audit logs to ${output}...` });
    const content = await auditClient.exportLogs(format, {
      teamId,
      since: options.since,
      until: options.until,
    });

    fs.writeFileSync(output, content);
    ui.stopSpinnerSuccess(`Exported to ${output}`);

    const stats = fs.statSync(output);
    ui.info(`File size: ${(stats.size / 1024).toFixed(1)} KB`);
  } catch (error: any) {
    ui.stopSpinnerFail('Failed to export audit logs');
    ui.error(error.message);
  }
}

/** Options for the audit scan subcommand */
export interface AuditScanOptions {
  /** Compliance framework filter */
  framework?: 'soc2' | 'hipaa' | 'pci' | 'iso27001';
  /** Write JSON report to this file */
  output?: string;
  /** Directory to scan (default: cwd) */
  dir?: string;
  /** Exit code 1 if findings exceed this count */
  threshold?: number;
}

/**
 * Parse audit scan options from CLI args
 */
export function parseAuditScanOptions(args: string[]): AuditScanOptions {
  const options: AuditScanOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--framework' && args[i + 1]) {
      options.framework = args[++i] as AuditScanOptions['framework'];
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      options.output = args[++i];
    } else if ((arg === '--dir' || arg === '-d') && args[i + 1]) {
      options.dir = args[++i];
    } else if (arg === '--threshold' && args[i + 1]) {
      options.threshold = parseInt(args[++i], 10);
    }
  }

  return options;
}

/**
 * Audit scan subcommand — runs the local security scanner
 */
export async function auditScanCommand(options: AuditScanOptions): Promise<void> {
  const { scanSecurity } = await import('../../audit/security-scanner');
  const dir = options.dir ?? process.cwd();

  ui.startSpinner({ message: `Scanning ${dir} for security issues...` });

  let result;
  try {
    result = await scanSecurity({ dir });
  } catch (e: any) {
    ui.stopSpinnerFail('Scan failed');
    ui.error(e.message);
    return;
  }

  ui.stopSpinnerSuccess(
    `Scan complete: ${result.findings.length} finding(s) in ${result.scannedFiles} file(s)`
  );

  // Filter by framework if provided (maps framework to relevant finding IDs)
  let findings = result.findings;
  if (options.framework) {
    // Each framework maps loosely to severity thresholds
    const frameworkSeverityMap: Record<string, string[]> = {
      soc2: ['CRITICAL', 'HIGH', 'MEDIUM'],
      hipaa: ['CRITICAL', 'HIGH', 'MEDIUM'],
      pci: ['CRITICAL', 'HIGH'],
      iso27001: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
    };
    const allowedSeverities = frameworkSeverityMap[options.framework] ?? [];
    findings = findings.filter((f: { severity: string }) => allowedSeverities.includes(f.severity));
    ui.dim(`Framework filter (${options.framework}): showing ${findings.length} relevant finding(s)`);
  }

  if (findings.length === 0) {
    ui.info('No findings. Scan clean.');
  } else {
    ui.newLine();
    for (const finding of findings) {
      const severityColor = finding.severity === 'CRITICAL' || finding.severity === 'HIGH'
        ? 'red'
        : finding.severity === 'MEDIUM'
        ? 'yellow'
        : 'white';
      ui.print(`[${ui.color(finding.severity, severityColor)}] ${finding.id}: ${finding.title}`);
      if (finding.file) ui.dim(`  File: ${finding.file}${finding.line ? `:${finding.line}` : ''}`);
      ui.dim(`  ${finding.recommendation}`);
      ui.newLine();
    }
  }

  // Write JSON report to file if requested
  if (options.output) {
    const report = {
      timestamp: result.timestamp.toISOString(),
      scannedFiles: result.scannedFiles,
      scanDuration: result.scanDuration,
      framework: options.framework ?? null,
      findingsCount: findings.length,
      findings,
    };
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2), 'utf-8');
    ui.print(`Report written to ${options.output}`);
  }

  // Threshold check — exit code 1 if too many findings
  if (options.threshold !== undefined && findings.length > options.threshold) {
    ui.error(`Findings (${findings.length}) exceeded threshold (${options.threshold}). Exiting with code 1.`);
    process.exit(1);
  }
}

/**
 * Main audit command dispatcher
 */
export async function auditCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list':
    case '':
      await auditListCommand(parseAuditListOptions(args));
      break;
    case 'export':
      await auditExportCommand(parseAuditExportOptions(args));
      break;
    case 'scan':
      await auditScanCommand(parseAuditScanOptions(args));
      break;
    default:
      ui.error(`Unknown audit command: ${subcommand}`);
      ui.newLine();
      ui.info('Available audit commands:');
      ui.print('  nimbus audit                      - List audit logs');
      ui.print('  nimbus audit list                 - List audit logs');
      ui.print('  nimbus audit export               - Export audit logs');
      ui.print('  nimbus audit scan                 - Scan directory for security issues');
      ui.newLine();
      ui.info('Options (list):');
      ui.print('  --since <time>   Filter logs since (e.g., 7d, 24h, 2024-01-01)');
      ui.print('  --until <time>   Filter logs until');
      ui.print('  --action <type>  Filter by action type');
      ui.print('  --user <id>      Filter by user');
      ui.print('  --limit <n>      Number of logs to show');
      ui.print('  --json           Output as JSON');
      ui.newLine();
      ui.info('Options (scan):');
      ui.print('  --framework <f>  Compliance framework: soc2|hipaa|pci|iso27001');
      ui.print('  --output <file>  Write JSON report to file');
      ui.print('  --dir <path>     Directory to scan (default: cwd)');
      ui.print('  --threshold <n>  Exit code 1 if findings exceed this count');
      ui.newLine();
      ui.info('Export options:');
      ui.print('  --format <type>  Export format (csv|json)');
      ui.print('  --output <file>  Output file path');
  }
}
