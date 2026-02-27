/**
 * Azure Static Pricing Lookup
 *
 * Monthly on-demand pricing based on East US region as of 2024.
 * These are approximate list prices used for quick estimation.
 * Install Infracost for real-time, region-aware pricing.
 */

import type { TerraformResource } from '../parsers/types';
import type { PricingResult } from './index';

const HOURS_PER_MONTH = 730;

// ------------------------------------------------------------------
// Virtual Machine pricing (on-demand, East US, Linux)
// ------------------------------------------------------------------
const VM_PRICING: Record<string, number> = {
  // B-series burstable
  Standard_B1ls: 3.8,
  Standard_B1s: 7.59,
  Standard_B1ms: 15.18,
  Standard_B2s: 30.37,
  Standard_B2ms: 60.74,
  Standard_B4ms: 121.47,
  Standard_B8ms: 242.94,
  // D-series general purpose
  Standard_D2s_v3: 69.35,
  Standard_D4s_v3: 138.7,
  Standard_D8s_v3: 277.4,
  Standard_D16s_v3: 554.79,
  Standard_D2s_v4: 69.35,
  Standard_D4s_v4: 138.7,
  Standard_D8s_v4: 277.4,
  Standard_D2s_v5: 69.35,
  Standard_D4s_v5: 138.7,
  Standard_D8s_v5: 277.4,
  // D-series (non-premium storage)
  Standard_D2_v3: 65.7,
  Standard_D4_v3: 131.4,
  Standard_D2_v5: 65.7,
  Standard_D4_v5: 131.4,
  // E-series memory optimized
  Standard_E2s_v3: 91.98,
  Standard_E4s_v3: 183.96,
  Standard_E8s_v3: 367.92,
  Standard_E16s_v3: 735.84,
  Standard_E2s_v5: 91.98,
  Standard_E4s_v5: 183.96,
  Standard_E8s_v5: 367.92,
  // F-series compute optimized
  Standard_F2s_v2: 60.59,
  Standard_F4s_v2: 121.18,
  Standard_F8s_v2: 242.36,
  Standard_F16s_v2: 484.72,
  // A-series basic
  Standard_A1_v2: 29.2,
  Standard_A2_v2: 61.32,
  Standard_A4_v2: 128.48,
};

// ------------------------------------------------------------------
// Managed Disk pricing (per GB/month, East US)
// ------------------------------------------------------------------
const DISK_PRICING: Record<string, { price: number; type: 'fixed' | 'per-gb' }> = {
  // Premium SSD managed disks (fixed per tier)
  Premium_LRS: { price: 0.132, type: 'per-gb' },
  StandardSSD_LRS: { price: 0.075, type: 'per-gb' },
  Standard_LRS: { price: 0.04, type: 'per-gb' },
  UltraSSD_LRS: { price: 0.12, type: 'per-gb' },
  PremiumV2_LRS: { price: 0.12, type: 'per-gb' },
};

/**
 * Look up the estimated monthly price for an Azure Terraform resource.
 */
export function getAzurePrice(resource: TerraformResource): PricingResult | null {
  const { type, attributes } = resource;

  switch (type) {
    // ----- Compute -----
    case 'azurerm_virtual_machine':
    case 'azurerm_linux_virtual_machine':
    case 'azurerm_windows_virtual_machine': {
      const vmSize = attributes.size || attributes.vm_size || 'Standard_D2s_v3';
      const price = VM_PRICING[vmSize];
      if (!price) {
        return {
          monthlyCost: 69.35,
          hourlyCost: 69.35 / HOURS_PER_MONTH,
          description: `VM ${vmSize} (estimated, size not in lookup table)`,
        };
      }
      const isWindows = type === 'azurerm_windows_virtual_machine';
      const windowsSurcharge = isWindows ? price * 0.4 : 0; // ~40% Windows license surcharge
      return {
        monthlyCost: price + windowsSurcharge,
        hourlyCost: (price + windowsSurcharge) / HOURS_PER_MONTH,
        unit: 'hours',
        description: `VM ${vmSize}${isWindows ? ' (Windows)' : ''}`,
      };
    }

    case 'azurerm_virtual_machine_scale_set':
    case 'azurerm_linux_virtual_machine_scale_set':
    case 'azurerm_windows_virtual_machine_scale_set': {
      const vmSize = attributes.sku || attributes.size || 'Standard_D2s_v3';
      const instances = attributes.instances || 2;
      const price = VM_PRICING[vmSize] || 69.35;
      return {
        monthlyCost: price * instances,
        hourlyCost: (price * instances) / HOURS_PER_MONTH,
        quantity: instances,
        unit: 'instances',
        description: `VMSS ${vmSize} x${instances}`,
      };
    }

    // ----- Database -----
    case 'azurerm_mssql_server': {
      // SQL Server logical server has no direct cost
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'SQL Server logical server (no direct cost)',
      };
    }

    case 'azurerm_mssql_database': {
      // Estimate based on sku_name
      const sku = attributes.sku_name || 'S0';
      const sqlPricing: Record<string, number> = {
        Basic: 4.9,
        S0: 14.72,
        S1: 29.43,
        S2: 73.58,
        S3: 147.17,
        P1: 460.8,
        P2: 921.6,
        P4: 1843.2,
        GP_S_Gen5_1: 38.35,
        GP_S_Gen5_2: 76.7,
        GP_Gen5_2: 307.68,
        GP_Gen5_4: 615.36,
        BC_Gen5_2: 716.8,
        BC_Gen5_4: 1433.6,
      };
      const price = sqlPricing[sku] || 14.72;
      return {
        monthlyCost: price,
        hourlyCost: price / HOURS_PER_MONTH,
        description: `Azure SQL Database ${sku}`,
      };
    }

    case 'azurerm_mysql_flexible_server':
    case 'azurerm_postgresql_flexible_server': {
      const sku = attributes.sku_name || 'B_Standard_B1ms';
      const dbType = type.includes('mysql') ? 'MySQL' : 'PostgreSQL';
      // Approximate pricing for flexible server
      const flexPricing: Record<string, number> = {
        B_Standard_B1s: 12.26,
        B_Standard_B1ms: 15.33,
        B_Standard_B2s: 30.66,
        GP_Standard_D2s_v3: 101.47,
        GP_Standard_D4s_v3: 202.94,
        GP_Standard_D8s_v3: 405.88,
        MO_Standard_E2s_v3: 128.11,
        MO_Standard_E4s_v3: 256.23,
      };
      const price = flexPricing[sku] || 15.33;
      const storageGB = attributes.storage_mb ? attributes.storage_mb / 1024 : 32;
      const storageCost = storageGB * 0.115; // ~$0.115/GB/month
      return {
        monthlyCost: price + storageCost,
        hourlyCost: price / HOURS_PER_MONTH,
        description: `${dbType} Flexible Server ${sku} + ${storageGB}GB`,
      };
    }

    case 'azurerm_cosmosdb_account': {
      // CosmosDB: estimate 400 RU/s provisioned
      const rus = 400;
      // $0.008/100 RU/hr
      const cost = (rus / 100) * 0.008 * HOURS_PER_MONTH;
      return {
        monthlyCost: cost,
        hourlyCost: (rus / 100) * 0.008,
        description: `Cosmos DB (estimated ${rus} RU/s provisioned)`,
      };
    }

    case 'azurerm_redis_cache': {
      const family = attributes.family || 'C';
      const capacity = attributes.capacity || 0;
      // Basic tier pricing
      const redisPricing: Record<string, number> = {
        C0: 16.06,
        C1: 40.15,
        C2: 60.22,
        C3: 120.45,
        C4: 240.9,
        C5: 481.8,
        C6: 963.6,
        P1: 200.75,
        P2: 401.5,
        P3: 803.0,
        P4: 1606.0,
      };
      const key = `${family}${capacity}`;
      const price = redisPricing[key] || 16.06;
      return {
        monthlyCost: price,
        hourlyCost: price / HOURS_PER_MONTH,
        description: `Azure Cache for Redis ${key}`,
      };
    }

    // ----- Storage -----
    case 'azurerm_storage_account': {
      // Storage account: pricing depends on access tier and usage
      // Estimate 100GB Hot tier
      return {
        monthlyCost: 2.08,
        hourlyCost: 0,
        unit: 'GB',
        description: 'Storage Account (estimated 100GB Hot tier)',
      };
    }

    case 'azurerm_managed_disk': {
      const storageType = attributes.storage_account_type || 'Standard_LRS';
      const diskSize = attributes.disk_size_gb || 32;
      const diskInfo = DISK_PRICING[storageType];
      const pricePerGB = diskInfo ? diskInfo.price : 0.04;
      return {
        monthlyCost: diskSize * pricePerGB,
        hourlyCost: 0,
        quantity: diskSize,
        unit: 'GB',
        description: `Managed Disk ${storageType} ${diskSize}GB`,
      };
    }

    // ----- Networking -----
    case 'azurerm_lb':
    case 'azurerm_lb_rule': {
      const sku = attributes.sku || 'Standard';
      if (sku === 'Basic') {
        return { monthlyCost: 0, hourlyCost: 0, description: 'Load Balancer Basic (free)' };
      }
      // Standard LB: ~$0.025/hr + rules
      return {
        monthlyCost: 18.25 + 7.3,
        hourlyCost: 0.025,
        description: 'Load Balancer Standard (fixed + estimated rules)',
      };
    }

    case 'azurerm_application_gateway': {
      // App Gateway v2: ~$0.246/hr + capacity units
      return {
        monthlyCost: 179.58 + 43.8,
        hourlyCost: 0.246,
        description: 'Application Gateway v2 (fixed + estimated CU)',
      };
    }

    case 'azurerm_public_ip': {
      const sku = attributes.sku || 'Standard';
      if (sku === 'Basic') {
        return {
          monthlyCost: 0,
          hourlyCost: 0,
          description: 'Public IP Basic (free when associated)',
        };
      }
      // Standard: $0.005/hr
      return {
        monthlyCost: 3.65,
        hourlyCost: 0.005,
        description: 'Public IP Standard',
      };
    }

    case 'azurerm_nat_gateway': {
      // NAT Gateway: ~$0.045/hr + data processing
      return {
        monthlyCost: 32.85 + 32.85,
        hourlyCost: 0.045,
        description: 'NAT Gateway (fixed + estimated data processing)',
      };
    }

    case 'azurerm_frontdoor':
    case 'azurerm_cdn_frontdoor_profile': {
      return {
        monthlyCost: 35.04,
        hourlyCost: 35.04 / HOURS_PER_MONTH,
        description: 'Azure Front Door (estimated base fee)',
      };
    }

    case 'azurerm_vpn_gateway': {
      return {
        monthlyCost: 138.7,
        hourlyCost: 0.19,
        description: 'VPN Gateway (VpnGw1)',
      };
    }

    case 'azurerm_express_route_circuit': {
      // ExpressRoute: varies wildly, estimate Standard 50Mbps Metered
      return {
        monthlyCost: 29.2,
        hourlyCost: 0.04,
        description: 'ExpressRoute (estimated Standard 50Mbps)',
      };
    }

    // ----- Containers -----
    case 'azurerm_kubernetes_cluster': {
      // AKS control plane is free for standard tier
      // Cost comes from node pools
      const sku = attributes.sku_tier || 'Free';
      const cost = sku === 'Standard' ? 73.0 : 0;
      return {
        monthlyCost: cost,
        hourlyCost: cost / HOURS_PER_MONTH,
        description: `AKS cluster (${sku} tier)`,
      };
    }

    case 'azurerm_kubernetes_cluster_node_pool': {
      const vmSize = attributes.vm_size || 'Standard_D2s_v3';
      const nodeCount = attributes.node_count || attributes.min_count || 1;
      const price = VM_PRICING[vmSize] || 69.35;
      return {
        monthlyCost: price * nodeCount,
        hourlyCost: (price * nodeCount) / HOURS_PER_MONTH,
        quantity: nodeCount,
        unit: 'nodes',
        description: `AKS node pool ${vmSize} x${nodeCount}`,
      };
    }

    case 'azurerm_container_registry': {
      const sku = attributes.sku || 'Basic';
      const acrPricing: Record<string, number> = {
        Basic: 5.0,
        Standard: 20.0,
        Premium: 50.0,
      };
      return {
        monthlyCost: acrPricing[sku] || 5.0,
        hourlyCost: 0,
        description: `Container Registry ${sku}`,
      };
    }

    case 'azurerm_container_group': {
      // ACI: estimate 1 vCPU, 1.5GB memory, running 730 hours
      const cpuCores = attributes.cpu || 1;
      const memoryGb = attributes.memory || 1.5;
      // ~$0.0000125/vCPU-second, ~$0.0000015/GB-second
      const cpuCost = cpuCores * 0.0000125 * 3600 * HOURS_PER_MONTH;
      const memCost = memoryGb * 0.0000015 * 3600 * HOURS_PER_MONTH;
      return {
        monthlyCost: cpuCost + memCost,
        hourlyCost: (cpuCost + memCost) / HOURS_PER_MONTH,
        description: `Container Instance (${cpuCores} vCPU, ${memoryGb}GB)`,
      };
    }

    // ----- Serverless -----
    case 'azurerm_function_app':
    case 'azurerm_linux_function_app':
    case 'azurerm_windows_function_app': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Function App (consumption plan, usage-based)',
      };
    }

    case 'azurerm_servicebus_namespace': {
      const sku = attributes.sku || 'Basic';
      const sbPricing: Record<string, number> = {
        Basic: 0.05,
        Standard: 9.81,
        Premium: 668.26,
      };
      return {
        monthlyCost: sbPricing[sku] || 0.05,
        hourlyCost: 0,
        description: `Service Bus ${sku}`,
      };
    }

    case 'azurerm_eventhub_namespace': {
      const sku = attributes.sku || 'Basic';
      const capacity = attributes.capacity || 1;
      const ehPricing: Record<string, number> = {
        Basic: 10.95,
        Standard: 21.9,
        Premium: 876.0,
      };
      const base = ehPricing[sku] || 10.95;
      return {
        monthlyCost: base * capacity,
        hourlyCost: (base * capacity) / HOURS_PER_MONTH,
        quantity: capacity,
        unit: 'throughput units',
        description: `Event Hubs ${sku} (${capacity} TU)`,
      };
    }

    // ----- App Service -----
    case 'azurerm_service_plan': {
      const skuName = attributes.sku_name || 'B1';
      const aspPricing: Record<string, number> = {
        F1: 0,
        D1: 9.49,
        B1: 13.14,
        B2: 26.28,
        B3: 52.56,
        S1: 73.0,
        S2: 146.0,
        S3: 292.0,
        P1v2: 73.0,
        P2v2: 146.0,
        P3v2: 292.0,
        P1v3: 102.2,
        P2v3: 204.4,
        P3v3: 408.8,
      };
      return {
        monthlyCost: aspPricing[skuName] || 13.14,
        hourlyCost: (aspPricing[skuName] || 13.14) / HOURS_PER_MONTH,
        description: `App Service Plan ${skuName}`,
      };
    }

    case 'azurerm_linux_web_app':
    case 'azurerm_windows_web_app': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Web App (cost included in Service Plan)',
      };
    }

    // ----- Monitoring -----
    case 'azurerm_log_analytics_workspace': {
      // Free tier: 5GB/month; Pay-as-you-go: ~$2.76/GB
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Log Analytics Workspace (ingestion usage-based, 5GB free)',
      };
    }

    case 'azurerm_application_insights': {
      return {
        monthlyCost: 0,
        hourlyCost: 0,
        description: 'Application Insights (ingestion usage-based, 5GB free)',
      };
    }

    case 'azurerm_monitor_action_group':
    case 'azurerm_monitor_metric_alert': {
      return { monthlyCost: 0, hourlyCost: 0, description: 'Monitor resource (minimal cost)' };
    }

    // ----- Identity / Security / Networking (no direct cost) -----
    case 'azurerm_resource_group':
    case 'azurerm_virtual_network':
    case 'azurerm_subnet':
    case 'azurerm_network_security_group':
    case 'azurerm_network_security_rule':
    case 'azurerm_route_table':
    case 'azurerm_network_interface':
    case 'azurerm_user_assigned_identity':
    case 'azurerm_role_assignment':
    case 'azurerm_key_vault':
    case 'azurerm_key_vault_secret':
    case 'azurerm_key_vault_key':
    case 'azurerm_dns_zone':
    case 'azurerm_dns_a_record':
    case 'azurerm_dns_cname_record':
    case 'azurerm_private_dns_zone':
    case 'azurerm_private_endpoint': {
      return { monthlyCost: 0, hourlyCost: 0, description: 'No direct cost' };
    }

    default:
      return null;
  }
}
