/**
 * Unified Pricing Lookup
 *
 * Routes resource pricing lookups to the appropriate cloud provider module.
 */

import type { TerraformResource } from '../parsers/types';
import { getAWSPrice } from './aws';
import { getGCPPrice } from './gcp';
import { getAzurePrice } from './azure';

export interface PricingResult {
  /** Estimated monthly cost in USD */
  monthlyCost: number;
  /** Estimated hourly cost in USD */
  hourlyCost: number;
  /** Quantity (e.g. GB, instances, nodes) */
  quantity?: number;
  /** Unit label for the quantity */
  unit?: string;
  /** Human-readable pricing description */
  description?: string;
}

/**
 * Get the estimated price for a Terraform resource.
 * Returns null if the resource type is not recognized by any provider module.
 */
export function getResourcePrice(resource: TerraformResource): PricingResult | null {
  switch (resource.provider) {
    case 'aws':
      return getAWSPrice(resource);
    case 'gcp':
      return getGCPPrice(resource);
    case 'azure':
      return getAzurePrice(resource);
    default:
      return null;
  }
}
