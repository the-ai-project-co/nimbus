/**
 * Generic OpenAI-Compatible Provider
 * Works with any provider that implements the OpenAI chat completions API:
 * Groq, Together AI, DeepSeek, Fireworks AI, Perplexity, Mistral AI, etc.
 */

import OpenAI from 'openai';
import {
  BaseProvider,
  CompletionRequest,
  LLMMessage,
  LLMResponse,
  StreamChunk,
  ToolCall,
  ToolCompletionRequest,
} from '../types';

export interface OpenAICompatibleConfig {
  name: string;
  apiKey: string;
  baseURL: string;
  defaultModel: string;
  defaultHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider extends BaseProvider {
  name: string;
  private client: OpenAI;
  private defaultModel: string;

  constructor(config: OpenAICompatibleConfig) {
    super();
    this.name = config.name;
    this.defaultModel = config.defaultModel;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
    });
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    const messages = this.convertMessages(request.messages);

    const response = await this.client.chat.completions.create({
      model: request.model || this.defaultModel,
      messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stopSequences,
      response_format: request.responseFormat,
    });

    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error(`${this.name} response missing choices`);
    }

    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map(this.convertToolCall),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const messages = this.convertMessages(request.messages);

    const stream = await this.client.chat.completions.create({
      model: request.model || this.defaultModel,
      messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stopSequences,
      stream: true,
    });

    // Accumulator for tool calls across chunks
    const toolCallAccumulator = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const finishReason = chunk.choices[0]?.finish_reason;

      if (delta?.content) {
        yield {
          content: delta.content,
          done: false,
        };
      }

      if (delta?.tool_calls) {
        // Accumulate tool calls across chunks
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;
          const existing = toolCallAccumulator.get(index);

          if (existing) {
            // Append arguments to existing tool call
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            // Initialize new tool call entry
            toolCallAccumulator.set(index, {
              id: tc.id || '',
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            });
          }
        }

        // Yield accumulated tool calls
        const toolCalls = Array.from(toolCallAccumulator.values()).map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));

        yield {
          done: false,
          toolCalls,
        };
      }

      // Capture usage from streaming chunks if available
      const chunkUsage = (chunk as any).usage;
      if (chunkUsage) {
        yield {
          done: false,
          usage: {
            promptTokens: chunkUsage.prompt_tokens || 0,
            completionTokens: chunkUsage.completion_tokens || 0,
            totalTokens: chunkUsage.total_tokens || 0,
          },
        };
      }

      if (finishReason) {
        yield { done: true };
      }
    }
  }

  async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
    const messages = this.convertMessages(request.messages);

    const response = await this.client.chat.completions.create({
      model: request.model || this.defaultModel,
      messages,
      tools: request.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      })),
      tool_choice: request.toolChoice,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
    });

    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error(`${this.name} response missing choices`);
    }

    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map(this.convertToolCall),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
      finishReason: this.mapFinishReason(choice.finish_reason),
    };
  }

  async countTokens(text: string): Promise<number> {
    // Approximation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(_model: string): number {
    return 4096;
  }

  async listModels(): Promise<string[]> {
    return [this.defaultModel];
  }

  /**
   * Convert messages to OpenAI-compatible format
   */
  private convertMessages(messages: LLMMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      if (m.role === 'tool') {
        // Tool result message
        return {
          role: 'tool' as const,
          content: m.content,
          tool_call_id: m.toolCallId!,
        };
      }

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        // Assistant message with tool calls
        return {
          role: 'assistant' as const,
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        };
      }

      // Regular message
      return {
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      };
    });
  }

  /**
   * Convert OpenAI tool call to standard format
   */
  private convertToolCall(tc: any): ToolCall {
    return {
      id: tc.id,
      type: 'function',
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    };
  }
}
