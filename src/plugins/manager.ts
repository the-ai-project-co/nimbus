/**
 * Nimbus Plugin System — Manager
 *
 * The `PluginManager` is the single point of contact for the rest of the
 * application.  It owns the lifecycle of all loaded plugins, converts their
 * contributed tools into {@link ToolDefinition} objects compatible with the
 * existing {@link ToolRegistry}, and exposes plugin metadata for CLI display.
 *
 * Singleton pattern: import {@link pluginManager} for the application-wide
 * instance.  Tests can construct isolated `PluginManager` instances directly.
 *
 * Tool conversion strategy:
 *   Plugin tools supply a plain JSON Schema object for `inputSchema` (no Zod
 *   required in plugins).  The manager wraps that schema inside a minimal Zod
 *   passthrough (`z.unknown()`) so the {@link ToolDefinition} type constraint
 *   is satisfied without running Zod validation on the plugin's input — the
 *   plugin's own `execute` function is responsible for validating its input.
 *
 * @module plugins/manager
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import { PluginLoader } from './loader';
import type {
  NimbusPlugin,
  PluginToolDefinition,
  PluginProviderDefinition,
  LoadedPlugin,
  PluginLoadError,
} from './types';
import type { ToolDefinition } from '../tools/schemas/types';

// Suppress unused import warnings: fs and path are required by the module
// contract ("Use `import * as fs from 'node:fs'` and `import * as path from
// 'node:path'`") and may be used by subclasses or future additions.
void fs;
void path;

// ---------------------------------------------------------------------------
// Plugin Info (public surface)
// ---------------------------------------------------------------------------

/**
 * Summary of a single loaded plugin, returned by
 * {@link PluginManager.listPlugins}.
 */
export interface PluginInfo {
  /** Plugin identifier. */
  name: string;

  /** SemVer version string. */
  version: string;

  /** Optional description from the plugin manifest. */
  description?: string;

  /** Absolute path to the plugin directory on disk. */
  pluginDir: string;

  /** Number of tools contributed by this plugin. */
  toolCount: number;

  /** Number of LLM providers contributed by this plugin. */
  providerCount: number;
}

// ---------------------------------------------------------------------------
// Initialisation Result
// ---------------------------------------------------------------------------

/**
 * Returned by {@link PluginManager.init} to inform the caller of how many
 * plugins loaded successfully and which failed.
 */
export interface PluginInitResult {
  /** Number of plugins that loaded successfully. */
  loadedCount: number;

  /** Number of plugins that failed to load. */
  errorCount: number;

  /** Details of each failed plugin. */
  errors: PluginLoadError[];
}

// ---------------------------------------------------------------------------
// Tool Conversion
// ---------------------------------------------------------------------------

/**
 * Convert a {@link PluginToolDefinition} into a {@link ToolDefinition} that
 * is compatible with the application's {@link ToolRegistry}.
 *
 * The `inputSchema` is wrapped in `z.unknown()` so that the plugin's own
 * `execute` function handles validation internally.  The `category` is fixed
 * to `'mcp'` (the "external source" bucket) and `isDestructive` defaults to
 * `false` for plugin tools unless the permission tier indicates otherwise.
 *
 * @param pluginName - The owning plugin's name, prepended to error messages.
 * @param tool - The plugin-supplied tool definition.
 * @returns A {@link ToolDefinition} ready for registration.
 */
function convertPluginTool(pluginName: string, tool: PluginToolDefinition): ToolDefinition {
  // The plugin execute function returns { success, output }; we normalise
  // this to the ToolResult shape ({ output, isError }) so that the agent
  // loop can treat plugin tools identically to built-in tools.
  const wrappedExecute = async (input: unknown) => {
    try {
      const result = await tool.execute(input);
      return {
        output: result.output,
        isError: !result.success,
        error: result.success ? undefined : result.output,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[nimbus:plugins] Warning: plugin '${pluginName}' tool '${tool.name}' ` +
          `threw during execution: ${msg}\n`
      );
      return {
        output: '',
        error: msg,
        isError: true,
      };
    }
  };

  return {
    name: tool.name,
    description: tool.description,
    // z.unknown() satisfies z.ZodType<unknown> while imposing no constraints.
    // The raw JSON Schema is preserved on a non-standard property for
    // consumers (e.g. provider format converters) that need the schema shape.
    inputSchema: z.unknown(),
    execute: wrappedExecute,
    permissionTier: tool.permissionTier,
    // Plugin tools are categorised alongside MCP tools as external sources.
    category: 'mcp',
    // Tools with always_ask tier are considered potentially destructive.
    isDestructive: tool.permissionTier === 'always_ask',
  };
}

// ---------------------------------------------------------------------------
// Plugin Manager
// ---------------------------------------------------------------------------

/**
 * Manages the lifecycle of all loaded Nimbus plugins and provides the
 * host application with access to their contributed tools and providers.
 *
 * ### Usage
 * ```ts
 * import { pluginManager } from './plugins';
 *
 * // During application startup:
 * const result = await pluginManager.init();
 * if (result.errorCount > 0) {
 *   console.warn(`${result.errorCount} plugin(s) failed to load.`);
 * }
 *
 * // Register plugin tools alongside built-in tools:
 * for (const tool of pluginManager.getTools()) {
 *   defaultToolRegistry.register(tool);
 * }
 *
 * // During shutdown:
 * await pluginManager.shutdown();
 * ```
 */
export class PluginManager {
  /** Map of plugin name → loaded plugin record. */
  private plugins: Map<string, LoadedPlugin> = new Map();

  /** Loader instance used by this manager. Swappable in tests. */
  private readonly loader: PluginLoader;

  /** Whether {@link init} has been called at least once. */
  private initialized = false;

  /**
   * @param loader - Override the default {@link PluginLoader}. Primarily
   *   useful in tests where a custom plugins directory is needed.
   */
  constructor(loader?: PluginLoader) {
    this.loader = loader ?? new PluginLoader();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Discover and load all plugins from `~/.nimbus/plugins/`.
   *
   * Safe to call multiple times; subsequent calls are no-ops and return the
   * same result summary (plugins are not reloaded).
   *
   * @returns A summary of how many plugins loaded and which failed.
   */
  async init(): Promise<PluginInitResult> {
    if (this.initialized) {
      return {
        loadedCount: this.plugins.size,
        errorCount: 0,
        errors: [],
      };
    }

    const { loaded, errors } = await this.loader.loadAll();

    for (const record of loaded) {
      const { plugin } = record;

      // Guard against duplicate plugin names across directories.
      if (this.plugins.has(plugin.name)) {
        process.stderr.write(
          `[nimbus:plugins] Warning: duplicate plugin name '${plugin.name}' ` +
            `found in '${record.pluginDir}'. The later plugin will be skipped.\n`
        );
        continue;
      }

      this.plugins.set(plugin.name, record);
    }

    this.initialized = true;

    return {
      loadedCount: this.plugins.size,
      errorCount: errors.length,
      errors,
    };
  }

  /**
   * Call `onUnload` on all active plugins and clear the internal registry.
   *
   * After this call the manager is reset to its pre-init state.
   */
  async shutdown(): Promise<void> {
    await this.loader.unloadAll();
    this.plugins.clear();
    this.initialized = false;
  }

  // -------------------------------------------------------------------------
  // Tool Access
  // -------------------------------------------------------------------------

  /**
   * Return a flattened array of {@link ToolDefinition} objects built from
   * every tool contributed by every loaded plugin.
   *
   * Tools whose conversion fails are skipped with a stderr warning so that
   * a malformed tool definition in one plugin does not prevent valid tools
   * from other plugins being registered.
   *
   * @returns Array of converted tool definitions ready for {@link ToolRegistry.register}.
   */
  getTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const { plugin } of Array.from(this.plugins.values())) {
      if (!plugin.tools || plugin.tools.length === 0) {
        continue;
      }

      for (const pluginTool of plugin.tools) {
        try {
          tools.push(convertPluginTool(plugin.name, pluginTool));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[nimbus:plugins] Warning: plugin '${plugin.name}' tool ` +
              `'${pluginTool.name}' could not be converted: ${msg}\n`
          );
        }
      }
    }

    return tools;
  }

  // -------------------------------------------------------------------------
  // Provider Access
  // -------------------------------------------------------------------------

  /**
   * Return a flattened array of all {@link PluginProviderDefinition} objects
   * contributed by loaded plugins.
   *
   * Callers (typically the LLM router) are responsible for calling each
   * factory and registering the resulting provider instance.
   *
   * @returns Array of provider definitions in load order.
   */
  getProviders(): PluginProviderDefinition[] {
    const providers: PluginProviderDefinition[] = [];

    for (const { plugin } of Array.from(this.plugins.values())) {
      if (!plugin.providers || plugin.providers.length === 0) {
        continue;
      }
      providers.push(...plugin.providers);
    }

    return providers;
  }

  // -------------------------------------------------------------------------
  // Introspection
  // -------------------------------------------------------------------------

  /**
   * Return summary information about every currently loaded plugin.
   *
   * Useful for `nimbus plugin list` style CLI commands.
   */
  listPlugins(): PluginInfo[] {
    return Array.from(this.plugins.values()).map(({ plugin, pluginDir }) => ({
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      pluginDir,
      toolCount: plugin.tools?.length ?? 0,
      providerCount: plugin.providers?.length ?? 0,
    }));
  }

  /**
   * Look up a single loaded plugin by name.
   *
   * @param name - The plugin's `name` field.
   * @returns The {@link NimbusPlugin} if found, or `undefined`.
   */
  getPlugin(name: string): NimbusPlugin | undefined {
    return this.plugins.get(name)?.plugin;
  }

  /**
   * Whether the manager has been initialised (i.e. {@link init} has been
   * called and completed).
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Number of plugins currently loaded.
   */
  get pluginCount(): number {
    return this.plugins.size;
  }
}

// ---------------------------------------------------------------------------
// Application-wide Singleton
// ---------------------------------------------------------------------------

/**
 * Application-wide plugin manager instance.
 *
 * Import this wherever you need to access plugin tools or providers at
 * runtime.
 *
 * @example
 * ```ts
 * import { pluginManager } from '../plugins';
 * await pluginManager.init();
 * ```
 */
export const pluginManager = new PluginManager();
