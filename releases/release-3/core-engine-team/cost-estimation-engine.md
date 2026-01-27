# Core Engine Team - Release 3 Specification

> **Team**: Core Engine Team
> **Phase**: Release 3 (Months 7-9)
> **Dependencies**: Cloud Provider APIs, State Layer

---

## Overview

Release 3 extends the Core Engine with cost estimation capabilities, usage tracking, and team policy enforcement.

---

## New Features

### 1. Cost Estimation Engine

#### 1.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cost Estimation Engine                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Parser    │  │  Pricing    │  │ Optimizer   │            │
│  │  (Terraform)│  │   APIs      │  │  Engine     │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  Provider Adapters                         │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────┐  │ │
│  │  │   AWS   │  │   GCP   │  │  Azure  │  │  Datadog    │  │ │
│  │  │ Pricing │  │ Pricing │  │ Pricing │  │  Pricing    │  │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────┘  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 1.2 Cost Estimator

**File**: `packages/core/src/cost/estimator.ts`

```typescript
interface CostEstimate {
  monthly: number;
  hourly: number;
  breakdown: CostItem[];
  optimizations: Optimization[];
  currency: string;
}

interface CostItem {
  resource: string;
  service: string;
  provider: 'aws' | 'gcp' | 'azure';
  monthlyCost: number;
  details: string;
  pricingModel: 'on-demand' | 'spot' | 'reserved' | 'committed';
}

interface Optimization {
  type: 'spot' | 'reserved' | 'rightsizing' | 'removal';
  resource: string;
  currentCost: number;
  optimizedCost: number;
  savingsPercent: number;
  recommendation: string;
}

export class CostEstimator {
  private pricingProviders: Map<string, PricingProvider>;

  constructor() {
    this.pricingProviders = new Map([
      ['aws', new AWSPricingProvider()],
      ['gcp', new GCPPricingProvider()],
      ['azure', new AzurePricingProvider()],
    ]);
  }

  async estimateTerraform(directory: string): Promise<CostEstimate> {
    // Parse Terraform files
    const resources = await this.parseTerraformResources(directory);

    // Get pricing for each resource
    const items: CostItem[] = [];
    for (const resource of resources) {
      const pricing = await this.getResourcePricing(resource);
      items.push(pricing);
    }

    // Calculate total
    const monthly = items.reduce((sum, item) => sum + item.monthlyCost, 0);

    // Find optimizations
    const optimizations = await this.findOptimizations(items);

    return {
      monthly,
      hourly: monthly / 730, // Average hours per month
      breakdown: items,
      optimizations,
      currency: 'USD',
    };
  }

  async estimatePlan(plan: Plan): Promise<CostEstimate> {
    const resources = this.extractResourcesFromPlan(plan);
    return this.estimateResources(resources);
  }

  private async getResourcePricing(resource: TerraformResource): Promise<CostItem> {
    const provider = this.pricingProviders.get(resource.provider);
    if (!provider) {
      throw new Error(`Unknown provider: ${resource.provider}`);
    }

    const price = await provider.getPrice(resource.type, resource.config);

    return {
      resource: resource.name,
      service: resource.type,
      provider: resource.provider,
      monthlyCost: price.monthly,
      details: price.details,
      pricingModel: price.model,
    };
  }

  private async findOptimizations(items: CostItem[]): Promise<Optimization[]> {
    const optimizations: Optimization[] = [];

    for (const item of items) {
      // Check for spot instance opportunities
      if (this.canUseSpot(item)) {
        const spotPrice = await this.getSpotPrice(item);
        optimizations.push({
          type: 'spot',
          resource: item.resource,
          currentCost: item.monthlyCost,
          optimizedCost: spotPrice,
          savingsPercent: ((item.monthlyCost - spotPrice) / item.monthlyCost) * 100,
          recommendation: `Use Spot instances for ${item.resource} to save ${Math.round((item.monthlyCost - spotPrice))}$/month`,
        });
      }

      // Check for reserved instance opportunities
      if (this.shouldReserve(item)) {
        const reservedPrice = await this.getReservedPrice(item);
        optimizations.push({
          type: 'reserved',
          resource: item.resource,
          currentCost: item.monthlyCost,
          optimizedCost: reservedPrice,
          savingsPercent: ((item.monthlyCost - reservedPrice) / item.monthlyCost) * 100,
          recommendation: `Consider 1-year reserved instance for ${item.resource}`,
        });
      }

      // Check for rightsizing
      const rightsizing = await this.checkRightsizing(item);
      if (rightsizing) {
        optimizations.push(rightsizing);
      }
    }

    return optimizations;
  }

  private canUseSpot(item: CostItem): boolean {
    // EC2, EKS nodes, batch workloads can use spot
    return ['aws_instance', 'aws_eks_node_group', 'google_compute_instance']
      .includes(item.service);
  }
}
```

#### 1.3 AWS Pricing Provider

**File**: `packages/core/src/cost/providers/aws.ts`

```typescript
import { PricingClient, GetProductsCommand } from '@aws-sdk/client-pricing';

interface ResourcePrice {
  monthly: number;
  details: string;
  model: 'on-demand' | 'spot' | 'reserved';
}

export class AWSPricingProvider implements PricingProvider {
  private client: PricingClient;
  private cache: Map<string, ResourcePrice> = new Map();

  constructor() {
    this.client = new PricingClient({ region: 'us-east-1' });
  }

  async getPrice(resourceType: string, config: Record<string, unknown>): Promise<ResourcePrice> {
    const cacheKey = this.getCacheKey(resourceType, config);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const price = await this.fetchPrice(resourceType, config);
    this.cache.set(cacheKey, price);
    return price;
  }

  private async fetchPrice(resourceType: string, config: Record<string, unknown>): Promise<ResourcePrice> {
    switch (resourceType) {
      case 'aws_instance':
        return this.getEC2Price(config);
      case 'aws_eks_cluster':
        return this.getEKSPrice(config);
      case 'aws_rds_instance':
        return this.getRDSPrice(config);
      case 'aws_nat_gateway':
        return this.getNATGatewayPrice(config);
      case 'aws_s3_bucket':
        return this.getS3Price(config);
      default:
        return { monthly: 0, details: 'Pricing not available', model: 'on-demand' };
    }
  }

  private async getEC2Price(config: Record<string, unknown>): Promise<ResourcePrice> {
    const instanceType = config.instance_type as string;
    const region = config.region as string || 'us-east-1';

    const command = new GetProductsCommand({
      ServiceCode: 'AmazonEC2',
      Filters: [
        { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
        { Type: 'TERM_MATCH', Field: 'location', Value: this.regionToLocation(region) },
        { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
        { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
        { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
      ],
    });

    const response = await this.client.send(command);
    const priceList = JSON.parse(response.PriceList?.[0] || '{}');
    const hourlyPrice = this.extractHourlyPrice(priceList);

    return {
      monthly: hourlyPrice * 730,
      details: `${instanceType} in ${region}`,
      model: 'on-demand',
    };
  }

  private async getEKSPrice(config: Record<string, unknown>): Promise<ResourcePrice> {
    // EKS control plane: $0.10/hour
    return {
      monthly: 0.10 * 730, // ~$73/month
      details: 'EKS Control Plane',
      model: 'on-demand',
    };
  }

  private async getNATGatewayPrice(config: Record<string, unknown>): Promise<ResourcePrice> {
    // NAT Gateway: ~$0.045/hour + data processing
    return {
      monthly: 0.045 * 730, // ~$32.85/month base
      details: 'NAT Gateway (base, excludes data processing)',
      model: 'on-demand',
    };
  }
}
```

---

### 2. Usage Tracking System

#### 2.1 Usage Tracker

**File**: `packages/core/src/usage/tracker.ts`

```typescript
interface UsageRecord {
  userId: string;
  teamId?: string;
  operationType: string;
  timestamp: Date;
  tokensUsed: number;
  costUsd: number;
  model: string;
}

interface UsageSummary {
  period: { start: Date; end: Date };
  totalOperations: number;
  byCategory: Record<string, number>;
  tokensUsed: number;
  estimatedCost: number;
}

export class UsageTracker {
  private db: Database;

  async recordUsage(record: Omit<UsageRecord, 'timestamp'>): Promise<void> {
    await this.db.usage.insert({
      ...record,
      timestamp: new Date(),
    });
  }

  async getSummary(userId: string, period: 'day' | 'week' | 'month'): Promise<UsageSummary> {
    const start = this.getPeriodStart(period);
    const end = new Date();

    const records = await this.db.usage
      .select()
      .where('userId', '=', userId)
      .where('timestamp', '>=', start)
      .where('timestamp', '<=', end)
      .execute();

    const byCategory: Record<string, number> = {};
    let tokensUsed = 0;
    let estimatedCost = 0;

    for (const record of records) {
      byCategory[record.operationType] = (byCategory[record.operationType] || 0) + 1;
      tokensUsed += record.tokensUsed;
      estimatedCost += record.costUsd;
    }

    return {
      period: { start, end },
      totalOperations: records.length,
      byCategory,
      tokensUsed,
      estimatedCost,
    };
  }

  async checkLimits(userId: string, tier: UserTier): Promise<LimitCheck> {
    const summary = await this.getSummary(userId, 'month');
    const limits = tierLimits[tier];

    return {
      withinLimits: summary.totalOperations < limits.operationsPerMonth,
      used: summary.totalOperations,
      limit: limits.operationsPerMonth,
      percentUsed: (summary.totalOperations / limits.operationsPerMonth) * 100,
    };
  }
}
```

#### 2.2 Tier Enforcement

**File**: `packages/core/src/usage/tiers.ts`

```typescript
interface TierLimits {
  operationsPerMonth: number;
  clouds: string[];
  teamMembers: number;
  historyRetentionDays: number;
  features: string[];
}

export const tierLimits: Record<string, TierLimits> = {
  free: {
    operationsPerMonth: 50,
    clouds: ['aws'],
    teamMembers: 1,
    historyRetentionDays: 7,
    features: ['basic_generation', 'basic_k8s'],
  },
  pro: {
    operationsPerMonth: -1, // unlimited
    clouds: ['aws', 'gcp', 'azure'],
    teamMembers: 1,
    historyRetentionDays: 90,
    features: ['all_generation', 'all_k8s', 'cicd', 'monitoring'],
  },
  team: {
    operationsPerMonth: -1,
    clouds: ['aws', 'gcp', 'azure'],
    teamMembers: -1, // unlimited
    historyRetentionDays: 365,
    features: ['all', 'team_features', 'audit_logs', 'sso'],
  },
  enterprise: {
    operationsPerMonth: -1,
    clouds: ['aws', 'gcp', 'azure'],
    teamMembers: -1,
    historyRetentionDays: -1, // unlimited
    features: ['all', 'enterprise_features', 'compliance', 'support'],
  },
};

export class TierEnforcer {
  private usageTracker: UsageTracker;

  async canPerformOperation(userId: string, operationType: string): Promise<boolean> {
    const user = await this.getUser(userId);
    const tier = tierLimits[user.tier];

    // Check operation limits
    const limits = await this.usageTracker.checkLimits(userId, user.tier);
    if (!limits.withinLimits) {
      throw new TierLimitExceededError('Monthly operation limit reached');
    }

    // Check feature access
    if (!this.hasFeatureAccess(tier, operationType)) {
      throw new FeatureNotAvailableError(`${operationType} not available in ${user.tier} tier`);
    }

    return true;
  }

  async canAccessCloud(userId: string, cloud: string): Promise<boolean> {
    const user = await this.getUser(userId);
    const tier = tierLimits[user.tier];

    return tier.clouds.includes(cloud);
  }
}
```

---

### 3. Team Policy Engine

#### 3.1 Policy Manager

**File**: `packages/core/src/policy/manager.ts`

```typescript
interface TeamPolicy {
  teamId: string;
  rules: PolicyRule[];
  approvers: ApproverConfig;
  restrictions: Restriction[];
}

interface PolicyRule {
  name: string;
  condition: PolicyCondition;
  action: 'allow' | 'deny' | 'require_approval';
  message?: string;
}

interface PolicyCondition {
  type: 'resource_type' | 'environment' | 'operation' | 'cost_threshold';
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
  value: string | number;
}

interface ApproverConfig {
  production: string[]; // List of user IDs who can approve production changes
  costThreshold: number; // Require approval for costs above this
  destructive: string[]; // Approvers for delete operations
}

export class PolicyManager {
  private db: Database;

  async checkPolicy(teamId: string, plan: Plan): Promise<PolicyCheckResult> {
    const policy = await this.getTeamPolicy(teamId);
    const violations: PolicyViolation[] = [];
    let requiresApproval = false;
    let approvers: string[] = [];

    for (const rule of policy.rules) {
      const matches = this.evaluateCondition(rule.condition, plan);

      if (matches) {
        switch (rule.action) {
          case 'deny':
            violations.push({
              rule: rule.name,
              message: rule.message || `Operation denied by policy: ${rule.name}`,
            });
            break;
          case 'require_approval':
            requiresApproval = true;
            approvers = this.getApprovers(policy, rule);
            break;
        }
      }
    }

    // Check cost threshold
    if (plan.estimatedCost && plan.estimatedCost > policy.approvers.costThreshold) {
      requiresApproval = true;
      approvers = [...new Set([...approvers, ...policy.approvers.production])];
    }

    return {
      allowed: violations.length === 0,
      violations,
      requiresApproval,
      approvers,
    };
  }

  private evaluateCondition(condition: PolicyCondition, plan: Plan): boolean {
    switch (condition.type) {
      case 'environment':
        return this.checkEnvironment(plan, condition);
      case 'resource_type':
        return this.checkResourceType(plan, condition);
      case 'operation':
        return this.checkOperation(plan, condition);
      case 'cost_threshold':
        return plan.estimatedCost > (condition.value as number);
      default:
        return false;
    }
  }

  async requestApproval(
    planId: string,
    approvers: string[],
    requester: string
  ): Promise<ApprovalRequest> {
    const request: ApprovalRequest = {
      id: generateId(),
      planId,
      requester,
      approvers,
      status: 'pending',
      createdAt: new Date(),
    };

    await this.db.approvalRequests.insert(request);

    // Notify approvers (via webhook, email, etc.)
    await this.notifyApprovers(request);

    return request;
  }

  async processApproval(
    requestId: string,
    approverId: string,
    decision: 'approve' | 'deny',
    comment?: string
  ): Promise<void> {
    const request = await this.db.approvalRequests.findOne({ id: requestId });

    if (!request.approvers.includes(approverId)) {
      throw new Error('User not authorized to approve this request');
    }

    await this.db.approvalRequests.update(
      { id: requestId },
      {
        status: decision === 'approve' ? 'approved' : 'denied',
        decidedBy: approverId,
        decidedAt: new Date(),
        comment,
      }
    );
  }
}
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-200 | As a user, I want cost estimates before operations | Accurate cost shown | Sprint 13-14 |
| US-201 | As a user, I want optimization suggestions | Spot/reserved options shown | Sprint 13-14 |
| US-202 | As a user, I want to see my usage | Usage dashboard accurate | Sprint 15-16 |
| US-203 | As an admin, I want to enforce team policies | Policies block violations | Sprint 17-18 |
| US-204 | As a user, I want approval workflows | Approvals work correctly | Sprint 17-18 |

---

## Sprint Breakdown

### Sprint 13-14 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Cost Estimator core | 4 days | Basic estimation |
| AWS Pricing provider | 3 days | AWS pricing API |
| GCP Pricing provider | 3 days | GCP pricing API |
| Optimization engine | 3 days | Cost suggestions |

### Sprint 15-16 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Usage Tracker | 3 days | Record usage |
| Usage Summary | 2 days | Aggregate data |
| Tier Enforcement | 3 days | Limit checks |
| Billing integration | 4 days | Stripe webhook |

### Sprint 17-18 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Policy Manager | 4 days | Policy evaluation |
| Approval workflows | 4 days | Request/approve flow |
| Notification system | 2 days | Alert approvers |
| Integration testing | 3 days | Full flow testing |

---

## Acceptance Criteria

- [ ] Cost estimates within 10% of actual AWS/GCP pricing
- [ ] Optimization suggestions save 20%+ when applicable
- [ ] Usage tracking accurate to the operation
- [ ] Tier limits enforced correctly
- [ ] Team policies can block operations
- [ ] Approval workflows notify and process correctly
- [ ] All cost/usage data exportable

---

*Document Version: 1.0*
*Last Updated: January 2026*
