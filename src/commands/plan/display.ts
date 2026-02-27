/**
 * Plan Display Utilities
 *
 * Format and display plan output for different infrastructure types
 */

import { ui } from '../../wizard';

/**
 * Resource change in plan
 */
export interface ResourceChange {
  action: string;
  resource: string;
  address: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/**
 * Plan result structure
 */
export interface PlanResult {
  type: 'terraform' | 'k8s' | 'helm';
  success: boolean;
  error?: string;
  changes?: {
    add: number;
    change: number;
    destroy: number;
  };
  resources?: ResourceChange[];
  raw?: string;
}

/**
 * Action symbols for display
 */
const ACTION_SYMBOLS: Record<
  string,
  { symbol: string; color: 'green' | 'yellow' | 'red' | 'blue' | 'cyan' }
> = {
  create: { symbol: '+', color: 'green' },
  add: { symbol: '+', color: 'green' },
  apply: { symbol: '~', color: 'cyan' },
  update: { symbol: '~', color: 'yellow' },
  change: { symbol: '~', color: 'yellow' },
  delete: { symbol: '-', color: 'red' },
  destroy: { symbol: '-', color: 'red' },
  read: { symbol: '<=', color: 'blue' },
  'no-op': { symbol: ' ', color: 'blue' },
};

/**
 * Format action for display
 */
function formatAction(action: string): string {
  const config = ACTION_SYMBOLS[action.toLowerCase()] || { symbol: '?', color: 'yellow' as const };
  return ui.color(config.symbol, config.color);
}

/**
 * Format resource for display
 */
function formatResource(resource: string): string {
  return resource;
}

/**
 * Display plan summary
 */
function displaySummary(changes: { add: number; change: number; destroy: number }): void {
  ui.print('Plan Summary:');
  ui.newLine();

  const { add, change, destroy } = changes;
  const total = add + change + destroy;

  if (total === 0) {
    ui.print('  No changes. Infrastructure is up to date.');
    return;
  }

  if (add > 0) {
    ui.print(`  ${ui.color(`+ ${add} to add`, 'green')}`);
  }
  if (change > 0) {
    ui.print(`  ${ui.color(`~ ${change} to change`, 'yellow')}`);
  }
  if (destroy > 0) {
    ui.print(`  ${ui.color(`- ${destroy} to destroy`, 'red')}`);
  }

  ui.newLine();
  ui.print(`  Total: ${total} resource(s)`);
}

/**
 * Display resource changes
 */
function displayResources(resources: ResourceChange[]): void {
  if (!resources || resources.length === 0) {
    return;
  }

  ui.newLine();
  ui.print('Resource Changes:');
  ui.newLine();

  // Group by action
  const grouped: Record<string, ResourceChange[]> = {};

  for (const resource of resources) {
    const action = resource.action.toLowerCase();
    if (!grouped[action]) {
      grouped[action] = [];
    }
    grouped[action].push(resource);
  }

  // Display in order: create, update, delete, other
  const order = ['create', 'add', 'update', 'change', 'apply', 'delete', 'destroy', 'read'];

  for (const action of order) {
    const items = grouped[action];
    if (!items || items.length === 0) {
      continue;
    }

    for (const item of items) {
      const symbol = formatAction(item.action);
      const resource = formatResource(item.resource);
      ui.print(`  ${symbol} ${resource}`);

      // Show address if different from resource name
      if (item.address && item.address !== item.resource) {
        ui.print(`      ${ui.dim(item.address)}`);
      }
    }
  }

  // Display any remaining actions not in order
  for (const [action, items] of Object.entries(grouped)) {
    if (order.includes(action)) {
      continue;
    }

    for (const item of items) {
      const symbol = formatAction(item.action);
      const resource = formatResource(item.resource);
      ui.print(`  ${symbol} ${resource}`);
    }
  }
}

/**
 * Display raw plan output (detailed mode)
 */
function displayRawPlan(raw: string): void {
  ui.newLine();
  ui.print('Detailed Plan:');
  ui.newLine();

  // Limit output length
  const maxLength = 5000;
  if (raw.length > maxLength) {
    ui.print(raw.slice(0, maxLength));
    ui.newLine();
    ui.print(ui.dim(`... (output truncated, ${raw.length - maxLength} more characters)`));
  } else {
    ui.print(raw);
  }
}

/**
 * Display Terraform-specific plan
 */
function displayTerraformPlan(plan: PlanResult, detailed: boolean): void {
  if (plan.changes) {
    displaySummary(plan.changes);
  }

  if (plan.resources && plan.resources.length > 0) {
    displayResources(plan.resources);
  }

  if (detailed && plan.raw) {
    displayRawPlan(plan.raw);
  }

  // Show next steps
  ui.newLine();
  ui.print('Next steps:');
  ui.print('  - Review the changes above');
  ui.print('  - Run "nimbus apply terraform" to apply');
  ui.print('  - Or run "nimbus tf apply" for more options');
}

/**
 * Display Kubernetes-specific plan
 */
function displayK8sPlan(plan: PlanResult, detailed: boolean): void {
  if (plan.changes) {
    ui.print('Plan Summary:');
    ui.newLine();
    ui.print(`  ${ui.color(`${plan.changes.add} resource(s) to apply`, 'cyan')}`);
    if (plan.changes.change > 0) {
      ui.print(`  ${ui.color(`${plan.changes.change} resource(s) will be updated`, 'yellow')}`);
    }
    ui.newLine();
    ui.info("Note: Kubernetes apply is idempotent - unchanged resources won't be modified");
  }

  if (plan.resources && plan.resources.length > 0) {
    displayResources(plan.resources);
  }

  if (detailed && plan.raw) {
    displayRawPlan(plan.raw);
  }

  // Show next steps
  ui.newLine();
  ui.print('Next steps:');
  ui.print('  - Review the resources above');
  ui.print('  - Run "nimbus apply k8s" to apply');
  ui.print('  - Or run "nimbus k8s apply" for more options');
}

/**
 * Display Helm-specific plan
 */
function displayHelmPlan(plan: PlanResult, detailed: boolean): void {
  if (plan.changes) {
    ui.print('Plan Summary:');
    ui.newLine();
    if (plan.changes.add > 0) {
      ui.print(`  ${ui.color(`+ ${plan.changes.add} resource(s) to create`, 'green')}`);
    }
    if (plan.changes.change > 0) {
      ui.print(`  ${ui.color(`~ ${plan.changes.change} resource(s) to update`, 'yellow')}`);
    }
    if (plan.changes.destroy > 0) {
      ui.print(`  ${ui.color(`- ${plan.changes.destroy} resource(s) to remove`, 'red')}`);
    }
  }

  if (plan.resources && plan.resources.length > 0) {
    displayResources(plan.resources);
  }

  if (detailed && plan.raw) {
    displayRawPlan(plan.raw);
  }

  // Show next steps
  ui.newLine();
  ui.print('Next steps:');
  ui.print('  - Review the changes above');
  ui.print('  - Run "nimbus apply helm" to install/upgrade');
  ui.print('  - Or run "nimbus helm install/upgrade" for more options');
}

/**
 * Display plan result
 */
export function displayPlan(plan: PlanResult, detailed = false): void {
  switch (plan.type) {
    case 'terraform':
      displayTerraformPlan(plan, detailed);
      break;
    case 'k8s':
      displayK8sPlan(plan, detailed);
      break;
    case 'helm':
      displayHelmPlan(plan, detailed);
      break;
  }
}
