export interface BestPracticeRule {
  id: string;
  category: 'security' | 'tagging' | 'cost' | 'reliability' | 'performance' | 'networking' | 'compliance';
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  recommendation: string;
  applies_to: string[]; // Component types this rule applies to
  check: (config: Record<string, unknown>) => boolean;
  autofix?: (config: Record<string, unknown>) => Record<string, unknown>;
}

export interface BestPracticeViolation {
  rule_id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
  component: string;
  can_autofix: boolean;
}

export interface BestPracticeReport {
  summary: {
    total_rules_checked: number;
    violations_found: number;
    violations_by_severity: Record<string, number>;
    violations_by_category: Record<string, number>;
    autofixable_violations: number;
  };
  violations: BestPracticeViolation[];
  recommendations: string[];
}

export interface SecurityBestPractices {
  encryption_at_rest: boolean;
  encryption_in_transit: boolean;
  principle_of_least_privilege: boolean;
  network_isolation: boolean;
  secret_management: boolean;
  audit_logging: boolean;
  mfa_enabled: boolean;
}

export interface TaggingBestPractices {
  required_tags: string[];
  tag_format: 'PascalCase' | 'camelCase' | 'snake_case' | 'kebab-case';
  enforce_tags: boolean;
}

export interface CostOptimizationBestPractices {
  right_sizing: boolean;
  reserved_instances: boolean;
  spot_instances: boolean;
  lifecycle_policies: boolean;
  unused_resource_detection: boolean;
  cost_allocation_tags: boolean;
}
