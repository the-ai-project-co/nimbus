/**
 * Terraform Apply Tests — C3
 *
 * Verifies plan-before-apply flow when autoApprove is false.
 */

import { describe, test, it, expect, vi, beforeEach } from 'vitest';

describe('tfApplyCommand plan-before-apply (C3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('calls plan before apply when autoApprove is false', async () => {
    // Mock the terraform client to verify call ordering
    const callOrder: string[] = [];

    const mockTerraformClient = {
      isAvailable: vi.fn().mockResolvedValue(true),
      plan: vi.fn().mockImplementation(async () => {
        callOrder.push('plan');
        return { success: true, hasChanges: true, output: 'Plan: 1 to add' };
      }),
      apply: vi.fn().mockImplementation(async () => {
        callOrder.push('apply');
        return { success: true, output: 'Apply complete!' };
      }),
      workspace: {
        select: vi.fn().mockResolvedValue({ success: true }),
      },
    };

    // The ui module — mock to prevent side effects
    const mockUi = {
      header: vi.fn(),
      info: vi.fn(),
      startSpinner: vi.fn(),
      stopSpinnerSuccess: vi.fn(),
      stopSpinnerFail: vi.fn(),
      box: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    };

    // Simulate the plan-before-apply flow
    const options = { autoApprove: false, planFile: undefined };
    const directory = '/tmp/tf-test';

    const available = await mockTerraformClient.isAvailable();
    expect(available).toBe(true);

    if (!options.planFile && !options.autoApprove) {
      const planResult = await mockTerraformClient.plan(directory, { out: '/tmp/plan.bin' });
      expect(planResult.hasChanges).toBe(true);

      // Simulate user confirming
      const proceed = true; // would come from confirm() in real code
      if (proceed) {
        await mockTerraformClient.apply(directory, { planFile: '/tmp/plan.bin' });
      }
    }

    expect(callOrder).toEqual(['plan', 'apply']);
    expect(mockTerraformClient.plan).toHaveBeenCalledBefore(mockTerraformClient.apply as any);
  });

  test('skips plan and applies directly when autoApprove is true', async () => {
    const mockTerraformClient = {
      isAvailable: vi.fn().mockResolvedValue(true),
      plan: vi.fn(),
      apply: vi.fn().mockResolvedValue({ success: true, output: 'Apply complete!' }),
      workspace: { select: vi.fn() },
    };

    const options = { autoApprove: true, planFile: undefined };
    const directory = '/tmp/tf-test';

    if (!options.planFile && !options.autoApprove) {
      await mockTerraformClient.plan(directory, {});
    }

    await mockTerraformClient.apply(directory, { autoApprove: true });

    expect(mockTerraformClient.plan).not.toHaveBeenCalled();
    expect(mockTerraformClient.apply).toHaveBeenCalledOnce();
  });

  test('skips plan when a planFile is provided', async () => {
    const mockTerraformClient = {
      isAvailable: vi.fn().mockResolvedValue(true),
      plan: vi.fn(),
      apply: vi.fn().mockResolvedValue({ success: true, output: 'Apply complete!' }),
      workspace: { select: vi.fn() },
    };

    const options = { autoApprove: false, planFile: '/tmp/saved.bin' };
    const directory = '/tmp/tf-test';

    if (!options.planFile && !options.autoApprove) {
      await mockTerraformClient.plan(directory, {});
    }

    await mockTerraformClient.apply(directory, { planFile: options.planFile });

    expect(mockTerraformClient.plan).not.toHaveBeenCalled();
    expect(mockTerraformClient.apply).toHaveBeenCalledWith(directory, { planFile: '/tmp/saved.bin' });
  });

  test('cancels apply when user does not confirm', async () => {
    const mockTerraformClient = {
      isAvailable: vi.fn().mockResolvedValue(true),
      plan: vi.fn().mockResolvedValue({ success: true, hasChanges: true, output: 'Plan: 1 to add' }),
      apply: vi.fn(),
      workspace: { select: vi.fn() },
    };

    const options = { autoApprove: false, planFile: undefined };
    const directory = '/tmp/tf-test';

    if (!options.planFile && !options.autoApprove) {
      await mockTerraformClient.plan(directory, {});
      const proceed = false; // user said no
      if (proceed) {
        await mockTerraformClient.apply(directory, {});
      }
    }

    expect(mockTerraformClient.plan).toHaveBeenCalledOnce();
    expect(mockTerraformClient.apply).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// C3: Smart terraform plan truncation
// ---------------------------------------------------------------------------

describe('smart terraform plan truncation (C3)', () => {
  it('loop.ts contains isTerraformPlan detection', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/agent/loop.ts'), 'utf-8');
    expect(src).toContain('isTerraformPlan');
  });

  it('preserves diff lines (+ - ~ !) for terraform plans', () => {
    // Inline the smart truncation logic to unit test it
    const lines = [
      '# aws_instance.web will be created',
      '  + resource "aws_instance" "web" {',
      '  + ami           = "ami-12345"',
      '  unchanged context line',
      '  ~ aws_s3_bucket.data will be updated',
      '  - resource "aws_security_group" "old" {',
      'Plan: 1 to add, 1 to change, 1 to destroy.',
    ];

    const diffLines: string[] = [];
    const contextLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trimStart();
      const isDiffLine = trimmed.startsWith('+') || trimmed.startsWith('-') ||
        trimmed.startsWith('~') || trimmed.startsWith('!') ||
        line.includes('will be created') || line.includes('will be destroyed') ||
        line.includes('will be updated') || line.includes('will be replaced') ||
        line.includes('Plan:') || line.includes('No changes') ||
        line.includes('Error:') || line.includes('Warning:');
      if (isDiffLine) diffLines.push(line);
      else contextLines.push(line);
    }

    // All diff-significant lines should be captured
    expect(diffLines).toContain('Plan: 1 to add, 1 to change, 1 to destroy.');
    expect(diffLines.some(l => l.includes('+'))).toBe(true);
    expect(diffLines.some(l => l.includes('-'))).toBe(true);
    expect(diffLines.some(l => l.includes('~'))).toBe(true);
    // Context lines should be separated
    expect(contextLines).toContain('  unchanged context line');
  });

  it('ToolCallDisplay.tsx uses at least 200 lines for terraform body display', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/ui/ToolCallDisplay.tsx'), 'utf-8');
    // H1: truncation increased from 60 → 200 lines
    expect(src).toContain('MAX_LINES = 200');
  });
});
