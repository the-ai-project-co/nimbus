import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { logger } from '@nimbus/shared-utils';

export interface TemplateMetadata {
  id: string;
  name: string;
  description: string;
  type: 'terraform' | 'kubernetes';
  provider: 'aws' | 'gcp' | 'azure' | 'generic';
  component: string;
  path: string;
  requiredVariables: string[];
}

export class TemplateLoader {
  private templates: Map<string, string>;
  private metadata: Map<string, TemplateMetadata>;
  private templatesDir: string;
  private cacheEnabled: boolean;

  constructor(templatesDir?: string, cacheEnabled: boolean = true) {
    this.templatesDir = templatesDir || join(process.cwd(), 'templates');
    this.cacheEnabled = cacheEnabled;
    this.templates = new Map();
    this.metadata = new Map();
  }

  /**
   * Initialize and scan templates directory
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing template loader from ${this.templatesDir}`);
    await this.scanTemplates();
    logger.info(`Loaded ${this.templates.size} templates`);
  }

  /**
   * Load a template by ID
   */
  loadTemplate(templateId: string): string {
    // Check cache first
    if (this.cacheEnabled && this.templates.has(templateId)) {
      return this.templates.get(templateId)!;
    }

    // Load from file
    const metadata = this.metadata.get(templateId);
    if (!metadata) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const templateContent = readFileSync(metadata.path, 'utf-8');

    // Cache if enabled
    if (this.cacheEnabled) {
      this.templates.set(templateId, templateContent);
    }

    return templateContent;
  }

  /**
   * Get template metadata
   */
  getMetadata(templateId: string): TemplateMetadata | undefined {
    return this.metadata.get(templateId);
  }

  /**
   * List all templates
   */
  listTemplates(): TemplateMetadata[] {
    return Array.from(this.metadata.values());
  }

  /**
   * List templates by type
   */
  listByType(type: 'terraform' | 'kubernetes'): TemplateMetadata[] {
    return this.listTemplates().filter(t => t.type === type);
  }

  /**
   * List templates by provider
   */
  listByProvider(provider: 'aws' | 'gcp' | 'azure' | 'generic'): TemplateMetadata[] {
    return this.listTemplates().filter(t => t.provider === provider);
  }

  /**
   * List templates by component
   */
  listByComponent(component: string): TemplateMetadata[] {
    return this.listTemplates().filter(t => t.component === component);
  }

  /**
   * Find template by criteria
   */
  findTemplate(type: string, provider: string, component: string): TemplateMetadata | undefined {
    return this.listTemplates().find(
      t => t.type === type && t.provider === provider && t.component === component
    );
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templates.clear();
    logger.info('Template cache cleared');
  }

  /**
   * Reload templates from disk
   */
  async reload(): Promise<void> {
    this.clearCache();
    this.metadata.clear();
    await this.scanTemplates();
    logger.info(`Reloaded ${this.templates.size} templates`);
  }

  /**
   * Scan templates directory and build metadata
   */
  private async scanTemplates(): Promise<void> {
    try {
      await this.scanDirectory(this.templatesDir, []);
    } catch (error) {
      logger.error('Error scanning templates directory', error);
      throw error;
    }
  }

  /**
   * Recursively scan directory for templates
   */
  private async scanDirectory(dir: string, pathSegments: string[]): Promise<void> {
    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          await this.scanDirectory(fullPath, [...pathSegments, entry]);
        } else if (stat.isFile() && this.isTemplateFile(entry)) {
          const metadata = this.extractMetadata(fullPath, pathSegments, entry);
          if (metadata) {
            this.metadata.set(metadata.id, metadata);
          }
        }
      }
    } catch (error) {
      // Directory might not exist, that's ok
      if ((error as any).code !== 'ENOENT') {
        logger.error(`Error scanning directory ${dir}`, error);
      }
    }
  }

  /**
   * Check if file is a template file
   */
  private isTemplateFile(filename: string): boolean {
    const ext = extname(filename);
    return ext === '.hbs' || ext === '.handlebars';
  }

  /**
   * Extract metadata from template path
   */
  private extractMetadata(fullPath: string, pathSegments: string[], filename: string): TemplateMetadata | null {
    try {
      // Path format: templates/{type}/{provider}/{component}.hbs
      // Example: templates/terraform/aws/vpc.hbs

      if (pathSegments.length < 2) {
        return null;
      }

      const type = pathSegments[0] as 'terraform' | 'kubernetes';
      const provider = pathSegments[1] as 'aws' | 'gcp' | 'azure' | 'generic';
      const component = filename.replace(/\.(hbs|handlebars)$/, '');

      const id = `${type}/${provider}/${component}`;
      const name = this.formatName(component);
      const description = `${name} template for ${provider.toUpperCase()}`;

      // Parse template to find required variables
      const requiredVariables = this.extractRequiredVariables(fullPath);

      return {
        id,
        name,
        description,
        type,
        provider,
        component,
        path: fullPath,
        requiredVariables,
      };
    } catch (error) {
      logger.error(`Error extracting metadata from ${fullPath}`, error);
      return null;
    }
  }

  /**
   * Format component name
   */
  private formatName(component: string): string {
    return component
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Extract required variables from template
   */
  private extractRequiredVariables(templatePath: string): string[] {
    try {
      const content = readFileSync(templatePath, 'utf-8');
      const variableRegex = /\{\{([^}]+)\}\}/g;
      const variables = new Set<string>();

      let match;
      while ((match = variableRegex.exec(content)) !== null) {
        const variable = match[1].trim();
        // Skip helpers and block expressions
        if (!variable.startsWith('#') && !variable.startsWith('/') && !variable.includes(' ')) {
          variables.add(variable);
        }
      }

      return Array.from(variables).sort();
    } catch (error) {
      logger.error(`Error extracting variables from ${templatePath}`, error);
      return [];
    }
  }
}
