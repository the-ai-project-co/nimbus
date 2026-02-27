/**
 * Built-in Cost Estimator
 *
 * Parses Terraform .tf files and estimates costs using a static pricing
 * lookup table. This provides quick, offline cost estimates without
 * requiring external tools like Infracost.
 *
 * For more accurate, real-time pricing, install Infracost.
 */

import { TerraformParser } from './parsers/terraform';
import { getResourcePrice } from './pricing';
import type { CostEstimate, CostResource } from './index';

export class CostEstimator {
  /**
   * Estimate costs for a directory containing Terraform files.
   *
   * Reads all .tf files in the given directory, parses resource blocks,
   * and looks up estimated pricing for each recognized resource type.
   */
  static async estimateDirectory(directory: string): Promise<CostEstimate> {
    const parser = new TerraformParser();
    const resources = await parser.parseDirectory(directory);

    const costResources: CostResource[] = [];
    const unsupportedTypes: Record<string, number> = {};

    for (const resource of resources) {
      const pricing = getResourcePrice(resource);
      if (pricing) {
        costResources.push({
          name: `${resource.type}.${resource.name}`,
          resourceType: resource.type,
          monthlyCost: pricing.monthlyCost,
          hourlyCost: pricing.hourlyCost,
          monthlyQuantity: pricing.quantity,
          unit: pricing.unit,
        });
      } else {
        unsupportedTypes[resource.type] = (unsupportedTypes[resource.type] || 0) + 1;
      }
    }

    const totalMonthlyCost = costResources.reduce((sum, r) => sum + r.monthlyCost, 0);
    const totalHourlyCost = costResources.reduce((sum, r) => sum + (r.hourlyCost || 0), 0);

    return {
      version: '0.2',
      currency: 'USD',
      projects: [
        {
          name: directory.split('/').pop() || 'project',
          metadata: { source: 'nimbus-builtin' },
          pastTotalMonthlyCost: 0,
          pastTotalHourlyCost: 0,
          diffTotalMonthlyCost: 0,
          diffTotalHourlyCost: 0,
          totalMonthlyCost,
          totalHourlyCost,
          resources: costResources,
        },
      ],
      totalMonthlyCost,
      totalHourlyCost,
      diffTotalMonthlyCost: 0,
      timeGenerated: new Date().toISOString(),
      summary: {
        totalDetectedResources: resources.length,
        totalSupportedResources: costResources.length,
        totalUnsupportedResources: Object.values(unsupportedTypes).reduce((s, c) => s + c, 0),
        totalUsageBasedResources: 0,
        totalNoPriceResources: 0,
        unsupportedResourceCounts: unsupportedTypes,
        noPriceResourceCounts: {},
      },
    };
  }
}
