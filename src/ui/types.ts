/**
 * Shared types for Nimbus TUI components.
 *
 * These interfaces are consumed by every Ink component in the UI layer and by
 * the orchestration logic that feeds data into the rendering tree.
 */

/** The three operational modes of the Nimbus agent. */
export type AgentMode = 'plan' | 'build' | 'deploy';

/** A single chat message displayed in the message list. */
export interface UIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: UIToolCall[];
}

/** A tool invocation attached to an assistant message. */
export interface UIToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: { output: string; isError: boolean };
  status: 'pending' | 'running' | 'completed' | 'failed';
  /** Elapsed wall-clock time in milliseconds. */
  duration?: number;
}

/** Metadata about the current agent session. */
export interface SessionInfo {
  id: string;
  model: string;
  mode: AgentMode;
  tokenCount: number;
  maxTokens: number;
  costUSD: number;
  snapshotCount: number;
}

/** A single resource-level change shown in the deploy preview. */
export interface DeployChange {
  action: 'create' | 'modify' | 'destroy' | 'replace';
  resourceType: string;
  resourceName: string;
  details?: string;
}

/** Full deploy preview data rendered before apply. */
export interface DeployPreviewData {
  tool: string;
  changes: DeployChange[];
  costImpact?: string;
  blastRadius?: string;
  affectedServices?: string[];
}
