/**
 * Type definitions for Azure Infrastructure Discovery
 */

// Azure subscription types
export interface AzureSubscription {
  subscriptionId: string;
  displayName: string;
  state: string;
  tenantId?: string;
}

export interface AzureCredentialInfo {
  subscriptionId: string;
  tenantId?: string;
  authenticated: boolean;
}

export interface CredentialValidationResult {
  valid: boolean;
  credential?: AzureCredentialInfo;
  error?: string;
}

// Region types
export interface AzureRegion {
  name: string;
  displayName: string;
  regionalDisplayName?: string;
  metadata?: {
    regionType?: string;
    physicalLocation?: string;
    geography?: string;
    geographyGroup?: string;
    pairedRegion?: string;
  };
}

export interface RegionScanConfig {
  regions: string[] | 'all';
  excludeRegions?: string[];
}

// Discovery configuration
export interface DiscoveryConfig {
  subscriptionId?: string;
  regions: RegionScanConfig;
  services?: string[];
  excludeServices?: string[];
  concurrency?: number;
  timeout?: number;
}

// Resource types
export interface DiscoveredResource {
  id: string;
  resourceId: string;
  type: string;
  azureType: string;
  service: string;
  region: string;
  resourceGroup: string;
  name?: string;
  tags: Record<string, string>;
  properties: Record<string, unknown>;
  relationships: ResourceRelationship[];
  createdAt?: Date;
  status?: string;
}

export interface ResourceRelationship {
  type: 'depends_on' | 'contains' | 'references' | 'attached_to';
  targetResourceId: string;
  targetType: string;
}

// Inventory types
export interface InfrastructureInventory {
  id: string;
  timestamp: Date;
  provider: 'azure';
  subscriptionId: string;
  subscription: AzureSubscription;
  regions: string[];
  summary: InventorySummary;
  resources: DiscoveredResource[];
  metadata: DiscoveryMetadata;
}

export interface InventorySummary {
  totalResources: number;
  resourcesByService: Record<string, number>;
  resourcesByRegion: Record<string, number>;
  resourcesByType: Record<string, number>;
}

export interface DiscoveryMetadata {
  scanDuration: number;
  apiCallCount: number;
  startedAt: Date;
  completedAt?: Date;
  errors: ScanError[];
  warnings: ScanWarning[];
}

export interface ScanError {
  service: string;
  region: string;
  operation: string;
  message: string;
  code?: string;
  timestamp: Date;
}

export interface ScanWarning {
  service: string;
  region: string;
  message: string;
  timestamp: Date;
}

// Discovery progress types
export interface DiscoveryProgress {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  regionsScanned: number;
  totalRegions: number;
  servicesScanned: number;
  totalServices: number;
  resourcesFound: number;
  currentRegion?: string;
  currentService?: string;
  errors: ScanError[];
  startedAt: Date;
  updatedAt: Date;
}

// Discovery session
export interface DiscoverySession {
  id: string;
  config: DiscoveryConfig;
  progress: DiscoveryProgress;
  inventory?: InfrastructureInventory;
}

// Supported Azure services for discovery
export const SUPPORTED_SERVICES = [
  'Compute',
  'Storage',
  'AKS',
  'Network',
  'Functions',
  'SQL',
  'CosmosDB',
  'KeyVault',
  'AppService',
  'ContainerRegistry',
  'Redis',
  'ServiceBus',
  'EventHub',
  'DNS',
  'FrontDoor',
] as const;

export type SupportedService = typeof SUPPORTED_SERVICES[number];

// Azure resource type to Terraform type mapping
export const AZURE_TO_TERRAFORM_TYPE_MAP: Record<string, string> = {
  // Compute
  'Microsoft.Compute/virtualMachines': 'azurerm_virtual_machine',
  'Microsoft.Compute/disks': 'azurerm_managed_disk',
  'Microsoft.Compute/availabilitySets': 'azurerm_availability_set',
  'Microsoft.Compute/virtualMachineScaleSets': 'azurerm_virtual_machine_scale_set',
  'Microsoft.Compute/images': 'azurerm_image',

  // Storage
  'Microsoft.Storage/storageAccounts': 'azurerm_storage_account',
  'Microsoft.Storage/storageAccounts/blobServices/containers': 'azurerm_storage_container',

  // Network
  'Microsoft.Network/virtualNetworks': 'azurerm_virtual_network',
  'Microsoft.Network/virtualNetworks/subnets': 'azurerm_subnet',
  'Microsoft.Network/networkSecurityGroups': 'azurerm_network_security_group',
  'Microsoft.Network/publicIPAddresses': 'azurerm_public_ip',
  'Microsoft.Network/networkInterfaces': 'azurerm_network_interface',
  'Microsoft.Network/loadBalancers': 'azurerm_lb',
  'Microsoft.Network/applicationGateways': 'azurerm_application_gateway',
  'Microsoft.Network/routeTables': 'azurerm_route_table',

  // AKS
  'Microsoft.ContainerService/managedClusters': 'azurerm_kubernetes_cluster',

  // Functions / App Service
  'Microsoft.Web/sites': 'azurerm_function_app',
  'Microsoft.Web/serverfarms': 'azurerm_service_plan',

  // SQL
  'Microsoft.Sql/servers': 'azurerm_mssql_server',
  'Microsoft.Sql/servers/databases': 'azurerm_mssql_database',

  // CosmosDB
  'Microsoft.DocumentDB/databaseAccounts': 'azurerm_cosmosdb_account',

  // Key Vault
  'Microsoft.KeyVault/vaults': 'azurerm_key_vault',

  // Container Registry
  'Microsoft.ContainerRegistry/registries': 'azurerm_container_registry',

  // Redis
  'Microsoft.Cache/redis': 'azurerm_redis_cache',

  // Service Bus
  'Microsoft.ServiceBus/namespaces': 'azurerm_servicebus_namespace',

  // Event Hub
  'Microsoft.EventHub/namespaces': 'azurerm_eventhub_namespace',

  // DNS
  'Microsoft.Network/dnszones': 'azurerm_dns_zone',
  'Microsoft.Network/privateDnsZones': 'azurerm_private_dns_zone',

  // Front Door
  'Microsoft.Network/frontDoors': 'azurerm_frontdoor',

  // Resource Group
  'Microsoft.Resources/resourceGroups': 'azurerm_resource_group',
};

/**
 * Get Terraform resource type from Azure type
 */
export function getTerraformType(azureType: string): string {
  return AZURE_TO_TERRAFORM_TYPE_MAP[azureType] || `azurerm_${azureType.toLowerCase().replace(/\//g, '_').replace(/microsoft\./i, '')}`;
}

/**
 * Extract resource group from an Azure resource ID
 */
export function extractResourceGroup(resourceId: string): string {
  const match = resourceId.match(/\/resourceGroups\/([^/]+)/i);
  return match ? match[1] : '';
}

/**
 * Extract subscription ID from an Azure resource ID
 */
export function extractSubscriptionId(resourceId: string): string {
  const match = resourceId.match(/\/subscriptions\/([^/]+)/i);
  return match ? match[1] : '';
}
