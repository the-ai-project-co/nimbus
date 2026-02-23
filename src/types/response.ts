/**
 * Chat Response
 */
export interface ChatResponse {
  message: string;
  model: string;
  provider: string;
  tokensUsed?: number;
  finishReason?: 'stop' | 'length' | 'error';
}

/**
 * Generation Response
 */
export interface GenerateResponse {
  success: boolean;
  files: GeneratedFile[];
  summary: string;
  warnings?: string[];
}

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'hcl' | 'yaml' | 'json' | 'md' | 'txt';
}

/**
 * Tool Execution Response
 */
export interface ToolExecutionResponse {
  success: boolean;
  output: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Operation History
 */
export interface Operation {
  id: string;
  timestamp: Date;
  type: string;
  command: string;
  input?: string;
  output?: string;
  status: 'success' | 'error' | 'cancelled';
  durationMs?: number;
  model?: string;
  tokensUsed?: number;
  costUsd?: number;
  metadata?: Record<string, unknown>;
}
