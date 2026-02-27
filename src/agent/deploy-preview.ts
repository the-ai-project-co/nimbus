/**
 * Deploy Preview
 *
 * Generates dry-run previews for infrastructure changes with
 * blast radius analysis. Shows what will be created, modified,
 * or destroyed before the user approves execution.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/** A single resource change in the preview */
export interface ResourceChange {
  /** Resource type and name (e.g., "aws_instance.web") */
  resource: string;
  /** Change action */
  action: 'create' | 'update' | 'destroy' | 'replace' | 'read' | 'no-op';
  /** Brief description of what changes */
  details?: string;
}

/** The full deploy preview result */
export interface DeployPreview {
  /** The deployment tool (terraform/kubectl/helm) */
  tool: string;
  /** The action being previewed */
  action: string;
  /** Working directory */
  workdir: string;
  /** Individual resource changes */
  changes: ResourceChange[];
  /** Summary counts */
  summary: {
    toCreate: number;
    toUpdate: number;
    toDestroy: number;
    toReplace: number;
    unchanged: number;
  };
  /** Raw plan output */
  rawOutput: string;
  /** Estimated cost impact (if available) */
  costImpact?: string;
  /** Whether the preview succeeded */
  success: boolean;
  /** Error message if preview failed */
  error?: string;
}

/**
 * Generate a deploy preview for the given action.
 *
 * Dispatches to the appropriate provider-specific preview generator
 * based on the action keyword (terraform, kubectl/kubernetes, or helm).
 *
 * @param action - The action keyword (e.g., "terraform apply", "kubectl apply", "helm install")
 * @param workdir - Working directory containing the IaC files
 * @returns DeployPreview result
 */
export async function generateDeployPreview(
  action: string,
  workdir: string
): Promise<DeployPreview> {
  const actionLower = action.toLowerCase();

  if (actionLower.includes('terraform')) {
    return generateTerraformPreview(workdir);
  }
  if (actionLower.includes('kubectl') || actionLower.includes('kubernetes')) {
    return generateKubectlPreview(action, workdir);
  }
  if (actionLower.includes('helm')) {
    return generateHelmPreview(action, workdir);
  }

  return {
    tool: 'unknown',
    action,
    workdir,
    changes: [],
    summary: { toCreate: 0, toUpdate: 0, toDestroy: 0, toReplace: 0, unchanged: 0 },
    rawOutput: '',
    success: false,
    error: `Unsupported action for deploy preview: ${action}`,
  };
}

/**
 * Format a deploy preview into a human-readable string.
 *
 * Produces a summary block with change counts, a detailed change list
 * using +/~/- symbols, optional cost impact, and a blast-radius warning
 * when destructive operations are present.
 *
 * @param preview - The deploy preview to format
 * @returns Formatted multi-line string suitable for terminal display
 */
export function formatDeployPreview(preview: DeployPreview): string {
  if (!preview.success) {
    return `Deploy Preview Failed\n${'='.repeat(40)}\n\nError: ${preview.error}\n`;
  }

  const lines: string[] = [];
  lines.push(`Deploy Preview: ${preview.tool} ${preview.action}`);
  lines.push('='.repeat(50));
  lines.push(`Working directory: ${preview.workdir}`);
  lines.push('');

  // Summary
  const { toCreate, toUpdate, toDestroy, toReplace, unchanged } = preview.summary;
  lines.push('Summary:');
  if (toCreate > 0) {
    lines.push(`  + ${toCreate} to create`);
  }
  if (toUpdate > 0) {
    lines.push(`  ~ ${toUpdate} to update`);
  }
  if (toReplace > 0) {
    lines.push(`  +/- ${toReplace} to replace`);
  }
  if (toDestroy > 0) {
    lines.push(`  - ${toDestroy} to destroy`);
  }
  if (unchanged > 0) {
    lines.push(`  = ${unchanged} unchanged`);
  }
  lines.push('');

  // Detailed changes
  if (preview.changes.length > 0) {
    lines.push('Changes:');
    for (const change of preview.changes) {
      const symbol = getChangeSymbol(change.action);
      const detail = change.details ? ` (${change.details})` : '';
      lines.push(`  ${symbol} ${change.resource}${detail}`);
    }
    lines.push('');
  }

  // Cost impact
  if (preview.costImpact) {
    lines.push(`Cost Impact: ${preview.costImpact}`);
    lines.push('');
  }

  // Blast radius warning
  if (toDestroy > 0) {
    lines.push('WARNING: This operation will DESTROY resources.');
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------
// Provider-specific preview generators
// ---------------------------------------------------------------

/**
 * Run `terraform plan` and parse the human-readable output into
 * structured {@link ResourceChange} entries.
 */
async function generateTerraformPreview(workdir: string): Promise<DeployPreview> {
  const base = {
    tool: 'terraform',
    action: 'apply',
    workdir,
  };

  try {
    // Run terraform plan with JSON output
    const { stdout, stderr } = await execAsync(
      'terraform plan -no-color -detailed-exitcode 2>&1 || true',
      { cwd: workdir, timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }
    );

    const output = stdout || stderr;
    const changes = parseTerraformPlanOutput(output);
    const summary = summarizeChanges(changes);

    return {
      ...base,
      changes,
      summary,
      rawOutput: output,
      success: true,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      changes: [],
      summary: { toCreate: 0, toUpdate: 0, toDestroy: 0, toReplace: 0, unchanged: 0 },
      rawOutput: '',
      success: false,
      error: msg,
    };
  }
}

/**
 * Run `kubectl diff` against the current cluster state and parse
 * the unified-diff output into {@link ResourceChange} entries.
 */
async function generateKubectlPreview(action: string, workdir: string): Promise<DeployPreview> {
  const base = {
    tool: 'kubectl',
    action,
    workdir,
  };

  try {
    const { stdout } = await execAsync('kubectl diff -f . 2>&1 || true', {
      cwd: workdir,
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const changes = parseKubectlDiffOutput(stdout);
    const summary = summarizeChanges(changes);

    return {
      ...base,
      changes,
      summary,
      rawOutput: stdout,
      success: true,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      changes: [],
      summary: { toCreate: 0, toUpdate: 0, toDestroy: 0, toReplace: 0, unchanged: 0 },
      rawOutput: '',
      success: false,
      error: msg,
    };
  }
}

/**
 * Run `helm template` to render the chart locally and report the
 * rendered manifests as a single create change.
 */
async function generateHelmPreview(action: string, workdir: string): Promise<DeployPreview> {
  const base = {
    tool: 'helm',
    action,
    workdir,
  };

  try {
    // Use helm template to show what would be deployed
    const { stdout } = await execAsync('helm template . 2>&1', {
      cwd: workdir,
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    return {
      ...base,
      changes: [{ resource: 'helm-chart', action: 'create', details: 'Template rendered' }],
      summary: { toCreate: 1, toUpdate: 0, toDestroy: 0, toReplace: 0, unchanged: 0 },
      rawOutput: stdout,
      success: true,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      changes: [],
      summary: { toCreate: 0, toUpdate: 0, toDestroy: 0, toReplace: 0, unchanged: 0 },
      rawOutput: '',
      success: false,
      error: msg,
    };
  }
}

// ---------------------------------------------------------------
// Output parsers
// ---------------------------------------------------------------

/**
 * Parse the human-readable `terraform plan` output into structured
 * {@link ResourceChange} entries.
 *
 * Recognises lines such as:
 *   `# aws_instance.web will be created`
 *   `# aws_instance.web will be updated in-place`
 *   `# aws_instance.web will be destroyed`
 *   `# aws_instance.web must be replaced`
 *
 * Falls back to the summary line (`Plan: X to add, Y to change, Z to destroy.`)
 * when no individual resource lines are found.
 */
function parseTerraformPlanOutput(output: string): ResourceChange[] {
  const changes: ResourceChange[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    // Match lines like: "  # aws_instance.web will be created"
    const createMatch = line.match(/^\s*#\s+(\S+)\s+will be created/);
    if (createMatch) {
      changes.push({ resource: createMatch[1], action: 'create' });
      continue;
    }

    const updateMatch = line.match(/^\s*#\s+(\S+)\s+will be updated/);
    if (updateMatch) {
      changes.push({ resource: updateMatch[1], action: 'update' });
      continue;
    }

    const destroyMatch = line.match(/^\s*#\s+(\S+)\s+will be destroyed/);
    if (destroyMatch) {
      changes.push({ resource: destroyMatch[1], action: 'destroy' });
      continue;
    }

    const replaceMatch = line.match(/^\s*#\s+(\S+)\s+must be replaced/);
    if (replaceMatch) {
      changes.push({ resource: replaceMatch[1], action: 'replace' });
      continue;
    }

    // Also match: "Plan: X to add, Y to change, Z to destroy."
    const summaryMatch = line.match(
      /Plan:\s+(\d+)\s+to add,\s+(\d+)\s+to change,\s+(\d+)\s+to destroy/
    );
    if (summaryMatch && changes.length === 0) {
      // If we didn't find specific resources, create generic entries
      const toAdd = parseInt(summaryMatch[1]);
      const toChange = parseInt(summaryMatch[2]);
      const toDestroy = parseInt(summaryMatch[3]);

      for (let i = 0; i < toAdd; i++) {
        changes.push({ resource: `resource_${i + 1}`, action: 'create' });
      }
      for (let i = 0; i < toChange; i++) {
        changes.push({ resource: `resource_${toAdd + i + 1}`, action: 'update' });
      }
      for (let i = 0; i < toDestroy; i++) {
        changes.push({ resource: `resource_${toAdd + toChange + i + 1}`, action: 'destroy' });
      }
    }
  }

  return changes;
}

/**
 * Parse `kubectl diff` unified-diff output into structured
 * {@link ResourceChange} entries.
 *
 * Each `diff -u` header is treated as a separate resource update.
 * An empty or "no changes" output yields an empty array.
 */
function parseKubectlDiffOutput(output: string): ResourceChange[] {
  const changes: ResourceChange[] = [];
  const resourceRegex = /^diff -u.*\/(\S+)/gm;
  let match;

  while ((match = resourceRegex.exec(output)) !== null) {
    changes.push({ resource: match[1], action: 'update' });
  }

  // If output is empty, no changes
  if (output.trim() === '' || output.includes('no changes')) {
    return [];
  }

  // If we found no specific resources but have output, assume updates
  if (changes.length === 0 && output.trim().length > 0) {
    changes.push({ resource: 'kubernetes-resources', action: 'update' });
  }

  return changes;
}

/**
 * Aggregate an array of {@link ResourceChange} entries into the
 * summary counts used by {@link DeployPreview}.
 */
function summarizeChanges(changes: ResourceChange[]): DeployPreview['summary'] {
  return {
    toCreate: changes.filter(c => c.action === 'create').length,
    toUpdate: changes.filter(c => c.action === 'update').length,
    toDestroy: changes.filter(c => c.action === 'destroy').length,
    toReplace: changes.filter(c => c.action === 'replace').length,
    unchanged: changes.filter(c => c.action === 'no-op').length,
  };
}

/**
 * Map a {@link ResourceChange} action to a single-character symbol
 * for display in the formatted preview.
 *
 * | Action    | Symbol |
 * |-----------|--------|
 * | create    | `+`    |
 * | update    | `~`    |
 * | destroy   | `-`    |
 * | replace   | `+/-`  |
 * | read      | `>`    |
 * | no-op     | `=`    |
 */
function getChangeSymbol(action: ResourceChange['action']): string {
  switch (action) {
    case 'create':
      return '+';
    case 'update':
      return '~';
    case 'destroy':
      return '-';
    case 'replace':
      return '+/-';
    case 'read':
      return '>';
    case 'no-op':
      return '=';
  }
}
