/**
 * Interactive Prompt Utilities
 *
 * Provides functions for user input in the CLI wizard
 */

import * as readline from 'node:readline';
import type { SelectConfig, ConfirmConfig, InputConfig } from './types';
import { ui } from './ui';

/**
 * Create a readline interface for user input
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt for a single selection from options
 */
export async function select<T = string>(config: SelectConfig): Promise<T | undefined> {
  return new Promise(resolve => {
    const options = config.options.filter(o => !o.disabled);
    let selectedIndex = 0;

    // Find default selection
    if (config.defaultValue) {
      const defaultIdx = options.findIndex(o => o.value === config.defaultValue);
      if (defaultIdx >= 0) {
        selectedIndex = defaultIdx;
      }
    }

    // Display prompt
    ui.print(`  ${ui.icons.question} ${config.message}`);
    ui.newLine();

    // For now, use simple numbered selection (arrow key selection requires raw mode)
    for (let i = 0; i < config.options.length; i++) {
      const opt = config.options[i];
      const num = i + 1;
      let line = `    ${num}. ${opt.label}`;

      if (opt.disabled) {
        line = ui.dim(`${line} (${opt.disabledReason || 'unavailable'})`);
      }

      ui.print(line);

      if (opt.description) {
        ui.print(ui.dim(`       ${opt.description}`));
      }
    }

    ui.newLine();

    const rl = createReadline();
    const defaultNum = selectedIndex + 1;
    const prompt = config.required
      ? `  Enter choice (1-${config.options.length}): `
      : `  Enter choice (1-${config.options.length}) [${defaultNum}]: `;

    rl.question(prompt, answer => {
      rl.close();

      const trimmed = answer.trim();

      // Use default if empty
      if (!trimmed && !config.required) {
        resolve(config.options[selectedIndex].value as T);
        return;
      }

      // Parse number
      const num = parseInt(trimmed, 10);
      if (isNaN(num) || num < 1 || num > config.options.length) {
        ui.error(
          `Invalid selection. Please enter a number between 1 and ${config.options.length}.`
        );
        resolve(undefined);
        return;
      }

      const selected = config.options[num - 1];
      if (selected.disabled) {
        ui.error(`Option "${selected.label}" is not available.`);
        resolve(undefined);
        return;
      }

      ui.newLine();
      ui.print(`  ${ui.icons.success} Selected: ${selected.label}`);
      resolve(selected.value as T);
    });
  });
}

/**
 * Prompt for multiple selections from options
 */
export async function multiSelect<T = string>(config: SelectConfig): Promise<T[]> {
  return new Promise(resolve => {
    const options = config.options.filter(o => !o.disabled);

    ui.print(`  ${ui.icons.question} ${config.message}`);
    ui.print(ui.dim('  (Enter comma-separated numbers, or "all" for all options)'));
    ui.newLine();

    // Display options
    for (let i = 0; i < config.options.length; i++) {
      const opt = config.options[i];
      const num = i + 1;
      let line = `    ${num}. ${opt.label}`;

      if (opt.disabled) {
        line = ui.dim(`${line} (${opt.disabledReason || 'unavailable'})`);
      }

      ui.print(line);

      if (opt.description) {
        ui.print(ui.dim(`       ${opt.description}`));
      }
    }

    ui.newLine();

    const rl = createReadline();
    const prompt = `  Enter choices: `;

    rl.question(prompt, answer => {
      rl.close();

      const trimmed = answer.trim().toLowerCase();

      // Handle "all" selection
      if (trimmed === 'all') {
        const allValues = options.map(o => o.value as T);
        ui.newLine();
        ui.print(`  ${ui.icons.success} Selected: All options`);
        resolve(allValues);
        return;
      }

      // Parse comma-separated numbers
      const nums = trimmed.split(',').map(s => parseInt(s.trim(), 10));
      const selected: T[] = [];
      const selectedLabels: string[] = [];

      for (const num of nums) {
        if (isNaN(num) || num < 1 || num > config.options.length) {
          continue;
        }

        const opt = config.options[num - 1];
        if (!opt.disabled) {
          selected.push(opt.value as T);
          selectedLabels.push(opt.label);
        }
      }

      if (selected.length === 0 && config.required) {
        ui.error('Please select at least one option.');
        resolve([]);
        return;
      }

      if (config.maxSelections && selected.length > config.maxSelections) {
        ui.error(`Maximum ${config.maxSelections} selections allowed.`);
        resolve([]);
        return;
      }

      ui.newLine();
      ui.print(`  ${ui.icons.success} Selected: ${selectedLabels.join(', ')}`);
      resolve(selected);
    });
  });
}

/**
 * Prompt for confirmation (yes/no)
 */
export async function confirm(config: ConfirmConfig): Promise<boolean> {
  return new Promise(resolve => {
    const defaultHint =
      config.defaultValue !== undefined ? (config.defaultValue ? '[Y/n]' : '[y/N]') : '[y/n]';

    const rl = createReadline();
    const prompt = `  ${ui.icons.question} ${config.message} ${defaultHint} `;

    rl.question(prompt, answer => {
      rl.close();

      const trimmed = answer.trim().toLowerCase();

      // Handle empty input
      if (!trimmed) {
        if (config.defaultValue !== undefined) {
          resolve(config.defaultValue);
          return;
        }
        resolve(false);
        return;
      }

      // Parse answer
      if (trimmed === 'y' || trimmed === 'yes') {
        resolve(true);
      } else if (trimmed === 'n' || trimmed === 'no') {
        resolve(false);
      } else {
        ui.error('Please enter "y" or "n".');
        resolve(config.defaultValue ?? false);
      }
    });
  });
}

/**
 * Prompt for text input
 */
export async function input(config: InputConfig): Promise<string> {
  return new Promise(resolve => {
    const rl = createReadline();

    let prompt = `  ${ui.icons.question} ${config.message}`;
    if (config.defaultValue) {
      prompt += ui.dim(` [${config.defaultValue}]`);
    }
    prompt += ': ';

    rl.question(prompt, answer => {
      rl.close();

      let value = answer.trim();

      // Use default if empty
      if (!value && config.defaultValue) {
        value = config.defaultValue;
      }

      // Transform if specified
      if (config.transform && value) {
        value = config.transform(value);
      }

      // Validate if specified
      if (config.validate && value) {
        const result = config.validate(value);
        if (result !== true) {
          ui.error(result);
          resolve('');
          return;
        }
      }

      resolve(value);
    });
  });
}

/**
 * Prompt for a path input with validation
 */
export async function pathInput(message: string, defaultValue?: string): Promise<string> {
  return input({
    message,
    defaultValue,
    validate: value => {
      // Basic path validation
      if (!value) {
        return 'Path is required';
      }
      if (value.includes('\0')) {
        return 'Invalid path';
      }
      return true;
    },
  });
}

/**
 * Wait for user to press enter
 */
export async function pressEnter(message: string = 'Press Enter to continue...'): Promise<void> {
  return new Promise(resolve => {
    const rl = createReadline();
    rl.question(`  ${message}`, () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Display action options (e.g., for review)
 */
export async function actionSelect(
  message: string,
  actions: Array<{ key: string; label: string; description?: string }>
): Promise<string> {
  return new Promise(resolve => {
    ui.print(`  ${message}`);
    ui.newLine();

    for (const action of actions) {
      ui.print(`    [${action.key.toUpperCase()}] ${action.label}`);
      if (action.description) {
        ui.print(ui.dim(`        ${action.description}`));
      }
    }

    ui.newLine();

    const rl = createReadline();
    const validKeys = actions.map(a => a.key.toLowerCase());

    rl.question('  > ', answer => {
      rl.close();

      const key = answer.trim().toLowerCase();

      if (!validKeys.includes(key)) {
        ui.error(
          `Invalid option. Please enter one of: ${actions.map(a => a.key.toUpperCase()).join(', ')}`
        );
        resolve('');
        return;
      }

      resolve(key);
    });
  });
}
