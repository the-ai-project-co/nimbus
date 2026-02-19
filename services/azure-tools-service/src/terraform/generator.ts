/**
 * Azure Terraform Generator
 *
 * Generates Terraform configurations from discovered Azure resources.
 * Produces azurerm provider blocks, resource blocks, variables, outputs,
 * and import scripts.
 */

import type { DiscoveredResource } from '../discovery/types';
import { AZURE_TO_TERRAFORM_TYPE_MAP, getTerraformType } from '../discovery/types';
import type {
  TerraformGeneratorConfig,
  TerraformResource,
  TerraformVariable,
  TerraformOutput,
  TerraformImport,
  GeneratedFiles,
  GenerationSummary,
  TerraformValue,
} from './types';
import { toTerraformIdentifier, toSnakeCase, isExcludedField } from './types';

/**
 * Map Azure resource type to a Terraform service category
 */
function getServiceCategory(azureType: string): string {
  const lower = azureType.toLowerCase();

  if (lower.includes('microsoft.compute')) return 'compute';
  if (lower.includes('microsoft.storage')) return 'storage';
  if (lower.includes('microsoft.network')) return 'network';
  if (lower.includes('microsoft.containerservice')) return 'aks';
  if (lower.includes('microsoft.web')) return 'functions';
  if (lower.includes('microsoft.sql')) return 'sql';
  if (lower.includes('microsoft.documentdb')) return 'cosmosdb';
  if (lower.includes('microsoft.keyvault')) return 'keyvault';
  if (lower.includes('microsoft.containerregistry')) return 'acr';
  if (lower.includes('microsoft.cache')) return 'redis';
  if (lower.includes('microsoft.servicebus')) return 'servicebus';
  if (lower.includes('microsoft.eventhub')) return 'eventhub';
  if (lower.includes('microsoft.resources')) return 'resource_group';

  return 'misc';
}

/**
 * Azure Terraform Generator class
 */
export class AzureTerraformGenerator {
  private config: TerraformGeneratorConfig;

  constructor(config: TerraformGeneratorConfig) {
    this.config = {
      generateImportBlocks: true,
      generateImportScript: true,
      organizeByService: true,
      terraformVersion: '1.5.0',
      azurermProviderVersion: '~> 3.0',
      ...config,
    };
  }

  /**
   * Generate Terraform configuration from discovered Azure resources
   */
  generate(resources: DiscoveredResource[]): GeneratedFiles {
    const mappedResources: TerraformResource[] = [];
    const unmappedResources: DiscoveredResource[] = [];
    const outputs: TerraformOutput[] = [];
    const imports: TerraformImport[] = [];
    const variables: TerraformVariable[] = [];

    // Track used names to ensure uniqueness
    const usedNames = new Set<string>();

    // Phase 1: Map all resources to Terraform resources
    for (const resource of resources) {
      const terraformType = getTerraformType(resource.azureType);

      // If we got a fallback type that is not in the known map, treat as unmapped
      if (!AZURE_TO_TERRAFORM_TYPE_MAP[resource.azureType]) {
        unmappedResources.push(resource);
        continue;
      }

      const baseName = toTerraformIdentifier(resource.name || resource.id);
      let uniqueName = baseName;
      let counter = 1;
      while (usedNames.has(`${terraformType}.${uniqueName}`)) {
        uniqueName = `${baseName}_${counter}`;
        counter++;
      }
      usedNames.add(`${terraformType}.${uniqueName}`);

      // Build attributes from resource properties
      const attributes = this.mapAttributes(resource);

      const mapped: TerraformResource = {
        type: terraformType,
        name: uniqueName,
        attributes,
        sourceResource: resource,
      };

      mappedResources.push(mapped);

      // Generate import block
      if (this.config.generateImportBlocks && resource.resourceId) {
        imports.push({
          to: `${terraformType}.${uniqueName}`,
          id: resource.resourceId,
        });
      }

      // Generate outputs for key resources
      const resourceOutputs = this.generateResourceOutputs(mapped);
      outputs.push(...resourceOutputs);
    }

    // Phase 2: Build standard variables
    variables.push(
      {
        name: 'resource_group_name',
        type: 'string',
        description: 'Name of the Azure resource group',
        default: null,
      },
      {
        name: 'location',
        type: 'string',
        description: 'Azure region for resources',
        default: this.config.defaultRegion || 'eastus',
      },
    );

    if (this.config.defaultSubscriptionId) {
      variables.push({
        name: 'subscription_id',
        type: 'string',
        description: 'Azure subscription ID',
        default: this.config.defaultSubscriptionId,
        sensitive: true,
      });
    }

    // Phase 3: Organize into files
    const files = this.organizeFiles(mappedResources, variables, outputs, imports);

    // Phase 4: Generate import script
    const importScript = this.config.generateImportScript
      ? this.generateImportScript(imports)
      : '';

    // Phase 5: Calculate summary
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
   * Map resource properties to Terraform attributes
   */
  private mapAttributes(resource: DiscoveredResource): Record<string, TerraformValue> {
    const attrs: Record<string, TerraformValue> = {};

    // Always include name and location
    if (resource.name) {
      attrs.name = resource.name;
    }

    if (resource.region) {
      attrs.location = resource.region;
    }

    if (resource.resourceGroup) {
      attrs.resource_group_name = { _type: 'reference', value: 'var.resource_group_name' };
    }

    // Map tags
    if (resource.tags && Object.keys(resource.tags).length > 0) {
      attrs.tags = resource.tags;
    }

    // Map selected properties based on resource type
    if (resource.properties) {
      for (const [key, value] of Object.entries(resource.properties)) {
        const snakeKey = toSnakeCase(key);
        if (isExcludedField(key) || isExcludedField(snakeKey)) continue;
        if (value === null || value === undefined) continue;

        // Only include primitive values and simple objects for safety
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          attrs[snakeKey] = value as TerraformValue;
        }
      }
    }

    return attrs;
  }

  /**
   * Generate outputs for a mapped resource
   */
  private generateResourceOutputs(resource: TerraformResource): TerraformOutput[] {
    const outputs: TerraformOutput[] = [];
    const ref = `${resource.type}.${resource.name}`;

    // Generate an ID output for every resource
    outputs.push({
      name: `${resource.name}_id`,
      value: `${ref}.id`,
      description: `ID of ${resource.type} ${resource.name}`,
    });

    return outputs;
  }

  /**
   * Organize resources into Terraform files
   */
  private organizeFiles(
    resources: TerraformResource[],
    variables: TerraformVariable[],
    outputs: TerraformOutput[],
    imports: TerraformImport[],
  ): Map<string, string> {
    const files = new Map<string, string>();

    // providers.tf
    files.set('providers.tf', this.generateProvidersFile());

    // variables.tf
    if (variables.length > 0) {
      files.set('variables.tf', this.generateVariablesFile(variables));
    }

    // import.tf
    if (this.config.generateImportBlocks && imports.length > 0) {
      files.set('import.tf', this.generateImportsFile(imports));
    }

    if (this.config.organizeByService) {
      // Group resources by service
      const resourcesByService = new Map<string, TerraformResource[]>();
      const outputsByService = new Map<string, TerraformOutput[]>();

      for (const resource of resources) {
        const service = resource.sourceResource
          ? getServiceCategory(resource.sourceResource.azureType)
          : 'misc';

        if (!resourcesByService.has(service)) {
          resourcesByService.set(service, []);
        }
        resourcesByService.get(service)!.push(resource);
      }

      for (const output of outputs) {
        // Derive service from resource reference in the output value
        let service = 'misc';
        const matchedResource = resources.find(r =>
          output.value.startsWith(`${r.type}.${r.name}`)
        );
        if (matchedResource?.sourceResource) {
          service = getServiceCategory(matchedResource.sourceResource.azureType);
        }

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
      // Single main.tf
      files.set('main.tf', this.generateResourceFile(resources, outputs));
    }

    // terraform.tfvars.example
    if (variables.length > 0) {
      files.set('terraform.tfvars.example', this.generateTfvarsExample(variables));
    }

    return files;
  }

  /**
   * Generate providers.tf content
   */
  private generateProvidersFile(): string {
    const lines: string[] = [
      '# Terraform configuration',
      '# Generated by Nimbus Azure Infrastructure Discovery',
      '',
      'terraform {',
      `  required_version = ">= ${this.config.terraformVersion}"`,
      '',
      '  required_providers {',
      '    azurerm = {',
      '      source  = "hashicorp/azurerm"',
      `      version = "${this.config.azurermProviderVersion}"`,
      '    }',
      '  }',
      '}',
      '',
      'provider "azurerm" {',
      '  features {}',
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
      '# Variables',
      '# Generated by Nimbus Azure Infrastructure Discovery',
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

      if (variable.sensitive) {
        lines.push('  sensitive   = true');
      }

      if (variable.default !== undefined && variable.default !== null) {
        const defaultValue =
          typeof variable.default === 'string'
            ? `"${variable.default}"`
            : String(variable.default);
        lines.push(`  default     = ${defaultValue}`);
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
      '# Import blocks (Terraform 1.5+)',
      '# Generated by Nimbus Azure Infrastructure Discovery',
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
   * Generate a resource file with resources and their outputs
   */
  private generateResourceFile(
    resources: TerraformResource[],
    outputs: TerraformOutput[],
  ): string {
    const lines: string[] = [
      '# Resources',
      '# Generated by Nimbus Azure Infrastructure Discovery',
      '',
    ];

    for (const resource of resources) {
      lines.push(`resource "${resource.type}" "${resource.name}" {`);

      for (const [key, value] of Object.entries(resource.attributes)) {
        const formatted = this.formatValue(value, 1);
        if (formatted !== null) {
          lines.push(`  ${key} = ${formatted}`);
        }
      }

      if (resource.dependsOn && resource.dependsOn.length > 0) {
        lines.push('');
        const deps = resource.dependsOn.map(d => `    ${d},`).join('\n');
        lines.push('  depends_on = [');
        lines.push(deps);
        lines.push('  ]');
      }

      if (resource.lifecycle) {
        lines.push('');
        lines.push('  lifecycle {');
        if (resource.lifecycle.preventDestroy) {
          lines.push('    prevent_destroy = true');
        }
        if (resource.lifecycle.createBeforeDestroy) {
          lines.push('    create_before_destroy = true');
        }
        if (resource.lifecycle.ignoreChanges) {
          if (resource.lifecycle.ignoreChanges === 'all') {
            lines.push('    ignore_changes = all');
          } else {
            const changes = resource.lifecycle.ignoreChanges.map(c => `      ${c},`).join('\n');
            lines.push('    ignore_changes = [');
            lines.push(changes);
            lines.push('    ]');
          }
        }
        lines.push('  }');
      }

      lines.push('}');
      lines.push('');
    }

    // Outputs section
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
   * Format a Terraform value for HCL output
   */
  private formatValue(value: TerraformValue, indent: number): string | null {
    if (value === null || value === undefined) {
      return 'null';
    }

    if (typeof value === 'string') {
      return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const items = value
        .map(v => this.formatValue(v, indent + 1))
        .filter(v => v !== null);
      return `[${items.join(', ')}]`;
    }

    // Reference type
    if (value && typeof value === 'object' && '_type' in value) {
      if (value._type === 'reference') {
        return (value as { _type: 'reference'; value: string }).value;
      }
      if (value._type === 'expression') {
        return (value as { _type: 'expression'; value: string }).value;
      }
      if (value._type === 'block') {
        const block = value as { _type: 'block'; _blockType?: string; attributes: Record<string, TerraformValue> };
        const prefix = '  '.repeat(indent);
        const innerPrefix = '  '.repeat(indent + 1);
        const blockLines: string[] = ['{'];
        for (const [k, v] of Object.entries(block.attributes)) {
          const formatted = this.formatValue(v, indent + 1);
          if (formatted !== null) {
            blockLines.push(`${innerPrefix}${k} = ${formatted}`);
          }
        }
        blockLines.push(`${prefix}}`);
        return blockLines.join('\n');
      }
    }

    // Plain object (map/tags)
    if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value as Record<string, TerraformValue>);
      if (entries.length === 0) return '{}';

      const prefix = '  '.repeat(indent);
      const innerPrefix = '  '.repeat(indent + 1);
      const objLines: string[] = ['{'];
      for (const [k, v] of entries) {
        const formatted = this.formatValue(v, indent + 1);
        if (formatted !== null) {
          objLines.push(`${innerPrefix}${k} = ${formatted}`);
        }
      }
      objLines.push(`${prefix}}`);
      return objLines.join('\n');
    }

    return null;
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
        exampleValue = typeof variable.default === 'string'
          ? `"${variable.default}"`
          : JSON.stringify(variable.default);
      } else if (variable.type === 'string') {
        exampleValue = '""';
      } else if (variable.type === 'number') {
        exampleValue = '0';
      } else if (variable.type === 'bool') {
        exampleValue = 'false';
      } else if (variable.type?.startsWith('list')) {
        exampleValue = '[]';
      } else if (variable.type?.startsWith('map')) {
        exampleValue = '{}';
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
      '# Generated by Nimbus Azure Infrastructure Discovery',
      '',
      '# This script imports existing Azure resources into Terraform state.',
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
      const service = resource.sourceResource
        ? getServiceCategory(resource.sourceResource.azureType)
        : 'misc';
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
 * Create an Azure Terraform generator instance
 */
export function createAzureTerraformGenerator(
  config: TerraformGeneratorConfig,
): AzureTerraformGenerator {
  return new AzureTerraformGenerator(config);
}
