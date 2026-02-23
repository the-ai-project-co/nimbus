/**
 * Cost Warning Utility
 *
 * Shows informational cost warnings before destructive operations.
 * Best-effort: silently skips on any failure.
 */

import { ui } from '../wizard/ui';
import { CostEstimator } from '../commands/cost/estimator';

/**
 * Show an informational cost warning before a destructive operation.
 * Calls CostEstimator.estimateDirectory() and displays the estimated
 * monthly cost impact as a negative value (savings from destroying).
 * Wrapped in try/catch — never throws.
 */
export async function showDestructionCostWarning(directory: string): Promise<void> {
  try {
    const estimate = await CostEstimator.estimateDirectory(directory);

    if (estimate.totalMonthlyCost > 0) {
      ui.warning(
        `Estimated monthly cost impact: -$${estimate.totalMonthlyCost.toFixed(2)}/month`
      );
    }
  } catch {
    // Best-effort — silently skip if estimation fails
  }
}
