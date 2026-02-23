/**
 * Security Scanning Subagent
 *
 * Scans codebases for vulnerabilities, leaked secrets, and
 * misconfigurations. Reports findings with severity levels and
 * remediation guidance.
 *
 * @module agent/subagents/security
 */

import { Subagent, type SubagentConfig } from './base';
import {
  readFileTool,
  globTool,
  grepTool,
  listDirTool,
} from '../../tools/schemas/standard';

// ---------------------------------------------------------------------------
// Security Patterns
// ---------------------------------------------------------------------------

/**
 * Common security anti-patterns the subagent is instructed to scan for.
 * These are embedded in the system prompt so the LLM knows what to look for.
 */
const SECURITY_PATTERNS = [
  'AWS access keys (AKIA...)',
  'Private keys (.pem, .key)',
  'Hardcoded passwords',
  'Open security groups (0.0.0.0/0)',
  'Unencrypted S3 buckets',
  'Missing HTTPS/TLS',
  'SQL injection vectors',
  'XSS vulnerabilities',
  'Exposed secrets in env files',
  'Overly permissive IAM policies',
] as const;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const securityConfig: SubagentConfig = {
  name: 'security',
  description:
    'Security auditor — scans for vulnerabilities, leaked secrets, and misconfigurations.',
  systemPrompt: `You are a security auditor subagent. You scan codebases for security issues.

Scan for:
${SECURITY_PATTERNS.map((p) => `- ${p}`).join('\n')}

Rules:
- Search systematically — use grep for patterns, glob to find config files
- Report findings with severity levels (CRITICAL, HIGH, MEDIUM, LOW)
- Include file paths and line numbers for every finding
- Suggest remediation steps
- Do NOT modify any files
- Do NOT spawn further subagents`,
  tools: [readFileTool, globTool, grepTool, listDirTool],
  model: 'anthropic/claude-sonnet-4-20250514',
  maxTurns: 20,
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create a new security scanning subagent instance. */
export function createSecuritySubagent(): Subagent {
  return new Subagent(securityConfig);
}

export { securityConfig };
