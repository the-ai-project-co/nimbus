/**
 * Approval Workflow Component
 *
 * Displays approval prompts for risky operations
 */

import { ui } from './ui';
import { confirm, input } from './prompts';
import type { Risk, RiskSeverity } from '../config/safety-policy';

/**
 * Approval prompt configuration
 */
export interface ApprovalPromptConfig {
  /** Title of the approval prompt */
  title: string;
  /** Operation being performed */
  operation: string;
  /** List of risks identified */
  risks: Risk[];
  /** Estimated cost if available */
  estimatedCost?: number;
  /** List of affected resources */
  affectedResources?: string[];
  /** Environment being modified */
  environment?: string;
  /** Require typing confirmation word */
  requireConfirmation?: boolean;
  /** Custom confirmation word */
  confirmationWord?: string;
}

/**
 * Approval result
 */
export interface ApprovalResult {
  approved: boolean;
  reason?: string;
  approvedBy?: string;
  timestamp: Date;
}

/**
 * Display an approval prompt and return the result
 */
export async function promptForApproval(config: ApprovalPromptConfig): Promise<ApprovalResult> {
  ui.newLine();

  // Draw approval box
  drawApprovalBox(config);

  // Display risks
  displayRisks(config.risks);

  // Display affected resources if any
  if (config.affectedResources && config.affectedResources.length > 0) {
    displayAffectedResources(config.affectedResources);
  }

  // Display estimated cost if available
  if (config.estimatedCost !== undefined) {
    displayEstimatedCost(config.estimatedCost);
  }

  ui.newLine();

  // Require confirmation for critical operations
  const hasCritical = config.risks.some(r => r.severity === 'critical');
  const hasDestructive =
    config.operation.toLowerCase().includes('destroy') ||
    config.operation.toLowerCase().includes('delete');

  if (hasCritical || hasDestructive || config.requireConfirmation) {
    const confirmWord = config.confirmationWord || 'yes';
    const userInput = await input({
      message: `Type "${confirmWord}" to confirm:`,
      defaultValue: '',
    });

    if (userInput.toLowerCase() !== confirmWord.toLowerCase()) {
      ui.newLine();
      ui.warning('Operation cancelled - confirmation word did not match');
      return {
        approved: false,
        reason: 'Confirmation word mismatch',
        timestamp: new Date(),
      };
    }
  } else {
    // Simple confirmation
    const proceed = await confirm({
      message: 'Do you want to proceed with this operation?',
      defaultValue: false,
    });

    if (!proceed) {
      ui.newLine();
      ui.info('Operation cancelled by user');
      return {
        approved: false,
        reason: 'User declined',
        timestamp: new Date(),
      };
    }
  }

  ui.newLine();
  ui.success('Operation approved');

  return {
    approved: true,
    approvedBy: process.env.USER || 'unknown',
    timestamp: new Date(),
  };
}

/**
 * Draw the approval box header
 */
function drawApprovalBox(config: ApprovalPromptConfig): void {
  const width = 60;
  const borderColor = getSeverityColor(getHighestSeverity(config.risks));

  ui.print(ui.color(`╔${'═'.repeat(width - 2)}╗`, borderColor));

  // Title
  const titleLine = ` APPROVAL REQUIRED `;
  const padding = Math.floor((width - 2 - titleLine.length) / 2);
  ui.print(
    ui.color('║', borderColor) +
      ' '.repeat(padding) +
      ui.bold(ui.color(titleLine, 'yellow')) +
      ' '.repeat(width - 2 - padding - titleLine.length) +
      ui.color('║', borderColor)
  );

  ui.print(ui.color(`╠${'═'.repeat(width - 2)}╣`, borderColor));

  // Operation
  const opLine = `  Operation: ${config.operation}`;
  ui.print(ui.color('║', borderColor) + opLine.padEnd(width - 2) + ui.color('║', borderColor));

  // Environment if available
  if (config.environment) {
    const envLine = `  Environment: ${config.environment}`;
    ui.print(
      ui.color('║', borderColor) +
        ui.color(envLine.padEnd(width - 2), 'yellow') +
        ui.color('║', borderColor)
    );
  }

  ui.print(ui.color(`╚${'═'.repeat(width - 2)}╝`, borderColor));
}

/**
 * Display the list of risks
 */
function displayRisks(risks: Risk[]): void {
  if (risks.length === 0) {
    return;
  }

  ui.newLine();
  ui.print(ui.bold('  Identified Risks:'));
  ui.newLine();

  // Sort by severity
  const sortedRisks = [...risks].sort((a, b) => {
    const order: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.severity] - order[b.severity];
  });

  for (const risk of sortedRisks) {
    const icon = getSeverityIcon(risk.severity);
    const color = getSeverityColor(risk.severity);
    const label = `[${risk.severity.toUpperCase()}]`.padEnd(10);

    ui.print(`    ${icon} ${ui.color(label, color)} ${risk.message}`);

    // Show details if available
    if (risk.details) {
      for (const [key, value] of Object.entries(risk.details)) {
        ui.print(ui.dim(`       ${key}: ${value}`));
      }
    }
  }
}

/**
 * Display affected resources
 */
function displayAffectedResources(resources: string[]): void {
  ui.newLine();
  ui.print(ui.bold('  Affected Resources:'));
  ui.newLine();

  const maxDisplay = 10;
  const displayResources = resources.slice(0, maxDisplay);

  for (const resource of displayResources) {
    ui.print(`    ${ui.color('•', 'cyan')} ${resource}`);
  }

  if (resources.length > maxDisplay) {
    ui.print(ui.dim(`    ... and ${resources.length - maxDisplay} more`));
  }
}

/**
 * Display estimated cost
 */
function displayEstimatedCost(cost: number): void {
  ui.newLine();
  ui.print(ui.bold('  Estimated Cost:'));
  ui.newLine();

  const costStr = `$${cost.toFixed(2)}/month`;
  const color = cost > 1000 ? 'red' : cost > 500 ? 'yellow' : 'green';
  ui.print(`    ${ui.color(costStr, color)}`);
}

/**
 * Get the highest severity from a list of risks
 */
function getHighestSeverity(risks: Risk[]): RiskSeverity {
  const order: RiskSeverity[] = ['critical', 'high', 'medium', 'low'];
  for (const severity of order) {
    if (risks.some(r => r.severity === severity)) {
      return severity;
    }
  }
  return 'low';
}

/**
 * Get icon for severity level
 */
function getSeverityIcon(severity: RiskSeverity): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    case 'low':
      return '🔵';
    default:
      return '⚪';
  }
}

/**
 * Color type for UI
 */
type UIColor = 'red' | 'yellow' | 'cyan' | 'blue' | 'white' | 'green';

/**
 * Get color for severity level
 */
function getSeverityColor(severity: RiskSeverity): UIColor {
  switch (severity) {
    case 'critical':
      return 'red';
    case 'high':
      return 'yellow';
    case 'medium':
      return 'cyan';
    case 'low':
      return 'blue';
    default:
      return 'white';
  }
}

/**
 * Quick approval check without full prompt
 * Returns true if the operation should proceed based on policy
 */
export function shouldAutoApprove(operation: string, risks: Risk[]): boolean {
  // Never auto-approve if there are critical risks
  if (risks.some(r => r.severity === 'critical')) {
    return false;
  }

  // Never auto-approve destructive operations
  if (['destroy', 'delete', 'terminate'].some(op => operation.toLowerCase().includes(op))) {
    return false;
  }

  // Auto-approve if all risks are low severity
  if (risks.every(r => r.severity === 'low')) {
    return true;
  }

  return false;
}

/**
 * Confirm a destructive operation by requiring the user to type the resource name.
 * Returns true only if the typed name matches exactly.
 */
export async function confirmWithResourceName(
  resourceName: string,
  resourceType: string
): Promise<boolean> {
  ui.newLine();

  // Display warning box
  const width = 60;
  ui.print(ui.color(`╔${'═'.repeat(width - 2)}╗`, 'red'));

  const titleLine = ' DESTRUCTIVE OPERATION ';
  const padding = Math.floor((width - 2 - titleLine.length) / 2);
  ui.print(
    ui.color('║', 'red') +
      ' '.repeat(padding) +
      ui.bold(ui.color(titleLine, 'yellow')) +
      ' '.repeat(width - 2 - padding - titleLine.length) +
      ui.color('║', 'red')
  );

  ui.print(ui.color(`╠${'═'.repeat(width - 2)}╣`, 'red'));

  const typeLine = `  Resource type: ${resourceType}`;
  ui.print(ui.color('║', 'red') + typeLine.padEnd(width - 2) + ui.color('║', 'red'));

  const nameLine = `  Resource name: ${resourceName}`;
  ui.print(
    ui.color('║', 'red') + ui.color(nameLine.padEnd(width - 2), 'yellow') + ui.color('║', 'red')
  );

  const warnLine = '  This action CANNOT be undone.';
  ui.print(
    ui.color('║', 'red') + ui.color(warnLine.padEnd(width - 2), 'red') + ui.color('║', 'red')
  );

  ui.print(ui.color(`╚${'═'.repeat(width - 2)}╝`, 'red'));
  ui.newLine();

  const userInput = await input({
    message: `Type '${resourceName}' to confirm deletion:`,
    defaultValue: '',
  });

  if (userInput !== resourceName) {
    ui.newLine();
    ui.warning('Operation cancelled - resource name did not match');
    return false;
  }

  ui.newLine();
  ui.success('Deletion confirmed');
  return true;
}

/**
 * Display a safety summary without approval prompt
 */
export function displaySafetySummary(config: {
  operation: string;
  risks: Risk[];
  passed: boolean;
}): void {
  if (config.risks.length === 0) {
    ui.success(`Safety check passed for: ${config.operation}`);
    return;
  }

  ui.newLine();
  ui.print(ui.bold('  Safety Check Summary:'));
  ui.newLine();

  displayRisks(config.risks);

  ui.newLine();
  if (config.passed) {
    ui.success('All safety checks passed');
  } else {
    ui.error('Safety checks failed - operation blocked');
  }
}
