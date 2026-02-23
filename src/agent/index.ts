/**
 * Agent System — Barrel re-exports
 *
 * Core agentic loop, system prompt builder, permission engine,
 * context manager, and subagent system.
 */

// Core agentic loop
export {
  type AgentLoopOptions,
  type AgentLoopResult,
  type ToolCallInfo,
  runAgentLoop,
  getToolsForMode,
} from './loop';

// System prompt builder
export {
  type AgentMode,
  type SystemPromptOptions,
  buildSystemPrompt,
  loadNimbusMd,
} from './system-prompt';

// Permission engine
export {
  type PermissionDecision,
  type PermissionContext,
  type PermissionSessionState,
  type PermissionConfig,
  checkPermission,
  createPermissionState,
  approveForSession,
  approveActionForSession,
} from './permissions';

// Context manager — @file/@folder reference resolution
export {
  type FileReference,
  type ContextOptions,
  type ContextResult,
  resolveReferences,
  buildContextInjection,
  fuzzyFileSearch,
} from './context';

// Deploy preview system
export {
  type ResourceChange,
  type DeployPreview,
  generateDeployPreview,
  formatDeployPreview,
} from './deploy-preview';

// Subagent system
export {
  Subagent,
  type SubagentConfig,
  type SubagentResult,
  type SubagentType,
  createSubagent,
  parseAgentMention,
  createExploreSubagent,
  createInfraSubagent,
  createSecuritySubagent,
  createCostSubagent,
  createGeneralSubagent,
} from './subagents';
