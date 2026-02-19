/**
 * GCP Terraform Generator
 *
 * Generates Terraform configurations from discovered GCP resources.
 * Produces provider blocks, resource blocks, variables, outputs, and import scripts.
 */

import type { DiscoveredResource } from '../discovery/types';
import { GCP_TO_TERRAFORM_TYPE_MAP } from '../discovery/types';
import type {
  TerraformGeneratorConfig,
  TerraformResource,
  TerraformVariable,
  TerraformOutput,
  TerraformImport,
  GeneratedFiles,
  GenerationSummary,
} from './types';
import { getServiceForTerraformType, toTerraformIdentifier } from './types';

/**
 * GCP Terraform Generator class
 *
 * Takes discovered GCP resources and produces .tf file content
 * organized by service or in a single main.tf
 */
export class GCPTerraformGenerator {
  private config: TerraformGeneratorConfig;

  constructor(config: TerraformGeneratorConfig) {
    this.config = {
      generateImportBlocks: true,
      generateImportScript: true,
      organizeByService: true,
      terraformVersion: '1.5.0',
      googleProviderVersion: '~> 5.0',
      ...config,
    };
  }

  /**
   * Generate Terraform configuration from discovered resources
   */
  generate(resources: DiscoveredResource[]): GeneratedFiles {
    const mappedResources: TerraformResource[] = [];
    const unmappedResources: DiscoveredResource[] = [];
    const outputs: TerraformOutput[] = [];
    const imports: TerraformImport[] = [];
    const variables: TerraformVariable[] = [];

    // Phase 1: Map all resources to Terraform resource blocks
    for (const resource of resources) {
      const mapped = this.mapResource(resource);

      if (mapped) {
        mappedResources.push(mapped);

        // Generate import block
        if (this.config.generateImportBlocks) {
          const importId = this.getImportId(resource);
          imports.push({
            to: `${mapped.type}.${mapped.name}`,
            id: importId,
          });
        }

        // Generate suggested outputs
        const suggestedOutputs = this.getSuggestedOutputs(mapped);
        outputs.push(...suggestedOutputs);
      } else {
        unmappedResources.push(resource);
      }
    }

    // Add standard variables
    variables.push(
      {
        name: 'project',
        type: 'string',
        description: 'GCP project ID',
        default: this.config.defaultProject || null,
      },
      {
        name: 'region',
        type: 'string',
        description: 'Default GCP region',
        default: this.config.defaultRegion || 'us-central1',
      },
    );

    // Phase 2: Organize resources into files
    const files = this.organizeFiles(mappedResources, variables, imports, outputs);

    // Phase 3: Generate import script
    const importScript = this.config.generateImportScript
      ? this.generateImportScript(imports)
      : '';

    // Phase 4: Calculate summary
    const summary = this.calculateSummary(
      resources,
      mappedResources,
      unmappedResources,
      variables,
      outputs,
    );

    return {
      files,
      unmappedResources,
      variables,
      outputs,
      imports,
      importScript,
      summary,
    };
  }

  /**
   * Map a discovered GCP resource to a Terraform resource block
   */
  private mapResource(resource: DiscoveredResource): TerraformResource | null {
    const terraformType = resource.type;

    // Verify this is a known terraform type
    const knownTypes = Object.values(GCP_TO_TERRAFORM_TYPE_MAP);
    if (!knownTypes.includes(terraformType) && !terraformType.startsWith('google_')) {
      return null;
    }

    const name = toTerraformIdentifier(resource.name || resource.id);
    const attributes: Record<string, any> = {};

    // Map common properties based on resource type
    switch (terraformType) {
      case 'google_compute_instance':
        this.mapComputeInstance(resource, attributes);
        break;
      case 'google_compute_disk':
        this.mapComputeDisk(resource, attributes);
        break;
      case 'google_compute_firewall':
        this.mapComputeFirewall(resource, attributes);
        break;
      case 'google_compute_network':
        this.mapComputeNetwork(resource, attributes);
        break;
      case 'google_compute_subnetwork':
        this.mapComputeSubnetwork(resource, attributes);
        break;
      case 'google_storage_bucket':
        this.mapStorageBucket(resource, attributes);
        break;
      case 'google_container_cluster':
        this.mapContainerCluster(resource, attributes);
        break;
      case 'google_service_account':
        this.mapServiceAccount(resource, attributes);
        break;
      case 'google_cloudfunctions2_function':
        this.mapCloudFunction(resource, attributes);
        break;
      default:
        // Generic mapping: include name, project, and labels
        if (resource.name) attributes.name = resource.name;
        attributes.project = { _type: 'reference', value: 'var.project' };
        if (resource.labels && Object.keys(resource.labels).length > 0) {
          attributes.labels = resource.labels;
        }
        break;
    }

    return {
      type: terraformType,
      name,
      attributes,
      sourceResource: resource,
    };
  }

  // ==================== Resource Mappers ====================

  private mapComputeInstance(resource: DiscoveredResource, attrs: Record<string, any>): void {
    const props = resource.properties;
    attrs.name = resource.name || '';
    attrs.machine_type = props.machineType || 'e2-medium';
    attrs.zone = props.zone || '';
    attrs.project = { _type: 'reference', value: 'var.project' };

    if (props.tags && Array.isArray(props.tags) && props.tags.length > 0) {
      attrs.tags = props.tags;
    }

    // Boot disk
    const disks = props.disks as any[] | undefined;
    attrs.boot_disk = {
      initialize_params: {
        image: disks?.[0]?.sourceImage || '',
      },
    };

    // Network interface
    if (props.networkInterfaces && Array.isArray(props.networkInterfaces) && props.networkInterfaces.length > 0) {
      const ni = props.networkInterfaces[0] as any;
      attrs.network_interface = {
        network: ni.network || 'default',
        subnetwork: ni.subnetwork || '',
      };
    }

    if (resource.labels && Object.keys(resource.labels).length > 0) {
      attrs.labels = resource.labels;
    }

    if (props.canIpForward) {
      attrs.can_ip_forward = true;
    }

    if (props.serviceAccounts && Array.isArray(props.serviceAccounts) && props.serviceAccounts.length > 0) {
      const sa = props.serviceAccounts[0] as any;
      attrs.service_account = {
        email: sa.email || '',
        scopes: sa.scopes || ['cloud-platform'],
      };
    }
  }

  private mapComputeDisk(resource: DiscoveredResource, attrs: Record<string, any>): void {
    const props = resource.properties;
    attrs.name = resource.name || '';
    attrs.zone = props.zone || '';
    attrs.type = props.type || 'pd-standard';
    attrs.size = props.sizeGb || 10;
    attrs.project = { _type: 'reference', value: 'var.project' };

    if (props.sourceImage) {
      attrs.image = props.sourceImage;
    }

    if (resource.labels && Object.keys(resource.labels).length > 0) {
      attrs.labels = resource.labels;
    }
  }

  private mapComputeFirewall(resource: DiscoveredResource, attrs: Record<string, any>): void {
    const props = resource.properties;
    attrs.name = resource.name || '';
    attrs.network = props.network || 'default';
    attrs.project = { _type: 'reference', value: 'var.project' };
    attrs.direction = props.direction || 'INGRESS';

    if (props.priority !== undefined) {
      attrs.priority = props.priority;
    }

    if (props.sourceRanges && Array.isArray(props.sourceRanges) && props.sourceRanges.length > 0) {
      attrs.source_ranges = props.sourceRanges;
    }

    if (props.destinationRanges && Array.isArray(props.destinationRanges) && props.destinationRanges.length > 0) {
      attrs.destination_ranges = props.destinationRanges;
    }

    if (props.targetTags && Array.isArray(props.targetTags) && props.targetTags.length > 0) {
      attrs.target_tags = props.targetTags;
    }

    if (props.sourceTags && Array.isArray(props.sourceTags) && props.sourceTags.length > 0) {
      attrs.source_tags = props.sourceTags;
    }

    if (props.allowed && Array.isArray(props.allowed)) {
      attrs.allow = props.allowed.map((a: any) => ({
        protocol: a.ipProtocol || 'tcp',
        ports: a.ports || [],
      }));
    }

    if (props.denied && Array.isArray(props.denied)) {
      attrs.deny = props.denied.map((d: any) => ({
        protocol: d.ipProtocol || 'tcp',
        ports: d.ports || [],
      }));
    }
  }

  private mapComputeNetwork(resource: DiscoveredResource, attrs: Record<string, any>): void {
    const props = resource.properties;
    attrs.name = resource.name || '';
    attrs.project = { _type: 'reference', value: 'var.project' };
    attrs.auto_create_subnetworks = props.autoCreateSubnetworks ?? true;

    if (props.routingConfig && (props.routingConfig as any).routingMode) {
      attrs.routing_mode = (props.routingConfig as any).routingMode;
    }

    if (props.mtu) {
      attrs.mtu = props.mtu;
    }
  }

  private mapComputeSubnetwork(resource: DiscoveredResource, attrs: Record<string, any>): void {
    const props = resource.properties;
    attrs.name = resource.name || '';
    attrs.network = props.network || '';
    attrs.region = resource.region;
    attrs.ip_cidr_range = props.ipCidrRange || '';
    attrs.project = { _type: 'reference', value: 'var.project' };

    if (props.privateIpGoogleAccess) {
      attrs.private_ip_google_access = true;
    }

    if (props.secondaryIpRanges && Array.isArray(props.secondaryIpRanges) && props.secondaryIpRanges.length > 0) {
      attrs.secondary_ip_range = (props.secondaryIpRanges as any[]).map((range) => ({
        range_name: range.rangeName || '',
        ip_cidr_range: range.ipCidrRange || '',
      }));
    }

    if (props.purpose) {
      attrs.purpose = props.purpose;
    }
  }

  private mapStorageBucket(resource: DiscoveredResource, attrs: Record<string, any>): void {
    const props = resource.properties;
    attrs.name = resource.name || '';
    attrs.location = props.location || resource.region || 'US';
    attrs.project = { _type: 'reference', value: 'var.project' };

    if (props.storageClass) {
      attrs.storage_class = props.storageClass;
    }

    if (props.versioning) {
      attrs.versioning = {
        enabled: true,
      };
    }

    if (props.uniformBucketLevelAccess) {
      attrs.uniform_bucket_level_access = true;
    }

    if (resource.labels && Object.keys(resource.labels).length > 0) {
      attrs.labels = resource.labels;
    }
  }

  private mapContainerCluster(resource: DiscoveredResource, attrs: Record<string, any>): void {
    const props = resource.properties;
    attrs.name = resource.name || '';
    attrs.location = props.location || resource.region;
    attrs.project = { _type: 'reference', value: 'var.project' };

    if (props.network) {
      attrs.network = props.network;
    }
    if (props.subnetwork) {
      attrs.subnetwork = props.subnetwork;
    }

    if (props.initialClusterVersion) {
      attrs.min_master_version = props.initialClusterVersion;
    }

    if (resource.labels && Object.keys(resource.labels).length > 0) {
      attrs.resource_labels = resource.labels;
    }

    // Remove default node pool and manage separately
    attrs.remove_default_node_pool = true;
    attrs.initial_node_count = 1;
  }

  private mapServiceAccount(resource: DiscoveredResource, attrs: Record<string, any>): void {
    const props = resource.properties;
    attrs.account_id = props.uniqueId || resource.name || resource.id;
    attrs.display_name = props.displayName || resource.name || '';
    attrs.project = { _type: 'reference', value: 'var.project' };

    if (props.description) {
      attrs.description = props.description;
    }

    if (props.disabled) {
      attrs.disabled = true;
    }
  }

  private mapCloudFunction(resource: DiscoveredResource, attrs: Record<string, any>): void {
    const props = resource.properties;
    attrs.name = resource.name || '';
    attrs.location = props.location || resource.region;
    attrs.project = { _type: 'reference', value: 'var.project' };

    if (props.description) {
      attrs.description = props.description;
    }

    if (props.buildConfig) {
      const bc = props.buildConfig as any;
      attrs.build_config = {
        runtime: bc.runtime || '',
        entry_point: bc.entryPoint || '',
      };
    }

    if (props.serviceConfig) {
      const sc = props.serviceConfig as any;
      const serviceCfg: Record<string, any> = {};
      if (sc.availableMemory) serviceCfg.available_memory = sc.availableMemory;
      if (sc.timeoutSeconds) serviceCfg.timeout_seconds = sc.timeoutSeconds;
      if (sc.maxInstanceCount) serviceCfg.max_instance_count = sc.maxInstanceCount;
      if (sc.minInstanceCount) serviceCfg.min_instance_count = sc.minInstanceCount;
      if (sc.serviceAccountEmail) serviceCfg.service_account_email = sc.serviceAccountEmail;
      if (sc.ingressSettings) serviceCfg.ingress_settings = sc.ingressSettings;
      if (Object.keys(serviceCfg).length > 0) {
        attrs.service_config = serviceCfg;
      }
    }

    if (resource.labels && Object.keys(resource.labels).length > 0) {
      attrs.labels = resource.labels;
    }
  }

  // ==================== Import ID ====================

  /**
   * Get the import ID for a GCP resource
   */
  private getImportId(resource: DiscoveredResource): string {
    const project = this.config.defaultProject || '{{project}}';
    const region = resource.region || '{{region}}';

    switch (resource.type) {
      case 'google_compute_instance':
        return `projects/${project}/zones/${resource.properties.zone || '{{zone}}'}/instances/${resource.name || resource.id}`;
      case 'google_compute_disk':
        return `projects/${project}/zones/${resource.properties.zone || '{{zone}}'}/disks/${resource.name || resource.id}`;
      case 'google_compute_firewall':
        return `projects/${project}/global/firewalls/${resource.name || resource.id}`;
      case 'google_compute_network':
        return `projects/${project}/global/networks/${resource.name || resource.id}`;
      case 'google_compute_subnetwork':
        return `projects/${project}/regions/${region}/subnetworks/${resource.name || resource.id}`;
      case 'google_storage_bucket':
        return resource.name || resource.id;
      case 'google_container_cluster':
        return `projects/${project}/locations/${resource.properties.location || region}/clusters/${resource.name || resource.id}`;
      case 'google_service_account':
        return `projects/${project}/serviceAccounts/${resource.properties.email || resource.id}`;
      case 'google_project_iam_custom_role':
        return `projects/${project}/roles/${resource.name || resource.id}`;
      case 'google_cloudfunctions2_function':
        return `projects/${project}/locations/${resource.properties.location || region}/functions/${resource.name || resource.id}`;
      default:
        return resource.selfLink || resource.id;
    }
  }

  // ==================== Suggested Outputs ====================

  /**
   * Generate suggested outputs for a mapped resource
   */
  private getSuggestedOutputs(resource: TerraformResource): TerraformOutput[] {
    const outputs: TerraformOutput[] = [];
    const ref = `${resource.type}.${resource.name}`;

    switch (resource.type) {
      case 'google_compute_instance':
        outputs.push({
          name: `${resource.name}_self_link`,
          value: `${ref}.self_link`,
          description: `Self link for compute instance ${resource.name}`,
        });
        break;
      case 'google_compute_network':
        outputs.push({
          name: `${resource.name}_self_link`,
          value: `${ref}.self_link`,
          description: `Self link for VPC network ${resource.name}`,
        });
        break;
      case 'google_storage_bucket':
        outputs.push({
          name: `${resource.name}_url`,
          value: `${ref}.url`,
          description: `URL for storage bucket ${resource.name}`,
        });
        break;
      case 'google_container_cluster':
        outputs.push({
          name: `${resource.name}_endpoint`,
          value: `${ref}.endpoint`,
          description: `Endpoint for GKE cluster ${resource.name}`,
          sensitive: true,
        });
        break;
      case 'google_service_account':
        outputs.push({
          name: `${resource.name}_email`,
          value: `${ref}.email`,
          description: `Email for service account ${resource.name}`,
        });
        break;
    }

    return outputs;
  }

  // ==================== File Organization ====================

  /**
   * Organize resources into files
   */
  private organizeFiles(
    resources: TerraformResource[],
    variables: TerraformVariable[],
    imports: TerraformImport[],
    outputs: TerraformOutput[],
  ): Map<string, string> {
    const files = new Map<string, string>();

    // Generate providers.tf
    files.set('providers.tf', this.generateProvidersFile());

    // Generate variables.tf
    if (variables.length > 0) {
      files.set('variables.tf', this.generateVariablesFile(variables));
    }

    // Generate import.tf (Terraform 1.5+)
    if (this.config.generateImportBlocks && imports.length > 0) {
      files.set('import.tf', this.generateImportsFile(imports));
    }

    // Organize resources
    if (this.config.organizeByService) {
      const resourcesByService = new Map<string, TerraformResource[]>();
      const outputsByService = new Map<string, TerraformOutput[]>();

      for (const resource of resources) {
        const service = getServiceForTerraformType(resource.type);
        if (!resourcesByService.has(service)) {
          resourcesByService.set(service, []);
        }
        resourcesByService.get(service)!.push(resource);
      }

      for (const output of outputs) {
        const match = output.value.match(/^google_(\w+)/);
        const service = match ? getServiceForTerraformType(`google_${match[1]}`) : 'misc';
        if (!outputsByService.has(service)) {
          outputsByService.set(service, []);
        }
        outputsByService.get(service)!.push(output);
      }

      for (const [service, serviceResources] of resourcesByService) {
        const serviceOutputs = outputsByService.get(service) || [];
        const content = this.generateResourceFile(serviceResources, serviceOutputs);
        files.set(`${service}.tf`, content);
      }
    } else {
      const content = this.generateResourceFile(resources, outputs);
      files.set('main.tf', content);
    }

    // Generate terraform.tfvars.example
    if (variables.length > 0) {
      files.set('terraform.tfvars.example', this.generateTfvarsExample(variables));
    }

    return files;
  }

  // ==================== File Content Generators ====================

  /**
   * Generate providers.tf content
   */
  private generateProvidersFile(): string {
    const lines: string[] = [
      '# Terraform and Provider Configuration',
      '# Generated by Nimbus GCP Infrastructure Discovery',
      '',
      'terraform {',
      `  required_version = ">= ${this.config.terraformVersion}"`,
      '',
      '  required_providers {',
      '    google = {',
      '      source  = "hashicorp/google"',
      `      version = "${this.config.googleProviderVersion}"`,
      '    }',
      '  }',
      '}',
      '',
      'provider "google" {',
      '  project = var.project',
      '  region  = var.region',
      '}',
      '',
    ];

    return lines.join('\n');
  }

  /**
   * Generate variables.tf content
   */
  private generateVariablesFile(variables: TerraformVariable[]): string {
    const lines: string[] = [
      '# Variable Definitions',
      '# Generated by Nimbus GCP Infrastructure Discovery',
      '',
    ];

    for (const variable of variables) {
      lines.push(`variable "${variable.name}" {`);

      if (variable.description) {
        lines.push(`  description = "${variable.description}"`);
      }

      if (variable.type) {
        lines.push(`  type        = ${variable.type}`);
      }

      if (variable.default !== undefined && variable.default !== null) {
        lines.push(`  default     = ${JSON.stringify(variable.default)}`);
      }

      if (variable.sensitive) {
        lines.push('  sensitive   = true');
      }

      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate import.tf content
   */
  private generateImportsFile(imports: TerraformImport[]): string {
    const lines: string[] = [
      '# Import Blocks (Terraform 1.5+)',
      '# Generated by Nimbus GCP Infrastructure Discovery',
      '',
    ];

    for (const imp of imports) {
      lines.push('import {');
      lines.push(`  to = ${imp.to}`);
      lines.push(`  id = "${imp.id}"`);
      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate a resource file with optional outputs
   */
  private generateResourceFile(
    resources: TerraformResource[],
    outputs: TerraformOutput[],
  ): string {
    const lines: string[] = [
      '# Resource Definitions',
      '# Generated by Nimbus GCP Infrastructure Discovery',
      '',
    ];

    for (const resource of resources) {
      lines.push(`resource "${resource.type}" "${resource.name}" {`);
      this.writeAttributes(lines, resource.attributes, 1);

      if (resource.lifecycle) {
        lines.push('');
        lines.push('  lifecycle {');
        if (resource.lifecycle.createBeforeDestroy !== undefined) {
          lines.push(`    create_before_destroy = ${resource.lifecycle.createBeforeDestroy}`);
        }
        if (resource.lifecycle.preventDestroy !== undefined) {
          lines.push(`    prevent_destroy = ${resource.lifecycle.preventDestroy}`);
        }
        if (resource.lifecycle.ignoreChanges) {
          if (resource.lifecycle.ignoreChanges === 'all') {
            lines.push('    ignore_changes = all');
          } else {
            lines.push('    ignore_changes = [');
            for (const change of resource.lifecycle.ignoreChanges) {
              lines.push(`      ${change},`);
            }
            lines.push('    ]');
          }
        }
        lines.push('  }');
      }

      if (resource.dependsOn && resource.dependsOn.length > 0) {
        lines.push('');
        lines.push('  depends_on = [');
        for (const dep of resource.dependsOn) {
          lines.push(`    ${dep},`);
        }
        lines.push('  ]');
      }

      lines.push('}');
      lines.push('');
    }

    // Add outputs
    if (outputs.length > 0) {
      lines.push('# Outputs');
      lines.push('');

      for (const output of outputs) {
        lines.push(`output "${output.name}" {`);
        lines.push(`  value       = ${output.value}`);
        if (output.description) {
          lines.push(`  description = "${output.description}"`);
        }
        if (output.sensitive) {
          lines.push('  sensitive   = true');
        }
        lines.push('}');
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Write attributes recursively with proper indentation
   */
  private writeAttributes(
    lines: string[],
    attrs: Record<string, any>,
    indent: number,
  ): void {
    const prefix = '  '.repeat(indent);

    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null) continue;

      if (value && typeof value === 'object' && value._type === 'reference') {
        lines.push(`${prefix}${key} = ${value.value}`);
      } else if (Array.isArray(value)) {
        if (value.length === 0) continue;

        // Check if array contains objects (blocks) or primitives
        if (typeof value[0] === 'object' && !Array.isArray(value[0]) && value[0]?._type !== 'reference') {
          for (const item of value) {
            lines.push(`${prefix}${key} {`);
            this.writeAttributes(lines, item, indent + 1);
            lines.push(`${prefix}}`);
          }
        } else {
          const formatted = value.map((v: any) => typeof v === 'string' ? `"${v}"` : String(v));
          lines.push(`${prefix}${key} = [${formatted.join(', ')}]`);
        }
      } else if (typeof value === 'object') {
        lines.push(`${prefix}${key} {`);
        this.writeAttributes(lines, value, indent + 1);
        lines.push(`${prefix}}`);
      } else if (typeof value === 'string') {
        lines.push(`${prefix}${key} = "${value}"`);
      } else if (typeof value === 'boolean') {
        lines.push(`${prefix}${key} = ${value}`);
      } else if (typeof value === 'number') {
        lines.push(`${prefix}${key} = ${value}`);
      }
    }
  }

  /**
   * Generate terraform.tfvars.example
   */
  private generateTfvarsExample(variables: TerraformVariable[]): string {
    const lines: string[] = [
      '# Example terraform.tfvars file',
      '# Copy this file to terraform.tfvars and fill in the values',
      '',
    ];

    for (const variable of variables) {
      if (variable.description) {
        lines.push(`# ${variable.description}`);
      }

      let exampleValue: string;
      if (variable.sensitive) {
        exampleValue = '"<sensitive-value>"';
      } else if (variable.default !== undefined && variable.default !== null) {
        exampleValue = JSON.stringify(variable.default);
      } else if (variable.type === 'string') {
        exampleValue = '""';
      } else if (variable.type === 'number') {
        exampleValue = '0';
      } else if (variable.type === 'bool') {
        exampleValue = 'false';
      } else {
        exampleValue = '""';
      }

      lines.push(`${variable.name} = ${exampleValue}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate import shell script
   */
  private generateImportScript(imports: TerraformImport[]): string {
    const lines: string[] = [
      '#!/bin/bash',
      '',
      '# Terraform Import Script',
      '# Generated by Nimbus GCP Infrastructure Discovery',
      '',
      '# This script imports existing GCP resources into Terraform state.',
      '# Run this script from the directory containing your Terraform configuration.',
      '',
      '# Exit on error',
      'set -e',
      '',
      '# Initialize Terraform if not already done',
      'if [ ! -d ".terraform" ]; then',
      '  echo "Initializing Terraform..."',
      '  terraform init',
      'fi',
      '',
      '# Import resources',
      'echo "Starting resource import..."',
      '',
    ];

    for (const imp of imports) {
      const escapedId = imp.id
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\$/g, '\\$')
        .replace(/`/g, '\\`');
      const escapedTo = imp.to
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\$/g, '\\$')
        .replace(/`/g, '\\`');

      lines.push(`echo "Importing ${escapedTo}..."`);
      lines.push(`terraform import "${escapedTo}" "${escapedId}" || echo "Warning: Failed to import ${escapedTo}"`);
      lines.push('');
    }

    lines.push('echo "Import complete!"');
    lines.push('echo ""');
    lines.push('echo "Next steps:"');
    lines.push('echo "1. Review the imported state: terraform state list"');
    lines.push('echo "2. Generate configuration: terraform plan"');
    lines.push('echo "3. Review and apply changes: terraform apply"');

    return lines.join('\n');
  }

  /**
   * Calculate generation summary
   */
  private calculateSummary(
    totalResources: DiscoveredResource[],
    mappedResources: TerraformResource[],
    unmappedResources: DiscoveredResource[],
    variables: TerraformVariable[],
    outputs: TerraformOutput[],
  ): GenerationSummary {
    const resourcesByService: Record<string, number> = {};

    for (const resource of mappedResources) {
      const service = getServiceForTerraformType(resource.type);
      resourcesByService[service] = (resourcesByService[service] || 0) + 1;
    }

    return {
      totalResources: totalResources.length,
      mappedResources: mappedResources.length,
      unmappedResources: unmappedResources.length,
      resourcesByService,
      variablesGenerated: variables.length,
      outputsGenerated: outputs.length,
    };
  }
}

/**
 * Create a GCP Terraform generator instance
 */
export function createGCPTerraformGenerator(config: TerraformGeneratorConfig): GCPTerraformGenerator {
  return new GCPTerraformGenerator(config);
}
