/**
 * Configuration Module
 *
 * Exports configuration management utilities
 */

export { ConfigManager, configManager, CONFIG_KEYS } from './manager';
export type {
  NimbusConfig,
  WorkspaceConfig,
  LLMConfig,
  HistoryConfig,
  SafetyConfig,
  UIConfig,
  ConfigKey,
  ConfigKeyInfo,
} from './types';
