/**
 * GCP Static Pricing Lookup
 *
 * Monthly on-demand pricing based on us-central1 as of 2024.
 * These are approximate list prices used for quick estimation.
 * Install Infracost for real-time, region-aware pricing.
 */

import type { TerraformResource } from '../parsers/types';
import type { PricingResult } from './index';

const HOURS_PER_MONTH = 730;

// ------------------------------------------------------------------
// Compute Engine machine type pricing (on-demand, us-central1)
// ------------------------------------------------------------------
const GCE_PRICING: Record<string, number> = {
  // E2 shared-core
  'e2-micro': 6.11,
  'e2-small': 12.23,
  'e2-medium': 24.46,
  // E2 standard
  'e2-standard-2': 48.92,
  'e2-standard-4': 97.83,
  'e2-standard-8': 195.67,
  'e2-standard-16': 391.34,
  // N1 standard
  'n1-standard-1': 34.67,
  'n1-standard-2': 69.35,
  'n1-standard-4': 138.7,
  'n1-standard-8': 277.4,
  'n1-standard-16': 554.79,
  // N2 standard
  'n2-standard-2': 71.54,
  'n2-standard-4': 143.08,
  'n2-standard-8': 286.16,
  'n2-standard-16': 572.32,
  // N2D standard (AMD)
  'n2d-standard-2': 62.27,
  'n2d-standard-4': 124.54,
  'n2d-standard-8': 249.08,
  // C2 compute-optimized
  'c2-standard-4': 152.44,
  'c2-standard-8': 304.88,
  'c2-standard-16': 609.77,
  // M1 memory-optimized
  'm1-megamem-96': 7636.69,
  // N1 highmem
  'n1-highmem-2': 93.46,
  'n1-highmem-4': 186.93,
  'n1-highmem-8': 373.85,
  // F1/G1 (micro/small)
  'f1-micro': 3.88,
  'g1-small': 13.13,
};

// ------------------------------------------------------------------
// Cloud SQL pricing (on-demand, us-central1)
// ------------------------------------------------------------------
const CLOUD_SQL_PRICING: Record<string, number> = {
  'db-f1-micro': 7.67,
  'db-g1-small': 25.55,
  'db-n1-standard-1': 51.1,
  'db-n1-standard-2': 102.2,
  'db-n1-standard-4': 204.4,
  'db-n1-standard-8': 408.8,
  'db-n1-standard-16': 817.6,
  'db-n1-highmem-2': 117.8,
  'db-n1-highmem-4': 235.61,
  'db-n1-highmem-8': 471.22,
  'db-custom-1-3840': 51.1,
  'db-custom-2-7680': 102.2,
  'db-custom-4-15360': 204.4,
};

// ------------------------------------------------------------------
// Persistent Disk pricing (per GB/month, us-central1)
// ------------------------------------------------------------------
const DISK_PRICING: Record<string, number> = {
  'pd-standard': 0.04,
  'pd-balanced': 0.1,
  'pd-ssd': 0.17,
  'pd-extreme': 0.125,
};

/**
 * Look up the estimated monthly price for a GCP Terraform resource.
 */
export function getGCPPrice(resource: TerraformResource): PricingResult | null {
  const { type, attributes } = resource;

  switch (type) {
    // ----- Compute -----
    case 'google_compute_instance': {
      const machineType = attributes.machine_type || 'e2-medium';
      // machine_type can be a full URL or just the name
      const typeName = machineType.split('/').pop() || machineType;
      const price = GCE_PRICING[typeName];
      if (!price) {
        return {
          monthlyCost: 24.46,
          hourlyCost: 24.46 / HOURS_PER_MONTH,
          description: `GCE ${typeName} (estimated, type not in lookup table)`,
        };
      }
      return {
        monthlyCost: price,
        hourlyCost: price / HOURS_PER_MONTH,
        unit: 'hours',
        description: `GCE ${typeName}`,
      };
    }

    case 'google_compute_instance_template': {
      const machineType = attributes.machine_type || 'e2-medium';
      const typeName = machineType.split('/').pop() || machineType;
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: `Instance template ${typeName} (cost depends on instance group)`,
      };
    }

    case 'google_compute_instance_group_manager':
    case 'google_compute_region_instance_group_manager': {
      const targetSize = attributes.target_size || 1;
      const perInstance = 24.46; // default e2-medium
      return {
        monthlyCost: targetSize * perInstance,
        hourlyCost: (targetSize * perInstance) / HOURS_PER_MONTH,
        quantity: targetSize,
        unit: 'instances',
        description: `Instance group manager (${targetSize} instances, estimated e2-medium)`,
      };
    }

    // ----- Database -----
    case 'google_sql_database_instance': {
      const tier = attributes.tier || attributes['settings.tier'] || 'db-n1-standard-1';
      const price = CLOUD_SQL_PRICING[tier] || 51.1;
      const diskSize = attributes.disk_size || attributes['settings.disk_size'] || 10;
      const diskType = attributes.disk_type || attributes['settings.disk_type'] || 'PD_SSD';
      const diskRate = diskType === 'PD_HDD' ? 0.09 : 0.17;
      const diskCost = diskSize * diskRate;
      const ha =
        attributes.availability_type === 'REGIONAL' ||
        attributes['settings.availability_type'] === 'REGIONAL';
      const multiplier = ha ? 2 : 1;
      return {
        monthlyCost: price * multiplier + diskCost,
        hourlyCost: (price * multiplier) / HOURS_PER_MONTH,
        description: `Cloud SQL ${tier}${ha ? ' HA' : ''} + ${diskSize}GB`,
      };
    }

    case 'google_sql_database': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Cloud SQL database (no additional cost)',
      };
    }

    case 'google_spanner_instance': {
      const numNodes = attributes.num_nodes || 1;
      // $0.90/node-hour
      const cost = numNodes * 0.9 * HOURS_PER_MONTH;
      return {
        monthlyCost: cost,
        hourlyCost: numNodes * 0.9,
        quantity: numNodes,
        unit: 'nodes',
        description: `Cloud Spanner (${numNodes} nodes)`,
      };
    }

    // ----- Storage -----
    case 'google_storage_bucket': {
      // GCS standard: ~$0.020/GB, estimate 100GB
      return {
        monthlyCost: 2.0,
        hourlyCost: 0,
        unit: 'GB',
        description: 'GCS Standard (estimated 100GB baseline)',
      };
    }

    case 'google_compute_disk': {
      const diskType = attributes.type || 'pd-balanced';
      const size = attributes.size || 10;
      const pricePerGB = DISK_PRICING[diskType] || 0.1;
      return {
        monthlyCost: size * pricePerGB,
        hourlyCost: 0,
        quantity: size,
        unit: 'GB',
        description: `Persistent Disk ${diskType} ${size}GB`,
      };
    }

    // ----- Networking -----
    case 'google_compute_forwarding_rule':
    case 'google_compute_global_forwarding_rule': {
      // Forwarding rule: ~$0.025/hr
      return {
        monthlyCost: 18.25,
        hourlyCost: 0.025,
        description: 'Forwarding rule',
      };
    }

    case 'google_compute_router_nat': {
      // Cloud NAT: ~$0.044/hr per gateway + data processing
      const fixedCost = 0.044 * HOURS_PER_MONTH;
      return {
        monthlyCost: fixedCost + 32.12,
        hourlyCost: 0.044,
        description: 'Cloud NAT (fixed + estimated data processing)',
      };
    }

    case 'google_compute_address':
    case 'google_compute_global_address': {
      // Static IP: free when in use, $0.010/hr when idle
      return {
        monthlyCost: 7.3,
        hourlyCost: 0.01,
        description: 'Static IP (cost if unused)',
      };
    }

    // ----- Containers -----
    case 'google_container_cluster': {
      // GKE Autopilot: variable; Standard: $0.10/hr cluster management
      const isAutopilot = attributes.enable_autopilot === true;
      if (isAutopilot) {
        return {
          monthlyCost: 73.0,
          hourlyCost: 0.1,
          description: 'GKE Autopilot cluster management',
        };
      }
      return {
        monthlyCost: 73.0,
        hourlyCost: 0.1,
        description: 'GKE Standard cluster management',
      };
    }

    case 'google_container_node_pool': {
      const nodeCount = attributes.node_count || attributes.initial_node_count || 1;
      const machineType = attributes['node_config.machine_type'] || 'e2-medium';
      const price = GCE_PRICING[machineType] || 24.46;
      return {
        monthlyCost: price * nodeCount,
        hourlyCost: (price * nodeCount) / HOURS_PER_MONTH,
        quantity: nodeCount,
        unit: 'nodes',
        description: `GKE node pool (${nodeCount}x ${machineType})`,
      };
    }

    case 'google_cloud_run_service':
    case 'google_cloud_run_v2_service': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Cloud Run (usage-based, $0 at rest)',
      };
    }

    case 'google_artifact_registry_repository': {
      return {
        monthlyCost: 1.0,
        hourlyCost: 0,
        description: 'Artifact Registry (estimated 10GB images)',
      };
    }

    // ----- Serverless -----
    case 'google_cloudfunctions_function':
    case 'google_cloudfunctions2_function': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Cloud Function (usage-based, $0 at rest)',
      };
    }

    case 'google_pubsub_topic': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Pub/Sub topic (usage-based, first 10GB free)',
      };
    }

    case 'google_pubsub_subscription': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Pub/Sub subscription (usage-based)',
      };
    }

    // ----- Data -----
    case 'google_bigquery_dataset': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'BigQuery dataset (storage/query usage-based)',
      };
    }

    case 'google_bigquery_table': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'BigQuery table (storage/query usage-based)',
      };
    }

    case 'google_dataflow_job': {
      // Highly variable; estimate a small job
      return {
        monthlyCost: 50.0,
        hourlyCost: 50.0 / HOURS_PER_MONTH,
        description: 'Dataflow job (estimated small workload)',
      };
    }

    case 'google_redis_instance': {
      const memorySizeGb = attributes.memory_size_gb || 1;
      // Basic tier: ~$0.049/GB-hour
      const cost = memorySizeGb * 0.049 * HOURS_PER_MONTH;
      return {
        monthlyCost: cost,
        hourlyCost: memorySizeGb * 0.049,
        quantity: memorySizeGb,
        unit: 'GB',
        description: `Memorystore Redis (${memorySizeGb}GB)`,
      };
    }

    // ----- Monitoring / Logging -----
    case 'google_monitoring_alert_policy': {
      return { monthlyCost: 0, hourlyCost: 0, description: 'Monitoring alert (no direct cost)' };
    }

    case 'google_logging_metric': {
      return { monthlyCost: 0, hourlyCost: 0, description: 'Logging metric (no direct cost)' };
    }

    // ----- Identity / Security (no direct cost) -----
    case 'google_compute_network':
    case 'google_compute_subnetwork':
    case 'google_compute_firewall':
    case 'google_compute_route':
    case 'google_compute_router':
    case 'google_project_iam_member':
    case 'google_project_iam_binding':
    case 'google_project_iam_policy':
    case 'google_service_account':
    case 'google_service_account_iam_member':
    case 'google_kms_key_ring':
    case 'google_kms_crypto_key':
    case 'google_dns_managed_zone':
    case 'google_dns_record_set':
    case 'google_project_service': {
      return { monthlyCost: 0, hourlyCost: 0, description: 'No direct cost' };
    }

    // ----- VPN -----
    case 'google_compute_vpn_gateway':
    case 'google_compute_ha_vpn_gateway': {
      // VPN gateway: ~$0.075/hr
      return {
        monthlyCost: 0.075 * HOURS_PER_MONTH,
        hourlyCost: 0.075,
        description: 'Cloud VPN gateway',
      };
    }

    case 'google_compute_vpn_tunnel': {
      // VPN tunnel: ~$0.075/hr
      return {
        monthlyCost: 0.075 * HOURS_PER_MONTH,
        hourlyCost: 0.075,
        description: 'VPN tunnel',
      };
    }

    default:
      return null;
  }
}
