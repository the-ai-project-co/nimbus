/**
 * Nimbus Plugin System — Public API
 *
 * Re-exports the primary class and types needed by the rest of the
 * application and by external consumers that want to integrate with the
 * plugin system without importing internal submodules directly.
 *
 * @module plugins
 */

// Manager (class + singleton)
export { PluginManager, pluginManager } from './manager';
export type { PluginInfo, PluginInitResult } from './manager';

// Loader (class — exposed for testing and advanced use)
export { PluginLoader } from './loader';

// Public types
export type {
  NimbusPlugin,
  PluginToolDefinition,
  PluginProviderDefinition,
  PluginManifest,
  PluginPermissionTier,
  LoadedPlugin,
  PluginLoadError,
} from './types';
