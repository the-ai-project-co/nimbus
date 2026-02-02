/**
 * HCL Formatter
 *
 * Converts Terraform data structures to properly formatted HCL syntax
 */

import type {
  TerraformValue,
  TerraformBlock,
  TerraformReference,
  TerraformExpression,
  TerraformResource,
  TerraformVariable,
  TerraformOutput,
  TerraformImport,
  TerraformDataSource,
  TerraformProvider,
  TerraformLocals,
  TerraformFileContent,
} from './types';

/**
 * Formatter configuration
 */
export interface FormatterConfig {
  /** Indentation string (default: 2 spaces) */
  indent?: string;
  /** Whether to include comments */
  includeComments?: boolean;
  /** Line width for wrapping (default: 80) */
  lineWidth?: number;
}

const DEFAULT_CONFIG: Required<FormatterConfig> = {
  indent: '  ',
  includeComments: true,
  lineWidth: 80,
};

/**
 * HCL Formatter class
 */
export class HCLFormatter {
  private config: Required<FormatterConfig>;

  constructor(config: FormatterConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Format a complete Terraform file
   */
  formatFile(content: TerraformFileContent): string {
    const sections: string[] = [];

    // Terraform block
    if (content.terraform) {
      sections.push(this.formatTerraformBlock(content.terraform));
    }

    // Provider blocks
    if (content.providers && content.providers.length > 0) {
      for (const provider of content.providers) {
        sections.push(this.formatProvider(provider));
      }
    }

    // Variable blocks
    if (content.variables && content.variables.length > 0) {
      for (const variable of content.variables) {
        sections.push(this.formatVariable(variable));
      }
    }

    // Locals block
    if (content.locals && Object.keys(content.locals).length > 0) {
      sections.push(this.formatLocals(content.locals));
    }

    // Data source blocks
    if (content.dataSources && content.dataSources.length > 0) {
      for (const dataSource of content.dataSources) {
        sections.push(this.formatDataSource(dataSource));
      }
    }

    // Import blocks
    if (content.imports && content.imports.length > 0) {
      for (const importBlock of content.imports) {
        sections.push(this.formatImport(importBlock));
      }
    }

    // Resource blocks
    if (content.resources && content.resources.length > 0) {
      for (const resource of content.resources) {
        sections.push(this.formatResource(resource));
      }
    }

    // Output blocks
    if (content.outputs && content.outputs.length > 0) {
      for (const output of content.outputs) {
        sections.push(this.formatOutput(output));
      }
    }

    return sections.join('\n\n') + '\n';
  }

  /**
   * Format the terraform {} block
   */
  formatTerraformBlock(block: TerraformBlock): string {
    const lines: string[] = ['terraform {'];

    if (block.attributes) {
      for (const [key, value] of Object.entries(block.attributes)) {
        if (this.isBlock(value)) {
          lines.push(...this.formatNestedBlock(key, value as TerraformBlock, 1));
        } else {
          lines.push(`${this.config.indent}${key} = ${this.formatValue(value)}`);
        }
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Format a provider block
   */
  formatProvider(provider: TerraformProvider): string {
    const lines: string[] = [];

    if (provider.alias) {
      lines.push(`provider "${provider.name}" {`);
      lines.push(`${this.config.indent}alias = "${provider.alias}"`);
    } else {
      lines.push(`provider "${provider.name}" {`);
    }

    for (const [key, value] of Object.entries(provider.attributes)) {
      if (key === 'alias') continue; // Already handled

      if (this.isBlock(value)) {
        lines.push(...this.formatNestedBlock(key, value as TerraformBlock, 1));
      } else {
        lines.push(`${this.config.indent}${key} = ${this.formatValue(value)}`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Format a variable block
   */
  formatVariable(variable: TerraformVariable): string {
    const lines: string[] = [`variable "${variable.name}" {`];

    if (variable.description) {
      lines.push(`${this.config.indent}description = ${this.formatValue(variable.description)}`);
    }

    if (variable.type) {
      lines.push(`${this.config.indent}type        = ${variable.type}`);
    }

    if (variable.default !== undefined) {
      lines.push(`${this.config.indent}default     = ${this.formatValue(variable.default)}`);
    }

    if (variable.sensitive) {
      lines.push(`${this.config.indent}sensitive   = true`);
    }

    if (variable.nullable !== undefined) {
      lines.push(`${this.config.indent}nullable    = ${variable.nullable}`);
    }

    if (variable.validation && variable.validation.length > 0) {
      for (const validation of variable.validation) {
        lines.push('');
        lines.push(`${this.config.indent}validation {`);
        lines.push(`${this.config.indent}${this.config.indent}condition     = ${validation.condition}`);
        lines.push(`${this.config.indent}${this.config.indent}error_message = ${this.formatValue(validation.errorMessage)}`);
        lines.push(`${this.config.indent}}`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Format a locals block
   */
  formatLocals(locals: TerraformLocals): string {
    const lines: string[] = ['locals {'];

    for (const [key, value] of Object.entries(locals)) {
      lines.push(`${this.config.indent}${key} = ${this.formatValue(value)}`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Format a data source block
   */
  formatDataSource(dataSource: TerraformDataSource): string {
    const lines: string[] = [`data "${dataSource.type}" "${dataSource.name}" {`];

    if (dataSource.provider) {
      lines.push(`${this.config.indent}provider = ${dataSource.provider}`);
    }

    for (const [key, value] of Object.entries(dataSource.attributes)) {
      if (this.isBlock(value)) {
        lines.push(...this.formatNestedBlock(key, value as TerraformBlock, 1));
      } else {
        lines.push(`${this.config.indent}${key} = ${this.formatValue(value)}`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Format an import block
   */
  formatImport(importBlock: TerraformImport): string {
    const lines: string[] = ['import {'];

    lines.push(`${this.config.indent}to = ${importBlock.to}`);
    lines.push(`${this.config.indent}id = ${this.formatValue(importBlock.id)}`);

    if (importBlock.provider) {
      lines.push(`${this.config.indent}provider = ${importBlock.provider}`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Format a resource block
   */
  formatResource(resource: TerraformResource): string {
    const lines: string[] = [];

    // Add comment with source resource info
    if (this.config.includeComments && resource.sourceResource) {
      lines.push(`# ${resource.sourceResource.name || resource.sourceResource.id}`);
      if (resource.sourceResource.arn) {
        lines.push(`# ARN: ${resource.sourceResource.arn}`);
      }
    }

    lines.push(`resource "${resource.type}" "${resource.name}" {`);

    // Provider
    if (resource.provider) {
      lines.push(`${this.config.indent}provider = ${resource.provider}`);
      lines.push('');
    }

    // Count or for_each
    if (resource.count !== undefined) {
      lines.push(`${this.config.indent}count = ${resource.count}`);
      lines.push('');
    }
    if (resource.forEach) {
      lines.push(`${this.config.indent}for_each = ${resource.forEach}`);
      lines.push('');
    }

    // Attributes
    const attributeLines = this.formatAttributes(resource.attributes, 1);
    lines.push(...attributeLines);

    // Lifecycle
    if (resource.lifecycle) {
      lines.push('');
      lines.push(...this.formatLifecycle(resource.lifecycle, 1));
    }

    // depends_on
    if (resource.dependsOn && resource.dependsOn.length > 0) {
      lines.push('');
      lines.push(`${this.config.indent}depends_on = [`);
      for (const dep of resource.dependsOn) {
        lines.push(`${this.config.indent}${this.config.indent}${dep},`);
      }
      lines.push(`${this.config.indent}]`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Format an output block
   */
  formatOutput(output: TerraformOutput): string {
    const lines: string[] = [`output "${output.name}" {`];

    if (output.description) {
      lines.push(`${this.config.indent}description = ${this.formatValue(output.description)}`);
    }

    lines.push(`${this.config.indent}value       = ${output.value}`);

    if (output.sensitive) {
      lines.push(`${this.config.indent}sensitive   = true`);
    }

    if (output.dependsOn && output.dependsOn.length > 0) {
      lines.push(`${this.config.indent}depends_on  = [`);
      for (const dep of output.dependsOn) {
        lines.push(`${this.config.indent}${this.config.indent}${dep},`);
      }
      lines.push(`${this.config.indent}]`);
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Format attributes at a given indent level
   */
  private formatAttributes(
    attributes: Record<string, TerraformValue>,
    level: number
  ): string[] {
    const lines: string[] = [];
    const indent = this.config.indent.repeat(level);

    // Group attributes: simple values first, then blocks
    const simpleAttrs: [string, TerraformValue][] = [];
    const blockAttrs: [string, TerraformValue][] = [];

    for (const [key, value] of Object.entries(attributes)) {
      if (this.isBlock(value)) {
        blockAttrs.push([key, value]);
      } else if (Array.isArray(value) && value.length > 0 && this.isBlock(value[0])) {
        blockAttrs.push([key, value]);
      } else {
        simpleAttrs.push([key, value]);
      }
    }

    // Format simple attributes
    for (const [key, value] of simpleAttrs) {
      lines.push(`${indent}${key} = ${this.formatValue(value)}`);
    }

    // Format block attributes
    for (const [key, value] of blockAttrs) {
      if (simpleAttrs.length > 0 || blockAttrs.indexOf([key, value]) > 0) {
        lines.push('');
      }

      if (Array.isArray(value)) {
        for (const item of value) {
          if (this.isBlock(item)) {
            lines.push(...this.formatNestedBlock(key, item as TerraformBlock, level));
          }
        }
      } else {
        lines.push(...this.formatNestedBlock(key, value as TerraformBlock, level));
      }
    }

    return lines;
  }

  /**
   * Format a nested block
   */
  private formatNestedBlock(name: string, block: TerraformBlock, level: number): string[] {
    const lines: string[] = [];
    const indent = this.config.indent.repeat(level);

    lines.push(`${indent}${name} {`);

    if (block.attributes) {
      lines.push(...this.formatAttributes(block.attributes, level + 1));
    }

    lines.push(`${indent}}`);
    return lines;
  }

  /**
   * Format a lifecycle block
   */
  private formatLifecycle(
    lifecycle: TerraformResource['lifecycle'],
    level: number
  ): string[] {
    if (!lifecycle) return [];

    const lines: string[] = [];
    const indent = this.config.indent.repeat(level);

    lines.push(`${indent}lifecycle {`);

    if (lifecycle.createBeforeDestroy !== undefined) {
      lines.push(`${indent}${this.config.indent}create_before_destroy = ${lifecycle.createBeforeDestroy}`);
    }

    if (lifecycle.preventDestroy !== undefined) {
      lines.push(`${indent}${this.config.indent}prevent_destroy = ${lifecycle.preventDestroy}`);
    }

    if (lifecycle.ignoreChanges) {
      if (lifecycle.ignoreChanges === 'all') {
        lines.push(`${indent}${this.config.indent}ignore_changes = all`);
      } else {
        lines.push(`${indent}${this.config.indent}ignore_changes = [`);
        for (const change of lifecycle.ignoreChanges) {
          lines.push(`${indent}${this.config.indent}${this.config.indent}${change},`);
        }
        lines.push(`${indent}${this.config.indent}]`);
      }
    }

    if (lifecycle.replaceTriggeredBy && lifecycle.replaceTriggeredBy.length > 0) {
      lines.push(`${indent}${this.config.indent}replace_triggered_by = [`);
      for (const trigger of lifecycle.replaceTriggeredBy) {
        lines.push(`${indent}${this.config.indent}${this.config.indent}${trigger},`);
      }
      lines.push(`${indent}${this.config.indent}]`);
    }

    lines.push(`${indent}}`);
    return lines;
  }

  /**
   * Format a Terraform value
   */
  formatValue(value: TerraformValue): string {
    if (value === null) {
      return 'null';
    }

    if (typeof value === 'string') {
      return this.formatString(value);
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }

    if (Array.isArray(value)) {
      return this.formatArray(value);
    }

    if (this.isReference(value)) {
      return (value as TerraformReference).value;
    }

    if (this.isExpression(value)) {
      return (value as TerraformExpression).value;
    }

    if (this.isBlock(value)) {
      // Blocks should be handled separately
      return this.formatObject((value as TerraformBlock).attributes);
    }

    if (typeof value === 'object') {
      return this.formatObject(value as Record<string, TerraformValue>);
    }

    return String(value);
  }

  /**
   * Format a string value
   */
  private formatString(value: string): string {
    // Check if it's a reference or expression (no quotes needed)
    if (value.startsWith('${') || value.match(/^[a-z_][a-z0-9_]*\./i)) {
      return value;
    }

    // Check if it contains interpolation
    if (value.includes('${')) {
      // Use heredoc for multiline strings with interpolation
      if (value.includes('\n')) {
        return `<<-EOT\n${value}\nEOT`;
      }
      return `"${this.escapeString(value)}"`;
    }

    // Simple string
    if (value.includes('\n')) {
      return `<<-EOT\n${value}\nEOT`;
    }

    return `"${this.escapeString(value)}"`;
  }

  /**
   * Escape special characters in strings
   */
  private escapeString(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }

  /**
   * Format an array value
   */
  private formatArray(value: TerraformValue[]): string {
    if (value.length === 0) {
      return '[]';
    }

    // Check if it's a simple array that can fit on one line
    const isSimple = value.every(
      v => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    );

    if (isSimple && value.length <= 5) {
      const items = value.map(v => this.formatValue(v)).join(', ');
      if (items.length < this.config.lineWidth - 10) {
        return `[${items}]`;
      }
    }

    // Multi-line array
    const lines = ['['];
    for (const item of value) {
      lines.push(`${this.config.indent}${this.formatValue(item)},`);
    }
    lines.push(']');
    return lines.join('\n');
  }

  /**
   * Format an object value
   */
  private formatObject(value: Record<string, TerraformValue>): string {
    const entries = Object.entries(value);

    if (entries.length === 0) {
      return '{}';
    }

    // Check if it's a simple object that can fit on one line
    const isSimple = entries.every(
      ([_, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    );

    if (isSimple && entries.length <= 3) {
      const items = entries.map(([k, v]) => `${k} = ${this.formatValue(v)}`).join(', ');
      if (items.length < this.config.lineWidth - 10) {
        return `{ ${items} }`;
      }
    }

    // Multi-line object
    const lines = ['{'];
    for (const [key, val] of entries) {
      lines.push(`${this.config.indent}${key} = ${this.formatValue(val)}`);
    }
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Check if a value is a block
   */
  private isBlock(value: TerraformValue): boolean {
    return typeof value === 'object' && value !== null && '_type' in value && (value as any)._type === 'block';
  }

  /**
   * Check if a value is a reference
   */
  private isReference(value: TerraformValue): boolean {
    return typeof value === 'object' && value !== null && '_type' in value && (value as any)._type === 'reference';
  }

  /**
   * Check if a value is an expression
   */
  private isExpression(value: TerraformValue): boolean {
    return typeof value === 'object' && value !== null && '_type' in value && (value as any)._type === 'expression';
  }
}

/**
 * Create a default formatter instance
 */
export function createFormatter(config?: FormatterConfig): HCLFormatter {
  return new HCLFormatter(config);
}
