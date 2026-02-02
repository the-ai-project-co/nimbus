import type { BestPracticeRule } from './types';

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
    applies_to: ['vpc', 'eks', 'rds', 's3'],
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
    applies_to: ['vpc', 'eks', 'rds', 's3'],
    check: (config) => {
      const tags = config.tags as Record<string, string> | undefined;
      if (!tags) return false;
      return 'CostCenter' in tags || 'Team' in tags;
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
];

/**
 * All Rules Combined
 */
export const allRules: BestPracticeRule[] = [
  ...securityRules,
  ...taggingRules,
  ...costRules,
  ...reliabilityRules,
  ...performanceRules,
];
