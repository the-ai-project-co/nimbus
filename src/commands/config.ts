/**
 * Config Command
 *
 * Manage Nimbus configuration
 */

import { ui } from '../wizard/ui';
import { select, input, confirm } from '../wizard/prompts';
import { ConfigManager, CONFIG_KEYS } from '../config';
import type { ConfigKey } from '../config';

export interface ConfigOptions {
  /** Non-interactive mode */
  nonInteractive?: boolean;
}

export interface ConfigSetOptions extends ConfigOptions {
  /** Key to set */
  key?: string;
  /** Value to set */
  value?: string;
}

export interface ConfigGetOptions extends ConfigOptions {
  /** Key to get */
  key?: string;
}

export interface ConfigListOptions extends ConfigOptions {
  /** Output as JSON */
  json?: boolean;
  /** Show only keys with non-default values */
  changed?: boolean;
}

export interface ConfigInitOptions extends ConfigOptions {
  /** Force overwrite existing config */
  force?: boolean;
}

/**
 * Config set command
 */
export async function configSetCommand(options: ConfigSetOptions): Promise<void> {
  const configManager = new ConfigManager();

  let key = options.key;
  let value = options.value;

  // Interactive mode - select key if not provided
  if (!key && !options.nonInteractive) {
    const keyOptions = CONFIG_KEYS.map(k => ({
      label: k.key,
      value: k.key,
      description: k.description,
    }));

    key = await select({
      message: 'Select configuration key to set:',
      options: keyOptions,
    }) as string;
  }

  if (!key) {
    ui.error('Configuration key is required.');
    process.exit(1);
  }

  // Validate key
  const keyInfo = configManager.getKeyInfo(key);
  if (!keyInfo) {
    ui.warning(`Unknown configuration key: ${key}`);
    ui.info('Use "nimbus config list" to see available keys.');

    if (!options.nonInteractive) {
      const proceed = await confirm({
        message: 'Set this key anyway?',
        defaultValue: false,
      });

      if (!proceed) {
        return;
      }
    }
  }

  // Get value if not provided
  if (value === undefined && !options.nonInteractive) {
    const currentValue = configManager.get(key);
    const defaultValue = keyInfo?.defaultValue;

    let placeholder = '';
    if (currentValue !== undefined) {
      placeholder = String(currentValue);
    } else if (defaultValue !== undefined) {
      placeholder = `default: ${defaultValue}`;
    }

    if (keyInfo?.type === 'boolean') {
      const boolValue = await confirm({
        message: `Set ${key}:`,
        defaultValue: currentValue ?? defaultValue ?? false,
      });
      value = String(boolValue);
    } else {
      value = await input({
        message: `Enter value for ${key}:`,
        defaultValue: currentValue !== undefined ? String(currentValue) : undefined,
        placeholder,
      });
    }
  }

  if (value === undefined) {
    ui.error('Configuration value is required.');
    process.exit(1);
  }

  // Parse and set value
  const parsedValue = configManager.parseValue(key, value);
  configManager.set(key, parsedValue);

  ui.success(`Configuration updated: ${key} = ${parsedValue}`);
}

/**
 * Config get command
 */
export async function configGetCommand(options: ConfigGetOptions): Promise<void> {
  const configManager = new ConfigManager();

  let key = options.key;

  // Interactive mode - select key if not provided
  if (!key && !options.nonInteractive) {
    const keyOptions = CONFIG_KEYS.map(k => ({
      label: k.key,
      value: k.key,
      description: k.description,
    }));

    key = await select({
      message: 'Select configuration key to view:',
      options: keyOptions,
    }) as string;
  }

  if (!key) {
    ui.error('Configuration key is required.');
    process.exit(1);
  }

  const value = configManager.get(key);

  if (value === undefined) {
    const keyInfo = configManager.getKeyInfo(key);
    if (keyInfo?.defaultValue !== undefined) {
      ui.print(`${ui.color(key, 'cyan')}: ${keyInfo.defaultValue} ${ui.dim('(default)')}`);
    } else {
      ui.print(`${ui.color(key, 'cyan')}: ${ui.dim('(not set)')}`);
    }
  } else {
    ui.print(`${ui.color(key, 'cyan')}: ${value}`);
  }
}

/**
 * Config list command
 */
export async function configListCommand(options: ConfigListOptions): Promise<void> {
  const configManager = new ConfigManager();
  const allConfig = configManager.getAllFlat();

  if (options.json) {
    console.log(JSON.stringify(allConfig, null, 2));
    return;
  }

  ui.newLine();
  ui.header('Nimbus Configuration', configManager.getConfigPath());

  // Group by section
  const sections: Record<string, Array<{ key: string; value: any; info?: typeof CONFIG_KEYS[number] }>> = {};

  for (const keyInfo of CONFIG_KEYS) {
    const [section] = keyInfo.key.split('.');
    if (!sections[section]) {
      sections[section] = [];
    }

    const value = allConfig[keyInfo.key];
    const isDefault = value === undefined || value === keyInfo.defaultValue;

    if (options.changed && isDefault) {
      continue;
    }

    sections[section].push({
      key: keyInfo.key,
      value: value !== undefined ? value : keyInfo.defaultValue,
      info: keyInfo,
    });
  }

  for (const [section, items] of Object.entries(sections)) {
    if (items.length === 0) continue;

    ui.section(section.charAt(0).toUpperCase() + section.slice(1));

    for (const item of items) {
      const isDefault = item.value === item.info?.defaultValue;
      const valueStr = item.value !== undefined ? String(item.value) : ui.dim('(not set)');
      const defaultMarker = isDefault ? ui.dim(' (default)') : '';

      ui.print(`  ${ui.color(item.key, 'cyan')}: ${valueStr}${defaultMarker}`);

      if (item.info?.description) {
        ui.print(`    ${ui.dim(item.info.description)}`);
      }
    }

    ui.newLine();
  }
}

/**
 * Config init command
 */
export async function configInitCommand(options: ConfigInitOptions): Promise<void> {
  const configManager = new ConfigManager();

  if (configManager.exists() && !options.force) {
    ui.warning('Configuration file already exists at: ' + configManager.getConfigPath());

    if (!options.nonInteractive) {
      const overwrite = await confirm({
        message: 'Overwrite existing configuration?',
        defaultValue: false,
      });

      if (!overwrite) {
        ui.info('Configuration unchanged.');
        return;
      }
    } else {
      ui.info('Use --force to overwrite.');
      return;
    }
  }

  // Interactive configuration setup
  if (!options.nonInteractive) {
    ui.newLine();
    ui.header('Nimbus Configuration Setup', 'Let\'s configure your Nimbus CLI');

    // Workspace settings
    ui.section('Workspace');

    const defaultProvider = await select({
      message: 'Default cloud provider:',
      options: [
        { label: 'AWS', value: 'aws', description: 'Amazon Web Services' },
        { label: 'GCP', value: 'gcp', description: 'Google Cloud Platform' },
        { label: 'Azure', value: 'azure', description: 'Microsoft Azure' },
      ],
    });

    const outputDir = await input({
      message: 'Default output directory for generated code:',
      defaultValue: './infrastructure',
    });

    // LLM settings
    ui.section('LLM');

    const temperature = await input({
      message: 'LLM temperature (0-1):',
      defaultValue: '0.7',
      validate: (val) => {
        const num = Number(val);
        if (isNaN(num) || num < 0 || num > 1) {
          return 'Temperature must be a number between 0 and 1';
        }
        return true;
      },
    });

    // Safety settings
    ui.section('Safety');

    const requireConfirmation = await confirm({
      message: 'Require confirmation for destructive operations?',
      defaultValue: true,
    });

    // Save configuration
    configManager.set('workspace.defaultProvider', defaultProvider);
    configManager.set('workspace.outputDirectory', outputDir);
    configManager.set('llm.temperature', Number(temperature));
    configManager.set('safety.requireConfirmation', requireConfirmation);

    ui.newLine();
    ui.success('Configuration saved to: ' + configManager.getConfigPath());
  } else {
    // Non-interactive - just create default config
    configManager.reset();
    ui.success('Default configuration created at: ' + configManager.getConfigPath());
  }
}

/**
 * Config reset command
 */
export async function configResetCommand(options: ConfigOptions): Promise<void> {
  const configManager = new ConfigManager();

  if (!options.nonInteractive) {
    const confirm_reset = await confirm({
      message: 'Reset all configuration to defaults?',
      defaultValue: false,
    });

    if (!confirm_reset) {
      ui.info('Configuration unchanged.');
      return;
    }
  }

  configManager.reset();
  ui.success('Configuration reset to defaults.');
}

/**
 * Main config command dispatcher
 */
export const configCommand = {
  set: configSetCommand,
  get: configGetCommand,
  list: configListCommand,
  init: configInitCommand,
  reset: configResetCommand,
};
