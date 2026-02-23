/**
 * LLM Config Loader
 *
 * Reads ~/.nimbus/config.yaml and maps LLM-related settings
 * to RouterConfig for the LLM Router.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils';
import type { RouterConfig } from './router';

/**
 * Load LLM configuration from ~/.nimbus/config.yaml
 * Returns a Partial<RouterConfig> that can be passed to LLMRouter constructor
 */
export function loadLLMConfig(): Partial<RouterConfig> {
  const configPath = process.env.NIMBUS_CONFIG_PATH || path.join(os.homedir(), '.nimbus', 'config.yaml');

  if (!fs.existsSync(configPath)) {
    logger.info('No config file found at ' + configPath + ', using defaults');
    return {};
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = parseSimpleYaml(content);
    const llmSection = parsed.llm || {};

    const config: Partial<RouterConfig> = {};

    // Map default provider
    if (llmSection.default_provider) {
      config.defaultProvider = llmSection.default_provider;
    }

    // Map default model
    if (llmSection.defaultModel) {
      config.defaultModel = llmSection.defaultModel;
    }

    // Map cost optimization settings
    const costOpt = llmSection.cost_optimization;
    if (costOpt) {
      config.costOptimization = {
        enabled: costOpt.enabled ?? false,
        cheapModel: costOpt.cheap_model || '',
        expensiveModel: costOpt.expensive_model || '',
        cheapModelFor: costOpt.use_cheap_model_for || [],
        expensiveModelFor: costOpt.use_expensive_model_for || [],
      };
    }

    // Map fallback settings
    const fallback = llmSection.fallback;
    if (fallback) {
      config.fallback = {
        enabled: fallback.enabled ?? true,
        providers: fallback.providers || [],
      };
    }

    // Map token budget
    if (llmSection.maxTokens) {
      config.tokenBudget = {
        maxTokensPerRequest: llmSection.maxTokens,
      };
    }

    logger.info('Loaded LLM config from ' + configPath);
    return config;
  } catch (error: any) {
    logger.warn('Failed to load LLM config from ' + configPath + ': ' + error.message);
    return {};
  }
}

/**
 * Minimal YAML parser for flat/nested key-value configs.
 * Handles the subset of YAML used by Nimbus config files.
 */
function parseSimpleYaml(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = content.split('\n');
  // Stack tracks: indent level, the parent object, and the last key set on that object
  const stack: { indent: number; obj: Record<string, any>; lastKey?: string }[] = [{ indent: -1, obj: result }];

  for (const rawLine of lines) {
    // Skip comments and empty lines
    const commentIdx = rawLine.indexOf('#');
    const line = commentIdx >= 0 ? rawLine.slice(0, commentIdx) : rawLine;
    if (line.trim() === '') continue;

    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();

    // Handle list items (- value)
    if (trimmed.startsWith('- ')) {
      const listValue = trimmed.slice(2).trim();
      // Pop stack to find the owner of the list key.
      // If we're inside an empty object created by "key:" with no value,
      // pop past it to find the frame that owns the key.
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      // If the current frame has no lastKey, it's a placeholder empty object --
      // pop one more to reach the frame that holds the actual key reference.
      let frame = stack[stack.length - 1];
      if (!frame.lastKey && stack.length > 1) {
        stack.pop();
        frame = stack[stack.length - 1];
      }
      const parentObj = frame.obj;
      const lastKey = frame.lastKey;
      if (lastKey) {
        if (!Array.isArray(parentObj[lastKey])) {
          parentObj[lastKey] = [];
        }
        parentObj[lastKey].push(parseYamlValue(listValue));
      }
      continue;
    }

    // Handle key: value pairs
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    // Pop stack to find parent at correct indent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const frame = stack[stack.length - 1];
    const current = frame.obj;

    if (rawValue === '' || rawValue === undefined) {
      // Nested object (or potentially a list -- will be converted if list items follow)
      current[key] = {};
      frame.lastKey = key;
      stack.push({ indent, obj: current[key] });
    } else {
      current[key] = parseYamlValue(rawValue);
      frame.lastKey = key;
    }
  }

  return result;
}

/**
 * Parse a YAML scalar value
 */
function parseYamlValue(value: string): any {
  // Remove surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Null
  if (value === 'null' || value === '~') return null;

  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;

  // Inline list [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(v => parseYamlValue(v.trim()));
  }

  return value;
}
