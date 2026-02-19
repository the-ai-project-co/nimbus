/**
 * AWS Static Pricing Lookup
 *
 * Monthly on-demand pricing based on us-east-1 as of 2024.
 * These are approximate list prices used for quick estimation.
 * Install Infracost for real-time, region-aware pricing.
 */

import type { TerraformResource } from '../parsers/types';
import type { PricingResult } from './index';

// Hours in a month (AWS standard)
const HOURS_PER_MONTH = 730;

// ------------------------------------------------------------------
// EC2 instance pricing (on-demand, us-east-1, Linux)
// ------------------------------------------------------------------
const EC2_PRICING: Record<string, number> = {
  // T2 burstable
  't2.nano': 4.18,
  't2.micro': 8.35,
  't2.small': 16.79,
  't2.medium': 33.41,
  't2.large': 66.82,
  't2.xlarge': 133.63,
  't2.2xlarge': 267.26,
  // T3 burstable
  't3.nano': 3.80,
  't3.micro': 7.59,
  't3.small': 15.18,
  't3.medium': 30.37,
  't3.large': 60.74,
  't3.xlarge': 121.47,
  't3.2xlarge': 242.94,
  // T3a (AMD)
  't3a.nano': 3.43,
  't3a.micro': 6.86,
  't3a.small': 13.72,
  't3a.medium': 27.45,
  't3a.large': 54.90,
  't3a.xlarge': 109.79,
  // M5 general purpose
  'm5.large': 69.12,
  'm5.xlarge': 138.24,
  'm5.2xlarge': 276.48,
  'm5.4xlarge': 552.96,
  'm5.8xlarge': 1105.92,
  'm5.12xlarge': 1658.88,
  // M6i general purpose
  'm6i.large': 69.12,
  'm6i.xlarge': 138.24,
  'm6i.2xlarge': 276.48,
  'm6i.4xlarge': 552.96,
  // M7i general purpose
  'm7i.large': 72.56,
  'm7i.xlarge': 145.12,
  'm7i.2xlarge': 290.24,
  // C5 compute optimized
  'c5.large': 61.20,
  'c5.xlarge': 122.40,
  'c5.2xlarge': 244.80,
  'c5.4xlarge': 489.60,
  'c5.9xlarge': 1101.60,
  // C6i compute optimized
  'c6i.large': 61.20,
  'c6i.xlarge': 122.40,
  'c6i.2xlarge': 244.80,
  // R5 memory optimized
  'r5.large': 90.72,
  'r5.xlarge': 181.44,
  'r5.2xlarge': 362.88,
  'r5.4xlarge': 725.76,
  // R6i memory optimized
  'r6i.large': 90.72,
  'r6i.xlarge': 181.44,
  'r6i.2xlarge': 362.88,
  // P3 GPU
  'p3.2xlarge': 2208.60,
  'p3.8xlarge': 8834.40,
  // G4dn GPU
  'g4dn.xlarge': 379.58,
  'g4dn.2xlarge': 543.12,
};

// ------------------------------------------------------------------
// RDS instance pricing (on-demand, us-east-1, Single-AZ)
// ------------------------------------------------------------------
const RDS_PRICING: Record<string, number> = {
  'db.t3.micro': 12.41,
  'db.t3.small': 24.82,
  'db.t3.medium': 49.64,
  'db.t3.large': 99.28,
  'db.t3.xlarge': 198.56,
  'db.t4g.micro': 11.83,
  'db.t4g.small': 23.65,
  'db.t4g.medium': 47.30,
  'db.m5.large': 124.10,
  'db.m5.xlarge': 248.20,
  'db.m5.2xlarge': 496.40,
  'db.m5.4xlarge': 992.80,
  'db.m6i.large': 124.10,
  'db.m6i.xlarge': 248.20,
  'db.r5.large': 172.80,
  'db.r5.xlarge': 345.60,
  'db.r5.2xlarge': 691.20,
  'db.r6i.large': 172.80,
  'db.r6i.xlarge': 345.60,
};

// ------------------------------------------------------------------
// EBS volume pricing (per GB/month, us-east-1)
// ------------------------------------------------------------------
const EBS_PRICING: Record<string, number> = {
  'gp2': 0.10,
  'gp3': 0.08,
  'io1': 0.125,
  'io2': 0.125,
  'st1': 0.045,
  'sc1': 0.015,
  'standard': 0.05,
};

// ------------------------------------------------------------------
// ElastiCache node pricing (on-demand, us-east-1)
// ------------------------------------------------------------------
const ELASTICACHE_PRICING: Record<string, number> = {
  'cache.t3.micro': 12.24,
  'cache.t3.small': 24.48,
  'cache.t3.medium': 49.06,
  'cache.t4g.micro': 11.52,
  'cache.t4g.small': 23.04,
  'cache.t4g.medium': 46.08,
  'cache.m5.large': 124.10,
  'cache.m5.xlarge': 248.20,
  'cache.r5.large': 163.52,
  'cache.r5.xlarge': 327.04,
};

/**
 * Look up the estimated monthly price for an AWS Terraform resource.
 */
export function getAWSPrice(resource: TerraformResource): PricingResult | null {
  const { type, attributes } = resource;

  switch (type) {
    // ----- Compute -----
    case 'aws_instance': {
      const instanceType = attributes.instance_type || 't3.medium';
      const price = EC2_PRICING[instanceType];
      if (!price) {
        return {
          monthlyCost: 30.37,
          hourlyCost: 30.37 / HOURS_PER_MONTH,
          description: `EC2 ${instanceType} (estimated, type not in lookup table)`,
        };
      }
      return {
        monthlyCost: price,
        hourlyCost: price / HOURS_PER_MONTH,
        unit: 'hours',
        description: `EC2 ${instanceType}`,
      };
    }

    case 'aws_launch_template':
    case 'aws_launch_configuration': {
      const instanceType = attributes.instance_type || 't3.medium';
      const price = EC2_PRICING[instanceType];
      if (!price) {
        return {
          monthlyCost: 0,
          hourlyCost: 0,
          description: `Launch template ${instanceType} (cost depends on ASG)`,
        };
      }
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: `Launch template ${instanceType} (cost depends on ASG)`,
      };
    }

    case 'aws_autoscaling_group': {
      const min = attributes.min_size || 1;
      const max = attributes.max_size || min;
      const desired = attributes.desired_capacity || min;
      // Estimate based on desired capacity with a default t3.medium
      const perInstance = 30.37;
      return {
        monthlyCost: desired * perInstance,
        hourlyCost: (desired * perInstance) / HOURS_PER_MONTH,
        quantity: desired,
        unit: 'instances',
        description: `ASG (${min}-${max}, desired ${desired}) estimated at t3.medium`,
      };
    }

    // ----- Database -----
    case 'aws_db_instance': {
      const instanceClass = attributes.instance_class || 'db.t3.medium';
      const price = RDS_PRICING[instanceClass] || 49.64;
      const storageGB = attributes.allocated_storage || 20;
      const storageType = attributes.storage_type || 'gp2';
      const storageRate = EBS_PRICING[storageType] || 0.115;
      const storageCost = storageGB * storageRate;
      const multiAz = attributes.multi_az === true ? 2 : 1;
      const totalCompute = price * multiAz;
      return {
        monthlyCost: totalCompute + storageCost,
        hourlyCost: totalCompute / HOURS_PER_MONTH,
        description: `RDS ${instanceClass}${multiAz > 1 ? ' Multi-AZ' : ''} + ${storageGB}GB ${storageType}`,
      };
    }

    case 'aws_rds_cluster': {
      // Aurora cluster (control plane + writer instance estimated)
      return {
        monthlyCost: 210.24,
        hourlyCost: 210.24 / HOURS_PER_MONTH,
        description: 'Aurora cluster (estimated writer instance)',
      };
    }

    case 'aws_rds_cluster_instance': {
      const instanceClass = attributes.instance_class || 'db.r5.large';
      const price = RDS_PRICING[instanceClass] || 172.80;
      return {
        monthlyCost: price,
        hourlyCost: price / HOURS_PER_MONTH,
        description: `Aurora instance ${instanceClass}`,
      };
    }

    // ----- Storage -----
    case 'aws_s3_bucket': {
      // S3 pricing is purely usage-based; estimate 100GB standard as a baseline
      return {
        monthlyCost: 2.30,
        hourlyCost: 0,
        unit: 'GB',
        description: 'S3 Standard (estimated 100GB baseline)',
      };
    }

    case 'aws_ebs_volume': {
      const volumeType = attributes.type || 'gp3';
      const size = attributes.size || 20;
      const pricePerGB = EBS_PRICING[volumeType] || 0.08;
      const iops = attributes.iops || 0;
      let iopsCost = 0;
      if (volumeType === 'io1' || volumeType === 'io2') {
        iopsCost = iops * 0.065; // per provisioned IOPS/month
      }
      return {
        monthlyCost: size * pricePerGB + iopsCost,
        hourlyCost: 0,
        quantity: size,
        unit: 'GB',
        description: `EBS ${volumeType} ${size}GB${iops ? ` ${iops} IOPS` : ''}`,
      };
    }

    case 'aws_efs_file_system': {
      // EFS standard: ~$0.30/GB, estimate 50GB
      return {
        monthlyCost: 15.00,
        hourlyCost: 0,
        unit: 'GB',
        description: 'EFS Standard (estimated 50GB)',
      };
    }

    // ----- Networking -----
    case 'aws_lb':
    case 'aws_alb': {
      // ALB: ~$0.0225/hr fixed + ~$0.008/LCU-hr
      const fixedCost = 0.0225 * HOURS_PER_MONTH; // ~$16.43
      const lcuEstimate = 5.84; // Estimated LCU charges
      return {
        monthlyCost: fixedCost + lcuEstimate,
        hourlyCost: 0.0225,
        description: 'Application Load Balancer (fixed + estimated LCU)',
      };
    }

    case 'aws_lb_target_group':
    case 'aws_alb_target_group': {
      return { monthlyCost: 0, hourlyCost: 0, description: 'ALB target group (no direct cost)' };
    }

    case 'aws_nat_gateway': {
      // NAT GW: $0.045/hr + $0.045/GB processed
      const fixedCost = 0.045 * HOURS_PER_MONTH; // ~$32.85
      const dataEstimate = 32.85; // Estimated ~730GB data processing
      return {
        monthlyCost: fixedCost + dataEstimate,
        hourlyCost: 0.045,
        description: 'NAT Gateway (fixed + estimated data processing)',
      };
    }

    case 'aws_eip': {
      // EIPs are free when attached to a running instance; $0.005/hr when idle
      return {
        monthlyCost: 3.65,
        hourlyCost: 0.005,
        description: 'Elastic IP (cost if unattached)',
      };
    }

    case 'aws_cloudfront_distribution': {
      // CloudFront pricing is usage-based; provide a baseline
      return {
        monthlyCost: 10.00,
        hourlyCost: 0,
        description: 'CloudFront (estimated baseline, usage-based)',
      };
    }

    // ----- Containers -----
    case 'aws_eks_cluster': {
      return {
        monthlyCost: 73.00,
        hourlyCost: 0.10,
        description: 'EKS cluster control plane',
      };
    }

    case 'aws_ecs_cluster': {
      // ECS cluster itself is free; costs come from tasks/services
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'ECS cluster (no direct cost, tasks billed separately)',
      };
    }

    case 'aws_ecs_service':
    case 'aws_ecs_task_definition': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'ECS service/task (cost depends on launch type and resources)',
      };
    }

    case 'aws_ecr_repository': {
      // ~$0.10/GB storage
      return {
        monthlyCost: 1.00,
        hourlyCost: 0,
        description: 'ECR repository (estimated 10GB images)',
      };
    }

    // ----- Serverless -----
    case 'aws_lambda_function': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Lambda (usage-based, $0 at rest)',
      };
    }

    case 'aws_api_gateway_rest_api':
    case 'aws_apigatewayv2_api': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'API Gateway (usage-based, $0 at rest)',
      };
    }

    case 'aws_sqs_queue': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'SQS queue (usage-based, first 1M requests free)',
      };
    }

    case 'aws_sns_topic': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'SNS topic (usage-based)',
      };
    }

    case 'aws_dynamodb_table': {
      const billingMode = attributes.billing_mode || 'PROVISIONED';
      if (billingMode === 'PAY_PER_REQUEST') {
        return {
          monthlyCost: 0,
          hourlyCost: 0,
          description: 'DynamoDB on-demand (usage-based)',
        };
      }
      // Provisioned: estimate from read/write capacity
      const rcu = attributes.read_capacity || 5;
      const wcu = attributes.write_capacity || 5;
      const rcuCost = rcu * 0.00013 * HOURS_PER_MONTH; // ~$0.09/RCU/month
      const wcuCost = wcu * 0.00065 * HOURS_PER_MONTH; // ~$0.47/WCU/month
      return {
        monthlyCost: rcuCost + wcuCost,
        hourlyCost: (rcuCost + wcuCost) / HOURS_PER_MONTH,
        description: `DynamoDB provisioned (${rcu} RCU, ${wcu} WCU)`,
      };
    }

    // ----- Caching -----
    case 'aws_elasticache_cluster': {
      const nodeType = attributes.node_type || 'cache.t3.medium';
      const numNodes = attributes.num_cache_nodes || 1;
      const price = ELASTICACHE_PRICING[nodeType] || 49.06;
      return {
        monthlyCost: price * numNodes,
        hourlyCost: (price * numNodes) / HOURS_PER_MONTH,
        quantity: numNodes,
        unit: 'nodes',
        description: `ElastiCache ${nodeType} x${numNodes}`,
      };
    }

    case 'aws_elasticache_replication_group': {
      const nodeType = attributes.node_type || 'cache.t3.medium';
      const numReplicas = (attributes.number_cache_clusters || attributes.num_cache_clusters || 2);
      const price = ELASTICACHE_PRICING[nodeType] || 49.06;
      return {
        monthlyCost: price * numReplicas,
        hourlyCost: (price * numReplicas) / HOURS_PER_MONTH,
        quantity: numReplicas,
        unit: 'nodes',
        description: `ElastiCache replication group ${nodeType} x${numReplicas}`,
      };
    }

    // ----- Monitoring / Logging -----
    case 'aws_cloudwatch_log_group': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'CloudWatch Logs (ingestion/storage usage-based)',
      };
    }

    case 'aws_cloudwatch_metric_alarm': {
      // Standard resolution: $0.10/alarm/month
      return {
        monthlyCost: 0.10,
        hourlyCost: 0,
        description: 'CloudWatch alarm',
      };
    }

    // ----- Security / Identity (no direct cost) -----
    case 'aws_vpc':
    case 'aws_subnet':
    case 'aws_route_table':
    case 'aws_route_table_association':
    case 'aws_route':
    case 'aws_internet_gateway':
    case 'aws_security_group':
    case 'aws_security_group_rule':
    case 'aws_network_acl':
    case 'aws_iam_role':
    case 'aws_iam_policy':
    case 'aws_iam_policy_attachment':
    case 'aws_iam_role_policy_attachment':
    case 'aws_iam_instance_profile':
    case 'aws_iam_user':
    case 'aws_iam_group':
    case 'aws_kms_key':
    case 'aws_kms_alias':
    case 'aws_ssm_parameter':
    case 'aws_secretsmanager_secret':
    case 'aws_acm_certificate':
    case 'aws_route53_zone':
    case 'aws_route53_record':
    case 'aws_waf_web_acl':
    case 'aws_wafv2_web_acl': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'No direct cost',
      };
    }

    // ----- Data Transfer / VPN -----
    case 'aws_vpn_gateway': {
      return {
        monthlyCost: 36.50,
        hourlyCost: 0.05,
        description: 'VPN Gateway',
      };
    }

    case 'aws_customer_gateway': {
      return { monthlyCost: 0, hourlyCost: 0, description: 'Customer gateway (no direct cost)' };
    }

    // ----- Elasticsearch / OpenSearch -----
    case 'aws_elasticsearch_domain':
    case 'aws_opensearch_domain': {
      const instanceType = attributes.instance_type || 't3.small.search';
      return {
        monthlyCost: 26.28,
        hourlyCost: 0.036,
        description: `OpenSearch ${instanceType} (estimated)`,
      };
    }

    // ----- Kinesis -----
    case 'aws_kinesis_stream': {
      const shardCount = attributes.shard_count || 1;
      // $0.015/shard-hour = ~$10.95/shard/month
      return {
        monthlyCost: shardCount * 10.95,
        hourlyCost: shardCount * 0.015,
        quantity: shardCount,
        unit: 'shards',
        description: `Kinesis stream (${shardCount} shards)`,
      };
    }

    // ----- Redshift -----
    case 'aws_redshift_cluster': {
      const nodeType = attributes.node_type || 'dc2.large';
      const numNodes = attributes.number_of_nodes || 1;
      // dc2.large ~$0.25/hr
      const perNode = 182.50;
      return {
        monthlyCost: perNode * numNodes,
        hourlyCost: (perNode * numNodes) / HOURS_PER_MONTH,
        quantity: numNodes,
        unit: 'nodes',
        description: `Redshift ${nodeType} x${numNodes}`,
      };
    }

    default:
      return null;
  }
}
