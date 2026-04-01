/**
 * E2E Audit & Compliance Tests
 *
 * Comprehensive tests for the audit subsystem: security scanner
 * (src/audit/security-scanner.ts), compliance checker
 * (src/audit/compliance-checker.ts), activity log
 * (src/audit/activity-log.ts), and cost tracker
 * (src/audit/cost-tracker.ts).
 *
 * Tests use temporary directories with synthetic files to exercise the
 * real scanner and checker logic. No external dependencies are mocked
 * beyond the filesystem setup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanSecurity, maskSecrets, formatFindings } from '../../src/audit/security-scanner';
import type { SecurityFinding, ScanResult, Severity } from '../../src/audit/security-scanner';
import { checkCompliance, generateScorecard } from '../../src/audit/compliance-checker';
import type { ComplianceReport, Framework } from '../../src/audit/compliance-checker';
import { ActivityLog } from '../../src/audit/activity-log';
import type { ActivityEntry, ActivityFilter } from '../../src/audit/activity-log';
import { CostTracker } from '../../src/audit/cost-tracker';
import type { CostEntry, CostSummary } from '../../src/audit/cost-tracker';

// ---------------------------------------------------------------------------
// Restore mocks between tests
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers: temp directory with synthetic files
// ---------------------------------------------------------------------------

/**
 * Create a temporary directory and write files into it for scanning.
 * Returns the dir path; caller must clean up.
 */
function createTempDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-audit-test-'));
  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(dir, name);
    const dirName = path.dirname(fullPath);
    fs.mkdirSync(dirName, { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
  }
  return dir;
}

/**
 * Remove a temporary directory and all its contents.
 */
function cleanupDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors in tests
  }
}

// ===========================================================================
// 1. Security Scanner Tests
// ===========================================================================

describe('Security Scanner', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      cleanupDir(tempDir);
    }
  });

  it('detects hardcoded API keys', async () => {
    tempDir = createTempDir({
      'config.ts': `
        const config = {
          api_key: "sk-abcdefghij1234567890abcdefghij1234567890",
        };
      `,
    });

    const result = await scanSecurity({ dir: tempDir });

    expect(result.findings.length).toBeGreaterThan(0);
    const apiKeyFinding = result.findings.find(f => f.title.includes('API key'));
    expect(apiKeyFinding).toBeDefined();
    expect(apiKeyFinding!.severity).toBe('CRITICAL');
  });

  it('detects AWS access keys (AKIA...)', async () => {
    tempDir = createTempDir({
      'credentials.ts': `
        const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
      `,
    });

    const result = await scanSecurity({ dir: tempDir });

    expect(result.findings.length).toBeGreaterThan(0);
    const awsFinding = result.findings.find(f => f.title.includes('AWS access key'));
    expect(awsFinding).toBeDefined();
    expect(awsFinding!.severity).toBe('HIGH');
  });

  it('detects private keys (BEGIN RSA PRIVATE KEY)', async () => {
    tempDir = createTempDir({
      'key.ts': `
        const PRIVATE_KEY = \`-----BEGIN RSA PRIVATE KEY-----
MIIBogIBAAJBALRiMLAHudeSA/x3hB2f+2NRkJLA
-----END RSA PRIVATE KEY-----\`;
      `,
    });

    const result = await scanSecurity({ dir: tempDir });

    expect(result.findings.length).toBeGreaterThan(0);
    const pkFinding = result.findings.find(f => f.title.includes('Private key'));
    expect(pkFinding).toBeDefined();
    expect(pkFinding!.severity).toBe('HIGH');
  });

  it('assigns correct severity levels', async () => {
    tempDir = createTempDir({
      'mixed.ts': `
        const api_key = "supersecretapikey12345678";
        const AWS_ACCESS = "AKIAIOSFODNN7EXAMPLE";
        const key = "-----BEGIN RSA PRIVATE KEY-----";
      `,
    });

    const result = await scanSecurity({ dir: tempDir });

    // Check that we have at least CRITICAL and HIGH findings
    const severities = new Set(result.findings.map(f => f.severity));
    expect(severities.has('CRITICAL')).toBe(true);
    expect(severities.has('HIGH')).toBe(true);

    // CRITICAL findings should come first (sorted by severity)
    if (result.findings.length >= 2) {
      const firstSeverity = result.findings[0].severity;
      expect(firstSeverity).toBe('CRITICAL');
    }
  });

  it('reports correct scanned file count and timing', async () => {
    tempDir = createTempDir({
      'a.ts': 'const a = 1;',
      'b.ts': 'const b = 2;',
      'c.json': '{}',
    });

    const result = await scanSecurity({ dir: tempDir });

    expect(result.scannedFiles).toBe(3);
    expect(result.scanDuration).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('returns no findings for clean code', async () => {
    tempDir = createTempDir({
      'clean.ts': `
        export function add(a: number, b: number): number {
          return a + b;
        }
      `,
    });

    const result = await scanSecurity({ dir: tempDir });

    expect(result.findings.length).toBe(0);
  });

  it('respects exclude option to skip directories', async () => {
    tempDir = createTempDir({
      'main.ts': 'const ok = true;',
      'vendor/secret.ts': 'const api_key = "hardcoded_secret_value_1234";',
    });

    const result = await scanSecurity({
      dir: tempDir,
      exclude: ['vendor'],
    });

    const vendorFindings = result.findings.filter(f => f.file?.includes('vendor'));
    expect(vendorFindings.length).toBe(0);
  });

  it('formatFindings produces readable output', async () => {
    const findings: SecurityFinding[] = [
      {
        id: 'SEC-001-abcd',
        severity: 'CRITICAL',
        title: 'Hardcoded API key or secret',
        description: 'A potential API key is hardcoded.',
        file: 'config.ts',
        line: 5,
        recommendation: 'Use environment variables.',
      },
    ];

    const output = formatFindings(findings);

    expect(output).toContain('Security Scan Report');
    expect(output).toContain('1 finding');
    expect(output).toContain('CRITICAL');
    expect(output).toContain('config.ts:5');
    expect(output).toContain('Hardcoded API key');
  });

  it('formatFindings handles empty findings', () => {
    const output = formatFindings([]);
    expect(output).toBe('No security issues found.');
  });
});

// ===========================================================================
// 2. maskSecrets Tests
// ===========================================================================

describe('maskSecrets', () => {
  it('redacts AWS access keys in output', () => {
    const input = 'Found key: AKIAIOSFODNN7EXAMPLE in config';
    const result = maskSecrets(input);

    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result).toContain('[AWS_ACCESS_KEY]');
  });

  it('redacts private key blocks', () => {
    const input = `-----BEGIN RSA PRIVATE KEY-----
MIIBogIBAAJBALRiMLAHudeSA
-----END RSA PRIVATE KEY-----`;
    const result = maskSecrets(input);

    expect(result).not.toContain('BEGIN RSA PRIVATE KEY');
    expect(result).toContain('[PRIVATE_KEY_REDACTED]');
  });

  it('redacts GitHub tokens', () => {
    const input = 'token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const result = maskSecrets(input);

    expect(result).not.toContain('ghp_');
    expect(result).toContain('[GITHUB_TOKEN]');
  });

  it('redacts OpenAI keys', () => {
    const input = 'key: sk-1234567890abcdefghij1234567890abcdefghij12';
    const result = maskSecrets(input);

    expect(result).not.toContain('sk-1234567890');
    expect(result).toContain('[OPENAI_KEY]');
  });

  it('leaves clean text unchanged', () => {
    const input = 'This is a normal log message with no secrets.';
    const result = maskSecrets(input);

    expect(result).toBe(input);
  });

  it('redacts multiple secrets in the same string', () => {
    const input = 'AWS: AKIAIOSFODNN7EXAMPLE, GitHub: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const result = maskSecrets(input);

    expect(result).toContain('[AWS_ACCESS_KEY]');
    expect(result).toContain('[GITHUB_TOKEN]');
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(result).not.toContain('ghp_ABCDEF');
  });
});

// ===========================================================================
// 3. Compliance Checker Tests
// ===========================================================================

describe('Compliance Checker', () => {
  let tempDir: string;

  afterEach(() => {
    if (tempDir) {
      cleanupDir(tempDir);
    }
  });

  it('evaluates SOC2 controls against Terraform files', async () => {
    tempDir = createTempDir({
      'main.tf': `
        resource "aws_cloudtrail" "main" {
          name = "main-trail"
        }
        resource "aws_iam_role" "admin" {
          name = "admin"
        }
        resource "aws_s3_bucket" "data" {
          server_side_encryption_configuration {
            rule {
              apply_server_side_encryption_by_default {
                sse_algorithm = "AES256"
              }
            }
          }
        }
        resource "aws_security_group" "web" {
          name = "web"
        }
      `,
    });

    const reports = await checkCompliance({ dir: tempDir, frameworks: ['SOC2'] });

    expect(reports.length).toBe(1);
    const soc2 = reports[0];
    expect(soc2.framework).toBe('SOC2');
    expect(soc2.controls.length).toBeGreaterThan(0);

    // SOC2-001 (logging) should pass due to aws_cloudtrail
    const loggingControl = soc2.controls.find(c => c.id === 'SOC2-001');
    expect(loggingControl).toBeDefined();
    expect(loggingControl!.status).toBe('pass');

    // SOC2-002 (access controls) should pass due to aws_iam_role
    const accessControl = soc2.controls.find(c => c.id === 'SOC2-002');
    expect(accessControl).toBeDefined();
    expect(accessControl!.status).toBe('pass');
  });

  it('evaluates HIPAA controls and detects missing requirements', async () => {
    tempDir = createTempDir({
      'infra.tf': `
        resource "aws_iam_role" "app" {
          name = "app-role"
        }
      `,
    });

    const reports = await checkCompliance({ dir: tempDir, frameworks: ['HIPAA'] });

    expect(reports.length).toBe(1);
    const hipaa = reports[0];
    expect(hipaa.framework).toBe('HIPAA');

    // HIPAA-001 (encryption required) should fail -- no encryption config
    const encryptionControl = hipaa.controls.find(c => c.id === 'HIPAA-001');
    expect(encryptionControl).toBeDefined();
    expect(encryptionControl!.status).toBe('fail');

    // HIPAA-003 (access controls) should pass -- aws_iam_role present
    const accessControl = hipaa.controls.find(c => c.id === 'HIPAA-003');
    expect(accessControl).toBeDefined();
    expect(accessControl!.status).toBe('pass');
  });

  it('evaluates PCI-DSS controls including wildcard IAM detection', async () => {
    tempDir = createTempDir({
      'iam.tf': `
        resource "aws_iam_policy" "admin" {
          policy = jsonencode({
            Statement = [{
              "Action": "*"
              Effect   = "Allow"
              Resource = "*"
            }]
          })
        }
        resource "aws_vpc" "main" {
          cidr_block = "10.0.0.0/16"
        }
      `,
    });

    const reports = await checkCompliance({ dir: tempDir, frameworks: ['PCI'] });

    expect(reports.length).toBe(1);
    const pci = reports[0];
    expect(pci.framework).toBe('PCI');

    // PCI-001 (network segmentation) should pass -- aws_vpc present
    const networkControl = pci.controls.find(c => c.id === 'PCI-001');
    expect(networkControl).toBeDefined();
    expect(networkControl!.status).toBe('pass');

    // PCI-004 (no wildcard IAM) should fail -- "Action": "*" is present
    const wildcardControl = pci.controls.find(c => c.id === 'PCI-004');
    expect(wildcardControl).toBeDefined();
    expect(wildcardControl!.status).toBe('fail');
  });

  it('generates a scorecard from compliance reports', async () => {
    tempDir = createTempDir({
      'main.tf': `
        resource "aws_cloudtrail" "main" { name = "trail" }
        resource "aws_iam_role" "admin" { name = "admin" }
        resource "aws_security_group" "web" { name = "web" }
        resource "aws_vpc" "main" { cidr_block = "10.0.0.0/16" }
      `,
    });

    const reports = await checkCompliance({ dir: tempDir, frameworks: ['SOC2', 'PCI'] });
    const scorecard = generateScorecard(reports);

    expect(scorecard).toContain('Compliance Scorecard');
    expect(scorecard).toContain('SOC2');
    expect(scorecard).toContain('PCI');
    expect(scorecard).toContain('%');
    expect(scorecard).toContain('Overall:');
    expect(scorecard).toContain('pass');
  });

  it('generates an empty scorecard message when no reports provided', () => {
    const scorecard = generateScorecard([]);
    expect(scorecard).toBe('No compliance reports to display.');
  });

  it('skips all controls when no Terraform files found', async () => {
    tempDir = createTempDir({
      'readme.md': '# No terraform here',
    });

    const reports = await checkCompliance({ dir: tempDir, frameworks: ['SOC2'] });

    expect(reports.length).toBe(1);
    const soc2 = reports[0];
    expect(soc2.controls.every(c => c.status === 'skip')).toBe(true);
    expect(soc2.skipCount).toBe(soc2.controls.length);
    expect(soc2.score).toBe(0);
  });

  it('compliance report includes pass/fail per control with evidence', async () => {
    tempDir = createTempDir({
      'main.tf': `
        resource "aws_cloudtrail" "main" { name = "trail" }
      `,
    });

    const reports = await checkCompliance({ dir: tempDir, frameworks: ['SOC2'] });
    const soc2 = reports[0];

    for (const control of soc2.controls) {
      expect(control.id).toBeDefined();
      expect(control.framework).toBe('SOC2');
      expect(control.name).toBeDefined();
      expect(control.description).toBeDefined();
      expect(['pass', 'fail', 'warn', 'skip']).toContain(control.status);
      expect(control.evidence).toBeDefined();
    }

    // Verify pass/fail counts add up
    const total = soc2.passCount + soc2.failCount + soc2.warnCount + soc2.skipCount;
    expect(total).toBe(soc2.controls.length);
  });

  it('score is computed as pass / (pass + fail + warn) * 100', async () => {
    tempDir = createTempDir({
      'main.tf': `
        resource "aws_cloudtrail" "main" { name = "trail" }
        resource "aws_iam_role" "admin" { name = "admin" }
      `,
    });

    const reports = await checkCompliance({ dir: tempDir, frameworks: ['SOC2'] });
    const soc2 = reports[0];
    const evaluatedCount = soc2.passCount + soc2.failCount + soc2.warnCount;

    if (evaluatedCount > 0) {
      const expectedScore = Math.round((soc2.passCount / evaluatedCount) * 100);
      expect(soc2.score).toBe(expectedScore);
    }
  });
});

// ===========================================================================
// 4. Activity Log Tests
// ===========================================================================

describe('Activity Log', () => {
  let log: ActivityLog;

  beforeEach(() => {
    log = new ActivityLog();
  });

  it('records entries with timestamps and auto-generated IDs', () => {
    const entry = log.log({
      timestamp: new Date('2026-03-15T10:00:00Z'),
      sessionId: 'sess-1',
      toolName: 'terraform_plan',
      toolInput: { dir: '/infra' },
      result: { output: 'Plan: 3 to add', isError: false },
      duration: 4200,
      mode: 'plan',
    });

    expect(entry.id).toBeDefined();
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.toolName).toBe('terraform_plan');
    expect(entry.sessionId).toBe('sess-1');
  });

  it('filters entries by tool name', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-1',
      toolName: 'terraform_plan',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 100,
      mode: 'plan',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: { command: 'ls' },
      result: { output: 'file.txt', isError: false },
      duration: 50,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-1',
      toolName: 'terraform_plan',
      toolInput: {},
      result: { output: 'ok2', isError: false },
      duration: 200,
      mode: 'plan',
    });

    const tfEntries = log.query({ toolName: 'terraform_plan' });
    expect(tfEntries.length).toBe(2);
    expect(tfEntries.every(e => e.toolName === 'terraform_plan')).toBe(true);

    const bashEntries = log.query({ toolName: 'bash' });
    expect(bashEntries.length).toBe(1);
  });

  it('filters entries by session ID', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-A',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 100,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-B',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 100,
      mode: 'build',
    });

    const sessA = log.query({ sessionId: 'sess-A' });
    expect(sessA.length).toBe(1);
    expect(sessA[0].sessionId).toBe('sess-A');
  });

  it('filters entries by date range (since/until)', () => {
    log.log({
      timestamp: new Date('2026-01-01T00:00:00Z'),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'old', isError: false },
      duration: 50,
      mode: 'build',
    });
    log.log({
      timestamp: new Date('2026-03-15T00:00:00Z'),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'mid', isError: false },
      duration: 50,
      mode: 'build',
    });
    log.log({
      timestamp: new Date('2026-06-01T00:00:00Z'),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'new', isError: false },
      duration: 50,
      mode: 'build',
    });

    const filtered = log.query({
      since: new Date('2026-02-01T00:00:00Z'),
      until: new Date('2026-04-01T00:00:00Z'),
    });
    expect(filtered.length).toBe(1);
    expect(filtered[0].result.output).toBe('mid');
  });

  it('respects limit parameter to cap results', () => {
    for (let i = 0; i < 10; i++) {
      log.log({
        timestamp: new Date(Date.now() + i * 1000),
        sessionId: 'sess-1',
        toolName: 'bash',
        toolInput: {},
        result: { output: `output-${i}`, isError: false },
        duration: 50,
        mode: 'build',
      });
    }

    const limited = log.query({ limit: 3 });
    expect(limited.length).toBe(3);
  });

  it('returns results in reverse chronological order (newest first)', () => {
    log.log({
      timestamp: new Date('2026-01-01T00:00:00Z'),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'first', isError: false },
      duration: 50,
      mode: 'build',
    });
    log.log({
      timestamp: new Date('2026-06-01T00:00:00Z'),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'second', isError: false },
      duration: 50,
      mode: 'build',
    });

    const entries = log.query();
    expect(entries.length).toBe(2);
    expect(entries[0].result.output).toBe('second');
    expect(entries[1].result.output).toBe('first');
  });

  it('filters by error status', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 50,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-1',
      toolName: 'terraform_apply',
      toolInput: {},
      result: { output: 'Error: resource conflict', isError: true },
      duration: 3000,
      mode: 'deploy',
    });

    const errors = log.query({ isError: true });
    expect(errors.length).toBe(1);
    expect(errors[0].toolName).toBe('terraform_apply');
    expect(errors[0].result.isError).toBe(true);

    const successes = log.query({ isError: false });
    expect(successes.length).toBe(1);
    expect(successes[0].result.isError).toBe(false);
  });

  it('getStats computes correct summary statistics', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 100,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-1',
      toolName: 'terraform_plan',
      toolInput: {},
      result: { output: 'plan', isError: false },
      duration: 3000,
      mode: 'plan',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'error', isError: true },
      duration: 200,
      mode: 'build',
    });

    const stats = log.getStats();

    expect(stats.totalCalls).toBe(3);
    expect(stats.errorCount).toBe(1);
    expect(stats.avgDuration).toBe(Math.round((100 + 3000 + 200) / 3));
    expect(stats.toolBreakdown['bash']).toBe(2);
    expect(stats.toolBreakdown['terraform_plan']).toBe(1);
  });

  it('formatLog produces human-readable output', () => {
    const entry = log.log({
      timestamp: new Date('2026-03-15T10:30:00Z'),
      sessionId: 'sess-1',
      toolName: 'terraform_plan',
      toolInput: { dir: '/infra' },
      result: { output: 'Plan: 3 to add', isError: false },
      duration: 4200,
      mode: 'plan',
    });

    const entries = log.query();
    const output = log.formatLog(entries);

    expect(output).toContain('Activity Log');
    expect(output).toContain('terraform_plan');
    expect(output).toContain('[plan]');
    expect(output).toContain('1 calls');
    expect(output).toContain('0 errors');
  });

  it('clear removes all entries', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 'sess-1',
      toolName: 'bash',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 50,
      mode: 'build',
    });

    expect(log.query().length).toBe(1);
    log.clear();
    expect(log.query().length).toBe(0);
  });
});

// ===========================================================================
// 5. Cost Tracker Tests
// ===========================================================================

describe('Cost Tracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  it('records LLM costs and returns entry with correct fields', () => {
    const entry = tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1500,
      outputTokens: 800,
      costUSD: 0.0165,
    });

    expect(entry.id).toBeDefined();
    expect(entry.sessionId).toBe('sess-1');
    expect(entry.category).toBe('llm');
    expect(entry.amount).toBe(0.0165);
    expect(entry.inputTokens).toBe(1500);
    expect(entry.outputTokens).toBe(800);
    expect(entry.model).toBe('claude-sonnet-4-20250514');
    expect(entry.timestamp).toBeInstanceOf(Date);
  });

  it('records infrastructure costs', () => {
    const entry = tracker.recordInfraCost({
      sessionId: 'sess-1',
      description: 'Added RDS instance (db.m5.large)',
      monthlyCost: 125.50,
    });

    expect(entry.id).toBeDefined();
    expect(entry.category).toBe('infra');
    expect(entry.amount).toBe(125.50);
    expect(entry.description).toContain('RDS instance');
  });

  it('aggregates per-provider (LLM vs infra) costs in summary', () => {
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1000,
      outputTokens: 500,
      costUSD: 0.01,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'gpt-4o',
      inputTokens: 2000,
      outputTokens: 1000,
      costUSD: 0.03,
    });
    tracker.recordInfraCost({
      sessionId: 'sess-1',
      description: 'S3 bucket',
      monthlyCost: 5.00,
    });

    const summary = tracker.getSummary();

    expect(summary.totalCost).toBeCloseTo(5.04, 2);
    expect(summary.llmCost).toBeCloseTo(0.04, 2);
    expect(summary.infraCost).toBeCloseTo(5.00, 2);
  });

  it('generates cost summary with daily breakdown and monthly projection', () => {
    // Record costs on two different days
    const day1 = new Date('2026-03-01T10:00:00Z');
    const day2 = new Date('2026-03-02T14:00:00Z');

    // We need to use recordLLMCost which auto-timestamps, so we record
    // entries and verify the summary structure
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 500,
      outputTokens: 200,
      costUSD: 0.005,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-2',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 400,
      costUSD: 0.015,
    });

    const summary = tracker.getSummary();

    expect(summary.totalCost).toBeCloseTo(0.02, 4);
    expect(summary.dailyCosts.length).toBeGreaterThan(0);
    expect(typeof summary.monthlyProjection).toBe('number');
    expect(summary.monthlyProjection).toBeGreaterThan(0);

    // Monthly projection = daily avg * 30
    const totalDaily = summary.dailyCosts.reduce((s, d) => s + d.amount, 0);
    const avgDaily = totalDaily / summary.dailyCosts.length;
    expect(summary.monthlyProjection).toBeCloseTo(avgDaily * 30, 4);
  });

  it('groups entries by session in summary', () => {
    tracker.recordLLMCost({
      sessionId: 'sess-A',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 500,
      outputTokens: 200,
      costUSD: 0.005,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-B',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 400,
      costUSD: 0.015,
    });
    tracker.recordInfraCost({
      sessionId: 'sess-A',
      description: 'EC2 instance',
      monthlyCost: 50.00,
    });

    const summary = tracker.getSummary();

    expect(summary.entriesBySession.size).toBe(2);
    expect(summary.entriesBySession.has('sess-A')).toBe(true);
    expect(summary.entriesBySession.has('sess-B')).toBe(true);
    expect(summary.entriesBySession.get('sess-A')!.length).toBe(2);
    expect(summary.entriesBySession.get('sess-B')!.length).toBe(1);
  });

  it('filters summary by session ID', () => {
    tracker.recordLLMCost({
      sessionId: 'sess-A',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 500,
      outputTokens: 200,
      costUSD: 0.005,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-B',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 400,
      costUSD: 0.015,
    });

    const summaryA = tracker.getSummary({ sessionId: 'sess-A' });

    expect(summaryA.totalCost).toBeCloseTo(0.005, 4);
    expect(summaryA.entriesBySession.size).toBe(1);
    expect(summaryA.entriesBySession.has('sess-A')).toBe(true);
  });

  it('formatSummary produces readable text report', () => {
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1500,
      outputTokens: 800,
      costUSD: 0.0165,
    });
    tracker.recordInfraCost({
      sessionId: 'sess-1',
      description: 'RDS db.m5.large',
      monthlyCost: 125.50,
    });

    const summary = tracker.getSummary();
    const output = tracker.formatSummary(summary);

    expect(output).toContain('Cost Summary');
    expect(output).toContain('Total Cost');
    expect(output).toContain('LLM Cost');
    expect(output).toContain('Infra Cost');
    expect(output).toContain('Monthly Estimate');
    expect(output).toContain('Per-Session Breakdown');
    expect(output).toContain('sess-1');
    expect(output).toContain('Projected monthly cost');
  });

  it('getEntries returns entries sorted newest first', () => {
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'model-a',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.001,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-1',
      model: 'model-b',
      inputTokens: 200,
      outputTokens: 100,
      costUSD: 0.002,
    });

    const entries = tracker.getEntries();

    expect(entries.length).toBe(2);
    // Newest first (second recorded entry should come first)
    expect(entries[0].timestamp.getTime()).toBeGreaterThanOrEqual(
      entries[1].timestamp.getTime()
    );
  });

  it('getEntries filters by session ID', () => {
    tracker.recordLLMCost({
      sessionId: 'sess-X',
      model: 'model-a',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.001,
    });
    tracker.recordLLMCost({
      sessionId: 'sess-Y',
      model: 'model-b',
      inputTokens: 200,
      outputTokens: 100,
      costUSD: 0.002,
    });

    const sessX = tracker.getEntries('sess-X');
    expect(sessX.length).toBe(1);
    expect(sessX[0].sessionId).toBe('sess-X');
  });

  it('empty tracker produces zero-cost summary', () => {
    const summary = tracker.getSummary();

    expect(summary.totalCost).toBe(0);
    expect(summary.llmCost).toBe(0);
    expect(summary.infraCost).toBe(0);
    expect(summary.dailyCosts.length).toBe(0);
    expect(summary.monthlyProjection).toBe(0);
    expect(summary.entriesBySession.size).toBe(0);
  });
});
