/**
 * Demo Command
 *
 * Run demo scenarios for presentations and tutorials
 */

import { logger } from '@nimbus/shared-utils';
import { ui } from '../wizard/ui';
import { select } from '../wizard/prompts';
import {
  getScenarios,
  getScenario,
  runScenario,
  type DemoScenario,
  type DemoOptions as DemoRunOptions,
} from '../demo';

/**
 * Demo command options
 */
export interface DemoOptions {
  /** Scenario ID to run */
  scenario?: string;
  /** List available scenarios */
  list?: boolean;
  /** Interactive mode (prompt for each step) */
  interactive?: boolean;
  /** Speed: slow, normal, fast */
  speed?: 'slow' | 'normal' | 'fast';
  /** Dry run - don't execute commands */
  dryRun?: boolean;
  /** Show all output (verbose) */
  verbose?: boolean;
  /** Category filter */
  category?: string;
  /** Tag filter */
  tag?: string;
}

/**
 * Parse demo command options from args
 */
export function parseDemoOptions(args: string[]): DemoOptions {
  const options: DemoOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--list' || arg === '-l') {
      options.list = true;
    } else if (arg === '--interactive' || arg === '-i') {
      options.interactive = true;
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--speed' || arg === '-s') {
      const speed = args[++i];
      if (speed === 'slow' || speed === 'normal' || speed === 'fast') {
        options.speed = speed;
      }
    } else if (arg === '--category' || arg === '-c') {
      options.category = args[++i];
    } else if (arg === '--tag' || arg === '-t') {
      options.tag = args[++i];
    } else if (!arg.startsWith('-') && !options.scenario) {
      options.scenario = arg;
    }
  }

  return options;
}

/**
 * Main demo command
 */
export async function demoCommand(options: DemoOptions): Promise<void> {
  logger.info('Running demo command', { options });

  try {
    // Auto-configure when NIMBUS_DEMO_MODE is set
    if (process.env.NIMBUS_DEMO_MODE === 'true') {
      ui.info('Demo mode enabled via NIMBUS_DEMO_MODE');
      options.dryRun = true;
      options.speed = options.speed || 'fast';
    }

    // Get all scenarios
    let scenarios = getScenarios();

    // Filter by category
    if (options.category) {
      scenarios = scenarios.filter(s => s.category === options.category);
    }

    // Filter by tag
    if (options.tag) {
      scenarios = scenarios.filter(s => s.tags?.includes(options.tag!));
    }

    // List scenarios
    if (options.list) {
      displayScenarioList(scenarios);
      return;
    }

    // If no scenario specified, show interactive picker
    if (!options.scenario) {
      if (scenarios.length === 0) {
        ui.warning('No scenarios available');
        return;
      }

      const selectedId = await select<string>({
        message: 'Select a demo scenario:',
        options: scenarios.map(s => ({
          label: s.name,
          value: s.id,
          description: `${s.category} - ${s.description}`,
        })),
      });

      if (!selectedId) {
        ui.warning('No scenario selected');
        return;
      }

      options.scenario = selectedId;
    }

    // Get the scenario
    const scenario = getScenario(options.scenario);
    if (!scenario) {
      ui.error(`Scenario not found: ${options.scenario}`);
      ui.newLine();
      ui.info('Available scenarios:');
      displayScenarioList(scenarios);
      return;
    }

    // Run the scenario
    const runOptions: DemoRunOptions = {
      interactive: options.interactive ?? true,
      speed: options.speed ?? 'normal',
      dryRun: options.dryRun ?? true, // Default to dry run for safety
      verbose: options.verbose ?? false,
    };

    await runScenario(scenario, runOptions);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Demo command failed', { error: message });
    ui.error(`Demo failed: ${message}`);
  }
}

/**
 * Display list of available scenarios
 */
function displayScenarioList(scenarios: DemoScenario[]): void {
  ui.newLine();
  ui.print(ui.bold('Available Demo Scenarios'));
  ui.newLine();

  if (scenarios.length === 0) {
    ui.print('  No scenarios found');
    return;
  }

  // Group by category
  const byCategory = new Map<string, DemoScenario[]>();
  for (const scenario of scenarios) {
    const list = byCategory.get(scenario.category) || [];
    list.push(scenario);
    byCategory.set(scenario.category, list);
  }

  // Display each category
  for (const [category, categoryScenarios] of byCategory) {
    ui.print(ui.color(`  ${formatCategory(category)}`, 'cyan'));

    for (const scenario of categoryScenarios) {
      const duration = scenario.duration ? `${scenario.duration} min` : '';
      const tags = scenario.tags?.length ? ui.dim(`[${scenario.tags.join(', ')}]`) : '';

      ui.print(`    ${ui.bold(scenario.id)}`);
      ui.print(`      ${scenario.name}`);
      ui.print(`      ${ui.dim(scenario.description)}`);
      if (duration || tags) {
        ui.print(`      ${duration} ${tags}`);
      }
      ui.newLine();
    }
  }

  ui.newLine();
  ui.print('Usage:');
  ui.print('  nimbus demo <scenario-id>           Run a specific scenario');
  ui.print('  nimbus demo --interactive           Interactive mode (pause between steps)');
  ui.print('  nimbus demo --dry-run               Show commands without executing');
  ui.print('  nimbus demo --speed slow|fast       Control demo speed');
  ui.print('  nimbus demo --category terraform    Filter by category');
  ui.print('  nimbus demo --tag aws               Filter by tag');
  ui.newLine();
}

/**
 * Format category name for display
 */
function formatCategory(category: string): string {
  const categoryNames: Record<string, string> = {
    terraform: 'Terraform Demos',
    kubernetes: 'Kubernetes Demos',
    helm: 'Helm Demos',
    aws: 'AWS Demos',
    'full-journey': 'Full Journey Demos',
    tutorial: 'Tutorials',
  };

  return categoryNames[category] || category;
}

/**
 * Run a specific demo scenario by ID
 */
export async function runDemoScenario(
  scenarioId: string,
  options: Partial<DemoOptions> = {}
): Promise<void> {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }

  const runOptions: DemoRunOptions = {
    interactive: options.interactive ?? true,
    speed: options.speed ?? 'normal',
    dryRun: options.dryRun ?? true,
    verbose: options.verbose ?? false,
  };

  await runScenario(scenario, runOptions);
}

/**
 * List all demo scenario IDs
 */
export function listDemoScenarios(): string[] {
  return getScenarios().map(s => s.id);
}
