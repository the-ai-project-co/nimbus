/**
 * Template Commands
 *
 * CLI commands for managing infrastructure templates
 */

import { RestClient } from '@nimbus/shared-clients';
import { ui } from '../wizard/ui';

const STATE_SERVICE_URL = process.env.STATE_SERVICE_URL || 'http://localhost:3004';

export interface TemplateCommandOptions {
  type?: string;
  name?: string;
  file?: string;
  json?: boolean;
}

/**
 * List all templates
 */
async function templateListCommand(options: TemplateCommandOptions = {}): Promise<void> {
  ui.header('Templates');
  ui.startSpinner({ message: 'Fetching templates...' });

  try {
    const client = new RestClient(STATE_SERVICE_URL);
    const params = options.type ? `?type=${encodeURIComponent(options.type)}` : '';
    const result = await client.get<any>(`/api/state/templates${params}`);

    if (result.success && result.data) {
      const templates = Array.isArray(result.data) ? result.data : [];
      ui.stopSpinnerSuccess(`Found ${templates.length} template(s)`);

      if (templates.length > 0) {
        ui.table({
          columns: [
            { key: 'id', header: 'ID' },
            { key: 'name', header: 'Name' },
            { key: 'type', header: 'Type' },
            { key: 'createdAt', header: 'Created' },
          ],
          data: templates.map((t: any) => ({
            id: t.id?.substring(0, 8) || '-',
            name: t.name || '-',
            type: t.type || '-',
            createdAt: t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '-',
          })),
        });
      } else {
        ui.info('No templates found. Use "nimbus template save" to create one.');
      }
    } else {
      ui.stopSpinnerFail('Failed to fetch templates');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error fetching templates');
    ui.error(error.message);
  }
}

/**
 * Get a specific template by ID
 */
async function templateGetCommand(id: string, options: TemplateCommandOptions = {}): Promise<void> {
  ui.header(`Template: ${id}`);
  ui.startSpinner({ message: 'Fetching template...' });

  try {
    const client = new RestClient(STATE_SERVICE_URL);
    const result = await client.get<any>(`/api/state/templates/${encodeURIComponent(id)}`);

    if (result.success && result.data) {
      ui.stopSpinnerSuccess('Template retrieved');
      const template = result.data;

      ui.print(`  ${ui.color('Name:', 'cyan')} ${template.name || '-'}`);
      ui.print(`  ${ui.color('Type:', 'cyan')} ${template.type || '-'}`);
      ui.print(`  ${ui.color('ID:', 'cyan')} ${template.id || '-'}`);
      ui.print(`  ${ui.color('Created:', 'cyan')} ${template.createdAt || '-'}`);

      if (template.variables && Object.keys(template.variables).length > 0) {
        ui.newLine();
        ui.print(`  ${ui.color('Variables:', 'cyan')}`);
        for (const [key, val] of Object.entries(template.variables)) {
          ui.print(`    ${key}: ${JSON.stringify(val)}`);
        }
      }

      if (template.content) {
        ui.newLine();
        ui.box({ title: 'Content', content: typeof template.content === 'string' ? template.content : JSON.stringify(template.content, null, 2) });
      }
    } else {
      ui.stopSpinnerFail('Template not found');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error fetching template');
    ui.error(error.message);
  }
}

/**
 * Save a new template
 */
async function templateSaveCommand(options: TemplateCommandOptions = {}): Promise<void> {
  ui.header('Save Template');

  if (!options.name) {
    ui.error('Template name is required. Use --name <name>');
    return;
  }

  let content = '';
  if (options.file) {
    try {
      const fs = await import('fs');
      content = fs.readFileSync(options.file, 'utf-8');
    } catch (err: any) {
      ui.error(`Failed to read file: ${err.message}`);
      return;
    }
  }

  ui.startSpinner({ message: 'Saving template...' });

  try {
    const client = new RestClient(STATE_SERVICE_URL);
    const result = await client.post<any>('/api/state/templates', {
      name: options.name,
      type: options.type || 'terraform',
      content,
      variables: {},
    });

    if (result.success) {
      ui.stopSpinnerSuccess(`Template "${options.name}" saved`);
      if (result.data?.id) {
        ui.info(`ID: ${result.data.id}`);
      }
    } else {
      ui.stopSpinnerFail('Failed to save template');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error saving template');
    ui.error(error.message);
  }
}

/**
 * Delete a template by ID
 */
async function templateDeleteCommand(id: string): Promise<void> {
  ui.header(`Delete Template: ${id}`);
  ui.startSpinner({ message: 'Deleting template...' });

  try {
    const client = new RestClient(STATE_SERVICE_URL);
    const result = await client.delete<any>(`/api/state/templates/${encodeURIComponent(id)}`);

    if (result.success) {
      ui.stopSpinnerSuccess('Template deleted');
    } else {
      ui.stopSpinnerFail('Failed to delete template');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error deleting template');
    ui.error(error.message);
  }
}

/**
 * Main template command router
 */
export async function templateCommand(subcommand: string, args: string[]): Promise<void> {
  const options: TemplateCommandOptions = {};
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--type' || arg === '-t') {
      options.type = args[++i];
    } else if (arg === '--name' || arg === '-n') {
      options.name = args[++i];
    } else if (arg === '--file' || arg === '-f') {
      options.file = args[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (!arg.startsWith('-')) {
      positionalArgs.push(arg);
    }
  }

  switch (subcommand) {
    case 'list':
    case 'ls':
      await templateListCommand(options);
      break;
    case 'get':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus template get <id>');
        return;
      }
      await templateGetCommand(positionalArgs[0], options);
      break;
    case 'save':
      await templateSaveCommand(options);
      break;
    case 'delete':
    case 'rm':
      if (positionalArgs.length < 1) {
        ui.error('Usage: nimbus template delete <id>');
        return;
      }
      await templateDeleteCommand(positionalArgs[0]);
      break;
    default:
      ui.error(`Unknown template subcommand: ${subcommand || '(none)'}`);
      ui.info('Available commands: list, get <id>, save --name <name> [--file <path>], delete <id>');
  }
}
