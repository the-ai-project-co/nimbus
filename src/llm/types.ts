/**
 * Base LLM Provider Interface
 * Defines the contract that all LLM providers must implement
 */

/** A text content block inside a multi-part message. */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/** An image content block (base64-encoded). */
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    data: string;
  };
}

/** A single content block inside a message. */
export type ContentBlock = TextContentBlock | ImageContentBlock;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Plain string for text-only messages, or an array of content blocks for multimodal. */
  content: string | ContentBlock[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface CompletionRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  responseFormat?: { type: 'text' | 'json_object' };
}

export interface ToolCompletionRequest extends CompletionRequest {
  tools: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

export interface JSONSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: any;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  /** Per-request cost information (added by the router after provider responds) */
  cost?: {
    costUSD: number;
    breakdown: {
      input: number;
      output: number;
    };
  };
}

export interface StreamChunk {
  content?: string;
  done: boolean;
  toolCalls?: ToolCall[];
  /** Emitted when a tool call block starts, before arguments are fully assembled.
   *  Allows the TUI to show "preparing tool X..." feedback during streaming. */
  toolCallStart?: { id: string; name: string };
  /** Token usage info, typically sent with the final (done) chunk */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Extract the text content from a message's content field.
 * Handles both plain strings and content block arrays.
 */
export function getTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter((b): b is TextContentBlock => b.type === 'text')
    .map(b => b.text)
    .join('');
}

/**
 * Check if a message contains image content blocks.
 */
export function hasImageContent(content: string | ContentBlock[]): boolean {
  if (typeof content === 'string') {
    return false;
  }
  return content.some(b => b.type === 'image');
}

/**
 * Base interface that all LLM providers must implement
 */
export interface LLMProvider {
  /** Provider name (e.g., 'anthropic', 'openai', 'google', 'ollama') */
  name: string;

  /**
   * Complete a chat request synchronously
   */
  complete(request: CompletionRequest): Promise<LLMResponse>;

  /**
   * Stream a chat completion
   */
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

  /**
   * Complete a chat request with tool calling support
   */
  completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse>;

  /**
   * Stream a chat completion with tool calling support.
   * Text chunks are yielded incrementally; tool calls are accumulated
   * and emitted on the final chunk.  Providers that don't implement native
   * streaming-with-tools fall back to the non-streaming completeWithTools.
   */
  streamWithTools?(request: ToolCompletionRequest): AsyncIterable<StreamChunk>;

  /**
   * Count tokens in a text string
   */
  countTokens(text: string): Promise<number>;

  /**
   * Get maximum token limit for a model
   */
  getMaxTokens(model: string): number;

  /**
   * List available models for this provider
   */
  listModels(): Promise<string[]>;
}

/**
 * Base provider class with common utilities
 */
export abstract class BaseProvider implements LLMProvider {
  abstract name: string;
  abstract complete(request: CompletionRequest): Promise<LLMResponse>;
  abstract stream(request: CompletionRequest): AsyncIterable<StreamChunk>;
  abstract completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse>;
  abstract countTokens(text: string): Promise<number>;
  abstract getMaxTokens(model: string): number;
  abstract listModels(): Promise<string[]>;

  /**
   * Extract system prompt from messages
   */
  protected extractSystemPrompt(messages: LLMMessage[]): string | undefined {
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length === 0) {
      return undefined;
    }
    return systemMessages.map(m => getTextContent(m.content)).join('\n\n');
  }

  /**
   * Filter out system messages
   */
  protected filterSystemMessages(messages: LLMMessage[]): LLMMessage[] {
    return messages.filter(m => m.role !== 'system');
  }

  /**
   * Map finish reason to standard format
   */
  protected mapFinishReason(reason: string | null | undefined): LLMResponse['finishReason'] {
    if (!reason) {
      return 'stop';
    }

    const normalized = reason.toLowerCase();
    if (normalized.includes('stop') || normalized === 'end_turn') {
      return 'stop';
    }
    if (normalized.includes('length') || normalized.includes('max_tokens')) {
      return 'length';
    }
    if (normalized.includes('tool') || normalized.includes('function')) {
      return 'tool_calls';
    }
    if (normalized.includes('content_filter') || normalized.includes('safety')) {
      return 'content_filter';
    }

    return 'stop';
  }
}
