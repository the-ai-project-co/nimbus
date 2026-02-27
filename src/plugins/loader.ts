/**
 * Nimbus Plugin System — Loader
 *
 * Responsible for discovering plugin directories under `~/.nimbus/plugins/`,
 * reading each `nimbus-plugin.json` manifest, dynamically importing the
 * plugin's entry point, and validating that it exports a {@link NimbusPlugin}.
 *
 * Design principles:
 *   - A single bad plugin must never crash the host process.  All errors are
 *     caught, surfaced via the {@link PluginLoadError} array returned from
 *     {@link PluginLoader.loadAll}, and emitted as warnings to stderr.
 *   - No external dependencies are introduced.  Dynamic import (`import()`)
 *     is the only mechanism used to load plugin modules.
 *   - The loader is stateless between calls; the manager owns the active-plugin
 *     map.
 *
 * @module plugins/loader
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { NimbusPlugin, PluginManifest, LoadedPlugin, PluginLoadError } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Name of the manifest file that must exist in every plugin directory. */
const MANIFEST_FILENAME = 'nimbus-plugin.json';

/** Default plugins root directory: ~/.nimbus/plugins/ */
const DEFAULT_PLUGINS_DIR = path.join(homedir(), '.nimbus', 'plugins');

// ---------------------------------------------------------------------------
// Type Guards
// ---------------------------------------------------------------------------

/**
 * Runtime check: does `value` look like a valid {@link PluginManifest}?
 *
 * Only the required fields (`name`, `version`, `main`) are checked.
 */
function isPluginManifest(value: unknown): value is PluginManifest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['name'] === 'string' &&
    obj['name'].trim().length > 0 &&
    typeof obj['version'] === 'string' &&
    obj['version'].trim().length > 0 &&
    typeof obj['main'] === 'string' &&
    obj['main'].trim().length > 0
  );
}

/**
 * Runtime check: does `value` look like a valid {@link NimbusPlugin}?
 *
 * Only the required fields (`name`, `version`) are checked.  Optional
 * arrays and lifecycle hooks are not validated here; if a plugin provides
 * malformed tools the manager will surface errors when registering them.
 */
function isNimbusPlugin(value: unknown): value is NimbusPlugin {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj['name'] === 'string' &&
    obj['name'].trim().length > 0 &&
    typeof obj['version'] === 'string' &&
    obj['version'].trim().length > 0
  );
}

// ---------------------------------------------------------------------------
// Loader Class
// ---------------------------------------------------------------------------

/**
 * Discovers, loads, and unloads Nimbus plugins from the filesystem.
 *
 * Intended for use by {@link import('./manager').PluginManager}; most
 * application code should interact with the manager rather than the loader
 * directly.
 */
export class PluginLoader {
  /** Root directory scanned by {@link discover}. */
  private readonly pluginsDir: string;

  /** Plugins that have been successfully loaded in this loader instance. */
  private loadedPlugins: LoadedPlugin[] = [];

  /**
   * @param pluginsDir - Override the default `~/.nimbus/plugins/` scan root.
   *   Primarily useful in tests.
   */
  constructor(pluginsDir: string = DEFAULT_PLUGINS_DIR) {
    this.pluginsDir = pluginsDir;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Scan {@link pluginsDir} for subdirectories that contain a
   * `nimbus-plugin.json` manifest.
   *
   * Entries that are not directories, or whose manifest file is missing, are
   * silently skipped.
   *
   * @returns Absolute paths of discovered plugin directories.
   */
  discover(): string[] {
    if (!fs.existsSync(this.pluginsDir)) {
      return [];
    }

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[nimbus:plugins] Warning: could not read plugins directory '${this.pluginsDir}': ${msg}\n`
      );
      return [];
    }

    const discovered: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const pluginDir = path.join(this.pluginsDir, entry.name);
      const manifestPath = path.join(pluginDir, MANIFEST_FILENAME);

      if (fs.existsSync(manifestPath)) {
        discovered.push(pluginDir);
      }
    }

    return discovered;
  }

  /**
   * Load a single plugin from the given directory.
   *
   * Steps:
   *  1. Read and parse `nimbus-plugin.json`.
   *  2. Resolve the `main` path relative to `pluginDir`.
   *  3. Dynamically import the entry point.
   *  4. Extract the default export and validate it as a {@link NimbusPlugin}.
   *  5. Await {@link NimbusPlugin.onLoad} if defined.
   *
   * @param pluginDir - Absolute path to the plugin directory.
   * @returns The loaded plugin record on success.
   * @throws {Error} Descriptive error if any step fails.
   */
  async load(pluginDir: string): Promise<LoadedPlugin> {
    // --- Step 1: Read manifest -----------------------------------------------
    const manifestPath = path.join(pluginDir, MANIFEST_FILENAME);

    let manifestRaw: string;
    try {
      manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Cannot read manifest at '${manifestPath}': ${msg}`);
    }

    let manifestData: unknown;
    try {
      manifestData = JSON.parse(manifestRaw);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Invalid JSON in manifest '${manifestPath}': ${msg}`);
    }

    if (!isPluginManifest(manifestData)) {
      throw new Error(
        `Manifest '${manifestPath}' is missing required fields ` +
          `('name', 'version', and 'main' must be non-empty strings).`
      );
    }

    const manifest = manifestData as PluginManifest;

    // --- Step 2: Resolve entry-point path ------------------------------------
    const mainPath = path.resolve(pluginDir, manifest.main);

    if (!fs.existsSync(mainPath)) {
      throw new Error(
        `Plugin '${manifest.name}': entry point '${mainPath}' does not exist ` +
          `(resolved from manifest 'main': '${manifest.main}').`
      );
    }

    // --- Step 3: Dynamic import ----------------------------------------------
    let moduleExports: unknown;
    try {
      // Use a dynamic string to prevent bundlers from statically analyzing this
      // import and attempting to inline plugin code at build time.
      const importPath = mainPath;
      moduleExports = await import(importPath);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Plugin '${manifest.name}': failed to import '${mainPath}': ${msg}`);
    }

    // --- Step 4: Extract and validate the default export ---------------------
    const rawPlugin =
      moduleExports !== null &&
      typeof moduleExports === 'object' &&
      'default' in (moduleExports as Record<string, unknown>)
        ? (moduleExports as Record<string, unknown>)['default']
        : moduleExports;

    if (!isNimbusPlugin(rawPlugin)) {
      throw new Error(
        `Plugin '${manifest.name}': entry point '${mainPath}' must default-export ` +
          `an object with at least 'name' (string) and 'version' (string) fields. ` +
          `Received: ${JSON.stringify(rawPlugin)}`
      );
    }

    const plugin = rawPlugin as NimbusPlugin;

    // Sanity check: manifest name should match the exported plugin name.
    // This is a warning only — mismatches are common during development.
    if (plugin.name !== manifest.name) {
      process.stderr.write(
        `[nimbus:plugins] Warning: manifest 'name' ('${manifest.name}') does not ` +
          `match plugin export 'name' ('${plugin.name}') in '${pluginDir}'. ` +
          `Using the exported name.\n`
      );
    }

    // --- Step 5: Call onLoad lifecycle hook ----------------------------------
    if (typeof plugin.onLoad === 'function') {
      try {
        await plugin.onLoad();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Plugin '${plugin.name}' onLoad() rejected: ${msg}`);
      }
    }

    const record: LoadedPlugin = { plugin, pluginDir };
    this.loadedPlugins.push(record);
    return record;
  }

  /**
   * Discover and load all plugins found in {@link pluginsDir}.
   *
   * Plugin load failures are collected rather than thrown, so that one bad
   * plugin does not prevent healthy plugins from loading.
   *
   * @returns An object containing:
   *   - `loaded`: successfully loaded plugin records.
   *   - `errors`: descriptions of plugins that failed to load.
   */
  async loadAll(): Promise<{ loaded: LoadedPlugin[]; errors: PluginLoadError[] }> {
    const discovered = this.discover();
    const loaded: LoadedPlugin[] = [];
    const errors: PluginLoadError[] = [];

    for (const pluginDir of discovered) {
      try {
        const record = await this.load(pluginDir);
        loaded.push(record);
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[nimbus:plugins] Warning: failed to load plugin from '${pluginDir}': ${reason}\n`
        );
        errors.push({ pluginDir, reason });
      }
    }

    return { loaded, errors };
  }

  /**
   * Call {@link NimbusPlugin.onUnload} on every plugin that was loaded by
   * this loader instance.
   *
   * Errors from individual `onUnload` callbacks are logged to stderr but
   * do not abort the unload sequence.
   */
  async unloadAll(): Promise<void> {
    for (const { plugin } of this.loadedPlugins) {
      if (typeof plugin.onUnload === 'function') {
        try {
          await plugin.onUnload();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[nimbus:plugins] Warning: plugin '${plugin.name}' onUnload() threw: ${msg}\n`
          );
        }
      }
    }

    this.loadedPlugins = [];
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  /**
   * Returns all plugins successfully loaded by this loader instance.
   * The array is a snapshot — mutations do not affect the loader's internal
   * state.
   */
  getLoaded(): LoadedPlugin[] {
    return [...this.loadedPlugins];
  }

  /**
   * The root directory this loader scans for plugins.
   */
  get directory(): string {
    return this.pluginsDir;
  }
}
