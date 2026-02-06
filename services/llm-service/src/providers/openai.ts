/**
 * OpenAI Provider
 * Supports GPT-4o, GPT-4o-mini, GPT-4-turbo
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

export class OpenAIProvider extends BaseProvider {
  name = 'openai';
  private client: OpenAI;
  private defaultModel = 'gpt-4o';

  constructor(apiKey?: string) {
    super();
    this.client = new OpenAI({
      apiKey: apiKey || getProviderApiKey('openai') || process.env.OPENAI_API_KEY,
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
      throw new Error('OpenAI response missing choices');
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
      throw new Error('OpenAI response missing choices');
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
    // Use gpt-tokenizer for accurate count
    return encode(text).length;
  }

  getMaxTokens(model: string): number {
    const limits: Record<string, number> = {
      'gpt-4o': 16384,
      'gpt-4o-2024-11-20': 16384,
      'gpt-4o-mini': 16384,
      'gpt-4o-mini-2024-07-18': 16384,
      'gpt-4-turbo': 4096,
      'gpt-4-turbo-2024-04-09': 4096,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 4096,
    };
    return limits[model] || 4096;
  }

  /**
   * Convert messages to OpenAI format
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
