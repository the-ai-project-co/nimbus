/**
 * Security Scanner - Scan codebase for common security issues.
 *
 * Walks a directory tree, applies regex-based patterns to detect hardcoded
 * secrets, open security groups, public S3 buckets, missing encryption,
 * exposed ports, SQL injection risks, and insecure HTTP URLs.
 *
 * Binary files and configurable exclusion directories are skipped.
 * Results are returned sorted by severity (CRITICAL first).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Severity level for a security finding */
export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** A single security finding produced by the scanner */
export interface SecurityFinding {
  /** Unique identifier for this finding */
  id: string;
  /** Severity level */
  severity: Severity;
  /** Short title describing the issue */
  title: string;
  /** Detailed description of the issue */
  description: string;
  /** File where the issue was found */
  file?: string;
  /** Line number within the file */
  line?: number;
  /** Actionable recommendation to fix the issue */
  recommendation: string;
}

/** Aggregate result of a security scan */
export interface ScanResult {
  /** All findings discovered during the scan */
  findings: SecurityFinding[];
  /** Total number of files inspected */
  scannedFiles: number;
  /** Wall-clock duration of the scan in milliseconds */
  scanDuration: number;
  /** Timestamp when the scan completed */
  timestamp: Date;
}

/** Options controlling which files and directories are scanned */
export interface ScanOptions {
  /** Root directory to scan */
  dir: string;
  /** File glob patterns to include (e.g. ['*.ts', '*.tf']). If omitted, all text files are scanned. */
  patterns?: string[];
  /** Directory names to skip (defaults to node_modules, .git, dist) */
  exclude?: string[];
  /** Maximum number of files to scan (defaults to 1000) */
  maxFiles?: number;
}

// ---------------------------------------------------------------------------
// Severity ordering (for sort)
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

// ---------------------------------------------------------------------------
// Detection rules
// ---------------------------------------------------------------------------

interface DetectionRule {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  pattern: RegExp;
  /** Optional: only apply to files matching these extensions */
  fileExtensions?: string[];
}

const DETECTION_RULES: DetectionRule[] = [
  // -- Hardcoded secrets --
  {
    id: 'SEC-001',
    severity: 'CRITICAL',
    title: 'Hardcoded API key or secret',
    description:
      'A potential API key, secret, password, or token is hardcoded in the source code. ' +
      'Hardcoded credentials can be extracted from version control history.',
    recommendation:
      'Move the secret to an environment variable or a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault).',
    pattern:
      /(?:api[_-]?key|api[_-]?secret|secret[_-]?key|access[_-]?key|auth[_-]?token|private[_-]?key)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    id: 'SEC-002',
    severity: 'CRITICAL',
    title: 'Hardcoded password',
    description:
      'A password value appears to be hardcoded in the source. This is a critical risk ' +
      'if the file is committed to version control.',
    recommendation:
      'Use environment variables or a secrets manager instead of embedding passwords in code.',
    pattern:
      /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/i,
  },
  {
    id: 'SEC-003',
    severity: 'CRITICAL',
    title: 'Hardcoded bearer or authorization token',
    description:
      'An authorization header or bearer token is hardcoded, allowing credential theft from source.',
    recommendation:
      'Inject tokens at runtime via environment variables or a credential helper.',
    pattern:
      /(?:bearer\s+[A-Za-z0-9\-._~+/]+=*|authorization['"]\s*:\s*['"][^'"]{10,}['"])/i,
  },
  {
    id: 'SEC-004',
    severity: 'HIGH',
    title: 'AWS access key ID detected',
    description:
      'A string matching the AWS access key ID format (AKIA...) was found. If valid, ' +
      'it grants access to AWS resources.',
    recommendation:
      'Rotate the key immediately and store credentials via AWS IAM roles or environment variables.',
    pattern: /AKIA[0-9A-Z]{16}/,
  },
  {
    id: 'SEC-005',
    severity: 'HIGH',
    title: 'Private key material detected',
    description: 'A PEM-encoded private key header was found in source code.',
    recommendation: 'Store private keys outside the repository in a secure secrets store.',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
  },

  // -- Terraform-specific --
  {
    id: 'TF-001',
    severity: 'HIGH',
    title: 'Open security group (0.0.0.0/0)',
    description:
      'A Terraform security group rule allows traffic from any IP address (0.0.0.0/0). ' +
      'This exposes services to the entire internet.',
    recommendation: 'Restrict CIDR blocks to known IP ranges required for your use case.',
    pattern: /cidr_blocks\s*=\s*\[?\s*["']0\.0\.0\.0\/0["']/,
    fileExtensions: ['.tf', '.tf.json'],
  },
  {
    id: 'TF-002',
    severity: 'HIGH',
    title: 'Public S3 bucket ACL',
    description:
      'An S3 bucket is configured with a public ACL (public-read or public-read-write). ' +
      'This makes the bucket contents accessible to anyone on the internet.',
    recommendation:
      'Set acl to "private" and use bucket policies for fine-grained access control.',
    pattern: /acl\s*=\s*["']public-read(?:-write)?["']/,
    fileExtensions: ['.tf', '.tf.json'],
  },
  {
    id: 'TF-003',
    severity: 'MEDIUM',
    title: 'S3 bucket missing server-side encryption',
    description:
      'An aws_s3_bucket resource was found without an accompanying server_side_encryption_configuration block.',
    recommendation: 'Add a server_side_encryption_configuration block with AES256 or aws:kms.',
    pattern: /resource\s+["']aws_s3_bucket["']\s+["'][^"']+["']\s*\{(?:(?!server_side_encryption_configuration)[^}])*\}/s,
    fileExtensions: ['.tf'],
  },
  {
    id: 'TF-004',
    severity: 'MEDIUM',
    title: 'RDS instance missing encryption',
    description:
      'An aws_db_instance resource does not have storage_encrypted = true, leaving data at rest unencrypted.',
    recommendation: 'Set storage_encrypted = true on all RDS instances.',
    pattern: /resource\s+["']aws_db_instance["']\s+["'][^"']+["']\s*\{(?:(?!storage_encrypted\s*=\s*true)[^}])*\}/s,
    fileExtensions: ['.tf'],
  },
  {
    id: 'TF-005',
    severity: 'HIGH',
    title: 'IAM policy with wildcard actions',
    description:
      'An IAM policy grants "*" (all actions), violating the principle of least privilege.',
    recommendation: 'Restrict actions to only those required by the workload.',
    pattern: /["']Action["']\s*:\s*["']\*["']/,
    fileExtensions: ['.tf', '.json'],
  },

  // -- Docker / Compose --
  {
    id: 'DOCKER-001',
    severity: 'MEDIUM',
    title: 'Port bound to all interfaces (0.0.0.0)',
    description:
      'A Docker Compose service binds a port to 0.0.0.0, exposing it on all network interfaces.',
    recommendation:
      'Bind to 127.0.0.1 for local-only access, or use a reverse proxy for external traffic.',
    pattern: /["']?0\.0\.0\.0:\d+:\d+["']?/,
    fileExtensions: ['.yml', '.yaml'],
  },

  // -- SQL injection --
  {
    id: 'CODE-001',
    severity: 'HIGH',
    title: 'Potential SQL injection via string concatenation',
    description:
      'A SQL query appears to be built with string concatenation or template literals that ' +
      'include variable interpolation, which can lead to SQL injection.',
    recommendation:
      'Use parameterized queries or prepared statements instead of string concatenation.',
    pattern:
      /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*(?:\$\{|\+\s*(?:req|params|query|input|user|body)\b)/i,
    fileExtensions: ['.ts', '.js', '.mjs', '.cjs'],
  },

  // -- Insecure HTTP --
  {
    id: 'CODE-002',
    severity: 'LOW',
    title: 'Insecure HTTP URL',
    description:
      'An http:// URL was found in configuration or source code. Data transmitted over ' +
      'plain HTTP is vulnerable to interception.',
    recommendation: 'Use https:// to encrypt data in transit.',
    pattern: /["']http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0|::1)[^'"]+["']/,
    fileExtensions: ['.ts', '.js', '.json', '.yml', '.yaml', '.tf', '.env', '.cfg', '.conf', '.toml'],
  },

  // -- Disabled TLS verification --
  {
    id: 'CODE-003',
    severity: 'HIGH',
    title: 'TLS certificate verification disabled',
    description:
      'TLS/SSL certificate verification is being disabled, making connections vulnerable ' +
      'to man-in-the-middle attacks.',
    recommendation: 'Do not disable certificate verification in production environments.',
    pattern: /(?:rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true)/i,
  },
];

// ---------------------------------------------------------------------------
// File extensions considered "text" (non-binary)
// ---------------------------------------------------------------------------

const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml', '.toml', '.cfg', '.conf', '.ini',
  '.tf', '.tfvars', '.hcl',
  '.sh', '.bash', '.zsh',
  '.py', '.rb', '.go', '.java', '.rs', '.c', '.cpp', '.h',
  '.md', '.txt', '.csv',
  '.sql', '.graphql', '.gql',
  '.env', '.env.example', '.env.local',
  '.xml', '.html', '.css', '.scss', '.less',
  '.dockerfile', '.dockerignore',
  '.gitignore', '.npmignore',
  '.tf.json',
]);

/** Names that indicate a binary or generated file regardless of extension */
const BINARY_NAMES = new Set([
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'coverage', '.next', 'build', '__pycache__'];

/**
 * Determine whether a file should be scanned based on its extension and name.
 */
function isTextFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  if (BINARY_NAMES.has(basename)) return false;

  // Files without an extension (e.g. Dockerfile, Makefile) are treated as text
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '') return true;

  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Check whether a file matches the user-provided glob patterns (simple suffix matching).
 */
function matchesPatterns(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return true;
  const basename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  return patterns.some(p => {
    // Handle "*.ext" patterns
    if (p.startsWith('*.')) {
      return ext === p.slice(1).toLowerCase() || ext === p.slice(1);
    }
    // Exact filename match
    return basename === p;
  });
}

/**
 * Check whether a detection rule applies to a given file extension.
 */
function ruleAppliesToFile(rule: DetectionRule, filePath: string): boolean {
  if (!rule.fileExtensions) return true;
  const ext = path.extname(filePath).toLowerCase();
  return rule.fileExtensions.includes(ext);
}

/**
 * Recursively collect file paths from a directory, respecting exclusions and limits.
 */
function collectFiles(
  dir: string,
  exclude: Set<string>,
  patterns: string[],
  maxFiles: number,
  collected: string[] = [],
): string[] {
  if (collected.length >= maxFiles) return collected;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // Permission denied or unreadable directory -- skip silently
    return collected;
  }

  for (const entry of entries) {
    if (collected.length >= maxFiles) break;

    if (entry.isDirectory()) {
      if (exclude.has(entry.name)) continue;
      collectFiles(path.join(dir, entry.name), exclude, patterns, maxFiles, collected);
    } else if (entry.isFile()) {
      const fullPath = path.join(dir, entry.name);
      if (isTextFile(fullPath) && matchesPatterns(fullPath, patterns)) {
        collected.push(fullPath);
      }
    }
  }

  return collected;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a directory tree for common security issues.
 *
 * Walks through files in `options.dir`, applies regex-based detection rules,
 * and returns all findings sorted by severity (CRITICAL first).
 *
 * @param options - Configuration controlling which files are scanned
 * @returns Scan result containing findings, file count, and timing information
 */
export async function scanSecurity(options: ScanOptions): Promise<ScanResult> {
  const startTime = Date.now();

  const excludeSet = new Set(options.exclude ?? DEFAULT_EXCLUDES);
  const patterns = options.patterns ?? [];
  const maxFiles = options.maxFiles ?? 1000;

  // Collect files to scan
  const files = collectFiles(options.dir, excludeSet, patterns, maxFiles);

  const findings: SecurityFinding[] = [];

  for (const filePath of files) {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      // Unreadable file -- skip
      continue;
    }

    const lines = content.split('\n');
    const relativePath = path.relative(options.dir, filePath);

    for (const rule of DETECTION_RULES) {
      if (!ruleAppliesToFile(rule, filePath)) continue;

      // For multiline patterns (dotAll flag), match against the whole file
      if (rule.pattern.flags.includes('s')) {
        if (rule.pattern.test(content)) {
          findings.push({
            id: `${rule.id}-${crypto.randomUUID().slice(0, 8)}`,
            severity: rule.severity,
            title: rule.title,
            description: rule.description,
            file: relativePath,
            recommendation: rule.recommendation,
          });
        }
        continue;
      }

      // Line-by-line matching for single-line patterns
      for (let i = 0; i < lines.length; i++) {
        if (rule.pattern.test(lines[i])) {
          findings.push({
            id: `${rule.id}-${crypto.randomUUID().slice(0, 8)}`,
            severity: rule.severity,
            title: rule.title,
            description: rule.description,
            file: relativePath,
            line: i + 1,
            recommendation: rule.recommendation,
          });
        }
      }
    }
  }

  // Sort by severity (CRITICAL first), then by file path
  findings.sort((a, b) => {
    const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return (a.file ?? '').localeCompare(b.file ?? '');
  });

  return {
    findings,
    scannedFiles: files.length,
    scanDuration: Date.now() - startTime,
    timestamp: new Date(),
  };
}

/**
 * Format an array of security findings as a human-readable report string.
 *
 * Each finding is displayed with a severity indicator, title, file location,
 * description, and recommendation.
 *
 * @param findings - The findings to format
 * @returns Formatted multi-line report
 */
export function formatFindings(findings: SecurityFinding[]): string {
  if (findings.length === 0) {
    return 'No security issues found.';
  }

  const severityIcon: Record<Severity, string> = {
    CRITICAL: '[CRITICAL]',
    HIGH: '[HIGH]    ',
    MEDIUM: '[MEDIUM]  ',
    LOW: '[LOW]     ',
  };

  const lines: string[] = [
    `Security Scan Report - ${findings.length} finding(s)`,
    '='.repeat(60),
    '',
  ];

  const grouped: Record<Severity, SecurityFinding[]> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };

  for (const f of findings) {
    grouped[f.severity].push(f);
  }

  for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Severity[]) {
    const group = grouped[severity];
    if (group.length === 0) continue;

    lines.push(`--- ${severity} (${group.length}) ---`);
    lines.push('');

    for (const finding of group) {
      lines.push(`  ${severityIcon[finding.severity]} ${finding.title}`);
      if (finding.file) {
        const loc = finding.line ? `${finding.file}:${finding.line}` : finding.file;
        lines.push(`    Location: ${loc}`);
      }
      lines.push(`    ${finding.description}`);
      lines.push(`    Recommendation: ${finding.recommendation}`);
      lines.push('');
    }
  }

  // Summary counts
  const criticalCount = grouped.CRITICAL.length;
  const highCount = grouped.HIGH.length;
  const mediumCount = grouped.MEDIUM.length;
  const lowCount = grouped.LOW.length;

  lines.push('='.repeat(60));
  lines.push(
    `Summary: ${criticalCount} critical, ${highCount} high, ${mediumCount} medium, ${lowCount} low`,
  );

  return lines.join('\n');
}
