/**
 * Theme system for Nimbus TUI.
 *
 * Provides named color themes (dark, light) that can be switched at runtime.
 * Components should import `activeTheme` and use its color properties instead
 * of hardcoding color strings.
 *
 * Theme preference is persisted to ~/.nimbus/config.yaml.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Theme {
  name: string;
  /** Primary accent color (headers, prompts). */
  primary: string;
  /** Secondary accent color (highlights). */
  secondary: string;
  /** Success / create indicator. */
  success: string;
  /** Warning indicator. */
  warning: string;
  /** Error / destroy indicator. */
  error: string;
  /** Dim text and separators. */
  muted: string;
  /** Border color. */
  border: string;
}

// ---------------------------------------------------------------------------
// Built-in themes
// ---------------------------------------------------------------------------

export const THEMES: Record<string, Theme> = {
  dark: {
    name: 'dark',
    primary: 'cyan',
    secondary: 'blue',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    muted: 'gray',
    border: 'gray',
  },
  light: {
    name: 'light',
    primary: 'blue',
    secondary: 'magenta',
    success: 'green',
    warning: 'yellow',
    error: 'red',
    muted: 'gray',
    border: 'white',
  },
};

// ---------------------------------------------------------------------------
// Active theme (mutable singleton)
// ---------------------------------------------------------------------------

export let activeTheme: Theme = THEMES.dark;

/**
 * Switch the active theme by name.
 * Falls back to `dark` if the name is not recognized.
 * Persists the chosen theme name to ~/.nimbus/config.yaml.
 */
export function setTheme(name: string): void {
  activeTheme = THEMES[name] ?? THEMES.dark;
  // Persist to config file
  try {
    const configDir = path.join(os.homedir(), '.nimbus');
    const configFile = path.join(configDir, 'config.yaml');
    fs.mkdirSync(configDir, { recursive: true });
    let config = '';
    try {
      config = fs.readFileSync(configFile, 'utf-8');
    } catch {
      /* new file */
    }
    if (config.includes('theme:')) {
      config = config.replace(/^theme:.*$/m, `theme: ${name}`);
    } else {
      config = config ? `${config.trim()}\ntheme: ${name}\n` : `theme: ${name}\n`;
    }
    fs.writeFileSync(configFile, config, 'utf-8');
  } catch {
    /* ignore FS errors */
  }
}

/**
 * List all available theme names.
 */
export function listThemes(): string[] {
  return Object.keys(THEMES);
}
