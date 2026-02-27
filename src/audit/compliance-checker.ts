/**
 * Compliance Checker - Check infrastructure compliance against standard frameworks.
 *
 * Scans Terraform files (and other configuration) for compliance with SOC2,
 * HIPAA, PCI-DSS, GDPR, and CIS benchmark controls. Each control is evaluated
 * as pass, fail, warn, or skip based on the presence or absence of required
 * Terraform configurations.
 *
 * Reports include per-framework pass/fail counts and an overall compliance
 * score expressed as a percentage.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported compliance frameworks */
export type Framework = 'SOC2' | 'HIPAA' | 'PCI' | 'GDPR' | 'CIS';

/** A single compliance control evaluation */
export interface ComplianceControl {
  /** Unique control identifier (e.g. SOC2-001) */
  id: string;
  /** Framework this control belongs to */
  framework: Framework;
  /** Human-readable control name */
  name: string;
  /** Detailed description of what is being checked */
  description: string;
  /** Evaluation result */
  status: 'pass' | 'fail' | 'warn' | 'skip';
  /** Evidence or explanation supporting the status */
  evidence?: string;
}

/** Aggregate compliance report for a single framework */
export interface ComplianceReport {
  /** Framework that was evaluated */
  framework: Framework;
  /** All controls evaluated */
  controls: ComplianceControl[];
  /** Number of controls that passed */
  passCount: number;
  /** Number of controls that failed */
  failCount: number;
  /** Number of controls with warnings */
  warnCount: number;
  /** Number of controls that were skipped */
  skipCount: number;
  /** Compliance score as a percentage (0-100) */
  score: number;
  /** Timestamp when the check completed */
  timestamp: Date;
}

/** Options controlling the compliance check */
export interface ComplianceOptions {
  /** Root directory to scan */
  dir: string;
  /** Frameworks to evaluate (defaults to all) */
  frameworks?: Framework[];
}

// ---------------------------------------------------------------------------
// Control definitions
// ---------------------------------------------------------------------------

interface ControlDefinition {
  id: string;
  framework: Framework;
  name: string;
  description: string;
  /** Pattern to search for in combined Terraform content -- presence means pass */
  passPattern?: RegExp;
  /** Pattern that indicates a failure if present */
  failPattern?: RegExp;
  /** If true, the control passes when the failPattern is NOT found */
  invertFail?: boolean;
}

const CONTROL_DEFINITIONS: ControlDefinition[] = [
  // -------------------------------------------------------------------------
  // SOC2 Controls
  // -------------------------------------------------------------------------
  {
    id: 'SOC2-001',
    framework: 'SOC2',
    name: 'Logging enabled',
    description: 'CloudTrail, CloudWatch, or equivalent logging must be configured.',
    passPattern:
      /(?:aws_cloudtrail|aws_cloudwatch_log_group|google_logging_project_sink|azurerm_monitor_diagnostic_setting)/,
  },
  {
    id: 'SOC2-002',
    framework: 'SOC2',
    name: 'Access controls defined',
    description: 'IAM policies, roles, or access control resources must be present.',
    passPattern: /(?:aws_iam_policy|aws_iam_role|google_project_iam|azurerm_role_assignment)/,
  },
  {
    id: 'SOC2-003',
    framework: 'SOC2',
    name: 'Encryption at rest',
    description: 'Storage resources must have encryption at rest enabled.',
    passPattern:
      /(?:server_side_encryption_configuration|storage_encrypted\s*=\s*true|encryption_configuration|kms_key_id|customer_managed_key)/,
  },
  {
    id: 'SOC2-004',
    framework: 'SOC2',
    name: 'Backup configuration',
    description: 'Automated backup or snapshot policies must be configured.',
    passPattern:
      /(?:backup_retention_period|aws_backup_plan|google_sql_database_instance.*backup_configuration|azurerm_backup_policy)/s,
  },
  {
    id: 'SOC2-005',
    framework: 'SOC2',
    name: 'Network security groups',
    description:
      'Network-level access controls (security groups, NACLs, firewall rules) must be present.',
    passPattern: /(?:aws_security_group|google_compute_firewall|azurerm_network_security_group)/,
  },

  // -------------------------------------------------------------------------
  // HIPAA Controls
  // -------------------------------------------------------------------------
  {
    id: 'HIPAA-001',
    framework: 'HIPAA',
    name: 'Encryption required',
    description: 'All data stores must use encryption at rest and in transit.',
    passPattern:
      /(?:server_side_encryption_configuration|storage_encrypted\s*=\s*true|ssl_enforcement_enabled|require_ssl)/,
  },
  {
    id: 'HIPAA-002',
    framework: 'HIPAA',
    name: 'Audit logging',
    description: 'Comprehensive audit logging must be enabled for all access to PHI.',
    passPattern:
      /(?:aws_cloudtrail|aws_cloudwatch_log_group|google_logging|azurerm_monitor_diagnostic_setting)/,
  },
  {
    id: 'HIPAA-003',
    framework: 'HIPAA',
    name: 'Access controls',
    description: 'Role-based access controls must restrict access to PHI.',
    passPattern: /(?:aws_iam_policy|aws_iam_role|google_project_iam|azurerm_role_assignment)/,
  },
  {
    id: 'HIPAA-004',
    framework: 'HIPAA',
    name: 'PHI data handling',
    description: 'Data classification tags or labels must identify PHI resources.',
    passPattern:
      /(?:tags\s*=\s*\{[^}]*(?:phi|hipaa|sensitive|classification)[^}]*\}|labels\s*=\s*\{[^}]*(?:phi|hipaa|sensitive)[^}]*\})/is,
  },
  {
    id: 'HIPAA-005',
    framework: 'HIPAA',
    name: 'Data backup and recovery',
    description: 'PHI data must have backup and disaster recovery plans.',
    passPattern: /(?:backup_retention_period|aws_backup_plan|point_in_time_recovery)/,
  },

  // -------------------------------------------------------------------------
  // PCI-DSS Controls
  // -------------------------------------------------------------------------
  {
    id: 'PCI-001',
    framework: 'PCI',
    name: 'Network segmentation',
    description: 'Cardholder data environments must be segmented from other networks.',
    passPattern:
      /(?:aws_vpc|aws_subnet|google_compute_network|google_compute_subnetwork|azurerm_virtual_network|azurerm_subnet)/,
  },
  {
    id: 'PCI-002',
    framework: 'PCI',
    name: 'Encryption in transit',
    description: 'All cardholder data must be encrypted during transmission.',
    passPattern:
      /(?:ssl_policy|ssl_certificate|tls_policy|https_only|redirect_all_requests_to.*https|listener.*protocol\s*=\s*["']HTTPS)/s,
  },
  {
    id: 'PCI-003',
    framework: 'PCI',
    name: 'Access logging',
    description: 'All access to cardholder data must be logged.',
    passPattern: /(?:access_log|logging\s*\{|enable_logging\s*=\s*true|log_analytics)/,
  },
  {
    id: 'PCI-004',
    framework: 'PCI',
    name: 'No wildcard IAM permissions',
    description: 'IAM policies must not use wildcard actions on cardholder data resources.',
    failPattern: /["']Action["']\s*:\s*["']\*["']/,
    invertFail: true,
  },
  {
    id: 'PCI-005',
    framework: 'PCI',
    name: 'WAF or firewall configured',
    description: 'Web application firewall or equivalent must protect public-facing applications.',
    passPattern:
      /(?:aws_wafv2|aws_waf|google_compute_security_policy|azurerm_web_application_firewall_policy)/,
  },

  // -------------------------------------------------------------------------
  // GDPR Controls
  // -------------------------------------------------------------------------
  {
    id: 'GDPR-001',
    framework: 'GDPR',
    name: 'Data retention policies',
    description: 'Resources must define data retention or lifecycle policies.',
    passPattern:
      /(?:lifecycle_rule|retention_in_days|expiration|ttl|data_retention|lifecycle_policy)/,
  },
  {
    id: 'GDPR-002',
    framework: 'GDPR',
    name: 'Consent mechanisms',
    description: 'Infrastructure must support consent management workflows.',
    passPattern: /(?:consent|gdpr|privacy|data_subject|right_to_erasure)/i,
  },
  {
    id: 'GDPR-003',
    framework: 'GDPR',
    name: 'Data deletion capability',
    description: 'Resources must support deletion of personal data (right to be forgotten).',
    passPattern: /(?:lifecycle_rule|versioning|object_lock|deletion_protection|prevent_destroy)/,
  },
  {
    id: 'GDPR-004',
    framework: 'GDPR',
    name: 'Data processing location',
    description: 'Resources must specify their deployment region to ensure data residency.',
    passPattern: /(?:region\s*=|location\s*=|availability_zone)/,
  },
  {
    id: 'GDPR-005',
    framework: 'GDPR',
    name: 'Encryption of personal data',
    description: 'Personal data must be encrypted at rest and in transit.',
    passPattern: /(?:server_side_encryption|storage_encrypted|kms_key|encryption_configuration)/,
  },

  // -------------------------------------------------------------------------
  // CIS Benchmark Controls
  // -------------------------------------------------------------------------
  {
    id: 'CIS-001',
    framework: 'CIS',
    name: 'No public access',
    description: 'Storage and database resources must not be publicly accessible.',
    failPattern: /(?:publicly_accessible\s*=\s*true|acl\s*=\s*["']public-read)/,
    invertFail: true,
  },
  {
    id: 'CIS-002',
    framework: 'CIS',
    name: 'Minimal IAM permissions',
    description: 'IAM policies should follow least privilege; no wildcard actions.',
    failPattern: /["']Action["']\s*:\s*["']\*["']/,
    invertFail: true,
  },
  {
    id: 'CIS-003',
    framework: 'CIS',
    name: 'Encryption enabled',
    description: 'All storage and database services must use encryption.',
    passPattern:
      /(?:server_side_encryption_configuration|storage_encrypted\s*=\s*true|encryption_configuration|kms_key_id)/,
  },
  {
    id: 'CIS-004',
    framework: 'CIS',
    name: 'VPC flow logs enabled',
    description: 'VPC flow logs must be enabled for network traffic monitoring.',
    passPattern:
      /(?:aws_flow_log|google_compute_subnetwork.*log_config|azurerm_network_watcher_flow_log)/s,
  },
  {
    id: 'CIS-005',
    framework: 'CIS',
    name: 'Multi-factor authentication',
    description: 'MFA should be required for IAM users with console access.',
    passPattern: /(?:mfa_delete|mfa_device|condition.*mfa|multi_factor)/i,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_EXCLUDES = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', 'build']);

/**
 * Recursively collect Terraform file contents from a directory.
 *
 * @returns Concatenated content of all .tf and .tf.json files, plus a count
 */
function collectTerraformContent(dir: string): { content: string; fileCount: number } {
  const chunks: string[] = [];
  let fileCount = 0;

  function walk(currentDir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDES.has(entry.name)) {
          continue;
        }
        walk(path.join(currentDir, entry.name));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.tf' || entry.name.endsWith('.tf.json') || ext === '.tfvars') {
          try {
            const content = fs.readFileSync(path.join(currentDir, entry.name), 'utf-8');
            chunks.push(content);
            fileCount++;
          } catch {
            // skip unreadable files
          }
        }
      }
    }
  }

  walk(dir);
  return { content: chunks.join('\n'), fileCount };
}

/**
 * Evaluate a single control definition against the combined Terraform content.
 */
function evaluateControl(
  def: ControlDefinition,
  terraformContent: string,
  hasTerraformFiles: boolean
): ComplianceControl {
  // If no Terraform files exist, skip the control
  if (!hasTerraformFiles) {
    return {
      id: def.id,
      framework: def.framework,
      name: def.name,
      description: def.description,
      status: 'skip',
      evidence: 'No Terraform files found in the scanned directory.',
    };
  }

  // Controls that use invertFail: pass when failPattern is NOT found
  if (def.invertFail && def.failPattern) {
    const match = def.failPattern.exec(terraformContent);
    if (match) {
      return {
        id: def.id,
        framework: def.framework,
        name: def.name,
        description: def.description,
        status: 'fail',
        evidence: `Found violation: "${match[0].slice(0, 80)}"`,
      };
    }
    return {
      id: def.id,
      framework: def.framework,
      name: def.name,
      description: def.description,
      status: 'pass',
      evidence: 'No violations detected.',
    };
  }

  // Standard passPattern check
  if (def.passPattern) {
    const match = def.passPattern.exec(terraformContent);
    if (match) {
      return {
        id: def.id,
        framework: def.framework,
        name: def.name,
        description: def.description,
        status: 'pass',
        evidence: `Found matching configuration: "${match[0].slice(0, 80)}"`,
      };
    }
    return {
      id: def.id,
      framework: def.framework,
      name: def.name,
      description: def.description,
      status: 'fail',
      evidence: 'Required configuration not found in Terraform files.',
    };
  }

  // No pattern defined -- warn
  return {
    id: def.id,
    framework: def.framework,
    name: def.name,
    description: def.description,
    status: 'warn',
    evidence: 'Manual verification required -- no automated check available.',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check compliance of infrastructure configurations against one or more frameworks.
 *
 * Scans Terraform files in the specified directory and evaluates each control
 * from the selected frameworks. Returns a compliance report per framework.
 *
 * @param options - Directory and framework selection
 * @returns Array of compliance reports, one per framework
 */
export async function checkCompliance(options: ComplianceOptions): Promise<ComplianceReport[]> {
  const frameworks = options.frameworks ?? (['SOC2', 'HIPAA', 'PCI', 'GDPR', 'CIS'] as Framework[]);
  const { content: terraformContent, fileCount } = collectTerraformContent(options.dir);
  const hasTerraformFiles = fileCount > 0;

  const reports: ComplianceReport[] = [];

  for (const framework of frameworks) {
    const definitions = CONTROL_DEFINITIONS.filter(d => d.framework === framework);
    const controls = definitions.map(def =>
      evaluateControl(def, terraformContent, hasTerraformFiles)
    );

    const passCount = controls.filter(c => c.status === 'pass').length;
    const failCount = controls.filter(c => c.status === 'fail').length;
    const warnCount = controls.filter(c => c.status === 'warn').length;
    const skipCount = controls.filter(c => c.status === 'skip').length;

    // Score = pass / (pass + fail + warn) * 100, skipped controls excluded
    const evaluatedCount = passCount + failCount + warnCount;
    const score = evaluatedCount > 0 ? Math.round((passCount / evaluatedCount) * 100) : 0;

    reports.push({
      framework,
      controls,
      passCount,
      failCount,
      warnCount,
      skipCount,
      score,
      timestamp: new Date(),
    });
  }

  return reports;
}

/**
 * Generate a visual scorecard from one or more compliance reports.
 *
 * Produces a formatted text table showing framework scores, pass/fail counts,
 * and individual control statuses.
 *
 * @param reports - Compliance reports to include in the scorecard
 * @returns Multi-line formatted scorecard string
 */
export function generateScorecard(reports: ComplianceReport[]): string {
  if (reports.length === 0) {
    return 'No compliance reports to display.';
  }

  const statusIcon: Record<string, string> = {
    pass: '[PASS]',
    fail: '[FAIL]',
    warn: '[WARN]',
    skip: '[SKIP]',
  };

  const lines: string[] = ['Compliance Scorecard', '='.repeat(60), ''];

  // Overview table
  lines.push('  Framework   Score   Pass  Fail  Warn  Skip');
  lines.push(`  ${'-'.repeat(50)}`);

  for (const report of reports) {
    const fw = report.framework.padEnd(10);
    const score = `${report.score}%`.padStart(5);
    const pass = String(report.passCount).padStart(4);
    const fail = String(report.failCount).padStart(4);
    const warn = String(report.warnCount).padStart(4);
    const skip = String(report.skipCount).padStart(4);
    lines.push(`  ${fw} ${score}   ${pass}  ${fail}  ${warn}  ${skip}`);
  }

  lines.push('');

  // Detailed control results
  for (const report of reports) {
    lines.push(`--- ${report.framework} (${report.score}%) ---`);
    lines.push('');

    for (const control of report.controls) {
      lines.push(`  ${statusIcon[control.status]} ${control.id}: ${control.name}`);
      lines.push(`         ${control.description}`);
      if (control.evidence) {
        lines.push(`         Evidence: ${control.evidence}`);
      }
      lines.push('');
    }
  }

  // Overall summary
  const totalPass = reports.reduce((s, r) => s + r.passCount, 0);
  const totalFail = reports.reduce((s, r) => s + r.failCount, 0);
  const totalWarn = reports.reduce((s, r) => s + r.warnCount, 0);
  const totalSkip = reports.reduce((s, r) => s + r.skipCount, 0);
  const totalEval = totalPass + totalFail + totalWarn;
  const overallScore = totalEval > 0 ? Math.round((totalPass / totalEval) * 100) : 0;

  lines.push('='.repeat(60));
  lines.push(
    `Overall: ${overallScore}% compliant (${totalPass} pass, ${totalFail} fail, ${totalWarn} warn, ${totalSkip} skip)`
  );

  return lines.join('\n');
}
