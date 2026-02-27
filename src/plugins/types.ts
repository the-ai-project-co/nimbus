/**
 * Nimbus Plugin System — Type Definitions
 *
 * These interfaces define the contract that every Nimbus plugin must satisfy.
 * A plugin is a directory installed under ~/.nimbus/plugins/ that contains a
 * `nimbus-plugin.json` manifest and a JavaScript/TypeScript entry point.
 *
 * Plugins may contribute:
 *   - Custom tools that are injected into the agent's ToolRegistry at startup.
 *   - Custom LLM provider factories that are registered with the LLM router.
 *
 * Lifecycle:
 *   1. {@link PluginLoader.discover} scans ~/.nimbus/plugins/ for manifests.
 *   2. {@link PluginLoader.load} imports the `main` entry point and validates
 *      that it default-exports a {@link NimbusPlugin}.
 *   3. If defined, {@link NimbusPlugin.onLoad} is awaited before the plugin is
 *      considered active.
 *   4. On process exit, {@link PluginManager.shutdown} calls
 *      {@link NimbusPlugin.onUnload} for every active plugin.
 *
 * @module plugins/types
 */

// ---------------------------------------------------------------------------
// Plugin Tool Definition
// ---------------------------------------------------------------------------

/**
 * The subset of permission tiers that plugins may request.
 *
 * The `blocked` tier is intentionally excluded — plugins cannot declare
 * a tool as permanently blocked; that is a host-level policy decision.
 */
export type PluginPermissionTier = 'auto_allow' | 'ask_once' | 'always_ask';

/**
 * Describes a single tool contributed by a plugin.
 *
 * The shape intentionally mirrors {@link import('../tools/schemas/types').ToolDefinition}
 * but keeps the `inputSchema` as a plain `Record<string, unknown>` JSON Schema
 * object rather than a Zod schema, so that plugins written in plain JavaScript
 * do not need a Zod dependency. The manager converts this to a full
 * {@link import('../tools/schemas/types').ToolDefinition} when registering.
 */
export interface PluginToolDefinition {
  /**
   * Unique snake_case identifier for this tool (e.g. `'my_plugin_fetch'`).
   * Must not collide with any built-in tool name.
   */
  name: string;

  /**
   * Natural-language description surfaced to the LLM so it knows when
   * and how to invoke this tool.
   */
  description: string;

  /**
   * JSON Schema object that describes the tool's expected input.
   * Must have `type: 'object'` at the top level.
   *
   * @example
   * ```json
   * {
   *   "type": "object",
   *   "properties": { "url": { "type": "string" } },
   *   "required": ["url"]
   * }
   * ```
   */
  inputSchema: Record<string, unknown>;

  /**
   * Which permission tier this tool belongs to. Determines whether the
   * user is prompted before execution.
   */
  permissionTier: PluginPermissionTier;

  /**
   * Execute the tool with the caller-supplied (already JSON-parsed) input.
   *
   * Implementations should catch their own errors and surface them via the
   * return value rather than throwing, so that the agentic loop can report
   * failures back to the LLM gracefully.
   *
   * @param input - The raw (unvalidated) input object forwarded by the engine.
   * @returns A promise that resolves to a result object.
   */
  execute: (input: unknown) => Promise<{ success: boolean; output: string }>;
}

// ---------------------------------------------------------------------------
// Plugin Provider Definition
// ---------------------------------------------------------------------------

/**
 * Describes a custom LLM provider contributed by a plugin.
 *
 * The `factory` function is called lazily the first time the provider is
 * selected by the router. It must return an object that satisfies the
 * {@link import('../llm/types').LLMProvider} interface, though the type is
 * declared as `unknown` here to keep plugins free of an explicit dependency
 * on the internal LLM types module.
 */
export interface PluginProviderDefinition {
  /**
   * Internal identifier used to route requests (e.g. `'my-custom-llm'`).
   * Must be unique across all loaded plugins and built-in providers.
   */
  name: string;

  /**
   * Human-readable label shown in CLI output and settings UIs
   * (e.g. `'My Custom LLM Provider'`).
   */
  displayName: string;

  /**
   * Async factory that constructs and returns a configured
   * {@link import('../llm/types').LLMProvider} instance.
   *
   * The factory is responsible for reading any required configuration
   * (API keys, base URLs, etc.) from environment variables or the
   * filesystem.
   *
   * @returns A promise resolving to an LLMProvider-compatible object.
   */
  factory: () => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Plugin Interface
// ---------------------------------------------------------------------------

/**
 * The primary contract that a Nimbus plugin must satisfy.
 *
 * Every plugin's `main` entry point must default-export an object that
 * implements this interface (or a class instance thereof).
 *
 * @example
 * ```ts
 * // ~/.nimbus/plugins/my-plugin/index.ts
 * import type { NimbusPlugin } from 'nimbus/plugins';
 *
 * const plugin: NimbusPlugin = {
 *   name: 'my-plugin',
 *   version: '1.0.0',
 *   description: 'Adds a custom HTTP fetch tool.',
 *   tools: [myFetchTool],
 *   async onLoad() {
 *     console.error('[my-plugin] loaded');
 *   },
 * };
 *
 * export default plugin;
 * ```
 */
export interface NimbusPlugin {
  /**
   * Unique plugin identifier. Should match the directory name and the
   * `name` field in `nimbus-plugin.json`.
   */
  name: string;

  /**
   * SemVer version string (e.g. `'1.2.3'`). Used for display and
   * compatibility checks.
   */
  version: string;

  /** Optional human-readable summary of what the plugin does. */
  description?: string;

  /**
   * Custom tools to register into the application-wide tool registry.
   * Registered after {@link onLoad} resolves successfully.
   */
  tools?: PluginToolDefinition[];

  /**
   * Custom LLM provider factories to register with the LLM router.
   * Registered after {@link onLoad} resolves successfully.
   */
  providers?: PluginProviderDefinition[];

  /**
   * Lifecycle hook called immediately after the plugin module is imported
   * and before its tools/providers are registered. Use this for one-time
   * initialisation (connecting to external services, reading config, etc.).
   *
   * If this function throws or rejects, the plugin is considered failed and
   * will not be registered.
   */
  onLoad?: () => Promise<void>;

  /**
   * Lifecycle hook called when Nimbus is shutting down.  Use this to
   * release resources (close connections, flush buffers, etc.).
   *
   * Errors thrown here are logged but do not interrupt the shutdown
   * sequence.
   */
  onUnload?: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Plugin Manifest
// ---------------------------------------------------------------------------

/**
 * Shape of the `nimbus-plugin.json` manifest file that every plugin
 * directory must contain.
 *
 * The loader reads this file first to obtain the `main` entry-point path
 * before dynamically importing the module.
 *
 * @example
 * ```json
 * {
 *   "name": "my-plugin",
 *   "version": "1.0.0",
 *   "description": "My custom Nimbus plugin.",
 *   "main": "dist/index.js"
 * }
 * ```
 */
export interface PluginManifest {
  /**
   * Plugin name. Should be a lowercase, hyphen-separated identifier and
   * must match the `name` field on the exported {@link NimbusPlugin}.
   */
  name: string;

  /** SemVer version string (e.g. `'1.0.0'`). */
  version: string;

  /** Optional human-readable description. */
  description?: string;

  /**
   * Relative path (from the plugin directory) to the JavaScript or
   * TypeScript entry point that default-exports a {@link NimbusPlugin}.
   *
   * @example `"dist/index.js"` or `"index.ts"`
   */
  main: string;
}

// ---------------------------------------------------------------------------
// Runtime Plugin Record
// ---------------------------------------------------------------------------

/**
 * Internal record that pairs a loaded plugin with the filesystem path it
 * was loaded from. Used by {@link import('./manager').PluginManager} to
 * track active plugins and surface diagnostic information.
 */
export interface LoadedPlugin {
  /** The instantiated plugin object. */
  plugin: NimbusPlugin;

  /** Absolute path to the plugin directory on disk. */
  pluginDir: string;
}

// ---------------------------------------------------------------------------
// Plugin Load Error
// ---------------------------------------------------------------------------

/**
 * Describes a plugin that failed to load, returned in the errors array
 * from {@link import('./loader').PluginLoader.loadAll}.
 */
export interface PluginLoadError {
  /** Absolute path of the plugin directory that failed. */
  pluginDir: string;

  /**
   * Human-readable reason for the failure (manifest parse error,
   * missing main file, missing `name` field, `onLoad` rejection, etc.).
   */
  reason: string;
}
