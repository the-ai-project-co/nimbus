/**
 * Runbook Command (G15)
 *
 * Load and execute operational runbooks as agent prompts.
 *
 * Runbook YAML format:
 *   name: rotate-certs
 *   description: Rotate TLS certs in prod namespace
 *   context: prod  # profile to activate
 *   steps:
 *     - Check for expiring certs in all namespaces
 *     - Rotate each cert using cert-manager annotate
 *     - Verify new certs are valid and pods restarted
 *
 * Usage:
 *   nimbus runbook list
 *   nimbus runbook run <name> [--auto]
 *   nimbus runbook create <name>
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunbookStep {
  /** Step text (the action to perform) */
  text: string;
  /** Condition that must be true for this step to proceed */
  if?: string;
  /** Whether user must explicitly approve before the step executes */
  require_approval?: boolean;
}

export interface RunbookDef {
  name: string;
  description?: string;
  context?: string;
  steps: RunbookStep[];
}

export interface RunbookOptions {
  auto?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Directories to scan for runbooks. */
const RUNBOOK_DIRS = [
  join(homedir(), '.nimbus', 'runbooks'),
  join(process.cwd(), 'runbooks'),
  join(process.cwd(), 'docs', 'runbooks'),
  join(process.cwd(), '.github', 'runbooks'),
];

/**
 * Find all runbook YAML files in the standard directories.
 */
function findRunbooks(): Array<{ path: string; dir: string; file: string }> {
  const results: Array<{ path: string; dir: string; file: string }> = [];
  for (const dir of RUNBOOK_DIRS) {
    if (!existsSync(dir)) continue;
    try {
      const files = readdirSync(dir).filter(f => /\.(yaml|yml)$/.test(f));
      for (const file of files) {
        results.push({ path: join(dir, file), dir, file });
      }
    } catch { /* non-critical */ }
  }
  return results;
}

/**
 * Minimal YAML parser for simple runbook format (no external dep).
 * Supports both plain string steps and structured steps with if:/require_approval: fields.
 *
 * Structured step example:
 *   steps:
 *     - name: Check certs
 *       run: Check for expiring certs
 *       if: cert_count > 0
 *       require_approval: true
 */
function parseRunbookYaml(content: string): RunbookDef {
  const lines = content.split('\n');
  const def: RunbookDef = { name: '', steps: [] };
  let inSteps = false;

  // We parse in two modes: simple (step is a plain `- text` line) and
  // structured (step is a YAML mapping started by `- name:` or `- run:`).
  let currentStep: RunbookStep | null = null;

  const flushStep = () => {
    if (currentStep) {
      def.steps.push(currentStep);
      currentStep = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('#') || !line.trim()) continue;

    if (line.startsWith('name:') && !inSteps) {
      def.name = line.slice(5).trim().replace(/^['"]|['"]$/g, '');
    } else if (line.startsWith('description:') && !inSteps) {
      def.description = line.slice(12).trim().replace(/^['"]|['"]$/g, '');
    } else if (line.startsWith('context:') && !inSteps) {
      def.context = line.slice(8).trim().replace(/^['"]|['"]$/g, '');
    } else if (line.trim() === 'steps:') {
      inSteps = true;
    } else if (inSteps) {
      // Top-level step item: starts with exactly two spaces + "- "
      if (/^ {0,2}- /.test(line)) {
        flushStep();
        const stepText = line.replace(/^\s*-\s*/, '').trim();
        // Detect structured step: starts with "name:", "run:", "action:"
        if (/^(name|run|action):/.test(stepText)) {
          const val = stepText.replace(/^(name|run|action):\s*/, '').replace(/^['"]|['"]$/g, '');
          currentStep = { text: val };
        } else if (stepText === '') {
          // blank mapping start — next indented lines fill it in
          currentStep = { text: '' };
        } else {
          // Plain string step
          def.steps.push({ text: stepText.replace(/^['"]|['"]$/g, '') });
        }
      } else if (currentStep && /^\s+(name|run|action):/.test(line)) {
        // Structured field continuation inside a step block
        const val = line.replace(/^\s+(name|run|action):\s*/, '').replace(/^['"]|['"]$/g, '');
        if (!currentStep.text) currentStep.text = val;
      } else if (currentStep && /^\s+if:/.test(line)) {
        const val = line.replace(/^\s+if:\s*/, '').replace(/^['"]|['"]$/g, '');
        currentStep.if = val;
      } else if (currentStep && /^\s+require_approval:/.test(line)) {
        const val = line.replace(/^\s+require_approval:\s*/, '').trim();
        currentStep.require_approval = val === 'true';
      } else if (!/^\s/.test(line)) {
        // Non-indented non-step line — exit step parsing
        flushStep();
        inSteps = false;
      }
    }
  }

  flushStep();

  return def;
}

/**
 * Build a multi-step agent prompt from a runbook definition.
 * Supports GAP-24 conditional steps (if:) and approval gates (require_approval:).
 */
function buildRunbookPrompt(def: RunbookDef): string {
  const parts = [
    `# Runbook: ${def.name}`,
  ];
  if (def.description) parts.push(`\n${def.description}`);
  if (def.context) parts.push(`\nContext/profile: ${def.context}`);
  parts.push('\n## Steps to execute in order:');

  def.steps.forEach((step, i) => {
    // GAP-24: In step parsing loop
    const ifCondition = step.if as string | undefined;
    const requireApproval = step.require_approval as boolean | undefined;

    let stepText = `Step ${i + 1}: ${step.text}`;
    if (ifCondition) {
      stepText += `\n  [CONDITIONAL: Only proceed if: ${ifCondition}]`;
      stepText += `\nAfter completing this step, check: ${ifCondition}. If the condition evaluates to false, stop and report the status without continuing to the next step.`;
    }
    if (requireApproval) {
      stepText += `\n  [REQUIRES APPROVAL: State this step's plan and wait for explicit user approval before executing]`;
      stepText = `IMPORTANT: Before executing this step, explicitly state what you are about to do and wait for the user to say "approve" or "yes" before proceeding.\n` + stepText;
    }
    parts.push(stepText);
  });

  parts.push('\nExecute each step in sequence. Check for errors after each step before proceeding. Report progress clearly.');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------

async function runbookList(): Promise<void> {
  const runbooks = findRunbooks();
  if (runbooks.length === 0) {
    console.log('No runbooks found.');
    console.log('');
    console.log('Create one at:');
    for (const dir of RUNBOOK_DIRS.slice(0, 2)) {
      console.log(`  ${dir}/<name>.yaml`);
    }
    return;
  }

  console.log('Available runbooks:\n');
  for (const rb of runbooks) {
    try {
      const content = readFileSync(rb.path, 'utf-8');
      const def = parseRunbookYaml(content);
      console.log(`  ${def.name.padEnd(24)} ${def.description ?? ''}`);
      console.log(`  ${''.padEnd(24)} (${rb.path})`);
    } catch {
      console.log(`  ${basename(rb.path)} (parse error)`);
    }
  }
}

async function runbookRun(name: string, options: RunbookOptions): Promise<void> {
  const runbooks = findRunbooks();
  const match = runbooks.find(rb => {
    try {
      const def = parseRunbookYaml(readFileSync(rb.path, 'utf-8'));
      return def.name === name || basename(rb.file, '.yaml') === name || basename(rb.file, '.yml') === name;
    } catch { return false; }
  });

  if (!match) {
    console.error(`Runbook not found: ${name}`);
    console.log('Run "nimbus runbook list" to see available runbooks.');
    process.exit(1);
  }

  const def = parseRunbookYaml(readFileSync(match.path, 'utf-8'));
  const prompt = buildRunbookPrompt(def);

  console.log(`Executing runbook: ${def.name}`);
  if (def.description) console.log(`Description: ${def.description}`);
  console.log(`Steps: ${def.steps.length}`);
  console.log('');

  if (!options.auto) {
    // Prompt for confirmation in interactive mode
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question('Proceed with runbook execution? (y/N) ', resolve);
    });
    rl.close();
    if (!answer.toLowerCase().startsWith('y')) {
      console.log('Runbook execution cancelled.');
      return;
    }
  }

  const { chatCommand } = await import('./chat');
  await chatCommand({ initialPrompt: prompt, mode: 'deploy' });
}

async function runbookCreate(name: string): Promise<void> {
  const targetDir = join(homedir(), '.nimbus', 'runbooks');
  mkdirSync(targetDir, { recursive: true });
  const targetPath = join(targetDir, `${name}.yaml`);

  if (existsSync(targetPath)) {
    console.error(`Runbook already exists: ${targetPath}`);
    process.exit(1);
  }

  const readline = await import('node:readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (q: string): Promise<string> => new Promise(resolve => rl.question(q, resolve));

  console.log(`Creating runbook: ${name}`);
  const description = await question('Description: ');
  const context = await question('Context/profile (optional, e.g. "prod"): ');
  console.log('Enter steps (empty line to finish):');

  const steps: string[] = [];
  let stepNum = 1;
  while (true) {
    const step = await question(`Step ${stepNum}: `);
    if (!step.trim()) break;
    steps.push(step.trim());
    stepNum++;
  }
  rl.close();

  if (steps.length === 0) {
    console.error('Runbook must have at least one step.');
    process.exit(1);
  }

  const yaml = [
    `name: ${name}`,
    `description: ${description}`,
    context ? `context: ${context}` : '# context: prod',
    'steps:',
    ...steps.map(s => `  - ${s}`),
  ].join('\n') + '\n';

  writeFileSync(targetPath, yaml, 'utf-8');
  console.log(`\nRunbook saved to: ${targetPath}`);
  console.log(`Run with: nimbus runbook run ${name}`);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runbookCommand(subcommand: string, args: string[]): Promise<void> {
  switch (subcommand) {
    case 'list':
    case 'ls':
      await runbookList();
      break;

    case 'run': {
      const name = args[0];
      if (!name) {
        console.error('Usage: nimbus runbook run <name> [--auto]');
        process.exit(1);
      }
      await runbookRun(name, { auto: args.includes('--auto') });
      break;
    }

    case 'create':
    case 'new': {
      const name = args[0];
      if (!name) {
        console.error('Usage: nimbus runbook create <name>');
        process.exit(1);
      }
      await runbookCreate(name);
      break;
    }

    default:
      console.log('Usage: nimbus runbook <list|run|create>');
      console.log('');
      console.log('  list               List available runbooks');
      console.log('  run <name>         Execute a runbook as an agent prompt');
      console.log('  create <name>      Create a new runbook interactively');
      break;
  }
}
