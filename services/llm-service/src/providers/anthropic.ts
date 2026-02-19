/**
 * Anthropic Claude Provider
 * Supports Claude Sonnet 4, Haiku 4, and Opus 4
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  BaseProvider,
  CompletionRequest,
  LLMMessage,
  LLMResponse,
  StreamChunk,
  ToolCall,
  ToolCompletionRequest,
  ToolDefinition,
} from './base';
import { getProviderApiKey } from './auth-bridge';

export class AnthropicProvider extends BaseProvider {
  name = 'anthropic';
  private client: Anthropic;
  private defaultModel = 'claude-sonnet-4-20250514';

  constructor(apiKey?: string) {
    super();
    this.client = new Anthropic({
      apiKey: apiKey || getProviderApiKey('anthropic') || process.env.ANTHROPIC_API_KEY,
    });
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    const systemPrompt = this.extractSystemPrompt(request.messages);
    const messages = this.convertMessages(this.filterSystemMessages(request.messages));

    const response = await this.client.messages.create({
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens || 4096,
      messages,
      system: systemPrompt,
      temperature: request.temperature,
      stop_sequences: request.stopSequences,
    });

    return this.convertResponse(response);
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const systemPrompt = this.extractSystemPrompt(request.messages);
    const messages = this.convertMessages(this.filterSystemMessages(request.messages));

    const stream = await this.client.messages.stream({
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens || 4096,
      messages,
      system: systemPrompt,
      temperature: request.temperature,
      stop_sequences: request.stopSequences,
    });

    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield {
            content: event.delta.text,
            done: false,
          };
        }
      } else if (event.type === 'message_delta') {
        // Capture usage from the message_delta event (sent near end of stream)
        const deltaEvent = event as any;
        if (deltaEvent.usage) {
          const inputTokens = deltaEvent.usage.input_tokens || 0;
          const outputTokens = deltaEvent.usage.output_tokens || 0;
          usage = {
            promptTokens: inputTokens,
            completionTokens: outputTokens,
            totalTokens: inputTokens + outputTokens,
          };
        }
      } else if (event.type === 'message_stop') {
        // If we didn't get usage from message_delta, try to get final message usage
        if (!usage) {
          try {
            const finalMessage = await stream.finalMessage();
            usage = {
              promptTokens: finalMessage.usage.input_tokens,
              completionTokens: finalMessage.usage.output_tokens,
              totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens,
            };
          } catch {
            // Non-critical: token count will be estimated
          }
        }
        yield { done: true, usage };
      }
    }
  }

  async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
    const systemPrompt = this.extractSystemPrompt(request.messages);
    const messages = this.convertMessages(this.filterSystemMessages(request.messages));

    const toolChoice = this.convertToolChoice(request.toolChoice);
    const response = await this.client.messages.create({
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens || 4096,
      messages,
      system: systemPrompt,
      tools: this.convertTools(request.tools),
      ...(toolChoice && { tool_choice: toolChoice }),
      temperature: request.temperature,
    });

    return this.convertResponse(response);
  }

  async countTokens(text: string): Promise<number> {
    try {
      const response = await this.client.messages.count_tokens({
        model: this.defaultModel,
        messages: [{ role: 'user', content: text }],
      });
      return response.input_tokens;
    } catch {
      // Fallback to approximation if API call fails
      return Math.ceil(text.length / 4);
    }
  }

  getMaxTokens(model: string): number {
    const limits: Record<string, number> = {
      'claude-sonnet-4-20250514': 8192,
      'claude-haiku-4-20250514': 8192,
      'claude-opus-4-20250514': 8192,
      'claude-3-5-sonnet-20241022': 8192,
      'claude-3-5-haiku-20241022': 8192,
    };
    return limits[model] || 4096;
  }

  async listModels(): Promise<string[]> {
    return [
      'claude-sonnet-4-20250514',
      'claude-haiku-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ];
  }

  /**
   * Convert messages to Anthropic format
   */
  private convertMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    return messages.map((m) => {
      if (m.role === 'tool') {
        // Tool result message
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: m.toolCallId!,
              content: m.content,
            },
          ],
        };
      }

      if (m.toolCalls && m.toolCalls.length > 0) {
        // Assistant message with tool calls
        return {
          role: 'assistant' as const,
          content: [
            ...(m.content
              ? [
                  {
                    type: 'text' as const,
                    text: m.content,
                  },
                ]
              : []),
            ...m.toolCalls.map((tc) => {
              try {
                return {
                  type: 'tool_use' as const,
                  id: tc.id,
                  name: tc.function.name,
                  input: JSON.parse(tc.function.arguments),
                };
              } catch (error) {
                console.error(`Failed to parse tool call arguments for ${tc.function.name}:`, error);
                return {
                  type: 'tool_use' as const,
                  id: tc.id,
                  name: tc.function.name,
                  input: {},
                };
              }
            }),
          ],
        };
      }

      // Regular message
      return {
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      };
    });
  }

  /**
   * Convert tool definitions to Anthropic format
   */
  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: {
        ...t.function.parameters,
        type: 'object' as const,
      },
    }));
  }

  /**
   * Convert tool choice to Anthropic format
   */
  private convertToolChoice(
    toolChoice?: ToolCompletionRequest['toolChoice']
  ): Anthropic.MessageCreateParams['tool_choice'] | undefined {
    if (!toolChoice || toolChoice === 'auto') {
      return { type: 'auto' };
    }
    if (toolChoice === 'none') {
      // When 'none' is specified, don't send tool_choice parameter
      // This prevents Anthropic from using tools
      return undefined;
    }
    if (typeof toolChoice === 'object' && toolChoice.type === 'function') {
      return {
        type: 'tool',
        name: toolChoice.function.name,
      };
    }
    return { type: 'auto' };
  }

  /**
   * Convert Anthropic response to standard format
   */
  private convertResponse(response: Anthropic.Message): LLMResponse {
    let content = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      finishReason: this.mapFinishReason(response.stop_reason),
    };
  }
}
