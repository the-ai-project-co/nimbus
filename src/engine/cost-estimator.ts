/**
 * Cost Estimator
 *
 * Standalone module for estimating monthly and annual infrastructure costs
 * based on component type, environment, region, and usage patterns.
 *
 * Extracted from the cost estimation logic in verifier.ts and planner.ts,
 * with expanded capabilities for detailed breakdowns and recommendations.
 */

import { logger } from '../utils';

// ==========================================
// Cost Estimator Types
// ==========================================

/** Known infrastructure components with a base monthly cost. */
export type KnownComponent =
  | 'vpc'
  | 'eks'
  | 'rds'
  | 's3'
  | 'ecs'
  | 'lambda'
  | 'cloudfront'
  | 'elasticache'
  | 'sqs'
  | 'sns';

/** The environment tier affects cost multipliers and recommendations. */
export type EnvironmentTier = 'development' | 'staging' | 'production';

/** Cloud provider — affects regional pricing offsets. */
export type CloudProvider = 'aws' | 'gcp' | 'azure';

export interface CostEstimationInput {
  /** List of infrastructure components to estimate (e.g. ['vpc', 'eks', 'rds']) */
  components: string[];
  /** Target environment — affects multipliers */
  environment?: EnvironmentTier | string;
  /** Cloud provider — affects regional pricing offsets */
  provider?: CloudProvider | string;
  /** AWS/GCP/Azure region — used for regional cost adjustments */
  region?: string;
  /** Optional explicit budget cap; used to flag over-budget estimates */
  budgetLimit?: number;
  /** Custom per-component overrides (monthly USD) */
  customCosts?: Record<string, number>;
}

export interface ComponentCostBreakdown {
  component: string;
  baseMonthlyCost: number;
  adjustedMonthlyCost: number;
  environmentMultiplier: number;
  regionalMultiplier: number;
  notes: string;
}

export interface CostEstimate {
  /** Total estimated monthly cost in USD */
  totalMonthlyCost: number;
  /** Total estimated annual cost in USD */
  totalAnnualCost: number;
  /** Per-component cost breakdown */
  breakdown: ComponentCostBreakdown[];
  /** Budget status */
  withinBudget: boolean;
  /** Budget limit used for comparison (if provided) */
  budgetLimit?: number;
  /** Cost optimisation recommendations */
  recommendations: string[];
  /** Environment tier used in the estimate */
  environment: string;
  /** Cloud provider used in the estimate */
  provider: string;
  /** Timestamp of estimate generation */
  generatedAt: Date;
}

// ==========================================
// Constants
// ==========================================

/**
 * Base monthly component costs in USD.
 *
 * These are intentionally conservative estimates for the most common
 * instance sizes and usage patterns. Extracted directly from the
 * original verifier.ts cost table and expanded for additional components.
 *
 * Sources:
 *   vpc: NAT Gateway ($0.045/h * 730h) ~= $32
 *   eks: Control plane only ($0.10/h * 730h) ~= $73
 *   rds: db.t3.micro ($0.017/h) + 20GB storage (~$2.30) ~= $15; rounded to $50 with Multi-AZ
 *   s3:  Minimal storage estimate (< 100GB) ~= $5
 */
const BASE_COMPONENT_COSTS: Record<string, number> = {
  vpc: 32, // NAT Gateway
  eks: 73, // Control plane
  rds: 50, // db.t3.micro + storage
  s3: 5, // Minimal storage
  ecs: 30, // Fargate minimal
  lambda: 2, // < 1M invocations/month
  cloudfront: 10, // < 1TB transfer/month
  elasticache: 25, // cache.t3.micro
  sqs: 1, // < 1M requests/month
  sns: 1, // < 1M notifications/month
};

/**
 * Regional cost multipliers relative to us-east-1 (base = 1.0).
 * Approximate — derived from AWS published pricing differentials.
 */
const REGIONAL_MULTIPLIERS: Record<string, number> = {
  'us-east-1': 1.0,
  'us-east-2': 1.0,
  'us-west-1': 1.08,
  'us-west-2': 1.0,
  'eu-west-1': 1.06,
  'eu-west-2': 1.1,
  'eu-central-1': 1.08,
  'ap-southeast-1': 1.14,
  'ap-northeast-1': 1.16,
  'ap-south-1': 1.05,
  'sa-east-1': 1.2,
  'ca-central-1': 1.06,
  // GCP regions (approximate relative costs)
  'us-central1': 1.0,
  'us-east1': 1.0,
  'europe-west1': 1.08,
  'asia-east1': 1.12,
  // Azure regions
  eastus: 1.0,
  westus: 1.05,
  westeurope: 1.1,
  southeastasia: 1.12,
};

/**
 * Environment multipliers.
 * Production typically uses larger, HA-ready instances; dev uses minimal sizes.
 */
const ENVIRONMENT_MULTIPLIERS: Record<string, number> = {
  development: 0.5,
  staging: 0.75,
  production: 1.0,
  prod: 1.0,
  dev: 0.5,
  staging_: 0.75,
};

/**
 * Human-readable notes per component explaining the cost assumption.
 */
const COMPONENT_NOTES: Record<string, string> = {
  vpc: 'NAT Gateway ($0.045/h) — one AZ; add $32/mo per additional AZ',
  eks: 'EKS control plane only ($0.10/h); node group EC2 costs are additive',
  rds: 'db.t3.micro Multi-AZ estimated; scales significantly with instance class',
  s3: 'Minimal estimate (<100GB, <1M requests); review lifecycle policies for long-term savings',
  ecs: 'Fargate minimal workload; scales linearly with vCPU and memory allocation',
  lambda: 'Under 1M invocations/month; free tier may apply',
  cloudfront: 'Under 1TB egress/month; varies heavily with traffic patterns',
  elasticache: 'cache.t3.micro; consider Reserved Nodes for >30% savings in production',
  sqs: 'Under 1M requests/month; near-zero cost at small scale',
  sns: 'Under 1M notifications/month; near-zero cost at small scale',
};

// ==========================================
// CostEstimator
// ==========================================

export class CostEstimator {
  /**
   * Estimate the monthly and annual cost for a given set of components.
   */
  estimate(input: CostEstimationInput): CostEstimate {
    const environment = input.environment || 'production';
    const provider = input.provider || 'aws';
    const region = input.region || this.defaultRegion(provider);
    const budgetLimit = input.budgetLimit;

    logger.info(
      `Estimating cost for ${input.components.length} components ` +
        `(env=${environment}, provider=${provider}, region=${region})`
    );

    const envMultiplier = this.resolveEnvironmentMultiplier(environment);
    const regionMultiplier = this.resolveRegionalMultiplier(region);

    const breakdown: ComponentCostBreakdown[] = [];

    for (const component of input.components) {
      const baseCost = this.resolveBaseCost(component, input.customCosts);
      const adjustedCost = Math.round(baseCost * envMultiplier * regionMultiplier * 100) / 100;

      breakdown.push({
        component,
        baseMonthlyCost: baseCost,
        adjustedMonthlyCost: adjustedCost,
        environmentMultiplier: envMultiplier,
        regionalMultiplier: regionMultiplier,
        notes:
          COMPONENT_NOTES[component] ||
          `Estimate for ${component}; verify against provider pricing`,
      });
    }

    const totalMonthlyCost =
      Math.round(breakdown.reduce((sum, b) => sum + b.adjustedMonthlyCost, 0) * 100) / 100;

    const totalAnnualCost = Math.round(totalMonthlyCost * 12 * 100) / 100;

    const withinBudget = budgetLimit !== undefined ? totalMonthlyCost <= budgetLimit : true;

    const recommendations = this.generateRecommendations(input, breakdown, totalMonthlyCost);

    logger.info(
      `Cost estimate: $${totalMonthlyCost}/mo ($${totalAnnualCost}/yr); ` +
        `${withinBudget ? 'within' : 'exceeds'} budget`
    );

    return {
      totalMonthlyCost,
      totalAnnualCost,
      breakdown,
      withinBudget,
      budgetLimit,
      recommendations,
      environment,
      provider,
      generatedAt: new Date(),
    };
  }

  /**
   * Estimate cost from a flat context object (compatible with verifier/planner usage).
   *
   * This is a convenience wrapper that accepts the same `context` shape used
   * by the Verifier's `runCostChecks` method, allowing the CostEstimator to
   * serve as a drop-in replacement.
   */
  estimateFromContext(context: Record<string, unknown>): number {
    const components = (context.components as string[]) || [];
    const result = this.estimate({
      components,
      environment: (context.environment as string) || 'production',
      provider: (context.provider as string) || 'aws',
      region: context.region as string | undefined,
      budgetLimit: context.budget_limit as number | undefined,
    });
    return result.totalMonthlyCost;
  }

  /**
   * Format a CostEstimate as a Markdown report.
   */
  formatAsMarkdown(estimate: CostEstimate): string {
    const lines: string[] = [
      `# Infrastructure Cost Estimate`,
      ``,
      `**Environment:** ${estimate.environment}`,
      `**Provider:** ${estimate.provider}`,
      `**Generated:** ${estimate.generatedAt.toISOString()}`,
      ``,
      `## Summary`,
      ``,
      `| Metric | Value |`,
      `|--------|-------|`,
      `| Monthly Cost | $${estimate.totalMonthlyCost.toFixed(2)} |`,
      `| Annual Cost | $${estimate.totalAnnualCost.toFixed(2)} |`,
    ];

    if (estimate.budgetLimit !== undefined) {
      lines.push(
        `| Budget Limit | $${estimate.budgetLimit.toFixed(2)} |`,
        `| Status | ${estimate.withinBudget ? 'Within Budget' : 'Over Budget'} |`
      );
    }

    lines.push(
      ``,
      `## Component Breakdown`,
      ``,
      `| Component | Base ($/mo) | Adjusted ($/mo) | Notes |`,
      `|-----------|------------|----------------|-------|`
    );

    for (const b of estimate.breakdown) {
      lines.push(
        `| ${b.component} | $${b.baseMonthlyCost.toFixed(2)} | $${b.adjustedMonthlyCost.toFixed(2)} | ${b.notes} |`
      );
    }

    if (estimate.recommendations.length > 0) {
      lines.push(``, `## Recommendations`, ``);
      for (const rec of estimate.recommendations) {
        lines.push(`- ${rec}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate cost optimisation recommendations based on the estimate inputs and results.
   */
  private generateRecommendations(
    input: CostEstimationInput,
    breakdown: ComponentCostBreakdown[],
    totalMonthlyCost: number
  ): string[] {
    const recommendations: string[] = [];
    const env = (input.environment || 'production').toLowerCase();
    const components = input.components.map(c => c.toLowerCase());

    // Production: Reserved instances
    if (env === 'production' || env === 'prod') {
      const hasExpensive = components.some(c => ['eks', 'rds', 'elasticache'].includes(c));
      if (hasExpensive) {
        recommendations.push(
          'Consider Reserved Instances or Savings Plans for EKS nodes, RDS, and ElastiCache — ' +
            'typically 30-40% savings over on-demand pricing with 1-year commitments.'
        );
      }
    }

    // Non-production: Single NAT gateway
    if (env !== 'production' && env !== 'prod' && components.includes('vpc')) {
      recommendations.push(
        'Use a single NAT Gateway in non-production environments to save ~$32/mo per additional AZ.'
      );
    }

    // S3 lifecycle policies
    if (components.includes('s3')) {
      recommendations.push(
        'Configure S3 Lifecycle policies to transition infrequently accessed objects to ' +
          'S3 Intelligent-Tiering or Glacier; can reduce storage costs by 40-60%.'
      );
    }

    // Development: spot instances
    if (env === 'development' || env === 'dev') {
      if (components.some(c => ['eks', 'ecs'].includes(c))) {
        recommendations.push(
          'Use Spot Instances for development EKS node groups and ECS Fargate Spot — ' +
            'up to 90% savings with appropriate interruption handling.'
        );
      }
    }

    // High overall cost warning
    if (totalMonthlyCost > 1000) {
      recommendations.push(
        `Total monthly cost $${totalMonthlyCost.toFixed(2)} is significant. ` +
          'Review instance types, enable autoscaling, and run AWS Cost Explorer or GCP Cost Management ' +
          'to identify unexpected spend.'
      );
    }

    // Lambda: evaluate if replacing always-on compute
    if (
      components.includes('lambda') &&
      !components.includes('ecs') &&
      !components.includes('eks')
    ) {
      recommendations.push(
        'Lambda-only architecture is cost-efficient at low request volumes. ' +
          'Monitor concurrency limits and cold-start latency as traffic grows.'
      );
    }

    // EKS without VPC
    if (components.includes('eks') && !components.includes('vpc')) {
      recommendations.push(
        'EKS clusters require a VPC. If using an existing VPC, ensure its NAT Gateway costs are ' +
          'accounted for separately (typically +$32/mo per AZ).'
      );
    }

    return recommendations;
  }

  /**
   * Resolve base cost for a component, respecting custom overrides.
   */
  private resolveBaseCost(component: string, customCosts?: Record<string, number>): number {
    if (customCosts && component in customCosts) {
      return customCosts[component];
    }
    return BASE_COMPONENT_COSTS[component.toLowerCase()] ?? 0;
  }

  /**
   * Resolve environment multiplier from an environment string.
   */
  private resolveEnvironmentMultiplier(environment: string): number {
    const key = environment.toLowerCase();
    return ENVIRONMENT_MULTIPLIERS[key] ?? 1.0;
  }

  /**
   * Resolve regional multiplier from a region string.
   */
  private resolveRegionalMultiplier(region: string): number {
    return REGIONAL_MULTIPLIERS[region] ?? 1.0;
  }

  /**
   * Return the default region for a given provider.
   */
  private defaultRegion(provider: string): string {
    switch (provider.toLowerCase()) {
      case 'gcp':
        return 'us-central1';
      case 'azure':
        return 'eastus';
      case 'aws':
      default:
        return 'us-east-1';
    }
  }

  /**
   * Get the base cost table (useful for display or testing).
   */
  getBaseCostTable(): Record<string, number> {
    return { ...BASE_COMPONENT_COSTS };
  }

  /**
   * Get the regional multiplier table (useful for display or testing).
   */
  getRegionalMultiplierTable(): Record<string, number> {
    return { ...REGIONAL_MULTIPLIERS };
  }
}
