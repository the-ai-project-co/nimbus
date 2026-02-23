/**
 * Tool Schemas — Barrel re-exports
 *
 * All tool definitions, types, and converter utilities for the
 * Nimbus agentic tool-use system.
 */

// Core types and registry
export {
  type PermissionTier,
  type ToolCategory,
  type ToolResult,
  type ToolDefinition,
  type ToolInput,
  type AnthropicTool,
  type OpenAITool,
  type GoogleTool,
  PERMISSION_TIER_ORDER,
  permissionTierIndex,
  zodToJsonSchema,
  toAnthropicTool,
  toOpenAITool,
  toGoogleTool,
  ToolRegistry,
  defaultToolRegistry,
} from './types';

// Standard tools (11)
export {
  readFileTool,
  editFileTool,
  multiEditTool,
  writeFileTool,
  bashTool,
  globTool,
  grepTool,
  listDirTool,
  webfetchTool,
  todoReadTool,
  todoWriteTool,
  standardTools,
} from './standard';

// DevOps tools (9)
export {
  terraformTool,
  kubectlTool,
  helmTool,
  cloudDiscoverTool,
  costEstimateTool,
  driftDetectTool,
  deployPreviewTool,
  gitTool,
  taskTool,
  devopsTools,
} from './devops';

// Converter utilities
export {
  type Provider,
  toAnthropicFormat,
  toOpenAIFormat,
  toGoogleFormat,
  toProviderFormat,
  getToolNames,
} from './converter';

// Combined all tools
import { standardTools } from './standard';
import { devopsTools } from './devops';

/** All 20 built-in tools (11 standard + 9 DevOps). MCP tools are added dynamically. */
export const allBuiltinTools = [...standardTools, ...devopsTools];
