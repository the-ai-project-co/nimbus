/**
 * Cloud Cost Estimator
 *
 * Provides cost estimates for live cloud operations (EC2 start, RDS create,
 * EKS create, etc.) so users see a cost warning before committing to
 * billable actions.
 *
 * Pricing data is a simple static lookup table based on on-demand, us-east-1
 * list prices.  Monthly = hourly * 730.  The goal is user awareness, not
 * exact billing.
 */

// Hours in a standard AWS billing month
const HOURS_PER_MONTH = 730;

// ------------------------------------------------------------------
// EC2 instance hourly pricing (on-demand, us-east-1, Linux)
// ------------------------------------------------------------------
const EC2_HOURLY: Record<string, number> = {
  // T3 burstable
  't3.nano': 0.0052,
  't3.micro': 0.0104,
  't3.small': 0.0208,
  't3.medium': 0.0416,
  't3.large': 0.0832,
  't3.xlarge': 0.1664,
  't3.2xlarge': 0.3328,
  // T3a (AMD)
  't3a.nano': 0.0047,
  't3a.micro': 0.0094,
  't3a.small': 0.0188,
  't3a.medium': 0.0376,
  't3a.large': 0.0752,
  't3a.xlarge': 0.1504,
  // T2 burstable
  't2.nano': 0.0058,
  't2.micro': 0.0116,
  't2.small': 0.0230,
  't2.medium': 0.0464,
  't2.large': 0.0928,
  't2.xlarge': 0.1856,
  't2.2xlarge': 0.3712,
  // M5 general purpose
  'm5.large': 0.096,
  'm5.xlarge': 0.192,
  'm5.2xlarge': 0.384,
  'm5.4xlarge': 0.768,
  // M6i general purpose
  'm6i.large': 0.096,
  'm6i.xlarge': 0.192,
  'm6i.2xlarge': 0.384,
  // C5 compute optimized
  'c5.large': 0.085,
  'c5.xlarge': 0.170,
  'c5.2xlarge': 0.340,
  'c5.4xlarge': 0.680,
  // R5 memory optimized
  'r5.large': 0.126,
  'r5.xlarge': 0.252,
  'r5.2xlarge': 0.504,
  // GPU
  'p3.2xlarge': 3.06,
  'g4dn.xlarge': 0.526,
  'g4dn.2xlarge': 0.752,
};

// ------------------------------------------------------------------
// RDS instance hourly pricing (on-demand, us-east-1, Single-AZ)
// ------------------------------------------------------------------
const RDS_HOURLY: Record<string, number> = {
  'db.t3.micro': 0.017,
  'db.t3.small': 0.034,
  'db.t3.medium': 0.068,
  'db.t3.large': 0.136,
  'db.t3.xlarge': 0.272,
  'db.t4g.micro': 0.016,
  'db.t4g.small': 0.032,
  'db.t4g.medium': 0.065,
  'db.m5.large': 0.171,
  'db.m5.xlarge': 0.342,
  'db.m5.2xlarge': 0.684,
  'db.m6i.large': 0.171,
  'db.m6i.xlarge': 0.342,
  'db.r5.large': 0.240,
  'db.r5.xlarge': 0.480,
  'db.r5.2xlarge': 0.960,
  'db.r6i.large': 0.240,
  'db.r6i.xlarge': 0.480,
};

// ------------------------------------------------------------------
// Fixed hourly rates for managed services
// ------------------------------------------------------------------
const MANAGED_SERVICE_HOURLY: Record<string, number> = {
  'eks-cluster': 0.10,
  'nat-gateway': 0.045,
  'alb': 0.0225,
  'nlb': 0.0225,
  'vpn-gateway': 0.05,
  'elasticache-t3-medium': 0.068,
  'redshift-dc2-large': 0.25,
};

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type CloudOperation =
  | 'ec2:StartInstances'
  | 'ec2:RunInstances'
  | 'rds:StartDBInstance'
  | 'rds:CreateDBInstance'
  | 'eks:CreateCluster'
  | 'natgateway:Create'
  | 'alb:Create'
  | 'nlb:Create';

export interface CloudCostEstimate {
  /** Estimated hourly cost in USD */
  hourly: number;
  /** Estimated monthly cost in USD (hourly * 730) */
  monthly: number;
  /** Human-readable description of the cost estimate */
  description: string;
}

export interface CloudCostParams {
  /** EC2 instance type (e.g. t3.micro) */
  instanceType?: string;
  /** RDS instance class (e.g. db.t3.micro) */
  instanceClass?: string;
  /** Number of instances / resources */
  count?: number;
  /** Whether RDS Multi-AZ is enabled (doubles compute cost) */
  multiAz?: boolean;
}

// ------------------------------------------------------------------
// Main estimation function
// ------------------------------------------------------------------

/**
 * Estimate the cost of a cloud operation.
 *
 * Returns null if the operation or resource type is not recognized.
 */
export function estimateCloudCost(
  operation: CloudOperation,
  params: CloudCostParams = {}
): CloudCostEstimate | null {
  const count = params.count ?? 1;

  switch (operation) {
    case 'ec2:StartInstances':
    case 'ec2:RunInstances': {
      const type = params.instanceType || 't3.medium';
      const hourlyPerUnit = EC2_HOURLY[type];
      if (hourlyPerUnit === undefined) {
        // Unknown type -- provide a generic estimate with a caveat
        return {
          hourly: 0.0416 * count,
          monthly: 0.0416 * HOURS_PER_MONTH * count,
          description: `EC2 ${type} x${count} (pricing unavailable, using t3.medium estimate)`,
        };
      }
      const hourly = hourlyPerUnit * count;
      return {
        hourly,
        monthly: hourly * HOURS_PER_MONTH,
        description: `EC2 ${type}${count > 1 ? ` x${count}` : ''} on-demand`,
      };
    }

    case 'rds:StartDBInstance':
    case 'rds:CreateDBInstance': {
      const cls = params.instanceClass || 'db.t3.medium';
      const hourlyPerUnit = RDS_HOURLY[cls];
      const multiAzMultiplier = params.multiAz ? 2 : 1;
      if (hourlyPerUnit === undefined) {
        const fallback = 0.068; // db.t3.medium default
        const hourly = fallback * multiAzMultiplier * count;
        return {
          hourly,
          monthly: hourly * HOURS_PER_MONTH,
          description: `RDS ${cls}${params.multiAz ? ' Multi-AZ' : ''}${count > 1 ? ` x${count}` : ''} (pricing unavailable, using db.t3.medium estimate)`,
        };
      }
      const hourly = hourlyPerUnit * multiAzMultiplier * count;
      return {
        hourly,
        monthly: hourly * HOURS_PER_MONTH,
        description: `RDS ${cls}${params.multiAz ? ' Multi-AZ' : ''}${count > 1 ? ` x${count}` : ''} on-demand`,
      };
    }

    case 'eks:CreateCluster': {
      const hourly = MANAGED_SERVICE_HOURLY['eks-cluster'] * count;
      return {
        hourly,
        monthly: hourly * HOURS_PER_MONTH,
        description: `EKS cluster control plane${count > 1 ? ` x${count}` : ''} ($0.10/hr fixed)`,
      };
    }

    case 'natgateway:Create': {
      const hourly = MANAGED_SERVICE_HOURLY['nat-gateway'] * count;
      return {
        hourly,
        monthly: hourly * HOURS_PER_MONTH,
        description: `NAT Gateway${count > 1 ? ` x${count}` : ''} ($0.045/hr + data processing charges)`,
      };
    }

    case 'alb:Create': {
      const hourly = MANAGED_SERVICE_HOURLY['alb'] * count;
      return {
        hourly,
        monthly: hourly * HOURS_PER_MONTH,
        description: `Application Load Balancer${count > 1 ? ` x${count}` : ''} ($0.0225/hr + LCU charges)`,
      };
    }

    case 'nlb:Create': {
      const hourly = MANAGED_SERVICE_HOURLY['nlb'] * count;
      return {
        hourly,
        monthly: hourly * HOURS_PER_MONTH,
        description: `Network Load Balancer${count > 1 ? ` x${count}` : ''} ($0.0225/hr + LCU charges)`,
      };
    }

    default:
      return null;
  }
}

// ------------------------------------------------------------------
// Display helpers
// ------------------------------------------------------------------

/**
 * Format a cost estimate into a human-readable warning string.
 *
 * Example output:
 *   "Estimated cost: ~$0.04/hour ($30.37/month) - EC2 t3.medium on-demand"
 */
export function formatCostWarning(estimate: CloudCostEstimate): string {
  const hourly = estimate.hourly < 0.01
    ? `$${estimate.hourly.toFixed(4)}`
    : `$${estimate.hourly.toFixed(2)}`;
  const monthly = `$${estimate.monthly.toFixed(2)}`;
  return `Estimated cost: ~${hourly}/hour (${monthly}/month) - ${estimate.description}`;
}

/**
 * Resolve an EC2 instance type to its hourly cost, or undefined if unknown.
 */
export function getEC2HourlyCost(instanceType: string): number | undefined {
  return EC2_HOURLY[instanceType];
}

/**
 * Resolve an RDS instance class to its hourly cost, or undefined if unknown.
 */
export function getRDSHourlyCost(instanceClass: string): number | undefined {
  return RDS_HOURLY[instanceClass];
}
