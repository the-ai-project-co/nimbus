/**
 * Type definitions for GCP Infrastructure Discovery
 */

// GCP Project types
export interface GCPProject {
  projectId: string;
  name: string;
  state: string;
}

export interface GCPCredentialInfo {
  projectId: string;
  serviceAccountEmail?: string;
  authenticated: boolean;
}

export interface CredentialValidationResult {
  valid: boolean;
  credential?: GCPCredentialInfo;
  error?: string;
}

// Region types
export interface GCPRegion {
  regionName: string;
  zones: string[];
  status: string;
}

export interface RegionScanConfig {
  regions: string[] | 'all';
  excludeRegions?: string[];
}

// Discovery configuration
export interface DiscoveryConfig {
  projectId?: string;
  regions: RegionScanConfig;
  services?: string[];
  excludeServices?: string[];
  concurrency?: number;
  timeout?: number;
}

// Resource types
export interface DiscoveredResource {
  id: string;
  selfLink: string;
  type: string;           // Terraform resource type (e.g., 'google_compute_instance')
  gcpType: string;        // GCP API type (e.g., 'compute.googleapis.com/Instance')
  service: string;        // Service name (e.g., 'Compute', 'Storage')
  region: string;
  name?: string;
  labels: Record<string, string>;
  properties: Record<string, unknown>;
  relationships: ResourceRelationship[];
  createdAt?: Date;
  status?: string;
}

export interface ResourceRelationship {
  type: 'depends_on' | 'contains' | 'references' | 'attached_to';
  targetSelfLink: string;
  targetType: string;
}

// Inventory types
export interface InfrastructureInventory {
  id: string;
  timestamp: Date;
  provider: 'gcp';
  projectId: string;
  credential: GCPCredentialInfo;
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

// Supported GCP services for discovery
export const SUPPORTED_SERVICES = [
  'Compute',
  'Storage',
  'GKE',
  'IAM',
  'CloudFunctions',
  'VPC',
] as const;

export type SupportedService = typeof SUPPORTED_SERVICES[number];

// GCP resource type to Terraform type mapping
export const GCP_TO_TERRAFORM_TYPE_MAP: Record<string, string> = {
  // Compute
  'compute.googleapis.com/Instance': 'google_compute_instance',
  'compute.googleapis.com/Disk': 'google_compute_disk',
  'compute.googleapis.com/Firewall': 'google_compute_firewall',
  'compute.googleapis.com/Address': 'google_compute_address',

  // VPC
  'compute.googleapis.com/Network': 'google_compute_network',
  'compute.googleapis.com/Subnetwork': 'google_compute_subnetwork',
  'compute.googleapis.com/Router': 'google_compute_router',
  'compute.googleapis.com/Route': 'google_compute_route',

  // Storage
  'storage.googleapis.com/Bucket': 'google_storage_bucket',

  // GKE
  'container.googleapis.com/Cluster': 'google_container_cluster',
  'container.googleapis.com/NodePool': 'google_container_node_pool',

  // IAM
  'iam.googleapis.com/ServiceAccount': 'google_service_account',
  'iam.googleapis.com/Role': 'google_project_iam_custom_role',

  // Cloud Functions
  'cloudfunctions.googleapis.com/Function': 'google_cloudfunctions2_function',
};

// Get Terraform resource type from GCP type
export function getTerraformType(gcpType: string): string {
  return GCP_TO_TERRAFORM_TYPE_MAP[gcpType] || `google_${gcpType.toLowerCase().replace(/\./g, '_').replace(/\//g, '_')}`;
}
