/**
 * Base Request Interface
 */
export interface BaseRequest {
  requestId: string;
  timestamp: string;
  userId?: string;
}

/**
 * LLM Chat Request
 */
export interface ChatRequest extends BaseRequest {
  message: string;
  model?: string;
  provider?: string;
  context?: ChatContext;
  stream?: boolean;
}

export interface ChatContext {
  conversationId?: string;
  history?: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

/**
 * Generation Request
 */
export interface GenerateRequest extends BaseRequest {
  type: 'terraform' | 'kubernetes' | 'helm';
  mode: 'questionnaire' | 'conversational';
  input: QuestionnaireAnswers | string;
  options?: GenerateOptions;
}

export interface QuestionnaireAnswers {
  provider?: string;
  region?: string;
  components?: string[];
  [key: string]: unknown;
}

export interface GenerateOptions {
  outputDir?: string;
  includeExamples?: boolean;
  applyBestPractices?: boolean;
}

/**
 * Tool Execution Request
 */
export interface ToolExecutionRequest extends BaseRequest {
  tool: string;
  input: Record<string, unknown>;
  dryRun?: boolean;
}
