/**
 * Best Practices Engine
 *
 * Merged module containing:
 * - BestPracticesEngine class (analyze, analyzeAll, autofix, scoring, reporting)
 * - All 60+ best practice rules across security, tagging, cost, reliability,
 *   performance, networking, compliance, ECS, and KMS categories
 */

import { logger } from '../utils';

// ==========================================
// Types
// ==========================================

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

// ==========================================
// Rules
// ==========================================

/**
 * Security Best Practice Rules
 */
export const securityRules: BestPracticeRule[] = [
  {
    id: 'sec-001',
    category: 'security',
    severity: 'critical',
    title: 'Enable Encryption at Rest',
    description: 'All data stores should have encryption at rest enabled',
    recommendation: 'Enable encryption at rest using AWS KMS for all data storage services',
    applies_to: ['rds', 's3', 'ebs', 'efs'],
    check: (config) => {
      return config.storage_encrypted === true || config.encryption_enabled === true;
    },
    autofix: (config) => ({
      ...config,
      storage_encrypted: true,
      encryption_enabled: true,
    }),
  },
  {
    id: 'sec-002',
    category: 'security',
    severity: 'high',
    title: 'Enable VPC Flow Logs',
    description: 'VPC should have flow logs enabled for security monitoring',
    recommendation: 'Enable VPC flow logs to monitor and troubleshoot network traffic',
    applies_to: ['vpc'],
    check: (config) => config.enable_flow_logs === true,
    autofix: (config) => ({
      ...config,
      enable_flow_logs: true,
      flow_logs_retention_days: 30,
    }),
  },
  {
    id: 'sec-003',
    category: 'security',
    severity: 'critical',
    title: 'Block Public Access for S3',
    description: 'S3 buckets should block all public access unless explicitly required',
    recommendation: 'Enable all S3 public access block settings',
    applies_to: ['s3'],
    check: (config) => {
      return (
        config.block_public_acls === true &&
        config.block_public_policy === true &&
        config.ignore_public_acls === true &&
        config.restrict_public_buckets === true
      );
    },
    autofix: (config) => ({
      ...config,
      block_public_acls: true,
      block_public_policy: true,
      ignore_public_acls: true,
      restrict_public_buckets: true,
    }),
  },
  {
    id: 'sec-004',
    category: 'security',
    severity: 'high',
    title: 'Enable S3 Versioning',
    description: 'S3 buckets should have versioning enabled for data protection',
    recommendation: 'Enable S3 versioning to protect against accidental deletion',
    applies_to: ['s3'],
    check: (config) => config.enable_versioning === true,
    autofix: (config) => ({
      ...config,
      enable_versioning: true,
    }),
  },
  {
    id: 'sec-005',
    category: 'security',
    severity: 'critical',
    title: 'Use Private Subnets for Databases',
    description: 'Databases should not be publicly accessible',
    recommendation: 'Deploy RDS instances in private subnets only',
    applies_to: ['rds'],
    check: (config) => config.publicly_accessible === false,
    autofix: (config) => ({
      ...config,
      publicly_accessible: false,
    }),
  },
  {
    id: 'sec-006',
    category: 'security',
    severity: 'high',
    title: 'Enable Deletion Protection',
    description: 'Production databases should have deletion protection enabled',
    recommendation: 'Enable deletion protection for RDS instances',
    applies_to: ['rds'],
    check: (config) => {
      if (config.environment === 'production') {
        return config.deletion_protection === true;
      }
      return true; // Not required for non-production
    },
    autofix: (config) => {
      if (config.environment === 'production') {
        return { ...config, deletion_protection: true };
      }
      return config;
    },
  },
  {
    id: 'sec-007',
    category: 'security',
    severity: 'medium',
    title: 'Enable EKS Cluster Logging',
    description: 'EKS clusters should have control plane logging enabled',
    recommendation: 'Enable all EKS cluster log types for auditing and troubleshooting',
    applies_to: ['eks'],
    check: (config) => config.enable_cluster_logs === true,
    autofix: (config) => ({
      ...config,
      enable_cluster_logs: true,
      cluster_log_types: ['api', 'audit', 'authenticator', 'controllerManager', 'scheduler'],
      cluster_log_retention_days: 30,
    }),
  },
  {
    id: 'sec-008',
    category: 'security',
    severity: 'high',
    title: 'Enable EKS Secret Encryption',
    description: 'EKS should encrypt Kubernetes secrets at rest',
    recommendation: 'Configure KMS key for EKS secret encryption',
    applies_to: ['eks'],
    check: (config) => config.enable_secret_encryption === true,
    autofix: (config) => ({
      ...config,
      enable_secret_encryption: true,
    }),
  },
  {
    id: 'sec-009',
    category: 'security',
    severity: 'medium',
    title: 'Restrict EKS API Access',
    description: 'EKS API endpoint should not be publicly accessible without restrictions',
    recommendation: 'Limit public access CIDR blocks or use private endpoint only',
    applies_to: ['eks'],
    check: (config) => {
      if (config.endpoint_public_access === false) return true;
      return Array.isArray(config.public_access_cidrs) && config.public_access_cidrs.length > 0;
    },
  },
  {
    id: 'sec-010',
    category: 'security',
    severity: 'high',
    title: 'Enable RDS Enhanced Monitoring',
    description: 'RDS instances should have enhanced monitoring enabled',
    recommendation: 'Enable enhanced monitoring with 60-second granularity',
    applies_to: ['rds'],
    check: (config) => config.enable_enhanced_monitoring === true,
    autofix: (config) => ({
      ...config,
      enable_enhanced_monitoring: true,
    }),
  },
];

/**
 * Additional Security Best Practice Rules
 */
export const additionalSecurityRules: BestPracticeRule[] = [
  {
    id: 'sec-011',
    category: 'security',
    severity: 'high',
    title: 'Enable CloudTrail Logging',
    description: 'CloudTrail should be enabled for all API calls',
    recommendation: 'Enable CloudTrail logging in all regions for audit and compliance',
    applies_to: ['cloudtrail', 'account'],
    check: (config) => config.enable_cloudtrail === true,
    autofix: (config) => ({
      ...config,
      enable_cloudtrail: true,
      cloudtrail_multi_region: true,
    }),
  },
  {
    id: 'sec-012',
    category: 'security',
    severity: 'high',
    title: 'Use HTTPS-Only for ALB Listeners',
    description: 'Application Load Balancers should only use HTTPS listeners',
    recommendation: 'Configure ALB listeners to use HTTPS with valid SSL certificates',
    applies_to: ['alb', 'elb', 'ecs'],
    check: (config) => config.listener_protocol === 'HTTPS' || config.redirect_http_to_https === true,
    autofix: (config) => ({
      ...config,
      redirect_http_to_https: true,
    }),
  },
  {
    id: 'sec-013',
    category: 'security',
    severity: 'critical',
    title: 'Restrict SSH Access',
    description: 'SSH access should not be open to 0.0.0.0/0',
    recommendation: 'Restrict SSH (port 22) access to known CIDR ranges only',
    applies_to: ['security_group', 'vpc'],
    check: (config) => {
      const rules = config.ingress_rules as Array<{ port: number; cidr: string }> | undefined;
      if (!rules) return true;
      return !rules.some(r => r.port === 22 && r.cidr === '0.0.0.0/0');
    },
  },
  {
    id: 'sec-014',
    category: 'security',
    severity: 'medium',
    title: 'Enable WAF for Public-Facing ALBs',
    description: 'Public-facing ALBs should have WAF enabled',
    recommendation: 'Attach AWS WAF to public-facing Application Load Balancers',
    applies_to: ['alb', 'ecs'],
    check: (config) => config.enable_waf === true || config.internal === true,
    autofix: (config) => {
      if (!config.internal) {
        return { ...config, enable_waf: true };
      }
      return config;
    },
  },
  {
    id: 'sec-015',
    category: 'security',
    severity: 'medium',
    title: 'Enable GuardDuty',
    description: 'GuardDuty should be enabled for threat detection',
    recommendation: 'Enable Amazon GuardDuty for intelligent threat detection',
    applies_to: ['account', 'guardduty'],
    check: (config) => config.enable_guardduty === true,
    autofix: (config) => ({
      ...config,
      enable_guardduty: true,
    }),
  },
  {
    id: 'sec-016',
    category: 'security',
    severity: 'high',
    title: 'Use IAM Roles Instead of Access Keys',
    description: 'Prefer IAM roles over long-lived access keys',
    recommendation: 'Use IAM roles for EC2/ECS/EKS instead of embedding access keys',
    applies_to: ['iam', 'ec2', 'ecs', 'eks'],
    check: (config) => config.use_iam_role === true || config.access_key_id === undefined,
  },
  {
    id: 'sec-017',
    category: 'security',
    severity: 'medium',
    title: 'Enable MFA Delete on S3 Buckets',
    description: 'S3 buckets should have MFA delete enabled for critical data',
    recommendation: 'Enable MFA delete to prevent accidental or malicious deletion',
    applies_to: ['s3'],
    check: (config) => {
      if (config.environment === 'production') {
        return config.mfa_delete === true;
      }
      return true;
    },
  },
  {
    id: 'sec-018',
    category: 'security',
    severity: 'high',
    title: 'Encrypt EBS Volumes by Default',
    description: 'EBS volumes should be encrypted by default',
    recommendation: 'Enable default EBS encryption for all new volumes',
    applies_to: ['ebs', 'ec2'],
    check: (config) => config.ebs_encryption === true || config.encrypted === true,
    autofix: (config) => ({
      ...config,
      ebs_encryption: true,
      encrypted: true,
    }),
  },
];

/**
 * Tagging Best Practice Rules
 */
export const taggingRules: BestPracticeRule[] = [
  {
    id: 'tag-001',
    category: 'tagging',
    severity: 'medium',
    title: 'Mandatory Tags Present',
    description: 'All resources should have mandatory tags',
    recommendation: 'Include Environment, ManagedBy, Project, and Owner tags on all resources',
    applies_to: ['vpc', 'eks', 'rds', 's3', 'ecs', 'kms'],
    check: (config) => {
      const tags = config.tags as Record<string, string> | undefined;
      if (!tags) return false;

      const requiredTags = ['Environment', 'ManagedBy', 'Project'];
      return requiredTags.every((tag) => tag in tags);
    },
    autofix: (config) => ({
      ...config,
      tags: {
        ...(config.tags as Record<string, string> || {}),
        Environment: config.environment || 'development',
        ManagedBy: 'Terraform',
        Project: config.project_name,
      },
    }),
  },
  {
    id: 'tag-002',
    category: 'tagging',
    severity: 'low',
    title: 'Cost Allocation Tags',
    description: 'Resources should include cost allocation tags',
    recommendation: 'Add CostCenter and Team tags for cost tracking',
    applies_to: ['vpc', 'eks', 'rds', 's3', 'ecs', 'kms'],
    check: (config) => {
      const tags = config.tags as Record<string, string> | undefined;
      if (!tags) return false;
      return 'CostCenter' in tags || 'Team' in tags;
    },
  },
  {
    id: 'tag-003',
    category: 'tagging',
    severity: 'low',
    title: 'Use Consistent Naming Convention',
    description: 'Resources should follow a consistent naming convention',
    recommendation: 'Use format: {project}-{environment}-{component}-{resource_type}',
    applies_to: ['vpc', 'eks', 'rds', 's3', 'ec2', 'ecs', 'kms'],
    check: (config) => {
      const name = config.name || config.resource_name;
      if (!name) return true;
      return /^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+/.test(name as string);
    },
  },
];

/**
 * Cost Optimization Best Practice Rules
 */
export const costRules: BestPracticeRule[] = [
  {
    id: 'cost-001',
    category: 'cost',
    severity: 'medium',
    title: 'Enable S3 Lifecycle Policies',
    description: 'S3 buckets should have lifecycle policies to optimize storage costs',
    recommendation: 'Configure lifecycle rules to transition old objects to cheaper storage classes',
    applies_to: ['s3'],
    check: (config) => config.enable_lifecycle_rules === true,
    autofix: (config) => ({
      ...config,
      enable_lifecycle_rules: true,
      transition_to_ia_days: 30,
      transition_to_glacier_days: 90,
      expiration_days: 365,
    }),
  },
  {
    id: 'cost-002',
    category: 'cost',
    severity: 'low',
    title: 'Use Single NAT Gateway for Non-Production',
    description: 'Non-production environments can use a single NAT gateway to reduce costs',
    recommendation: 'Use single_nat_gateway = true for development/staging environments',
    applies_to: ['vpc'],
    check: (config) => {
      if (config.environment === 'production') return true;
      return config.single_nat_gateway === true;
    },
    autofix: (config) => {
      if (config.environment !== 'production') {
        return {
          ...config,
          single_nat_gateway: true,
          nat_gateway_count: 1,
        };
      }
      return config;
    },
  },
  {
    id: 'cost-003',
    category: 'cost',
    severity: 'medium',
    title: 'Use Spot Instances for EKS Node Groups',
    description: 'Consider using Spot instances for non-production EKS workloads',
    recommendation: 'Set capacity_type = "SPOT" for development environments to reduce costs by up to 90%',
    applies_to: ['eks'],
    check: (config) => {
      if (config.environment === 'production') return true;
      return config.node_capacity_type === 'SPOT';
    },
  },
  {
    id: 'cost-004',
    category: 'cost',
    severity: 'low',
    title: 'Enable RDS Storage Autoscaling',
    description: 'RDS should use storage autoscaling to optimize costs',
    recommendation: 'Set max_allocated_storage to enable storage autoscaling',
    applies_to: ['rds'],
    check: (config): boolean => {
      if (config.create_cluster) return true; // Aurora handles this differently
      return Boolean(
        config.max_allocated_storage &&
        Number(config.max_allocated_storage) > Number(config.db_allocated_storage || 0)
      );
    },
  },
  {
    id: 'cost-005',
    category: 'cost',
    severity: 'medium',
    title: 'Clean Up Incomplete Multipart Uploads',
    description: 'S3 should automatically clean up incomplete multipart uploads',
    recommendation: 'Add lifecycle rule to abort incomplete uploads after 7 days',
    applies_to: ['s3'],
    check: (config) => config.abort_incomplete_multipart_days !== undefined,
    autofix: (config) => ({
      ...config,
      enable_lifecycle_rules: true,
      abort_incomplete_multipart_days: 7,
    }),
  },
];

/**
 * Additional Cost Optimization Best Practice Rules
 */
export const additionalCostRules: BestPracticeRule[] = [
  {
    id: 'cost-006',
    category: 'cost',
    severity: 'medium',
    title: 'Use Reserved Capacity for Production',
    description: 'Production workloads should consider reserved capacity',
    recommendation: 'Use Reserved Instances or Savings Plans for predictable production workloads',
    applies_to: ['ec2', 'rds', 'eks'],
    check: (config) => {
      if (config.environment === 'production') {
        return config.reserved_capacity === true || config.savings_plan === true;
      }
      return true;
    },
  },
  {
    id: 'cost-007',
    category: 'cost',
    severity: 'low',
    title: 'Enable Intelligent Tiering for S3',
    description: 'S3 buckets should use Intelligent-Tiering for cost optimization',
    recommendation: 'Enable S3 Intelligent-Tiering to automatically move data to cheaper tiers',
    applies_to: ['s3'],
    check: (config) => config.intelligent_tiering === true,
    autofix: (config) => ({
      ...config,
      intelligent_tiering: true,
    }),
  },
  {
    id: 'cost-008',
    category: 'cost',
    severity: 'medium',
    title: 'Right-Size EKS Node Groups',
    description: 'EKS node groups should have appropriate min/max/desired counts',
    recommendation: 'Set min, max, and desired node counts to avoid over-provisioning',
    applies_to: ['eks'],
    check: (config) => {
      const min = Number(config.node_min_size || 0);
      const max = Number(config.node_max_size || 0);
      return min > 0 && max > 0 && max >= min;
    },
  },
  {
    id: 'cost-009',
    category: 'cost',
    severity: 'low',
    title: 'Set Budget Alerts for Cost Thresholds',
    description: 'AWS Budget alerts should be configured for cost monitoring',
    recommendation: 'Set up AWS Budgets with alerts at 80% and 100% of expected spend',
    applies_to: ['account', 'budget'],
    check: (config) => config.enable_budget_alerts === true,
    autofix: (config) => ({
      ...config,
      enable_budget_alerts: true,
    }),
  },
];

/**
 * Reliability Best Practice Rules
 */
export const reliabilityRules: BestPracticeRule[] = [
  {
    id: 'rel-001',
    category: 'reliability',
    severity: 'high',
    title: 'Enable Multi-AZ for Production RDS',
    description: 'Production databases should be deployed across multiple availability zones',
    recommendation: 'Enable multi_az = true for production RDS instances',
    applies_to: ['rds'],
    check: (config) => {
      if (config.environment !== 'production') return true;
      return config.enable_multi_az === true || config.create_cluster === true;
    },
    autofix: (config) => {
      if (config.environment === 'production' && !config.create_cluster) {
        return { ...config, enable_multi_az: true };
      }
      return config;
    },
  },
  {
    id: 'rel-002',
    category: 'reliability',
    severity: 'high',
    title: 'Enable RDS Automated Backups',
    description: 'RDS should have automated backups with sufficient retention',
    recommendation: 'Set backup retention to at least 7 days for production',
    applies_to: ['rds'],
    check: (config) => {
      const retentionDays = Number(config.backup_retention_days || 0);
      if (config.environment === 'production') {
        return retentionDays >= 7;
      }
      return retentionDays >= 1;
    },
    autofix: (config) => ({
      ...config,
      backup_retention_days: config.environment === 'production' ? 7 : 3,
    }),
  },
  {
    id: 'rel-003',
    category: 'reliability',
    severity: 'medium',
    title: 'Deploy EKS Across Multiple AZs',
    description: 'EKS should be deployed across at least 2 availability zones',
    recommendation: 'Use at least 2 private subnets in different AZs',
    applies_to: ['eks'],
    check: (config) => {
      const subnetCount = Number(config.private_subnet_count || 0);
      return subnetCount >= 2;
    },
  },
  {
    id: 'rel-004',
    category: 'reliability',
    severity: 'medium',
    title: 'Enable Auto Minor Version Upgrades',
    description: 'Enable automatic minor version upgrades for security patches',
    recommendation: 'Set auto_minor_version_upgrade = true for RDS',
    applies_to: ['rds'],
    check: (config) => config.auto_minor_version_upgrade === true,
    autofix: (config) => ({
      ...config,
      auto_minor_version_upgrade: true,
    }),
  },
];

/**
 * Additional Reliability Best Practice Rules
 */
export const additionalReliabilityRules: BestPracticeRule[] = [
  {
    id: 'rel-005',
    category: 'reliability',
    severity: 'high',
    title: 'Configure Health Checks for ALB Target Groups',
    description: 'ALB target groups should have health checks configured',
    recommendation: 'Configure health check path, interval, and thresholds for target groups',
    applies_to: ['alb', 'target_group', 'ecs'],
    check: (config) => config.health_check_path !== undefined,
    autofix: (config) => ({
      ...config,
      health_check_path: config.health_check_path || '/health',
      health_check_interval: config.health_check_interval || 30,
      healthy_threshold: config.healthy_threshold || 3,
      unhealthy_threshold: config.unhealthy_threshold || 3,
    }),
  },
  {
    id: 'rel-006',
    category: 'reliability',
    severity: 'medium',
    title: 'Set Termination Protection on Production Instances',
    description: 'Production instances should have termination protection enabled',
    recommendation: 'Enable termination protection to prevent accidental instance termination',
    applies_to: ['ec2', 'rds'],
    check: (config) => {
      if (config.environment === 'production') {
        return config.disable_api_termination === true || config.deletion_protection === true;
      }
      return true;
    },
    autofix: (config) => {
      if (config.environment === 'production') {
        return { ...config, disable_api_termination: true, deletion_protection: true };
      }
      return config;
    },
  },
  {
    id: 'rel-007',
    category: 'reliability',
    severity: 'medium',
    title: 'Enable Cross-Region Backup for Production RDS',
    description: 'Production RDS instances should have cross-region backups',
    recommendation: 'Enable cross-region automated backups for disaster recovery',
    applies_to: ['rds'],
    check: (config) => {
      if (config.environment === 'production') {
        return config.enable_cross_region_backup === true;
      }
      return true;
    },
  },
  {
    id: 'rel-008',
    category: 'reliability',
    severity: 'medium',
    title: 'Configure Pod Disruption Budgets',
    description: 'Kubernetes deployments should have Pod Disruption Budgets',
    recommendation: 'Set PodDisruptionBudget to ensure minimum availability during disruptions',
    applies_to: ['eks', 'kubernetes', 'deployment'],
    check: (config) => config.pod_disruption_budget !== undefined,
  },
];

/**
 * Performance Best Practice Rules
 */
export const performanceRules: BestPracticeRule[] = [
  {
    id: 'perf-001',
    category: 'performance',
    severity: 'medium',
    title: 'Enable RDS Performance Insights',
    description: 'Enable Performance Insights for database performance monitoring',
    recommendation: 'Enable performance_insights for RDS instances',
    applies_to: ['rds'],
    check: (config) => config.enable_performance_insights === true,
    autofix: (config) => ({
      ...config,
      enable_performance_insights: true,
      performance_insights_retention: 7,
    }),
  },
  {
    id: 'perf-002',
    category: 'performance',
    severity: 'low',
    title: 'Use GP3 Storage for RDS',
    description: 'Use gp3 storage type for better price-performance ratio',
    recommendation: 'Set storage_type = "gp3" for RDS instances',
    applies_to: ['rds'],
    check: (config) => {
      if (config.create_cluster) return true; // Aurora uses cluster storage
      return config.db_storage_type === 'gp3';
    },
    autofix: (config) => {
      if (!config.create_cluster) {
        return { ...config, db_storage_type: 'gp3' };
      }
      return config;
    },
  },
  {
    id: 'perf-003',
    category: 'performance',
    severity: 'low',
    title: 'Enable S3 Transfer Acceleration',
    description: 'Enable transfer acceleration for faster uploads from distant locations',
    recommendation: 'Consider enabling S3 transfer acceleration for global access patterns',
    applies_to: ['s3'],
    check: () => true, // Informational only
  },
  {
    id: 'perf-004',
    category: 'performance',
    severity: 'medium',
    title: 'Enable CloudFront for Static Assets',
    description: 'Use CloudFront CDN for serving static assets to reduce latency',
    recommendation: 'Configure CloudFront distribution for S3 static content delivery',
    applies_to: ['s3', 'cloudfront'],
    check: (config) => config.enable_cdn === true || config.is_private_bucket === true,
  },
];

/**
 * Networking Best Practice Rules
 */
export const networkingRules: BestPracticeRule[] = [
  {
    id: 'net-001',
    category: 'networking',
    severity: 'high',
    title: 'Use Private Subnets for Application Workloads',
    description: 'Application workloads should be deployed in private subnets',
    recommendation: 'Deploy application servers, databases, and backend services in private subnets',
    applies_to: ['vpc', 'subnet', 'eks', 'rds', 'ecs'],
    check: (config) => config.use_private_subnets === true || config.publicly_accessible === false,
    autofix: (config) => ({
      ...config,
      use_private_subnets: true,
      publicly_accessible: false,
    }),
  },
  {
    id: 'net-002',
    category: 'networking',
    severity: 'critical',
    title: 'Restrict Security Group CIDR Ranges',
    description: 'Security groups should not allow 0.0.0.0/0 ingress',
    recommendation: 'Restrict security group ingress rules to specific CIDR ranges',
    applies_to: ['security_group', 'vpc'],
    check: (config) => {
      const rules = config.ingress_rules as Array<{ cidr: string }> | undefined;
      if (!rules) return true;
      return !rules.some(r => r.cidr === '0.0.0.0/0');
    },
  },
  {
    id: 'net-003',
    category: 'networking',
    severity: 'low',
    title: 'Use Network ACLs as Additional Defense',
    description: 'Network ACLs provide an additional layer of security',
    recommendation: 'Configure Network ACLs in addition to security groups for defense in depth',
    applies_to: ['vpc', 'subnet'],
    check: (config) => config.enable_network_acls === true,
  },
  {
    id: 'net-004',
    category: 'networking',
    severity: 'medium',
    title: 'Enable DNS Hostnames and Resolution in VPC',
    description: 'VPCs should have DNS hostnames and resolution enabled',
    recommendation: 'Enable enable_dns_hostnames and enable_dns_support in VPC',
    applies_to: ['vpc'],
    check: (config) => config.enable_dns_hostnames === true && config.enable_dns_support === true,
    autofix: (config) => ({
      ...config,
      enable_dns_hostnames: true,
      enable_dns_support: true,
    }),
  },
  {
    id: 'net-005',
    category: 'networking',
    severity: 'medium',
    title: 'Use VPC Endpoints for AWS Service Access',
    description: 'Use VPC endpoints to access AWS services without internet gateway',
    recommendation: 'Create VPC endpoints for S3, DynamoDB, and other frequently accessed services',
    applies_to: ['vpc'],
    check: (config) => config.enable_vpc_endpoints === true,
    autofix: (config) => ({
      ...config,
      enable_vpc_endpoints: true,
    }),
  },
];

/**
 * Compliance Best Practice Rules
 */
export const complianceRules: BestPracticeRule[] = [
  {
    id: 'comp-001',
    category: 'compliance',
    severity: 'medium',
    title: 'Enable Access Logging for S3',
    description: 'S3 buckets should have access logging enabled',
    recommendation: 'Enable server access logging for S3 buckets to track requests',
    applies_to: ['s3'],
    check: (config) => config.enable_access_logging === true,
    autofix: (config) => ({
      ...config,
      enable_access_logging: true,
    }),
  },
  {
    id: 'comp-002',
    category: 'compliance',
    severity: 'medium',
    title: 'Enable Audit Logging for RDS',
    description: 'RDS instances should have audit logging enabled',
    recommendation: 'Enable audit logging for database activity tracking',
    applies_to: ['rds'],
    check: (config) => config.enable_audit_logging === true,
    autofix: (config) => ({
      ...config,
      enable_audit_logging: true,
    }),
  },
  {
    id: 'comp-003',
    category: 'compliance',
    severity: 'medium',
    title: 'Retain CloudWatch Logs for 90+ Days',
    description: 'CloudWatch log groups should retain logs for at least 90 days',
    recommendation: 'Set CloudWatch log retention to at least 90 days for compliance',
    applies_to: ['cloudwatch', 'eks', 'rds', 'vpc', 'ecs'],
    check: (config) => {
      const retention = Number(config.log_retention_days || 0);
      return retention >= 90;
    },
    autofix: (config) => ({
      ...config,
      log_retention_days: Math.max(Number(config.log_retention_days || 0), 90),
    }),
  },
  {
    id: 'comp-004',
    category: 'compliance',
    severity: 'low',
    title: 'Tag Resources with Compliance Framework',
    description: 'All resources should be tagged with compliance framework identifier',
    recommendation: 'Add a ComplianceFramework tag (e.g., SOC2, HIPAA, PCI-DSS) to all resources',
    applies_to: ['vpc', 'eks', 'rds', 's3', 'ec2', 'ecs', 'kms'],
    check: (config) => {
      const tags = config.tags as Record<string, string> | undefined;
      return tags !== undefined && 'ComplianceFramework' in tags;
    },
  },
  {
    id: 'comp-005',
    category: 'compliance',
    severity: 'medium',
    title: 'Enable Config Recording for Drift Detection',
    description: 'AWS Config should be enabled to record resource configurations',
    recommendation: 'Enable AWS Config recording for drift detection and compliance auditing',
    applies_to: ['account', 'config'],
    check: (config) => config.enable_config_recording === true,
    autofix: (config) => ({
      ...config,
      enable_config_recording: true,
    }),
  },
  {
    id: 'comp-006',
    category: 'compliance',
    severity: 'high',
    title: 'Enable SSE-KMS for Sensitive Data Buckets',
    description: 'S3 buckets containing sensitive data should use SSE-KMS encryption',
    recommendation: 'Use SSE-KMS instead of SSE-S3 for buckets with sensitive or regulated data',
    applies_to: ['s3'],
    check: (config) => config.sse_algorithm === 'aws:kms' || config.kms_key_id !== undefined,
    autofix: (config) => ({
      ...config,
      sse_algorithm: 'aws:kms',
    }),
  },
];

/**
 * ECS Best Practice Rules
 */
export const ecsRules: BestPracticeRule[] = [
  {
    id: 'ecs-001',
    category: 'security',
    severity: 'high',
    title: 'Use Fargate for Serverless Containers',
    description: 'Prefer Fargate launch type for serverless container management',
    recommendation: 'Use Fargate to eliminate the need to manage EC2 instances for container workloads',
    applies_to: ['ecs'],
    check: (config) => config.launch_type === 'FARGATE' || config.launch_type === undefined,
  },
  {
    id: 'ecs-002',
    category: 'security',
    severity: 'high',
    title: 'Deploy ECS Tasks in Private Subnets',
    description: 'ECS tasks should run in private subnets behind a load balancer',
    recommendation: 'Configure ECS service networking to use private subnets with assign_public_ip = false',
    applies_to: ['ecs'],
    check: (config) => config.assign_public_ip === false || config.assign_public_ip === undefined,
    autofix: (config) => ({
      ...config,
      assign_public_ip: false,
    }),
  },
  {
    id: 'ecs-003',
    category: 'reliability',
    severity: 'high',
    title: 'Enable ECS Deployment Circuit Breaker',
    description: 'ECS services should have deployment circuit breaker enabled',
    recommendation: 'Enable deployment circuit breaker with rollback to prevent failed deployments from impacting availability',
    applies_to: ['ecs'],
    check: (config) => config.enable_circuit_breaker === true,
    autofix: (config) => ({
      ...config,
      enable_circuit_breaker: true,
    }),
  },
  {
    id: 'ecs-004',
    category: 'security',
    severity: 'medium',
    title: 'Enable Container Insights',
    description: 'ECS clusters should have Container Insights enabled for monitoring',
    recommendation: 'Enable CloudWatch Container Insights for detailed container-level metrics',
    applies_to: ['ecs'],
    check: (config) => config.enable_container_insights === true,
    autofix: (config) => ({
      ...config,
      enable_container_insights: true,
    }),
  },
  {
    id: 'ecs-005',
    category: 'reliability',
    severity: 'medium',
    title: 'Configure ECS Auto Scaling',
    description: 'ECS services should have auto scaling configured for production workloads',
    recommendation: 'Enable target tracking scaling on CPU and memory utilization',
    applies_to: ['ecs'],
    check: (config) => {
      if (config.environment === 'production') {
        return config.enable_autoscaling === true;
      }
      return true;
    },
    autofix: (config) => {
      if (config.environment === 'production') {
        return {
          ...config,
          enable_autoscaling: true,
          autoscaling_min_capacity: config.desired_count || 2,
          autoscaling_max_capacity: Math.max(Number(config.desired_count || 2) * 3, 6),
          cpu_scaling_target: 70,
          memory_scaling_target: 70,
        };
      }
      return config;
    },
  },
  {
    id: 'ecs-006',
    category: 'cost',
    severity: 'low',
    title: 'Use Fargate Spot for Non-Production ECS',
    description: 'Non-production ECS workloads can use Fargate Spot for cost savings',
    recommendation: 'Configure FARGATE_SPOT capacity provider for development and staging environments',
    applies_to: ['ecs'],
    check: (config) => {
      if (config.environment === 'production') return true;
      return config.use_fargate_spot === true;
    },
  },
  {
    id: 'ecs-007',
    category: 'security',
    severity: 'medium',
    title: 'Set Read-Only Root Filesystem',
    description: 'ECS task containers should use read-only root filesystems where possible',
    recommendation: 'Set readonlyRootFilesystem = true in container definitions to prevent filesystem modifications',
    applies_to: ['ecs'],
    check: (config) => config.readonly_root_filesystem === true,
  },
];

/**
 * KMS Best Practice Rules
 */
export const kmsRules: BestPracticeRule[] = [
  {
    id: 'kms-001',
    category: 'security',
    severity: 'critical',
    title: 'Enable KMS Key Rotation',
    description: 'KMS keys should have automatic key rotation enabled',
    recommendation: 'Enable automatic annual key rotation for all customer-managed KMS keys',
    applies_to: ['kms'],
    check: (config) => config.enable_key_rotation === true,
    autofix: (config) => ({
      ...config,
      enable_key_rotation: true,
    }),
  },
  {
    id: 'kms-002',
    category: 'security',
    severity: 'high',
    title: 'Set Appropriate KMS Deletion Window',
    description: 'KMS keys should have a sufficient deletion waiting period',
    recommendation: 'Set deletion_window_in_days to at least 14 days (30 for production) to allow recovery from accidental deletion',
    applies_to: ['kms'],
    check: (config) => {
      const window = Number(config.deletion_window_in_days || 0);
      if (config.environment === 'production') {
        return window >= 30;
      }
      return window >= 7;
    },
    autofix: (config) => ({
      ...config,
      deletion_window_in_days: config.environment === 'production' ? 30 : 14,
    }),
  },
  {
    id: 'kms-003',
    category: 'security',
    severity: 'high',
    title: 'Restrict KMS Key Policy',
    description: 'KMS key policies should follow the principle of least privilege',
    recommendation: 'Define explicit key admins and key users instead of granting broad access',
    applies_to: ['kms'],
    check: (config) => {
      return (
        (Array.isArray(config.key_admins) && config.key_admins.length > 0) ||
        (Array.isArray(config.key_users) && config.key_users.length > 0)
      );
    },
  },
  {
    id: 'kms-004',
    category: 'compliance',
    severity: 'medium',
    title: 'Use KMS Key Aliases',
    description: 'KMS keys should have descriptive aliases for identification',
    recommendation: 'Create meaningful aliases for all KMS keys to improve manageability',
    applies_to: ['kms'],
    check: (config) => config.key_alias !== undefined && config.key_alias !== '',
  },
  {
    id: 'kms-005',
    category: 'reliability',
    severity: 'medium',
    title: 'Consider Multi-Region KMS Keys for DR',
    description: 'Production KMS keys should consider multi-region replication',
    recommendation: 'Enable multi-region for KMS keys used by services that need cross-region disaster recovery',
    applies_to: ['kms'],
    check: (config) => {
      if (config.environment === 'production') {
        return config.multi_region === true || config.cross_region_not_needed === true;
      }
      return true;
    },
  },
];

/**
 * All Rules Combined
 */
export const allRules: BestPracticeRule[] = [
  ...securityRules,
  ...additionalSecurityRules,
  ...taggingRules,
  ...costRules,
  ...additionalCostRules,
  ...reliabilityRules,
  ...additionalReliabilityRules,
  ...performanceRules,
  ...networkingRules,
  ...complianceRules,
  ...ecsRules,
  ...kmsRules,
];

// ==========================================
// Engine
// ==========================================

export class BestPracticesEngine {
  private rules: Map<string, BestPracticeRule>;

  constructor(customRules: BestPracticeRule[] = []) {
    this.rules = new Map();

    // Load default rules
    [...allRules, ...customRules].forEach((rule) => {
      this.rules.set(rule.id, rule);
    });

    logger.info(`Initialized Best Practices Engine with ${this.rules.size} rules`);
  }

  /**
   * Analyze configuration against all best practices
   */
  analyze(
    component: string,
    config: Record<string, unknown>,
    options?: {
      categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance' | 'networking' | 'compliance'>;
      severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
      includeInfo?: boolean;
    }
  ): BestPracticeReport {
    const violations: BestPracticeViolation[] = [];
    const recommendations: string[] = [];

    // Filter rules based on component and options
    const applicableRules = this.getApplicableRules(component, options);

    logger.debug(`Checking ${applicableRules.length} rules for component: ${component}`);

    // Check each rule
    for (const rule of applicableRules) {
      try {
        const passed = rule.check(config);

        if (!passed) {
          violations.push({
            rule_id: rule.id,
            category: rule.category,
            severity: rule.severity,
            title: rule.title,
            description: rule.description,
            recommendation: rule.recommendation,
            component,
            can_autofix: !!rule.autofix,
          });

          recommendations.push(rule.recommendation);
        }
      } catch (error) {
        logger.error(`Error checking rule ${rule.id}`, error);
      }
    }

    // Build summary
    const summary = this.buildSummary(violations, applicableRules.length);

    logger.info(
      `Best practices analysis complete: ${violations.length} violations found out of ${applicableRules.length} rules checked`
    );

    return {
      summary,
      violations,
      recommendations: [...new Set(recommendations)], // Deduplicate
    };
  }

  /**
   * Analyze multiple components
   */
  analyzeAll(
    configs: Array<{ component: string; config: Record<string, unknown> }>,
    options?: {
      categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance' | 'networking' | 'compliance'>;
      severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
    }
  ): BestPracticeReport {
    const allViolations: BestPracticeViolation[] = [];
    const allRecommendations: string[] = [];
    let totalRulesChecked = 0;

    for (const { component, config } of configs) {
      const report = this.analyze(component, config, options);
      allViolations.push(...report.violations);
      allRecommendations.push(...report.recommendations);
      totalRulesChecked += report.summary.total_rules_checked;
    }

    const summary = this.buildSummary(allViolations, totalRulesChecked);

    return {
      summary,
      violations: allViolations,
      recommendations: [...new Set(allRecommendations)],
    };
  }

  /**
   * Apply autofixes to configuration
   */
  autofix(
    component: string,
    config: Record<string, unknown>,
    options?: {
      categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance' | 'networking' | 'compliance'>;
      severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
      ruleIds?: string[];
    }
  ): {
    fixed_config: Record<string, unknown>;
    applied_fixes: string[];
    violations_remaining: BestPracticeViolation[];
  } {
    let fixedConfig = { ...config };
    const appliedFixes: string[] = [];

    // Get applicable rules
    let applicableRules = this.getApplicableRules(component, options);

    // Filter by rule IDs if specified
    if (options?.ruleIds) {
      applicableRules = applicableRules.filter((rule) =>
        options.ruleIds!.includes(rule.id)
      );
    }

    // Apply fixes
    for (const rule of applicableRules) {
      if (rule.autofix) {
        try {
          const passed = rule.check(fixedConfig);
          if (!passed) {
            fixedConfig = rule.autofix(fixedConfig);
            appliedFixes.push(rule.id);
            logger.debug(`Applied autofix for rule: ${rule.id}`);
          }
        } catch (error) {
          logger.error(`Error applying autofix for rule ${rule.id}`, error);
        }
      }
    }

    // Re-analyze to find remaining violations
    const report = this.analyze(component, fixedConfig, options);

    logger.info(`Applied ${appliedFixes.length} autofixes, ${report.violations.length} violations remaining`);

    return {
      fixed_config: fixedConfig,
      applied_fixes: appliedFixes,
      violations_remaining: report.violations,
    };
  }

  /**
   * Get rules by category
   */
  getRulesByCategory(category: 'security' | 'tagging' | 'cost' | 'reliability' | 'performance'): BestPracticeRule[] {
    const ruleMap = {
      security: securityRules,
      tagging: taggingRules,
      cost: costRules,
      reliability: reliabilityRules,
      performance: performanceRules,
    };

    return ruleMap[category] || [];
  }

  /**
   * Get a specific rule by ID
   */
  getRule(ruleId: string): BestPracticeRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * List all rules
   */
  listRules(): BestPracticeRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Add custom rule
   */
  addRule(rule: BestPracticeRule): void {
    this.rules.set(rule.id, rule);
    logger.debug(`Added custom rule: ${rule.id}`);
  }

  /**
   * Remove rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
    logger.debug(`Removed rule: ${ruleId}`);
  }

  /**
   * Get applicable rules for a component
   */
  private getApplicableRules(
    component: string,
    options?: {
      categories?: Array<'security' | 'tagging' | 'cost' | 'reliability' | 'performance' | 'networking' | 'compliance'>;
      severities?: Array<'critical' | 'high' | 'medium' | 'low' | 'info'>;
      includeInfo?: boolean;
    }
  ): BestPracticeRule[] {
    let rules = Array.from(this.rules.values()).filter((rule) =>
      rule.applies_to.includes(component)
    );

    // Filter by categories
    if (options?.categories && options.categories.length > 0) {
      rules = rules.filter((rule) => options.categories!.includes(rule.category));
    }

    // Filter by severities
    if (options?.severities && options.severities.length > 0) {
      rules = rules.filter((rule) => options.severities!.includes(rule.severity));
    }

    // Exclude info severity unless explicitly included
    if (!options?.includeInfo) {
      rules = rules.filter((rule) => rule.severity !== 'info');
    }

    return rules;
  }

  /**
   * Build summary from violations
   */
  private buildSummary(violations: BestPracticeViolation[], totalRulesChecked: number) {
    const violationsBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    const violationsByCategory: Record<string, number> = {
      security: 0,
      tagging: 0,
      cost: 0,
      reliability: 0,
      performance: 0,
    };

    let autofixableViolations = 0;

    for (const violation of violations) {
      violationsBySeverity[violation.severity] =
        (violationsBySeverity[violation.severity] || 0) + 1;
      violationsByCategory[violation.category] =
        (violationsByCategory[violation.category] || 0) + 1;

      if (violation.can_autofix) {
        autofixableViolations++;
      }
    }

    return {
      total_rules_checked: totalRulesChecked,
      violations_found: violations.length,
      violations_by_severity: violationsBySeverity,
      violations_by_category: violationsByCategory,
      autofixable_violations: autofixableViolations,
    };
  }

  /**
   * Get compliance score (percentage of passed rules)
   */
  getComplianceScore(report: BestPracticeReport): number {
    if (report.summary.total_rules_checked === 0) return 100;

    const passed = report.summary.total_rules_checked - report.summary.violations_found;
    return Math.round((passed / report.summary.total_rules_checked) * 100);
  }

  /**
   * Get security score (based on security violations)
   */
  getSecurityScore(report: BestPracticeReport): number {
    const securityViolations = report.violations.filter((v) => v.category === 'security');
    const totalSecurityRules = this.getRulesByCategory('security').length;

    if (totalSecurityRules === 0) return 100;

    const passed = totalSecurityRules - securityViolations.length;
    return Math.round((passed / totalSecurityRules) * 100);
  }

  /**
   * Format report as markdown
   */
  formatReportAsMarkdown(report: BestPracticeReport): string {
    let markdown = '# Best Practices Report\n\n';

    // Summary
    markdown += '## Summary\n\n';
    markdown += `- **Total Rules Checked**: ${report.summary.total_rules_checked}\n`;
    markdown += `- **Violations Found**: ${report.summary.violations_found}\n`;
    markdown += `- **Compliance Score**: ${this.getComplianceScore(report)}%\n`;
    markdown += `- **Security Score**: ${this.getSecurityScore(report)}%\n`;
    markdown += `- **Autofixable Violations**: ${report.summary.autofixable_violations}\n\n`;

    // Violations by Severity
    markdown += '### Violations by Severity\n\n';
    Object.entries(report.summary.violations_by_severity).forEach(([severity, count]) => {
      if (count > 0) {
        markdown += `- **${severity}**: ${count}\n`;
      }
    });
    markdown += '\n';

    // Violations by Category
    markdown += '### Violations by Category\n\n';
    Object.entries(report.summary.violations_by_category).forEach(([category, count]) => {
      if (count > 0) {
        markdown += `- **${category}**: ${count}\n`;
      }
    });
    markdown += '\n';

    // Violations Detail
    if (report.violations.length > 0) {
      markdown += '## Violations\n\n';

      // Group by severity
      const groupedBySeverity = report.violations.reduce((acc, v) => {
        if (!acc[v.severity]) acc[v.severity] = [];
        acc[v.severity].push(v);
        return acc;
      }, {} as Record<string, BestPracticeViolation[]>);

      const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];

      for (const severity of severityOrder) {
        const violations = groupedBySeverity[severity];
        if (!violations || violations.length === 0) continue;

        markdown += `### ${severity.toUpperCase()} Severity\n\n`;

        for (const violation of violations) {
          markdown += `#### ${violation.title}\n\n`;
          markdown += `- **Rule ID**: ${violation.rule_id}\n`;
          markdown += `- **Category**: ${violation.category}\n`;
          markdown += `- **Component**: ${violation.component}\n`;
          markdown += `- **Description**: ${violation.description}\n`;
          markdown += `- **Recommendation**: ${violation.recommendation}\n`;
          markdown += `- **Can Autofix**: ${violation.can_autofix ? 'Yes' : 'No'}\n\n`;
        }
      }
    }

    return markdown;
  }
}
