/**
 * Template Commands
 *
 * CLI commands for managing infrastructure templates
 */

import { getDb } from '../state/db';
import { randomUUID } from 'crypto';
import { ui } from '../wizard/ui';

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
    const db = getDb();
    const templates = db
      .prepare(
        'SELECT * FROM templates WHERE (? IS NULL OR type=?) ORDER BY created_at DESC'
      )
      .all(options.type ?? null, options.type ?? null) as Array<Record<string, unknown>>;

    ui.stopSpinnerSuccess(`Found ${templates.length} template(s)`);

    if (templates.length > 0) {
      ui.table({
        columns: [
          { key: 'id', header: 'ID' },
          { key: 'name', header: 'Name' },
          { key: 'type', header: 'Type' },
          { key: 'createdAt', header: 'Created' },
        ],
        data: templates.map((t) => ({
          id: typeof t.id === 'string' ? t.id.substring(0, 8) : '-',
          name: typeof t.name === 'string' ? t.name : '-',
          type: typeof t.type === 'string' ? t.type : '-',
          createdAt:
            typeof t.created_at === 'string'
              ? new Date(t.created_at).toLocaleDateString()
              : '-',
        })),
      });
    } else {
      ui.info('No templates found. Use "nimbus template save" to create one.');
    }
  } catch (error: any) {
    ui.stopSpinnerFail('Error fetching templates');
    ui.error(error.message);
  }
}

/**
 * Get a specific template by ID
 */
async function templateGetCommand(
  id: string,
  _options: TemplateCommandOptions = {}
): Promise<void> {
  ui.header(`Template: ${id}`);
  ui.startSpinner({ message: 'Fetching template...' });

  try {
    const db = getDb();
    const template = db
      .prepare('SELECT * FROM templates WHERE id LIKE ?')
      .get(id + '%') as Record<string, unknown> | undefined;

    if (template) {
      ui.stopSpinnerSuccess('Template retrieved');

      ui.print(`  ${ui.color('Name:', 'cyan')} ${template.name || '-'}`);
      ui.print(`  ${ui.color('Type:', 'cyan')} ${template.type || '-'}`);
      ui.print(`  ${ui.color('ID:', 'cyan')} ${template.id || '-'}`);
      ui.print(`  ${ui.color('Created:', 'cyan')} ${template.created_at || '-'}`);

      let variables: Record<string, unknown> = {};
      try {
        variables =
          typeof template.variables === 'string'
            ? JSON.parse(template.variables)
            : {};
      } catch { /* ignore */ }

      if (Object.keys(variables).length > 0) {
        ui.newLine();
        ui.print(`  ${ui.color('Variables:', 'cyan')}`);
        for (const [key, val] of Object.entries(variables)) {
          ui.print(`    ${key}: ${JSON.stringify(val)}`);
        }
      }

      if (template.content) {
        ui.newLine();
        ui.box({
          title: 'Content',
          content:
            typeof template.content === 'string'
              ? template.content
              : JSON.stringify(template.content, null, 2),
        });
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
    const db = getDb();
    const id = randomUUID();
    db.prepare(
      'INSERT INTO templates (id,name,type,content,variables,created_at,updated_at) VALUES (?,?,?,?,?,datetime("now"),datetime("now"))'
    ).run(id, options.name, options.type || 'terraform', content, '{}');

    ui.stopSpinnerSuccess(`Template "${options.name}" saved`);
    ui.info(`ID: ${id}`);
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
    const db = getDb();
    const result = db.prepare('DELETE FROM templates WHERE id=?').run(id);

    if ((result as any).changes > 0) {
      ui.stopSpinnerSuccess('Template deleted');
    } else {
      ui.stopSpinnerFail('Template not found');
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
      ui.info(
        'Available commands: list, get <id>, save --name <name> [--file <path>], delete <id>'
      );
  }
}
