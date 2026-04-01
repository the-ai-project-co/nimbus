/**
 * Audit & Security End-to-End Tests
 *
 * Tests security scanning on real files and compliance checking
 * with real Terraform configs in temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanSecurity, maskSecrets } from '../../src/audit/security-scanner';
import { checkCompliance } from '../../src/audit/compliance-checker';
import { ActivityLog } from '../../src/audit/activity-log';
import { CostTracker } from '../../src/audit/cost-tracker';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-e2e-audit-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Security Scanner — real files
// ---------------------------------------------------------------------------

describe('Security scanner — real file scanning', () => {
  it('detects hardcoded AWS access key in .env file', async () => {
    fs.writeFileSync(path.join(tmpDir, '.env'), 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nSECRET=mysecret');
    const result = await scanSecurity({ dir: tmpDir });
    expect(result.findings.length).toBeGreaterThan(0);
    const awsFinding = result.findings.find(f => f.title?.includes('AWS') || f.description?.includes('AKIA'));
    expect(awsFinding).toBeDefined();
  });

  it('detects private key in config file', async () => {
    // Use a .txt extension since .pem is not in the scanner's TEXT_EXTENSIONS set
    fs.writeFileSync(path.join(tmpDir, 'key.txt'), '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----');
    const result = await scanSecurity({ dir: tmpDir });
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it('returns clean for files without secrets', async () => {
    fs.writeFileSync(path.join(tmpDir, 'clean.ts'), 'const x = 42;\nexport default x;');
    const result = await scanSecurity({ dir: tmpDir });
    const relevant = result.findings.filter(f => f.file?.includes('clean.ts'));
    expect(relevant.length).toBe(0);
  });

  it('assigns severity to findings', async () => {
    fs.writeFileSync(path.join(tmpDir, 'secrets.env'), 'GITHUB_TOKEN=ghp_1234567890abcdef1234567890abcdef12345');
    const result = await scanSecurity({ dir: tmpDir });
    if (result.findings.length > 0) {
      expect(result.findings[0].severity).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// maskSecrets
// ---------------------------------------------------------------------------

describe('maskSecrets — end-to-end', () => {
  it('masks AWS access keys', () => {
    const input = 'Key: AKIAIOSFODNN7EXAMPLE';
    const masked = maskSecrets(input);
    expect(masked).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(masked).toContain('[AWS_ACCESS_KEY]');
  });

  it('masks private key blocks', () => {
    const input = 'cert: -----BEGIN RSA PRIVATE KEY-----\ndata\n-----END RSA PRIVATE KEY-----';
    const masked = maskSecrets(input);
    expect(masked).not.toContain('BEGIN RSA PRIVATE KEY');
  });

  it('passes through clean text unchanged', () => {
    const input = 'This is clean text with no secrets.';
    expect(maskSecrets(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// Compliance checker — real Terraform files
// ---------------------------------------------------------------------------

describe('Compliance checker — real files', () => {
  it('checks SOC2 compliance on Terraform dir', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), `
      resource "aws_s3_bucket" "data" {
        bucket = "my-data-bucket"
      }
      resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
        bucket = aws_s3_bucket.data.id
        rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
      }
    `);
    const reports = await checkCompliance({ dir: tmpDir, frameworks: ['SOC2'] });
    expect(reports.length).toBe(1);
    const report = reports[0];
    expect(report).toBeDefined();
    expect(report.framework).toBe('SOC2');
    expect(typeof report.score).toBe('number');
  });

  it('generates scorecard with controls', async () => {
    fs.writeFileSync(path.join(tmpDir, 'main.tf'), 'resource "aws_instance" "web" {}');
    const reports = await checkCompliance({ dir: tmpDir, frameworks: ['SOC2'] });
    expect(reports.length).toBe(1);
    const report = reports[0];
    expect(report.controls).toBeDefined();
    expect(Array.isArray(report.controls)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

describe('ActivityLog — end-to-end', () => {
  it('records and retrieves entries', () => {
    const log = new ActivityLog();
    log.log({ timestamp: new Date(), toolName: 'terraform', toolInput: {}, result: { output: 'ok', isError: false }, duration: 100, sessionId: 'sess-1', mode: 'plan' });
    log.log({ timestamp: new Date(), toolName: 'kubectl', toolInput: {}, result: { output: 'ok', isError: false }, duration: 200, sessionId: 'sess-1', mode: 'build' });

    const entries = log.query();
    expect(entries.length).toBe(2);
    expect(entries[0].toolName).toBeDefined();
  });

  it('filters by tool name', () => {
    const log = new ActivityLog();
    log.log({ timestamp: new Date(), toolName: 'terraform', toolInput: {}, result: { output: 'ok', isError: false }, duration: 100, sessionId: 's1', mode: 'plan' });
    log.log({ timestamp: new Date(), toolName: 'kubectl', toolInput: {}, result: { output: 'ok', isError: false }, duration: 200, sessionId: 's1', mode: 'plan' });
    log.log({ timestamp: new Date(), toolName: 'terraform', toolInput: {}, result: { output: 'ok', isError: false }, duration: 300, sessionId: 's1', mode: 'plan' });

    const tfEntries = log.query({ toolName: 'terraform' });
    expect(tfEntries.length).toBe(2);
  });

  it('getStats returns aggregation', () => {
    const log = new ActivityLog();
    log.log({ timestamp: new Date(), toolName: 'terraform', toolInput: {}, result: { output: 'ok', isError: false }, duration: 100, sessionId: 's1', mode: 'plan' });
    log.log({ timestamp: new Date(), toolName: 'terraform', toolInput: {}, result: { output: 'ok', isError: false }, duration: 200, sessionId: 's1', mode: 'plan' });

    const stats = log.getStats();
    expect(stats.totalCalls).toBe(2);
  });

  it('clear removes all entries', () => {
    const log = new ActivityLog();
    log.log({ timestamp: new Date(), toolName: 'test', toolInput: {}, result: { output: 'ok', isError: false }, duration: 100, sessionId: 's1', mode: 'plan' });
    log.clear();
    expect(log.query().length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cost Tracker
// ---------------------------------------------------------------------------

describe('CostTracker — end-to-end', () => {
  it('tracks LLM costs and generates summary', () => {
    const tracker = new CostTracker();
    tracker.recordLLMCost({ model: 'claude-3-5-sonnet', inputTokens: 1000, outputTokens: 500, costUSD: 0.015, sessionId: 's1' });
    tracker.recordLLMCost({ model: 'gpt-4o', inputTokens: 2000, outputTokens: 1000, costUSD: 0.03, sessionId: 's1' });

    const summary = tracker.getSummary();
    expect(summary.totalCost).toBeCloseTo(0.045);
  });

  it('tracks infra costs separately', () => {
    const tracker = new CostTracker();
    tracker.recordLLMCost({ model: 'claude', inputTokens: 100, outputTokens: 50, costUSD: 0.01, sessionId: 's1' });
    tracker.recordInfraCost({ description: 'ec2 instance', monthlyCost: 1.50, sessionId: 's1' });

    const summary = tracker.getSummary();
    expect(summary.totalCost).toBeCloseTo(1.51);
  });

  it('generates formatted summary string', () => {
    const tracker = new CostTracker();
    tracker.recordLLMCost({ model: 'claude', inputTokens: 100, outputTokens: 50, costUSD: 0.01, sessionId: 's1' });
    const summary = tracker.getSummary();
    const formatted = tracker.formatSummary(summary);
    expect(formatted).toContain('$');
    expect(formatted.length).toBeGreaterThan(0);
  });
});
