/**
 * Demo Framework
 *
 * Orchestrates demo scenarios for presentations and tutorials
 */

import { logger } from '../utils';
import { ui } from '../wizard/ui';
import { confirm, select } from '../wizard/prompts';
import type {
  DemoScenario,
  DemoStep,
  DemoOptions,
  StepResult,
  ScenarioResult,
} from './types';
import { terraformVpcScenario } from './scenarios/terraform-vpc';
import { fullJourneyScenario } from './scenarios/full-journey';
import { gettingStartedScenario } from './scenarios/getting-started';
import { k8sDeploymentScenario } from './scenarios/k8s-deployment';
import { helmReleaseScenario } from './scenarios/helm-release';

// All available scenarios
const scenarios: DemoScenario[] = [
  gettingStartedScenario,
  terraformVpcScenario,
  k8sDeploymentScenario,
  helmReleaseScenario,
  fullJourneyScenario,
];

/**
 * Get all available demo scenarios
 */
export function getScenarios(): DemoScenario[] {
  return scenarios;
}

/**
 * Get a scenario by ID
 */
export function getScenario(id: string): DemoScenario | undefined {
  return scenarios.find(s => s.id === id);
}

/**
 * Run a demo scenario
 */
export async function runScenario(
  scenario: DemoScenario,
  options: DemoOptions = {}
): Promise<ScenarioResult> {
  logger.info(`Running demo scenario: ${scenario.name}`);

  const startedAt = new Date();
  const stepResults: StepResult[] = [];
  let totalDuration = 0;
  let success = true;

  // Show scenario header
  displayScenarioHeader(scenario);

  // Check prerequisites
  if (scenario.prerequisites && scenario.prerequisites.length > 0) {
    ui.newLine();
    ui.print(ui.bold('Prerequisites:'));
    for (const prereq of scenario.prerequisites) {
      ui.print(`  - ${prereq}`);
    }
    ui.newLine();

    if (options.interactive) {
      const proceed = await confirm({
        message: 'Have you met all prerequisites?',
        defaultValue: true,
      });

      if (!proceed) {
        ui.warning('Demo cancelled - prerequisites not met');
        return {
          scenario,
          steps: [],
          success: false,
          totalDuration: 0,
          startedAt,
          completedAt: new Date(),
        };
      }
    }
  }

  // Run each step
  for (let i = 0; i < scenario.steps.length; i++) {
    const step = scenario.steps[i];

    // Wait before step if interactive
    if (options.interactive && i > 0) {
      const proceed = await confirm({
        message: 'Continue to next step?',
        defaultValue: true,
      });

      if (!proceed) {
        ui.info('Demo paused');
        break;
      }
    }

    const result = await runStep(step, options, i + 1, scenario.steps.length);
    stepResults.push(result);
    totalDuration += result.duration;

    if (!result.success) {
      success = false;
      if (!options.interactive) {
        ui.error('Step failed, stopping demo');
        break;
      }
    }

    // Add delay based on speed
    const delay = getDelay(options.speed, step.delay);
    if (delay > 0) {
      await sleep(delay);
    }
  }

  const completedAt = new Date();

  // Show summary
  displaySummary(scenario, stepResults, success, totalDuration);

  return {
    scenario,
    steps: stepResults,
    success,
    totalDuration,
    startedAt,
    completedAt,
  };
}

/**
 * Run a single demo step
 */
async function runStep(
  step: DemoStep,
  options: DemoOptions,
  current: number,
  total: number
): Promise<StepResult> {
  const startTime = Date.now();

  // Display step header
  ui.newLine();
  ui.print(ui.color(`Step ${current}/${total}`, 'cyan'));
  ui.print(ui.bold(step.title));
  if (step.description) {
    ui.print(ui.dim(step.description));
  }
  ui.newLine();

  // Show command
  ui.print(`  ${ui.color('$', 'green')} ${ui.color(step.command, 'yellow')}`);
  ui.newLine();

  // Execute or mock
  let output = '';
  let error = '';
  let success = true;

  if (options.dryRun) {
    // Use mock response in dry run mode
    if (step.mockResponse) {
      output = step.mockResponse;
      if (step.showOutput !== false) {
        displayOutput(output);
      }
    } else {
      ui.dim('  [Dry run - command not executed]');
    }
  } else {
    // Actually execute the command
    try {
      const result = await executeCommand(step.command);
      output = result.stdout;
      error = result.stderr;
      success = result.exitCode === 0;

      if (step.showOutput !== false && output) {
        displayOutput(output);
      }

      if (error && options.verbose) {
        ui.print(ui.color(error, 'red'));
      }
    } catch (e: any) {
      success = false;
      error = e.message;
      ui.error(`Failed: ${error}`);
    }
  }

  // Verify expected output
  if (success && step.expectedOutput) {
    const regex = new RegExp(step.expectedOutput);
    if (!regex.test(output)) {
      success = false;
      error = 'Output did not match expected pattern';
    }
  }

  const duration = Date.now() - startTime;

  // Show result
  if (success) {
    ui.success('Step completed');
  } else {
    ui.error('Step failed');
  }

  return {
    step,
    success,
    output,
    error: error || undefined,
    duration,
  };
}

/**
 * Execute a command and return result
 */
async function executeCommand(command: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message,
      exitCode: error.code || 1,
    };
  }
}

/**
 * Display scenario header
 */
function displayScenarioHeader(scenario: DemoScenario): void {
  ui.newLine();
  ui.print('╔' + '═'.repeat(58) + '╗');
  ui.print('║' + ' '.repeat(58) + '║');
  ui.print('║' + centerText(scenario.name, 58) + '║');
  ui.print('║' + centerText(scenario.description, 58) + '║');
  ui.print('║' + ' '.repeat(58) + '║');
  ui.print('║' + centerText(`${scenario.steps.length} steps`, 58) + '║');
  ui.print('╚' + '═'.repeat(58) + '╝');
  ui.newLine();
}

/**
 * Display execution summary
 */
function displaySummary(
  scenario: DemoScenario,
  results: StepResult[],
  success: boolean,
  duration: number
): void {
  ui.newLine();
  ui.print('─'.repeat(60));
  ui.print(ui.bold('Demo Summary'));
  ui.newLine();

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  ui.print(`  Scenario: ${scenario.name}`);
  ui.print(`  Steps:    ${ui.color(`${passed} passed`, 'green')}, ${failed > 0 ? ui.color(`${failed} failed`, 'red') : '0 failed'}`);
  ui.print(`  Duration: ${(duration / 1000).toFixed(1)}s`);

  ui.newLine();
  if (success) {
    ui.success('Demo completed successfully!');
  } else {
    ui.error('Demo completed with errors');
  }
}

/**
 * Display command output with formatting
 */
function displayOutput(output: string): void {
  const lines = output.split('\n');
  for (const line of lines) {
    // Color terraform output
    if (line.startsWith('+')) {
      ui.print(`  ${ui.color(line, 'green')}`);
    } else if (line.startsWith('-')) {
      ui.print(`  ${ui.color(line, 'red')}`);
    } else if (line.startsWith('~')) {
      ui.print(`  ${ui.color(line, 'yellow')}`);
    } else {
      ui.print(`  ${line}`);
    }
  }
}

/**
 * Get delay based on speed setting
 */
function getDelay(speed: string | undefined, stepDelay: number | undefined): number {
  const baseDelay = stepDelay || 500;

  switch (speed) {
    case 'slow':
      return baseDelay * 2;
    case 'fast':
      return baseDelay / 2;
    default:
      return baseDelay;
  }
}

/**
 * Center text in a given width
 */
function centerText(text: string, width: number): string {
  const leftPadding = Math.max(0, Math.floor((width - text.length) / 2));
  const rightPadding = Math.max(0, width - leftPadding - text.length);
  return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Re-export types
export * from './types';
