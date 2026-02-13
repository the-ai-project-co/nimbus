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
    applies_to: ['alb', 'elb'],
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
    applies_to: ['alb'],
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
    applies_to: ['vpc', 'subnet', 'eks', 'rds'],
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
    applies_to: ['cloudwatch', 'eks', 'rds', 'vpc'],
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
    applies_to: ['vpc', 'eks', 'rds', 's3', 'ec2'],
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
    applies_to: ['alb', 'target_group'],
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
];
