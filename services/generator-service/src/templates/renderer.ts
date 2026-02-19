import Handlebars from 'handlebars';
import { logger } from '@nimbus/shared-utils';

export interface RenderOptions {
  strict?: boolean;
  helpers?: Record<string, Handlebars.HelperDelegate>;
}

export class TemplateRenderer {
  private handlebars: typeof Handlebars;

  constructor() {
    this.handlebars = Handlebars.create();
    this.registerDefaultHelpers();
  }

  /**
   * Render a template with variables
   */
  render(template: string, variables: Record<string, unknown>, options?: RenderOptions): string {
    try {
      // Register custom helpers if provided
      if (options?.helpers) {
        Object.entries(options.helpers).forEach(([name, helper]) => {
          this.handlebars.registerHelper(name, helper);
        });
      }

      // Compile template
      const compiled = this.handlebars.compile(template, {
        strict: options?.strict ?? false,
        noEscape: true, // Don't escape for code generation
      });

      // Render
      const result = compiled(variables);

      logger.debug('Template rendered successfully');
      return result;
    } catch (error) {
      logger.error('Error rendering template', error);
      throw new Error(`Template rendering failed: ${(error as Error).message}`);
    }
  }

  /**
   * Register a custom helper
   */
  registerHelper(name: string, helper: Handlebars.HelperDelegate): void {
    this.handlebars.registerHelper(name, helper);
  }

  /**
   * Register multiple helpers
   */
  registerHelpers(helpers: Record<string, Handlebars.HelperDelegate>): void {
    Object.entries(helpers).forEach(([name, helper]) => {
      this.handlebars.registerHelper(name, helper);
    });
  }

  /**
   * Register default helpers for infrastructure code generation
   */
  private registerDefaultHelpers(): void {
    // Uppercase helper
    this.handlebars.registerHelper('uppercase', (str: string) => {
      return str ? str.toUpperCase() : '';
    });

    // Lowercase helper
    this.handlebars.registerHelper('lowercase', (str: string) => {
      return str ? str.toLowerCase() : '';
    });

    // Capitalize helper
    this.handlebars.registerHelper('capitalize', (str: string) => {
      return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    });

    // Join array helper
    this.handlebars.registerHelper('join', (array: string[], separator: string = ', ') => {
      return Array.isArray(array) ? array.join(separator) : '';
    });

    // Quote string helper (for Terraform strings)
    this.handlebars.registerHelper('quote', (str: string) => {
      return `"${str}"`;
    });

    // CIDR subnet calculation helper
    this.handlebars.registerHelper('cidr_subnet', (vpcCidr: string, index: number, newbits: number = 8) => {
      // Simple CIDR subnet calculation
      // This is a simplified version - in production, use a proper library
      const [baseIp, baseBits] = vpcCidr.split('/');
      const octets = baseIp.split('.').map(Number);

      // Calculate new subnet
      const subnetIncrement = index * Math.pow(2, 32 - parseInt(baseBits) - newbits);
      const lastOctet = octets[3] + subnetIncrement;

      return `${octets[0]}.${octets[1]}.${octets[2]}.${lastOctet % 256}/${parseInt(baseBits) + newbits}`;
    });

    // Repeat helper (for generating multiple resources)
    this.handlebars.registerHelper('repeat', function(n: number, block: any) {
      let result = '';
      for (let i = 0; i < n; i++) {
        result += block.fn({ index: i, count: n });
      }
      return result;
    });

    // Range helper (for generating arrays)
    this.handlebars.registerHelper('range', (start: number, end: number) => {
      const result = [];
      for (let i = start; i <= end; i++) {
        result.push(i);
      }
      return result;
    });

    // Math helpers
    this.handlebars.registerHelper('add', (a: number, b: number) => a + b);
    this.handlebars.registerHelper('subtract', (a: number, b: number) => a - b);

    // Conditional helpers
    this.handlebars.registerHelper('eq', (a: any, b: any) => a === b);
    this.handlebars.registerHelper('ne', (a: any, b: any) => a !== b);
    this.handlebars.registerHelper('lt', (a: any, b: any) => a < b);
    this.handlebars.registerHelper('gt', (a: any, b: any) => a > b);
    this.handlebars.registerHelper('lte', (a: any, b: any) => a <= b);
    this.handlebars.registerHelper('gte', (a: any, b: any) => a >= b);
    this.handlebars.registerHelper('and', (a: any, b: any) => a && b);
    this.handlebars.registerHelper('or', (a: any, b: any) => a || b);
    this.handlebars.registerHelper('not', (a: any) => !a);

    // Contains helper (for arrays)
    this.handlebars.registerHelper('contains', (array: any[], value: any) => {
      return Array.isArray(array) && array.includes(value);
    });

    // Default value helper
    this.handlebars.registerHelper('default', (value: any, defaultValue: any) => {
      return value !== undefined && value !== null && value !== '' ? value : defaultValue;
    });

    // JSON stringify helper
    this.handlebars.registerHelper('json', (obj: any) => {
      return JSON.stringify(obj, null, 2);
    });

    // Indent helper (for nested code blocks)
    this.handlebars.registerHelper('indent', (text: string, spaces: number = 2) => {
      const indent = ' '.repeat(spaces);
      return text.split('\n').map(line => line ? indent + line : line).join('\n');
    });

    // Comment helper (for adding code comments)
    this.handlebars.registerHelper('comment', (text: string, style: string = '#') => {
      return `${style} ${text}`;
    });

    // Terraform map helper
    this.handlebars.registerHelper('tf_map', (obj: Record<string, any>) => {
      if (!obj || typeof obj !== 'object') return '{}';

      const entries = Object.entries(obj).map(([key, value]) => {
        const valueStr = typeof value === 'string' ? `"${value}"` : value;
        return `    ${key} = ${valueStr}`;
      });

      return '{\n' + entries.join('\n') + '\n  }';
    });

    // Terraform list helper
    this.handlebars.registerHelper('tf_list', (arr: any[]) => {
      if (!Array.isArray(arr)) return '[]';

      const items = arr.map(item => {
        return typeof item === 'string' ? `"${item}"` : item;
      });

      return '[' + items.join(', ') + ']';
    });
  }

  /**
   * Validate template syntax
   */
  validateTemplate(template: string): { valid: boolean; error?: string } {
    try {
      this.handlebars.compile(template);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Extract variables from template
   */
  extractVariables(template: string): string[] {
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables = new Set<string>();

    let match;
    while ((match = variableRegex.exec(template)) !== null) {
      const variable = match[1].trim();
      // Skip helpers, block expressions, and Handlebars built-ins
      if (
        !variable.startsWith('#') &&
        !variable.startsWith('/') &&
        !variable.includes(' ') &&
        variable !== 'this' &&
        variable !== '@index' &&
        variable !== '@key'
      ) {
        variables.add(variable);
      }
    }

    return Array.from(variables).sort();
  }
}
