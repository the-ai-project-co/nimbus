/**
 * OpenRouter Provider
 * OpenAI-compatible API with access to multiple model providers
 * Supports models from Anthropic, OpenAI, Google, Meta, and more via a unified API
 *
 * Base URL: https://openrouter.ai/api/v1
 * API Key: OPENROUTER_API_KEY env var
 */

import OpenAI from 'openai';
import { encode } from 'gpt-tokenizer';
import {
  BaseProvider,
  CompletionRequest,
  LLMMessage,
  LLMResponse,
  StreamChunk,
  ToolCall,
  ToolCompletionRequest,
} from './base';
import { getProviderApiKey } from './auth-bridge';

export class OpenRouterProvider extends BaseProvider {
  name = 'openrouter';
  private client: OpenAI;
  private defaultModel = 'anthropic/claude-sonnet-4-20250514';

  constructor(apiKey?: string) {
    super();
    this.client = new OpenAI({
      apiKey: apiKey || getProviderApiKey('openrouter') || process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://github.com/the-ai-project-co/nimbus',
        'X-Title': 'Nimbus CLI',
      },
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
      throw new Error('OpenRouter response missing choices');
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
        for (const tc of delta.tool_calls) {
          const index = tc.index ?? 0;
          const existing = toolCallAccumulator.get(index);

          if (existing) {
            if (tc.function?.arguments) {
              existing.arguments += tc.function.arguments;
            }
          } else {
            toolCallAccumulator.set(index, {
              id: tc.id || '',
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            });
          }
        }

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
      throw new Error('OpenRouter response missing choices');
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
    return encode(text).length;
  }

  getMaxTokens(model: string): number {
    const limits: Record<string, number> = {
      'anthropic/claude-sonnet-4-20250514': 8192,
      'anthropic/claude-haiku-4-20250514': 8192,
      'anthropic/claude-opus-4-20250514': 4096,
      'anthropic/claude-3.5-sonnet': 8192,
      'openai/gpt-4o': 16384,
      'openai/gpt-4o-mini': 16384,
      'google/gemini-2.0-flash-exp': 8192,
      'google/gemini-pro-1.5': 8192,
      'meta-llama/llama-3.1-405b-instruct': 4096,
      'meta-llama/llama-3.1-70b-instruct': 4096,
      'mistralai/mixtral-8x22b-instruct': 4096,
    };
    return limits[model] || 4096;
  }

  async listModels(): Promise<string[]> {
    return [
      'anthropic/claude-sonnet-4-20250514',
      'anthropic/claude-haiku-4-20250514',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'google/gemini-2.0-flash-exp',
      'meta-llama/llama-3.1-405b-instruct',
      'mistralai/mixtral-8x22b-instruct',
    ];
  }

  /**
   * Convert messages to OpenAI-compatible format
   */
  private convertMessages(messages: LLMMessage[]): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          content: m.content,
          tool_call_id: m.toolCallId!,
        };
      }

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
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

      return {
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      };
    });
  }

  /**
   * Convert tool call to standard format
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
