/**
 * Terraform Generator
 *
 * Main orchestration class for generating Terraform configurations
 * from discovered AWS resources
 */

import type { DiscoveredResource } from '../discovery/types';
import type {
  TerraformGeneratorConfig,
  TerraformResource,
  TerraformVariable,
  TerraformOutput,
  TerraformProvider,
  TerraformImport,
  TerraformFileContent,
  MappingContext,
  TerraformReference,
} from './types';
import { HCLFormatter } from './formatter';
import {
  createMapperRegistry,
  getServiceForTerraformType,
  MapperRegistry,
} from './mappers';

/**
 * Generated Terraform files
 */
export interface GeneratedFiles {
  /** Map of filename to content */
  files: Map<string, string>;
  /** List of resources that couldn't be mapped */
  unmappedResources: DiscoveredResource[];
  /** Variables that need to be provided */
  variables: TerraformVariable[];
  /** Suggested outputs */
  outputs: TerraformOutput[];
  /** Import blocks for Terraform 1.5+ */
  imports: TerraformImport[];
  /** Import script for older Terraform versions */
  importScript: string;
  /** Summary statistics */
  summary: GenerationSummary;
}

/**
 * Summary of the generation process
 */
export interface GenerationSummary {
  totalResources: number;
  mappedResources: number;
  unmappedResources: number;
  resourcesByService: Record<string, number>;
  variablesGenerated: number;
  outputsGenerated: number;
}

/**
 * Internal mapping context implementation
 */
class MappingContextImpl implements MappingContext {
  readonly config: TerraformGeneratorConfig;
  private resourceMap: Map<string, TerraformResource> = new Map();
  private arnToResource: Map<string, TerraformResource> = new Map();
  private variables: Map<string, TerraformVariable> = new Map();
  private sensitiveValues: Map<string, string> = new Map();

  constructor(config: TerraformGeneratorConfig) {
    this.config = config;
  }

  /**
   * Register a mapped resource
   */
  registerResource(resource: TerraformResource): void {
    const key = `${resource.type}.${resource.name}`;
    this.resourceMap.set(key, resource);

    if (resource.sourceResource?.arn) {
      this.arnToResource.set(resource.sourceResource.arn, resource);
    }
  }

  /**
   * Get a reference to another resource by ARN
   */
  getResourceReference(arn: string): TerraformReference | undefined {
    const resource = this.arnToResource.get(arn);
    if (resource) {
      return {
        _type: 'reference',
        value: `${resource.type}.${resource.name}.id`,
      };
    }
    return undefined;
  }

  /**
   * Add a variable
   */
  addVariable(variable: Omit<TerraformVariable, 'name'> & { name: string }): string {
    // Ensure unique variable names
    let varName = variable.name;
    let counter = 1;
    while (this.variables.has(varName)) {
      varName = `${variable.name}_${counter}`;
      counter++;
    }

    this.variables.set(varName, { ...variable, name: varName });
    return varName;
  }

  /**
   * Mark a value as sensitive and create a variable for it
   */
  markSensitive(key: string, value: unknown, description?: string): TerraformReference {
    const varName = this.addVariable({
      name: `sensitive_${key}`,
      type: 'string',
      description: description || `Sensitive value for ${key}`,
      sensitive: true,
    });

    this.sensitiveValues.set(varName, String(value));

    return {
      _type: 'reference',
      value: `var.${varName}`,
    };
  }

  /**
   * Get all variables
   */
  getVariables(): TerraformVariable[] {
    return Array.from(this.variables.values());
  }

  /**
   * Get sensitive values (for tfvars file)
   */
  getSensitiveValues(): Map<string, string> {
    return this.sensitiveValues;
  }

  /**
   * Get all registered resources
   */
  getResources(): TerraformResource[] {
    return Array.from(this.resourceMap.values());
  }
}

/**
 * Terraform Generator class
 */
export class TerraformGenerator {
  private config: TerraformGeneratorConfig;
  private formatter: HCLFormatter;
  private registry: MapperRegistry;

  constructor(config: TerraformGeneratorConfig) {
    this.config = {
      generateImportBlocks: true,
      generateImportScript: true,
      organizeByService: true,
      terraformVersion: '1.5.0',
      awsProviderVersion: '~> 5.0',
      ...config,
    };

    this.formatter = new HCLFormatter();
    this.registry = createMapperRegistry();
  }

  /**
   * Generate Terraform configuration from discovered resources
   */
  generate(resources: DiscoveredResource[]): GeneratedFiles {
    const context = new MappingContextImpl(this.config);
    const mappedResources: TerraformResource[] = [];
    const unmappedResources: DiscoveredResource[] = [];
    const outputs: TerraformOutput[] = [];
    const imports: TerraformImport[] = [];

    // Phase 1: Map all resources
    for (const resource of resources) {
      const mapper = this.registry.get(resource.type);

      if (mapper) {
        const mapped = mapper.map(resource, context);
        if (mapped) {
          mappedResources.push(mapped);
          context.registerResource(mapped);

          // Generate import block
          if (this.config.generateImportBlocks) {
            imports.push({
              to: `${mapped.type}.${mapped.name}`,
              id: mapper.getImportId(resource),
            });
          }

          // Get suggested outputs
          if (mapper.getSuggestedOutputs) {
            const suggestedOutputs = mapper.getSuggestedOutputs(resource);
            outputs.push(...suggestedOutputs);
          }
        } else {
          unmappedResources.push(resource);
        }
      } else {
        unmappedResources.push(resource);
      }
    }

    // Phase 2: Organize resources by service/file
    const files = this.organizeFiles(mappedResources, context, imports, outputs);

    // Phase 3: Generate import script
    const importScript = this.generateImportScript(imports);

    // Phase 4: Calculate summary
    const summary = this.calculateSummary(
      resources,
      mappedResources,
      unmappedResources,
      context.getVariables(),
      outputs
    );

    return {
      files,
      unmappedResources,
      variables: context.getVariables(),
      outputs,
      imports,
      importScript,
      summary,
    };
  }

  /**
   * Organize resources into files
   */
  private organizeFiles(
    resources: TerraformResource[],
    context: MappingContextImpl,
    imports: TerraformImport[],
    outputs: TerraformOutput[]
  ): Map<string, string> {
    const files = new Map<string, string>();

    // Generate providers.tf
    files.set('providers.tf', this.generateProvidersFile());

    // Generate variables.tf
    const variables = context.getVariables();
    if (variables.length > 0) {
      files.set('variables.tf', this.generateVariablesFile(variables));
    }

    // Generate outputs.tf
    if (outputs.length > 0 && !this.config.organizeByService) {
      files.set('outputs.tf', this.generateOutputsFile(outputs));
    }

    // Generate import.tf (Terraform 1.5+)
    if (this.config.generateImportBlocks && imports.length > 0) {
      files.set('import.tf', this.generateImportsFile(imports));
    }

    // Organize resources
    if (this.config.organizeByService) {
      // Group by service
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
        // Extract service from output value (e.g., aws_ec2_instance.xxx.id -> ec2)
        const match = output.value.match(/^aws_(\w+)/);
        const service = match ? getServiceForTerraformType(`aws_${match[1]}`) : 'misc';
        if (!outputsByService.has(service)) {
          outputsByService.set(service, []);
        }
        outputsByService.get(service)!.push(output);
      }

      // Generate service files
      for (const [service, serviceResources] of resourcesByService) {
        const serviceOutputs = outputsByService.get(service) || [];
        const content = this.generateServiceFile(serviceResources, serviceOutputs);
        files.set(`${service}.tf`, content);
      }
    } else {
      // Single main.tf
      const content = this.generateMainFile(resources);
      files.set('main.tf', content);
    }

    // Generate terraform.tfvars.example
    if (variables.length > 0) {
      files.set('terraform.tfvars.example', this.generateTfvarsExample(variables));
    }

    return files;
  }

  /**
   * Generate providers.tf content
   */
  private generateProvidersFile(): string {
    const content: TerraformFileContent = {
      terraform: {
        required_version: `>= ${this.config.terraformVersion}`,
        required_providers: {
          aws: {
            source: 'hashicorp/aws',
            version: this.config.awsProviderVersion!,
          },
        },
      },
      providers: [
        {
          name: 'aws',
          attributes: {
            region: { _type: 'reference', value: 'var.aws_region' },
          },
        },
      ],
      variables: [
        {
          name: 'aws_region',
          type: 'string',
          description: 'AWS region for resources',
          default: this.config.defaultRegion || 'us-east-1',
        },
      ],
    };

    return this.formatter.formatFile(content);
  }

  /**
   * Generate variables.tf content
   */
  private generateVariablesFile(variables: TerraformVariable[]): string {
    const content: TerraformFileContent = {
      variables,
    };

    return this.formatter.formatFile(content);
  }

  /**
   * Generate outputs.tf content
   */
  private generateOutputsFile(outputs: TerraformOutput[]): string {
    const content: TerraformFileContent = {
      outputs,
    };

    return this.formatter.formatFile(content);
  }

  /**
   * Generate import.tf content
   */
  private generateImportsFile(imports: TerraformImport[]): string {
    const content: TerraformFileContent = {
      imports,
    };

    return this.formatter.formatFile(content);
  }

  /**
   * Generate a service-specific file
   */
  private generateServiceFile(
    resources: TerraformResource[],
    outputs: TerraformOutput[]
  ): string {
    const content: TerraformFileContent = {
      resources,
      outputs: outputs.length > 0 ? outputs : undefined,
    };

    return this.formatter.formatFile(content);
  }

  /**
   * Generate main.tf with all resources
   */
  private generateMainFile(resources: TerraformResource[]): string {
    const content: TerraformFileContent = {
      resources,
    };

    return this.formatter.formatFile(content);
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
      } else if (variable.default !== undefined) {
        exampleValue = JSON.stringify(variable.default);
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
      '# Generated by Nimbus AWS Infrastructure Discovery',
      '',
      '# This script imports existing AWS resources into Terraform state.',
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
      // Escape special shell characters in the ID (backslash, double quote, dollar sign, backtick)
      const escapedId = imp.id
        .replace(/\\/g, '\\\\')  // Escape backslashes first
        .replace(/"/g, '\\"')    // Escape double quotes
        .replace(/\$/g, '\\$')   // Escape dollar signs
        .replace(/`/g, '\\`');   // Escape backticks
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
    outputs: TerraformOutput[]
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
 * Create a Terraform generator instance
 */
export function createTerraformGenerator(config: TerraformGeneratorConfig): TerraformGenerator {
  return new TerraformGenerator(config);
}
