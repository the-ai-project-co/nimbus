/**
 * GAP-11, GAP-18, GAP-20 Tests
 *
 * GAP-11: Terraform plan → FileDiffBatch wiring
 *   - parseTerraformPlanOutput with various plan outputs
 *   - buildFileDiffBatchFromPlan output shape
 *   - requestFileDiff callback called after terraform plan
 *
 * GAP-18: IaC validation after writing .tf files
 *   - .tf file detection from tool name and path
 *   - terraform validate error injection into tool result
 *
 * GAP-20: Per-tool timeout from NIMBUS.md
 *   - parseToolTimeouts function parsing
 *   - timeout propagation to ToolExecuteContext
 *   - NIMBUS.md ## Tool Timeouts section parsing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseTerraformPlanOutput,
  buildFileDiffBatchFromPlan,
  type ResourceChange,
  type DeployPreview,
} from '../agent/deploy-preview';
import { ToolRegistry } from '../tools/schemas/types';
import type { ToolDefinition, ToolExecuteContext } from '../tools/schemas/types';
import type { FileDiffDecision } from '../agent/loop';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// GAP-11 Tests: parseTerraformPlanOutput
// ---------------------------------------------------------------------------

describe('GAP-11 — parseTerraformPlanOutput', () => {
  it('parses a create resource line', () => {
    const output = `  # aws_instance.web will be created`;
    const changes = parseTerraformPlanOutput(output);
    expect(changes).toHaveLength(1);
    expect(changes[0].resource).toBe('aws_instance.web');
    expect(changes[0].action).toBe('create');
  });

  it('parses an update resource line', () => {
    const output = `  # aws_s3_bucket.data will be updated in-place`;
    const changes = parseTerraformPlanOutput(output);
    expect(changes).toHaveLength(1);
    expect(changes[0].resource).toBe('aws_s3_bucket.data');
    expect(changes[0].action).toBe('update');
  });

  it('parses a destroy resource line', () => {
    const output = `  # aws_security_group.old will be destroyed`;
    const changes = parseTerraformPlanOutput(output);
    expect(changes).toHaveLength(1);
    expect(changes[0].resource).toBe('aws_security_group.old');
    expect(changes[0].action).toBe('destroy');
  });

  it('parses a replace resource line', () => {
    const output = `  # aws_instance.app must be replaced`;
    const changes = parseTerraformPlanOutput(output);
    expect(changes).toHaveLength(1);
    expect(changes[0].resource).toBe('aws_instance.app');
    expect(changes[0].action).toBe('replace');
  });

  it('parses multiple resources in a plan output', () => {
    const output = [
      '  # aws_vpc.main will be created',
      '  # aws_subnet.public will be created',
      '  # aws_instance.old will be destroyed',
      '  # aws_instance.web will be updated in-place',
      '  # aws_rds_cluster.db must be replaced',
    ].join('\n');
    const changes = parseTerraformPlanOutput(output);
    expect(changes).toHaveLength(5);
    expect(changes.filter(c => c.action === 'create')).toHaveLength(2);
    expect(changes.filter(c => c.action === 'destroy')).toHaveLength(1);
    expect(changes.filter(c => c.action === 'update')).toHaveLength(1);
    expect(changes.filter(c => c.action === 'replace')).toHaveLength(1);
  });

  it('falls back to summary line when no resource lines present', () => {
    const output = `Plan: 2 to add, 1 to change, 1 to destroy.`;
    const changes = parseTerraformPlanOutput(output);
    expect(changes).toHaveLength(4);
    expect(changes.filter(c => c.action === 'create')).toHaveLength(2);
    expect(changes.filter(c => c.action === 'update')).toHaveLength(1);
    expect(changes.filter(c => c.action === 'destroy')).toHaveLength(1);
  });

  it('returns empty array for plan with no changes', () => {
    const output = `No changes. Your infrastructure matches the configuration.`;
    const changes = parseTerraformPlanOutput(output);
    expect(changes).toHaveLength(0);
  });

  it('ignores the summary line if individual resource lines were already parsed', () => {
    const output = [
      '  # aws_instance.web will be created',
      'Plan: 3 to add, 0 to change, 0 to destroy.',
    ].join('\n');
    const changes = parseTerraformPlanOutput(output);
    // Should only have 1 entry from the resource line, not 3+1
    expect(changes).toHaveLength(1);
    expect(changes[0].resource).toBe('aws_instance.web');
  });

  it('handles module-prefixed resource names', () => {
    const output = `  # module.vpc.aws_vpc.main will be created`;
    const changes = parseTerraformPlanOutput(output);
    expect(changes).toHaveLength(1);
    expect(changes[0].resource).toBe('module.vpc.aws_vpc.main');
  });

  it('parses plan with only destroy actions', () => {
    const output = [
      '  # aws_route53_record.old will be destroyed',
      '  # aws_iam_role.legacy will be destroyed',
    ].join('\n');
    const changes = parseTerraformPlanOutput(output);
    expect(changes).toHaveLength(2);
    expect(changes.every(c => c.action === 'destroy')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GAP-11 Tests: buildFileDiffBatchFromPlan
// ---------------------------------------------------------------------------

describe('GAP-11 — buildFileDiffBatchFromPlan', () => {
  function makePreview(changes: ResourceChange[]): DeployPreview {
    return {
      tool: 'terraform',
      action: 'plan',
      workdir: '/tmp/infra',
      changes,
      summary: {
        toCreate: changes.filter(c => c.action === 'create').length,
        toUpdate: changes.filter(c => c.action === 'update').length,
        toDestroy: changes.filter(c => c.action === 'destroy').length,
        toReplace: changes.filter(c => c.action === 'replace').length,
        unchanged: 0,
      },
      rawOutput: '',
      success: true,
    };
  }

  it('returns one entry per resource change', () => {
    const preview = makePreview([
      { resource: 'aws_instance.web', action: 'create' },
      { resource: 'aws_s3_bucket.data', action: 'update' },
    ]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch).toHaveLength(2);
  });

  it('each entry has filePath, diff, and toolName', () => {
    const preview = makePreview([{ resource: 'aws_vpc.main', action: 'create' }]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch[0]).toHaveProperty('filePath');
    expect(batch[0]).toHaveProperty('diff');
    expect(batch[0]).toHaveProperty('toolName');
  });

  it('filePath equals the resource name', () => {
    const preview = makePreview([{ resource: 'aws_instance.app', action: 'destroy' }]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch[0].filePath).toBe('aws_instance.app');
  });

  it('toolName is "terraform" for all entries', () => {
    const preview = makePreview([
      { resource: 'aws_vpc.main', action: 'create' },
      { resource: 'aws_subnet.pub', action: 'update' },
    ]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch.every(b => b.toolName === 'terraform')).toBe(true);
  });

  it('diff contains a unified diff header', () => {
    const preview = makePreview([{ resource: 'aws_instance.web', action: 'create' }]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch[0].diff).toContain('--- a/aws_instance.web');
    expect(batch[0].diff).toContain('+++ b/aws_instance.web');
  });

  it('diff uses "+" symbol for create action', () => {
    const preview = makePreview([{ resource: 'aws_lambda.fn', action: 'create' }]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch[0].diff).toContain('+ aws_lambda.fn');
  });

  it('diff uses "-" symbol for destroy action', () => {
    const preview = makePreview([{ resource: 'aws_iam_role.old', action: 'destroy' }]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch[0].diff).toContain('- aws_iam_role.old');
  });

  it('diff uses "~" symbol for update action', () => {
    const preview = makePreview([{ resource: 'aws_rds_instance.db', action: 'update' }]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch[0].diff).toContain('~ aws_rds_instance.db');
  });

  it('diff includes details when present', () => {
    const preview = makePreview([
      { resource: 'aws_instance.web', action: 'create', details: 'ami changed' },
    ]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch[0].diff).toContain('ami changed');
  });

  it('returns empty array for plan with no changes', () => {
    const preview = makePreview([]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch).toHaveLength(0);
  });

  it('handles replace action correctly', () => {
    const preview = makePreview([{ resource: 'aws_instance.app', action: 'replace' }]);
    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch[0].diff).toContain('+/-');
  });
});

// ---------------------------------------------------------------------------
// GAP-11 Tests: requestFileDiff callback integration
// ---------------------------------------------------------------------------

describe('GAP-11 — requestFileDiff callback with terraform plan', () => {
  it('parseTerraformPlanOutput + buildFileDiffBatchFromPlan together produce requestable diffs', () => {
    const planOutput = [
      '  # aws_instance.web will be created',
      '  # aws_security_group.main will be updated in-place',
    ].join('\n');

    const changes = parseTerraformPlanOutput(planOutput);
    expect(changes).toHaveLength(2);

    // Build a minimal preview to feed buildFileDiffBatchFromPlan
    const preview: DeployPreview = {
      tool: 'terraform',
      action: 'plan',
      workdir: '/tmp',
      changes,
      summary: { toCreate: 1, toUpdate: 1, toDestroy: 0, toReplace: 0, unchanged: 0 },
      rawOutput: planOutput,
      success: true,
    };

    const batch = buildFileDiffBatchFromPlan(preview);
    expect(batch).toHaveLength(2);

    // Simulate the requestFileDiff callback being called for each
    const calls: Array<[string, string, string]> = [];
    const fakeRequestFileDiff = async (path: string, toolName: string, diff: string): Promise<FileDiffDecision> => {
      calls.push([path, toolName, diff]);
      return 'apply';
    };

    // Run through the batch as loop.ts would
    const runBatch = async () => {
      for (const file of batch) {
        const decision = await fakeRequestFileDiff(file.filePath, file.toolName ?? 'terraform', file.diff ?? '');
        if (decision === 'reject-all') break;
      }
    };

    return runBatch().then(() => {
      expect(calls).toHaveLength(2);
      expect(calls[0][0]).toBe('aws_instance.web');
      expect(calls[0][1]).toBe('terraform');
      expect(calls[1][0]).toBe('aws_security_group.main');
    });
  });

  it('stops iteration on reject-all decision', async () => {
    const changes: ResourceChange[] = [
      { resource: 'aws_vpc.main', action: 'create' },
      { resource: 'aws_subnet.pub', action: 'create' },
      { resource: 'aws_sg.main', action: 'create' },
    ];
    const preview: DeployPreview = {
      tool: 'terraform', action: 'plan', workdir: '/tmp',
      changes, summary: { toCreate: 3, toUpdate: 0, toDestroy: 0, toReplace: 0, unchanged: 0 },
      rawOutput: '', success: true,
    };

    const batch = buildFileDiffBatchFromPlan(preview);
    const callCount = { n: 0 };
    const fakeRequestFileDiff = async (_path: string, _toolName: string, _diff: string): Promise<FileDiffDecision> => {
      callCount.n++;
      return callCount.n === 1 ? 'reject-all' : 'apply';
    };

    for (const file of batch) {
      const decision = await fakeRequestFileDiff(file.filePath, file.toolName ?? 'terraform', file.diff ?? '');
      if (decision === 'reject-all') break;
    }

    // Only 1 call should have been made before reject-all stopped iteration
    expect(callCount.n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GAP-18 Tests: .tf file detection
// ---------------------------------------------------------------------------

describe('GAP-18 — .tf file detection logic', () => {
  const FILE_WRITING_TOOLS = ['write_file', 'edit_file', 'multi_edit'];

  function shouldValidateTf(toolName: string, filePath: string): boolean {
    return FILE_WRITING_TOOLS.includes(toolName) && filePath.endsWith('.tf');
  }

  it('detects .tf extension for write_file with path', () => {
    expect(shouldValidateTf('write_file', 'main.tf')).toBe(true);
    expect(shouldValidateTf('write_file', '/infra/main.tf')).toBe(true);
  });

  it('detects .tf extension for edit_file', () => {
    expect(shouldValidateTf('edit_file', 'variables.tf')).toBe(true);
  });

  it('detects .tf extension for multi_edit', () => {
    expect(shouldValidateTf('multi_edit', 'outputs.tf')).toBe(true);
  });

  it('does NOT trigger for non-.tf files', () => {
    expect(shouldValidateTf('write_file', 'main.py')).toBe(false);
    expect(shouldValidateTf('write_file', 'values.yaml')).toBe(false);
    expect(shouldValidateTf('write_file', 'Dockerfile')).toBe(false);
    expect(shouldValidateTf('write_file', 'main.tfvars')).toBe(false);
  });

  it('does NOT trigger for non-file tools even with .tf in name', () => {
    expect(shouldValidateTf('bash', 'something.tf')).toBe(false);
    expect(shouldValidateTf('terraform', 'main.tf')).toBe(false);
    expect(shouldValidateTf('read_file', 'main.tf')).toBe(false);
  });

  it('handles empty path without error', () => {
    expect(shouldValidateTf('write_file', '')).toBe(false);
  });

  it('recognizes nested .tf paths', () => {
    expect(shouldValidateTf('write_file', '/home/user/project/modules/vpc/main.tf')).toBe(true);
  });

  it('does NOT match .tf.bak or other .tf-prefixed extensions', () => {
    expect(shouldValidateTf('write_file', 'main.tf.bak')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GAP-18 Tests: terraform validate error injection
// ---------------------------------------------------------------------------

describe('GAP-18 — terraform validate error injection', () => {
  it('produces correct error string from diagnostics', () => {
    const diagnostics = [
      { severity: 'error', summary: 'Missing required argument', detail: '"name" is required' },
      { severity: 'error', summary: 'Invalid value', detail: '"region" must be a string' },
    ];
    const errors = diagnostics
      .filter(d => d.severity === 'error')
      .map(d => `  ${d.summary}: ${d.detail}`)
      .join('\n');
    const suffix = `\n\nTerraform validation errors (please fix):\n${errors}`;
    expect(suffix).toContain('Missing required argument');
    expect(suffix).toContain('"name" is required');
    expect(suffix).toContain('Invalid value');
    expect(suffix).toContain('"region" must be a string');
  });

  it('filters out warning-level diagnostics', () => {
    const diagnostics = [
      { severity: 'error', summary: 'Missing required argument', detail: '"name" is required' },
      { severity: 'warning', summary: 'Deprecated', detail: 'Use newer syntax' },
    ];
    const errors = diagnostics
      .filter(d => d.severity === 'error')
      .map(d => `  ${d.summary}: ${d.detail}`)
      .join('\n');
    expect(errors).toContain('Missing required argument');
    expect(errors).not.toContain('Deprecated');
  });

  it('produces no suffix when valid is true', () => {
    const parsed = { valid: true, diagnostics: [] };
    let toolContent = 'Success';
    if (!parsed.valid && parsed.diagnostics && parsed.diagnostics.length > 0) {
      toolContent += '\n\nTerraform validation errors (please fix):';
    }
    expect(toolContent).toBe('Success');
  });

  it('produces suffix when valid is false and errors exist', () => {
    const parsed = {
      valid: false,
      diagnostics: [{ severity: 'error', summary: 'Error', detail: 'Something wrong' }],
    };
    let toolContent = 'File written';
    if (!parsed.valid && parsed.diagnostics && parsed.diagnostics.length > 0) {
      const errors = parsed.diagnostics
        .filter(d => d.severity === 'error')
        .map(d => `  ${d.summary}: ${d.detail}`)
        .join('\n');
      toolContent += `\n\nTerraform validation errors (please fix):\n${errors}`;
    }
    expect(toolContent).toContain('Terraform validation errors (please fix)');
    expect(toolContent).toContain('File written');
    expect(toolContent).toContain('Something wrong');
  });

  it('handles diagnostics with empty detail gracefully', () => {
    const diagnostics = [
      { severity: 'error', summary: 'Syntax error', detail: '' },
    ];
    const errors = diagnostics
      .filter(d => d.severity === 'error')
      .map(d => `  ${d.summary}: ${d.detail}`)
      .join('\n');
    expect(errors).toContain('Syntax error');
    expect(errors).toContain(':');
  });

  it('handles empty diagnostics array without suffix', () => {
    const parsed = { valid: false, diagnostics: [] as Array<{severity: string; summary: string; detail: string}> };
    let toolContent = 'File written';
    if (!parsed.valid && parsed.diagnostics && parsed.diagnostics.length > 0) {
      const errors = parsed.diagnostics
        .filter(d => d.severity === 'error')
        .map(d => `  ${d.summary}: ${d.detail}`)
        .join('\n');
      toolContent += `\n\nTerraform validation errors (please fix):\n${errors}`;
    }
    // No errors even though valid is false (empty diagnostics)
    expect(toolContent).toBe('File written');
  });
});

// ---------------------------------------------------------------------------
// GAP-20 Tests: parseToolTimeouts function
// ---------------------------------------------------------------------------

// Inline reproduction of parseToolTimeouts from ink/index.ts so we can unit-test it
function parseToolTimeouts(nimbusMd: string): Record<string, number> {
  const result: Record<string, number> = {};
  const match = nimbusMd.match(/##\s+Tool Timeouts\s*\n([\s\S]*?)(?=##|$)/);
  if (!match) return result;
  for (const line of match[1].split('\n')) {
    const m = line.match(/^\s*([a-z_]+)\s*:\s*(\d+)\s*$/);
    if (m) result[m[1]] = parseInt(m[2], 10);
  }
  return result;
}

describe('GAP-20 — parseToolTimeouts', () => {
  it('returns empty object when no Tool Timeouts section', () => {
    const nimbusMd = `## Project\nThis is a test project.\n\n## Instructions\nDo stuff.`;
    const result = parseToolTimeouts(nimbusMd);
    expect(result).toEqual({});
  });

  it('parses a single tool timeout', () => {
    const nimbusMd = `## Tool Timeouts\nterraform: 300000\n`;
    const result = parseToolTimeouts(nimbusMd);
    expect(result).toEqual({ terraform: 300000 });
  });

  it('parses multiple tool timeouts', () => {
    const nimbusMd = `## Tool Timeouts\nterraform: 600000\nkubectl: 120000\nhelm: 300000\n`;
    const result = parseToolTimeouts(nimbusMd);
    expect(result).toEqual({ terraform: 600000, kubectl: 120000, helm: 300000 });
  });

  it('parses tool timeouts with leading whitespace', () => {
    const nimbusMd = `## Tool Timeouts\n  terraform: 300000\n  kubectl: 60000\n`;
    const result = parseToolTimeouts(nimbusMd);
    expect(result).toEqual({ terraform: 300000, kubectl: 60000 });
  });

  it('stops at the next ## section', () => {
    const nimbusMd = `## Tool Timeouts\nterraform: 300000\n\n## Other Section\nkubectl: 999999\n`;
    const result = parseToolTimeouts(nimbusMd);
    // Only terraform should be parsed; kubectl appears after the next ##
    expect(result).toHaveProperty('terraform', 300000);
    expect(result).not.toHaveProperty('kubectl');
  });

  it('ignores non-matching lines in the section', () => {
    const nimbusMd = `## Tool Timeouts\n# comment line\nterraform: 300000\nsome_text without colon\n`;
    const result = parseToolTimeouts(nimbusMd);
    expect(result).toEqual({ terraform: 300000 });
  });

  it('ignores lines with non-numeric values', () => {
    const nimbusMd = `## Tool Timeouts\nterraform: fast\nkubectl: 120000\n`;
    const result = parseToolTimeouts(nimbusMd);
    // Only kubectl has a numeric value
    expect(result).toEqual({ kubectl: 120000 });
  });

  it('ignores tool names with uppercase letters', () => {
    const nimbusMd = `## Tool Timeouts\nTerraform: 300000\nkubectl: 120000\n`;
    const result = parseToolTimeouts(nimbusMd);
    // Terraform (capital T) doesn't match [a-z_]+ pattern
    expect(result).toEqual({ kubectl: 120000 });
  });

  it('parses tool names with underscores', () => {
    const nimbusMd = `## Tool Timeouts\ncloud_discover: 30000\nkubectl_context: 60000\n`;
    const result = parseToolTimeouts(nimbusMd);
    expect(result).toEqual({ cloud_discover: 30000, kubectl_context: 60000 });
  });

  it('handles Tool Timeouts section at end of file without trailing ##', () => {
    const nimbusMd = `## Project\nMy project.\n\n## Tool Timeouts\nterraform: 450000`;
    const result = parseToolTimeouts(nimbusMd);
    expect(result).toEqual({ terraform: 450000 });
  });

  it('returns integer values (not floats)', () => {
    const nimbusMd = `## Tool Timeouts\nterraform: 300000\n`;
    const result = parseToolTimeouts(nimbusMd);
    expect(Number.isInteger(result.terraform)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GAP-20 Tests: ToolExecuteContext timeout field
// ---------------------------------------------------------------------------

describe('GAP-20 — ToolExecuteContext.timeout field', () => {
  it('ToolExecuteContext accepts a timeout field', async () => {
    const { z } = await import('zod');
    let capturedCtx: ToolExecuteContext | undefined;

    const tool: ToolDefinition = {
      name: 'test_timeout_tool',
      description: 'A test tool that captures context',
      inputSchema: z.object({ value: z.string() }),
      permissionTier: 'auto_allow',
      category: 'devops',
      execute: async (_input: unknown, ctx?: ToolExecuteContext) => {
        capturedCtx = ctx;
        return { output: 'ok', isError: false };
      },
    };

    const ctx: ToolExecuteContext = { timeout: 30000 };
    await tool.execute({ value: 'test' }, ctx);
    expect(capturedCtx?.timeout).toBe(30000);
  });

  it('ToolExecuteContext.timeout is optional', async () => {
    const { z } = await import('zod');
    let capturedCtx: ToolExecuteContext | undefined;

    const tool: ToolDefinition = {
      name: 'test_no_timeout_tool',
      description: 'A test tool',
      inputSchema: z.object({ value: z.string() }),
      permissionTier: 'auto_allow',
      category: 'devops',
      execute: async (_input: unknown, ctx?: ToolExecuteContext) => {
        capturedCtx = ctx;
        return { output: 'ok', isError: false };
      },
    };

    await tool.execute({ value: 'test' }, {});
    expect(capturedCtx?.timeout).toBeUndefined();
  });

  it('ToolExecuteContext can have both onProgress and timeout', async () => {
    const { z } = await import('zod');
    let capturedCtx: ToolExecuteContext | undefined;

    const tool: ToolDefinition = {
      name: 'test_full_ctx_tool',
      description: 'A test tool',
      inputSchema: z.object({}),
      permissionTier: 'auto_allow',
      category: 'standard',
      execute: async (_input: unknown, ctx?: ToolExecuteContext) => {
        capturedCtx = ctx;
        return { output: 'ok', isError: false };
      },
    };

    const chunks: string[] = [];
    const ctx: ToolExecuteContext = {
      onProgress: (chunk) => chunks.push(chunk),
      timeout: 45000,
    };
    await tool.execute({}, ctx);
    expect(capturedCtx?.timeout).toBe(45000);
    expect(capturedCtx?.onProgress).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// GAP-20 Tests: toolTimeouts propagation in AgentLoopOptions
// ---------------------------------------------------------------------------

describe('GAP-20 — toolTimeouts in AgentLoopOptions (type check)', () => {
  it('AgentLoopOptions type includes toolTimeouts field', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    // Verify the toolTimeouts field is defined in AgentLoopOptions
    expect(loopSrc).toContain('toolTimeouts?: Record<string, number>');
  });

  it('executeToolCall signature includes toolTimeouts parameter', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    // Verify toolTimeouts is a parameter of executeToolCall
    expect(loopSrc).toContain('toolTimeouts?: Record<string, number>');
    // Verify the GAP-20 comment is present
    expect(loopSrc).toContain('GAP-20');
  });

  it('loop.ts passes options.toolTimeouts to executeToolCall', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain('options.toolTimeouts');
  });

  it('loop.ts builds toolCtx with timeout field', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain('toolTimeouts?.[toolName]');
  });
});

// ---------------------------------------------------------------------------
// GAP-20 Tests: devops.ts DEFAULT_TIMEOUT usage
// ---------------------------------------------------------------------------

describe('GAP-20 — devops.ts DEFAULT_TIMEOUT constant', () => {
  it('DEFAULT_TIMEOUT constant is defined in devops.ts', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const devopsSrc = readFileSync(join(__dirname, '..', 'tools', 'schemas', 'devops.ts'), 'utf-8');
    expect(devopsSrc).toContain('const DEFAULT_TIMEOUT = 600_000');
  });

  it('terraform spawnExec uses ctx?.timeout ?? DEFAULT_TIMEOUT', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const devopsSrc = readFileSync(join(__dirname, '..', 'tools', 'schemas', 'devops.ts'), 'utf-8');
    expect(devopsSrc).toContain('ctx?.timeout ?? DEFAULT_TIMEOUT');
  });

  it('kubectl spawnExec uses ctx?.timeout override', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const devopsSrc = readFileSync(join(__dirname, '..', 'tools', 'schemas', 'devops.ts'), 'utf-8');
    // kubectl uses ctx?.timeout ?? defaultKubectlTimeoutMs
    expect(devopsSrc).toContain('ctx?.timeout ?? defaultKubectlTimeoutMs');
  });

  it('helm spawnExec uses ctx?.timeout ?? DEFAULT_TIMEOUT', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const devopsSrc = readFileSync(join(__dirname, '..', 'tools', 'schemas', 'devops.ts'), 'utf-8');
    // There should be at least 2 occurrences of ctx?.timeout ?? DEFAULT_TIMEOUT (terraform + helm)
    const occurrences = (devopsSrc.match(/ctx\?\.timeout \?\? DEFAULT_TIMEOUT/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// GAP-20 Tests: ink/index.ts parseToolTimeouts integration
// ---------------------------------------------------------------------------

describe('GAP-20 — ink/index.ts parseToolTimeouts integration', () => {
  it('parseToolTimeouts function is defined in ink/index.ts source', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const inkSrc = readFileSync(join(__dirname, '..', 'ui', 'ink', 'index.ts'), 'utf-8');
    expect(inkSrc).toContain('function parseToolTimeouts');
  });

  it('ink/index.ts passes toolTimeouts to runAgentLoop', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const inkSrc = readFileSync(join(__dirname, '..', 'ui', 'ink', 'index.ts'), 'utf-8');
    expect(inkSrc).toContain('toolTimeouts:');
    expect(inkSrc).toContain('parseToolTimeouts(nimbusInstructions)');
  });

  it('parseToolTimeouts uses the ## Tool Timeouts section regex', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const inkSrc = readFileSync(join(__dirname, '..', 'ui', 'ink', 'index.ts'), 'utf-8');
    expect(inkSrc).toContain('Tool Timeouts');
    expect(inkSrc).toContain('[a-z_]+');
  });
});

// ---------------------------------------------------------------------------
// GAP-11 Tests: loop.ts FileDiff wiring source check
// ---------------------------------------------------------------------------

describe('GAP-11 — loop.ts FileDiff wiring', () => {
  it('loop.ts contains GAP-11 comment for FileDiff trigger', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain('GAP-11');
  });

  it('loop.ts imports parseTerraformPlanOutput from deploy-preview', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain('parseTerraformPlanOutput');
    expect(loopSrc).toContain('buildFileDiffBatchFromPlan');
    expect(loopSrc).toContain('./deploy-preview');
  });

  it('loop.ts checks for terraform plan action before calling FileDiff', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain("action === 'plan'");
    expect(loopSrc).toContain('options.requestFileDiff');
  });

  it('loop.ts breaks on reject-all decision in FileDiff loop', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    // The GAP-11 block should break on reject-all
    expect(loopSrc).toContain("decision === 'reject-all'");
    expect(loopSrc).toContain('break');
  });
});

// ---------------------------------------------------------------------------
// GAP-18 Tests: loop.ts IaC validation wiring source check
// ---------------------------------------------------------------------------

describe('GAP-18 — loop.ts IaC validation wiring', () => {
  it('loop.ts contains GAP-18 comment for terraform validate', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain('GAP-18');
  });

  it('loop.ts checks for .tf file extension', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain(".endsWith('.tf')");
  });

  it('loop.ts runs terraform validate -json', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain('terraform validate -json');
  });

  it('loop.ts checks for write_file, edit_file, multi_edit tool names', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain('write_file');
    expect(loopSrc).toContain('edit_file');
    expect(loopSrc).toContain('multi_edit');
  });

  it('loop.ts appends validation errors to toolContent', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain('Terraform validation errors (please fix)');
  });

  it('loop.ts uses 10 second timeout for validate command', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const loopSrc = readFileSync(join(__dirname, '..', 'agent', 'loop.ts'), 'utf-8');
    expect(loopSrc).toContain('timeout: 10_000');
  });
});

// ---------------------------------------------------------------------------
// Integration: parseToolTimeouts with a realistic NIMBUS.md
// ---------------------------------------------------------------------------

describe('GAP-20 — parseToolTimeouts with realistic NIMBUS.md', () => {
  const realisticNimbusMd = `# NIMBUS.md

## Project
This is an AWS infrastructure project using Terraform and Kubernetes.

## Cloud Context
- AWS Account: 123456789012
- Region: us-east-1

## Tool Timeouts
terraform: 900000
kubectl: 180000
helm: 600000
cloud_discover: 30000

## Instructions
Always run terraform plan before apply.
`;

  it('parses all tool timeouts from a realistic NIMBUS.md', () => {
    const result = parseToolTimeouts(realisticNimbusMd);
    expect(result.terraform).toBe(900000);
    expect(result.kubectl).toBe(180000);
    expect(result.helm).toBe(600000);
    expect(result.cloud_discover).toBe(30000);
  });

  it('does not include keys from other sections', () => {
    const result = parseToolTimeouts(realisticNimbusMd);
    expect(Object.keys(result)).toHaveLength(4);
  });

  it('returns correct types (numbers not strings)', () => {
    const result = parseToolTimeouts(realisticNimbusMd);
    for (const value of Object.values(result)) {
      expect(typeof value).toBe('number');
    }
  });

  it('handles NIMBUS.md with no Tool Timeouts section gracefully', () => {
    const minimal = `# NIMBUS.md\n\n## Project\nSome project.\n`;
    const result = parseToolTimeouts(minimal);
    expect(result).toEqual({});
  });

  it('handles NIMBUS.md where Tool Timeouts is the last section', () => {
    const lastSection = `# NIMBUS.md\n\n## Project\nSome project.\n\n## Tool Timeouts\nbash: 60000\n`;
    const result = parseToolTimeouts(lastSection);
    expect(result.bash).toBe(60000);
  });
});

// ---------------------------------------------------------------------------
// H2: Parallel read-only tool dispatch
// ---------------------------------------------------------------------------

describe('parallel read-only tool dispatch (H2)', () => {
  it('loop.ts contains READ_ONLY_TOOLS set', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('READ_ONLY_TOOLS');
  });

  it('READ_ONLY_TOOLS includes cloud_discover and read_file', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain("'cloud_discover'");
    expect(src).toContain("'read_file'");
  });

  it('parallel dispatch uses Promise.allSettled', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('Promise.allSettled');
  });

  it('allReadOnly check requires length > 1', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('allReadOnly && responseToolCalls.length > 1');
  });

  it('cloudDiscoverTool schema has regions array field', async () => {
    const { devopsTools } = await import('../tools/schemas/devops');
    const tool = devopsTools.find(t => t.name === 'cloud_discover');
    expect(tool).toBeDefined();
    // Schema should have regions field
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/tools/schemas/devops.ts'), 'utf-8');
    expect(src).toContain('regions: z.array(z.string())');
  });

  it('parallel dispatch uses continue to skip sequential loop', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('Skip sequential processing');
  });

  it('READ_ONLY_TOOLS includes kubectl_context', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain("'kubectl_context'");
  });

  it('READ_ONLY_TOOLS includes helm_values', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain("'helm_values'");
  });
});

// ---------------------------------------------------------------------------
// H1: LIVE streaming indicator
// ---------------------------------------------------------------------------

describe('LIVE streaming indicator (H1)', () => {
  it('ToolCallDisplay has LIVE indicator for logs tool', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    expect(src).toContain('● LIVE');
  });

  it('StatusBar has showStreamingHint prop', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/StatusBar.tsx'), 'utf-8');
    expect(src).toContain('showStreamingHint');
  });

  it('StatusBar shows Esc:stop stream when streaming hint active', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/StatusBar.tsx'), 'utf-8');
    expect(src).toContain('Esc:stop stream');
  });

  it('ToolCallDisplay streaming window is 40 for generic tools (M1: increased from 20)', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    // M1: Streaming window was increased — 60 lines for terraform/kubectl/logs, 40 for other tools
    expect(src).toContain('windowSize = isTerraformOrKubectl ? 60 : 40');
  });
});
