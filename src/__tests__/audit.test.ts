/**
 * Tests for the Nimbus audit modules:
 *   - Security Scanner
 *   - Compliance Checker
 *   - Cost Tracker
 *   - Activity Log
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { scanSecurity, formatFindings, type SecurityFinding } from '../audit/security-scanner';
import { checkCompliance, generateScorecard, type Framework } from '../audit/compliance-checker';
import { CostTracker } from '../audit/cost-tracker';
import { ActivityLog } from '../audit/activity-log';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-audit-test-'));
}

function removeTmpDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ============================================================================
// Security Scanner
// ============================================================================

describe('Security Scanner', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    removeTmpDir(tmpDir);
  });

  // ---- scanSecurity() ----

  test('scanSecurity() finds hardcoded API keys', async () => {
    fs.writeFileSync(path.join(tmpDir, 'config.ts'), 'const API_KEY = "sk-1234567890abcdef";\n');

    const result = await scanSecurity({ dir: tmpDir });

    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    const finding = result.findings.find(f => f.id.startsWith('SEC-001'));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('CRITICAL');
    expect(finding!.title).toContain('API key');
  });

  test('scanSecurity() finds hardcoded passwords', async () => {
    fs.writeFileSync(path.join(tmpDir, 'db.ts'), 'const password = "supersecret123";\n');

    const result = await scanSecurity({ dir: tmpDir });

    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    const finding = result.findings.find(f => f.id.startsWith('SEC-002'));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('CRITICAL');
    expect(finding!.title).toContain('password');
  });

  test('scanSecurity() finds open security groups (0.0.0.0/0 in .tf files)', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), 'cidr_blocks = ["0.0.0.0/0"]\n');

    const result = await scanSecurity({ dir: tmpDir });

    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    const finding = result.findings.find(f => f.id.startsWith('TF-001'));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('HIGH');
    expect(finding!.title).toContain('Open security group');
  });

  test('scanSecurity() finds public S3 buckets', async () => {
    fs.writeFileSync(path.join(tmpDir, 's3.tf'), 'acl = "public-read"\n');

    const result = await scanSecurity({ dir: tmpDir });

    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    const finding = result.findings.find(f => f.id.startsWith('TF-002'));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('HIGH');
    expect(finding!.title).toContain('Public S3 bucket');
  });

  test('scanSecurity() returns no findings for clean code', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'clean.ts'),
      [
        'const apiKey = process.env.API_KEY;',
        'const password = process.env.DB_PASSWORD;',
        'export function greet(name: string): string {',
        '  return `Hello, ${name}`;',
        '}',
      ].join('\n')
    );

    const result = await scanSecurity({ dir: tmpDir });

    expect(result.findings.length).toBe(0);
    expect(result.scannedFiles).toBe(1);
  });

  test('scanSecurity() skips node_modules', async () => {
    const nodeModulesDir = path.join(tmpDir, 'node_modules', 'some-pkg');
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.writeFileSync(
      path.join(nodeModulesDir, 'index.ts'),
      'const API_KEY = "sk-should-be-ignored-abcde";\n'
    );

    // Also put a clean file in the root so scannedFiles > 0 in root but
    // node_modules should be excluded entirely
    fs.writeFileSync(path.join(tmpDir, 'index.ts'), 'export const x = 1;\n');

    const result = await scanSecurity({ dir: tmpDir });

    expect(result.scannedFiles).toBe(1); // only root index.ts
    expect(result.findings.length).toBe(0);
  });

  // ---- formatFindings() ----

  test('formatFindings() produces readable output', () => {
    const findings: SecurityFinding[] = [
      {
        id: 'SEC-001-abcd1234',
        severity: 'CRITICAL',
        title: 'Hardcoded API key or secret',
        description: 'A potential API key is hardcoded.',
        file: 'config.ts',
        line: 3,
        recommendation: 'Move to environment variables.',
      },
      {
        id: 'TF-001-efgh5678',
        severity: 'HIGH',
        title: 'Open security group (0.0.0.0/0)',
        description: 'Security group allows traffic from any IP.',
        file: 'main.tf',
        line: 10,
        recommendation: 'Restrict CIDR blocks.',
      },
    ];

    const output = formatFindings(findings);

    expect(output).toContain('Security Scan Report');
    expect(output).toContain('2 finding(s)');
    expect(output).toContain('[CRITICAL]');
    expect(output).toContain('[HIGH]');
    expect(output).toContain('config.ts:3');
    expect(output).toContain('main.tf:10');
    expect(output).toContain('Recommendation:');
    expect(output).toContain('1 critical');
    expect(output).toContain('1 high');
  });

  test('formatFindings() returns clean message for empty findings', () => {
    const output = formatFindings([]);
    expect(output).toBe('No security issues found.');
  });
});

// ============================================================================
// Compliance Checker
// ============================================================================

describe('Compliance Checker', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    removeTmpDir(tmpDir);
  });

  test('checkCompliance() returns reports for all requested frameworks', async () => {
    // Create a minimal .tf file so controls are evaluated (not skipped)
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), 'provider "aws" {\n  region = "us-east-1"\n}\n');

    const frameworks: Framework[] = ['SOC2', 'HIPAA', 'PCI'];
    const reports = await checkCompliance({ dir: tmpDir, frameworks });

    expect(reports.length).toBe(3);
    expect(reports.map(r => r.framework)).toEqual(['SOC2', 'HIPAA', 'PCI']);

    for (const report of reports) {
      expect(report.controls.length).toBeGreaterThan(0);
      expect(report.timestamp).toBeInstanceOf(Date);
    }
  });

  test('checkCompliance() passes encryption check when encryption is configured', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'storage.tf'),
      [
        'resource "aws_s3_bucket" "data" {',
        '  bucket = "my-bucket"',
        '',
        '  server_side_encryption_configuration {',
        '    rule {',
        '      apply_server_side_encryption_by_default {',
        '        sse_algorithm = "AES256"',
        '      }',
        '    }',
        '  }',
        '}',
      ].join('\n')
    );

    const reports = await checkCompliance({
      dir: tmpDir,
      frameworks: ['SOC2'],
    });

    const soc2 = reports[0];
    // SOC2-003 is the "Encryption at rest" control
    const encryptionControl = soc2.controls.find(c => c.id === 'SOC2-003');
    expect(encryptionControl).toBeDefined();
    expect(encryptionControl!.status).toBe('pass');
  });

  test('checkCompliance() fails encryption check when missing', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'storage.tf'),
      ['resource "aws_s3_bucket" "data" {', '  bucket = "my-bucket"', '}'].join('\n')
    );

    const reports = await checkCompliance({
      dir: tmpDir,
      frameworks: ['SOC2'],
    });

    const soc2 = reports[0];
    const encryptionControl = soc2.controls.find(c => c.id === 'SOC2-003');
    expect(encryptionControl).toBeDefined();
    expect(encryptionControl!.status).toBe('fail');
  });

  test('checkCompliance() returns correct score', async () => {
    // Create .tf content that satisfies some SOC2 controls but not others.
    // SOC2 has 5 controls. We provide content matching logging (SOC2-001)
    // and access controls (SOC2-002) and network security groups (SOC2-005).
    fs.writeFileSync(
      path.join(tmpDir, 'infra.tf'),
      [
        'resource "aws_cloudtrail" "main" {}',
        'resource "aws_iam_role" "admin" {}',
        'resource "aws_security_group" "web" {}',
      ].join('\n')
    );

    const reports = await checkCompliance({
      dir: tmpDir,
      frameworks: ['SOC2'],
    });

    const soc2 = reports[0];
    // 3 pass, 2 fail, 0 warn => score = round(3/5 * 100) = 60
    expect(soc2.passCount).toBe(3);
    expect(soc2.failCount).toBe(2);
    expect(soc2.score).toBe(60);
  });

  test('generateScorecard() produces formatted output', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), 'resource "aws_cloudtrail" "main" {}\n');

    const reports = await checkCompliance({
      dir: tmpDir,
      frameworks: ['SOC2'],
    });

    const scorecard = generateScorecard(reports);

    expect(scorecard).toContain('Compliance Scorecard');
    expect(scorecard).toContain('SOC2');
    expect(scorecard).toContain('[PASS]');
    expect(scorecard).toContain('[FAIL]');
    expect(scorecard).toContain('Overall:');
    expect(scorecard).toContain('compliant');
  });

  test('generateScorecard() handles empty reports', () => {
    const scorecard = generateScorecard([]);
    expect(scorecard).toBe('No compliance reports to display.');
  });
});

// ============================================================================
// Cost Tracker
// ============================================================================

describe('Cost Tracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  test('recordLLMCost() adds an entry', () => {
    const entry = tracker.recordLLMCost({
      sessionId: 'session-1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1000,
      outputTokens: 500,
      costUSD: 0.015,
    });

    expect(entry.id).toBeDefined();
    expect(entry.category).toBe('llm');
    expect(entry.amount).toBe(0.015);
    expect(entry.model).toBe('claude-sonnet-4-20250514');
    expect(entry.inputTokens).toBe(1000);
    expect(entry.outputTokens).toBe(500);
    expect(entry.sessionId).toBe('session-1');
    expect(entry.timestamp).toBeInstanceOf(Date);
    expect(entry.description).toContain('claude-sonnet-4-20250514');
  });

  test('recordInfraCost() adds an entry', () => {
    const entry = tracker.recordInfraCost({
      sessionId: 'session-2',
      description: 'Added t3.medium EC2 instance',
      monthlyCost: 30.37,
    });

    expect(entry.id).toBeDefined();
    expect(entry.category).toBe('infra');
    expect(entry.amount).toBe(30.37);
    expect(entry.sessionId).toBe('session-2');
    expect(entry.description).toBe('Added t3.medium EC2 instance');
    expect(entry.inputTokens).toBeUndefined();
    expect(entry.outputTokens).toBeUndefined();
    expect(entry.model).toBeUndefined();
  });

  test('getSummary() calculates correct totals', () => {
    tracker.recordLLMCost({
      sessionId: 's1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.01,
    });
    tracker.recordLLMCost({
      sessionId: 's1',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 200,
      outputTokens: 100,
      costUSD: 0.02,
    });
    tracker.recordInfraCost({
      sessionId: 's1',
      description: 'RDS',
      monthlyCost: 50.0,
    });

    const summary = tracker.getSummary();

    expect(summary.totalCost).toBeCloseTo(50.03, 6);
    expect(summary.llmCost).toBeCloseTo(0.03, 6);
    expect(summary.infraCost).toBeCloseTo(50.0, 6);
  });

  test('getSummary() groups by session', () => {
    tracker.recordLLMCost({
      sessionId: 'session-a',
      model: 'gpt-4',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.01,
    });
    tracker.recordLLMCost({
      sessionId: 'session-b',
      model: 'gpt-4',
      inputTokens: 200,
      outputTokens: 100,
      costUSD: 0.02,
    });
    tracker.recordInfraCost({
      sessionId: 'session-a',
      description: 'EC2',
      monthlyCost: 10.0,
    });

    const summary = tracker.getSummary();

    expect(summary.entriesBySession.size).toBe(2);
    expect(summary.entriesBySession.get('session-a')!.length).toBe(2);
    expect(summary.entriesBySession.get('session-b')!.length).toBe(1);
  });

  test('getSummary() calculates daily costs', () => {
    // All entries created with new Date(), so they all belong to today
    tracker.recordLLMCost({
      sessionId: 's1',
      model: 'claude',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.01,
    });
    tracker.recordLLMCost({
      sessionId: 's1',
      model: 'claude',
      inputTokens: 200,
      outputTokens: 100,
      costUSD: 0.02,
    });

    const summary = tracker.getSummary();

    expect(summary.dailyCosts.length).toBe(1);
    // Today's date in YYYY-MM-DD
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    expect(summary.dailyCosts[0].date).toBe(`${y}-${m}-${d}`);
    expect(summary.dailyCosts[0].amount).toBeCloseTo(0.03, 6);
  });

  test('getSummary() calculates monthly projection', () => {
    tracker.recordLLMCost({
      sessionId: 's1',
      model: 'claude',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 1.0,
    });

    const summary = tracker.getSummary();

    // Single day of data: daily average = 1.0, projection = 1.0 * 30 = 30.0
    expect(summary.monthlyProjection).toBeCloseTo(30.0, 6);
  });

  test('getEntries() filters by session', () => {
    tracker.recordLLMCost({
      sessionId: 'alpha',
      model: 'claude',
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.01,
    });
    tracker.recordInfraCost({
      sessionId: 'beta',
      description: 'Lambda',
      monthlyCost: 5.0,
    });
    tracker.recordLLMCost({
      sessionId: 'alpha',
      model: 'claude',
      inputTokens: 200,
      outputTokens: 100,
      costUSD: 0.02,
    });

    const alphaEntries = tracker.getEntries('alpha');
    expect(alphaEntries.length).toBe(2);
    expect(alphaEntries.every(e => e.sessionId === 'alpha')).toBe(true);

    const betaEntries = tracker.getEntries('beta');
    expect(betaEntries.length).toBe(1);
    expect(betaEntries[0].category).toBe('infra');

    // All entries when no filter
    const allEntries = tracker.getEntries();
    expect(allEntries.length).toBe(3);
  });

  test('formatSummary() produces readable output', () => {
    tracker.recordLLMCost({
      sessionId: 'demo',
      model: 'claude-sonnet-4-20250514',
      inputTokens: 1500,
      outputTokens: 800,
      costUSD: 0.0165,
    });
    tracker.recordInfraCost({
      sessionId: 'demo',
      description: 'RDS t3.micro',
      monthlyCost: 15.33,
    });

    const summary = tracker.getSummary();
    const output = tracker.formatSummary(summary);

    expect(output).toContain('Cost Summary');
    expect(output).toContain('Total Cost:');
    expect(output).toContain('LLM Cost:');
    expect(output).toContain('Infra Cost:');
    expect(output).toContain('Monthly Estimate:');
    expect(output).toContain('Per-Session Breakdown:');
    expect(output).toContain('demo');
    expect(output).toContain('Daily Costs:');
    expect(output).toContain('Projected monthly cost:');
  });
});

// ============================================================================
// Activity Log
// ============================================================================

describe('Activity Log', () => {
  let log: ActivityLog;

  beforeEach(() => {
    log = new ActivityLog();
  });

  test('log() creates entry with auto-generated ID', () => {
    const entry = log.log({
      timestamp: new Date(),
      sessionId: 'session-1',
      toolName: 'terraform_plan',
      toolInput: { dir: '/infra' },
      result: { output: 'Plan: 3 to add', isError: false },
      duration: 4200,
      mode: 'plan',
    });

    expect(entry.id).toBeDefined();
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry.toolName).toBe('terraform_plan');
    expect(entry.sessionId).toBe('session-1');
    expect(entry.duration).toBe(4200);
    expect(entry.mode).toBe('plan');
  });

  test('query() returns all entries with no filter', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'file_read',
      toolInput: { path: '/a.ts' },
      result: { output: 'ok', isError: false },
      duration: 50,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'git_commit',
      toolInput: { message: 'fix' },
      result: { output: 'committed', isError: false },
      duration: 300,
      mode: 'build',
    });

    const results = log.query();

    expect(results.length).toBe(2);
  });

  test('query() filters by toolName', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'file_read',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 10,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'terraform_plan',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 3000,
      mode: 'plan',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'file_read',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 15,
      mode: 'build',
    });

    const results = log.query({ toolName: 'file_read' });

    expect(results.length).toBe(2);
    expect(results.every(e => e.toolName === 'file_read')).toBe(true);
  });

  test('query() filters by date range', () => {
    const jan1 = new Date('2025-01-01T00:00:00Z');
    const feb1 = new Date('2025-02-01T00:00:00Z');
    const mar1 = new Date('2025-03-01T00:00:00Z');

    log.log({
      timestamp: jan1,
      sessionId: 's1',
      toolName: 'tool_a',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 100,
      mode: 'build',
    });
    log.log({
      timestamp: feb1,
      sessionId: 's1',
      toolName: 'tool_b',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 100,
      mode: 'build',
    });
    log.log({
      timestamp: mar1,
      sessionId: 's1',
      toolName: 'tool_c',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 100,
      mode: 'build',
    });

    const results = log.query({
      since: new Date('2025-01-15T00:00:00Z'),
      until: new Date('2025-02-15T00:00:00Z'),
    });

    expect(results.length).toBe(1);
    expect(results[0].toolName).toBe('tool_b');
  });

  test('query() filters by sessionId', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 'alpha',
      toolName: 'file_read',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 10,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 'beta',
      toolName: 'file_write',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 20,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 'alpha',
      toolName: 'git_status',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 30,
      mode: 'build',
    });

    const results = log.query({ sessionId: 'alpha' });

    expect(results.length).toBe(2);
    expect(results.every(e => e.sessionId === 'alpha')).toBe(true);
  });

  test('query() filters by error status', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'terraform_apply',
      toolInput: {},
      result: { output: 'Error: access denied', isError: true },
      duration: 5000,
      mode: 'deploy',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'file_read',
      toolInput: {},
      result: { output: 'ok', isError: false },
      duration: 10,
      mode: 'build',
    });

    const errors = log.query({ isError: true });
    expect(errors.length).toBe(1);
    expect(errors[0].toolName).toBe('terraform_apply');

    const successes = log.query({ isError: false });
    expect(successes.length).toBe(1);
    expect(successes[0].toolName).toBe('file_read');
  });

  test('query() respects limit', () => {
    for (let i = 0; i < 10; i++) {
      log.log({
        timestamp: new Date(Date.now() + i * 1000),
        sessionId: 's1',
        toolName: `tool_${i}`,
        toolInput: {},
        result: { output: '', isError: false },
        duration: 100,
        mode: 'build',
      });
    }

    const results = log.query({ limit: 3 });

    expect(results.length).toBe(3);
  });

  test('getStats() returns correct totals', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'file_read',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 100,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'terraform_plan',
      toolInput: {},
      result: { output: 'Error', isError: true },
      duration: 5000,
      mode: 'plan',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'file_read',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 200,
      mode: 'build',
    });

    const stats = log.getStats();

    expect(stats.totalCalls).toBe(3);
    expect(stats.errorCount).toBe(1);
    // avg = (100 + 5000 + 200) / 3 = 1766.666... => round = 1767
    expect(stats.avgDuration).toBe(1767);
  });

  test('getStats() returns tool breakdown', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'file_read',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 10,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'file_read',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 10,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'terraform_plan',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 3000,
      mode: 'plan',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'git_commit',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 500,
      mode: 'build',
    });

    const stats = log.getStats();

    expect(stats.toolBreakdown['file_read']).toBe(2);
    expect(stats.toolBreakdown['terraform_plan']).toBe(1);
    expect(stats.toolBreakdown['git_commit']).toBe(1);
  });

  test('formatLog() produces readable output', () => {
    const now = new Date('2025-06-15T10:30:00Z');
    log.log({
      timestamp: now,
      sessionId: 's1',
      toolName: 'terraform_plan',
      toolInput: { dir: '/infra' },
      result: { output: 'Plan: 3 to add', isError: false },
      duration: 4200,
      mode: 'plan',
    });
    log.log({
      timestamp: new Date(now.getTime() + 60000),
      sessionId: 's1',
      toolName: 'terraform_apply',
      toolInput: { dir: '/infra' },
      result: { output: 'Error: access denied', isError: true },
      duration: 1200,
      mode: 'deploy',
    });

    const entries = log.query();
    const output = log.formatLog(entries);

    expect(output).toContain('Activity Log');
    expect(output).toContain('2 entries');
    expect(output).toContain('terraform_plan');
    expect(output).toContain('terraform_apply');
    expect(output).toContain('[OK]');
    expect(output).toContain('[ERROR]');
    expect(output).toContain('[plan]');
    expect(output).toContain('[deploy]');
    expect(output).toContain('1 errors');
  });

  test('formatLog() handles empty entries', () => {
    const output = log.formatLog([]);
    expect(output).toBe('No activity entries to display.');
  });

  test('clear() removes all entries', () => {
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'file_read',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 10,
      mode: 'build',
    });
    log.log({
      timestamp: new Date(),
      sessionId: 's1',
      toolName: 'git_status',
      toolInput: {},
      result: { output: '', isError: false },
      duration: 50,
      mode: 'build',
    });

    expect(log.query().length).toBe(2);

    log.clear();

    expect(log.query().length).toBe(0);
    expect(log.getStats().totalCalls).toBe(0);
  });
});
