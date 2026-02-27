/**
 * AWS Bedrock Provider
 * Lazy-loads @aws-sdk/client-bedrock-runtime for binary size optimization.
 *
 * Uses the Bedrock Converse API for a unified interface across models
 * (Anthropic Claude, Meta Llama, Mistral, Amazon Titan, etc.).
 */

import {
  BaseProvider,
  getTextContent,
  type CompletionRequest,
  type LLMMessage,
  type LLMResponse,
  type StreamChunk,
  type ToolCall,
  type ToolCompletionRequest,
} from '../types';
import type {
  BedrockRuntimeClient as BedrockRuntimeClientType,
  ContentBlock,
  ConverseCommandInput,
  ConverseStreamCommandInput,
  ConverseResponse,
  Message as BedrockMessage,
} from '@aws-sdk/client-bedrock-runtime';

export class BedrockProvider extends BaseProvider {
  name = 'bedrock';
  private defaultModel = 'anthropic.claude-3-5-sonnet-20241022-v2:0';
  private region: string;
  private _client: BedrockRuntimeClientType | null = null;

  constructor(region?: string) {
    super();
    this.region = region || process.env.AWS_REGION || 'us-east-1';
  }

  /**
   * Lazy-load the Bedrock client to avoid importing @aws-sdk at module load time.
   * This keeps binary size small for users who do not use Bedrock.
   */
  private async getClient(): Promise<BedrockRuntimeClientType> {
    if (this._client) {
      return this._client;
    }

    const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
    this._client = new BedrockRuntimeClient({ region: this.region });
    return this._client;
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    const client = await this.getClient();
    const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');

    const modelId = request.model || this.defaultModel;
    const systemPrompt = this.extractSystemPrompt(request.messages);
    const messages = this.convertMessages(this.filterSystemMessages(request.messages));

    const commandInput: ConverseCommandInput = {
      modelId,
      messages,
      inferenceConfig: {
        maxTokens: request.maxTokens || 4096,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
        ...(request.stopSequences &&
          request.stopSequences.length > 0 && { stopSequences: request.stopSequences }),
      },
      ...(systemPrompt && { system: [{ text: systemPrompt }] }),
    };

    const command = new ConverseCommand(commandInput);
    const response = await client.send(command);

    const content = this.extractContentFromResponse(response);
    const inputTokens = response.usage?.inputTokens || 0;
    const outputTokens = response.usage?.outputTokens || 0;

    return {
      content,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model: modelId,
      finishReason: this.mapBedrockStopReason(response.stopReason),
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const client = await this.getClient();
    const { ConverseStreamCommand } = await import('@aws-sdk/client-bedrock-runtime');

    const modelId = request.model || this.defaultModel;
    const systemPrompt = this.extractSystemPrompt(request.messages);
    const messages = this.convertMessages(this.filterSystemMessages(request.messages));

    const commandInput: ConverseStreamCommandInput = {
      modelId,
      messages,
      inferenceConfig: {
        maxTokens: request.maxTokens || 4096,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
        ...(request.stopSequences &&
          request.stopSequences.length > 0 && { stopSequences: request.stopSequences }),
      },
      ...(systemPrompt && { system: [{ text: systemPrompt }] }),
    };

    const command = new ConverseStreamCommand(commandInput);
    const response = await client.send(command);

    let usage: StreamChunk['usage'] | undefined;

    if (response.stream) {
      for await (const event of response.stream) {
        if (event.contentBlockDelta?.delta?.text) {
          yield {
            content: event.contentBlockDelta.delta.text,
            done: false,
          };
        }

        if (event.metadata?.usage) {
          const u = event.metadata.usage;
          usage = {
            promptTokens: u.inputTokens || 0,
            completionTokens: u.outputTokens || 0,
            totalTokens: (u.inputTokens || 0) + (u.outputTokens || 0),
          };
        }

        if (event.messageStop) {
          yield { done: true, usage };
        }
      }
    }
  }

  async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
    const client = await this.getClient();
    const { ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');

    const modelId = request.model || this.defaultModel;
    const systemPrompt = this.extractSystemPrompt(request.messages);
    const messages = this.convertMessages(this.filterSystemMessages(request.messages));

    const toolConfig = {
      tools: request.tools.map(t => ({
        toolSpec: {
          name: t.function.name,
          description: t.function.description,
          inputSchema: {
            json: t.function.parameters,
          },
        },
      })),
      ...(request.toolChoice && request.toolChoice !== 'auto' && request.toolChoice !== 'none'
        ? {
            toolChoice: {
              tool: {
                name:
                  typeof request.toolChoice === 'object'
                    ? request.toolChoice.function.name
                    : undefined,
              },
            },
          }
        : {}),
    };

    const commandInput: ConverseCommandInput = {
      modelId,
      messages,
      toolConfig,
      inferenceConfig: {
        maxTokens: request.maxTokens || 4096,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
      },
      ...(systemPrompt && { system: [{ text: systemPrompt }] }),
    };

    const command = new ConverseCommand(commandInput);
    const response = await client.send(command);

    const content = this.extractContentFromResponse(response);
    const toolCalls = this.extractToolCallsFromResponse(response);
    const inputTokens = response.usage?.inputTokens || 0;
    const outputTokens = response.usage?.outputTokens || 0;

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      model: modelId,
      finishReason: this.mapBedrockStopReason(response.stopReason),
    };
  }

  async *streamWithTools(request: ToolCompletionRequest): AsyncIterable<StreamChunk> {
    const client = await this.getClient();
    const { ConverseStreamCommand } = await import('@aws-sdk/client-bedrock-runtime');

    const modelId = request.model || this.defaultModel;
    const systemPrompt = this.extractSystemPrompt(request.messages);
    const messages = this.convertMessages(this.filterSystemMessages(request.messages));

    const toolConfig = {
      tools: request.tools.map(t => ({
        toolSpec: {
          name: t.function.name,
          description: t.function.description,
          inputSchema: {
            json: t.function.parameters,
          },
        },
      })),
      ...(request.toolChoice && request.toolChoice !== 'auto' && request.toolChoice !== 'none'
        ? {
            toolChoice: {
              tool: {
                name:
                  typeof request.toolChoice === 'object'
                    ? request.toolChoice.function.name
                    : undefined,
              },
            },
          }
        : {}),
    };

    const commandInput: ConverseStreamCommandInput = {
      modelId,
      messages,
      toolConfig,
      inferenceConfig: {
        maxTokens: request.maxTokens || 4096,
        ...(request.temperature !== undefined && { temperature: request.temperature }),
      },
      ...(systemPrompt && { system: [{ text: systemPrompt }] }),
    };

    const command = new ConverseStreamCommand(commandInput);
    const response = await client.send(command);

    let usage: StreamChunk['usage'] | undefined;
    const toolCalls: ToolCall[] = [];
    let currentToolCall: { id: string; name: string; inputJson: string } | null = null;

    if (response.stream) {
      for await (const event of response.stream) {
        // Tool call start
        if (event.contentBlockStart?.start?.toolUse) {
          const tu = event.contentBlockStart.start.toolUse;
          currentToolCall = {
            id: tu.toolUseId || `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            name: tu.name || 'unknown',
            inputJson: '',
          };
        }

        // Text delta
        if (event.contentBlockDelta?.delta?.text) {
          yield {
            content: event.contentBlockDelta.delta.text,
            done: false,
          };
        }

        // Tool input delta
        if (event.contentBlockDelta?.delta?.toolUse?.input) {
          if (currentToolCall) {
            currentToolCall.inputJson += event.contentBlockDelta.delta.toolUse.input;
          }
        }

        // Block stop — finalize current tool call
        if (event.contentBlockStop) {
          if (currentToolCall) {
            let parsedInput: Record<string, unknown> = {};
            try {
              parsedInput = JSON.parse(currentToolCall.inputJson) as Record<string, unknown>;
            } catch {
              /* use empty object */
            }
            toolCalls.push({
              id: currentToolCall.id,
              type: 'function',
              function: {
                name: currentToolCall.name,
                arguments: JSON.stringify(parsedInput),
              },
            });
            currentToolCall = null;
          }
        }

        // Usage metadata
        if (event.metadata?.usage) {
          const u = event.metadata.usage;
          usage = {
            promptTokens: u.inputTokens || 0,
            completionTokens: u.outputTokens || 0,
            totalTokens: (u.inputTokens || 0) + (u.outputTokens || 0),
          };
        }

        // Message stop
        if (event.messageStop) {
          yield {
            done: true,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage,
          };
        }
      }
    }
  }

  async countTokens(text: string): Promise<number> {
    try {
      const { encode } = await import('gpt-tokenizer');
      return encode(text).length;
    } catch {
      return Math.ceil(text.length / 4);
    }
  }

  getMaxTokens(model: string): number {
    const limits: Record<string, number> = {
      'anthropic.claude-3-5-sonnet-20241022-v2:0': 8192,
      'anthropic.claude-3-5-haiku-20241022-v1:0': 8192,
      'anthropic.claude-3-opus-20240229-v1:0': 4096,
      'anthropic.claude-3-haiku-20240307-v1:0': 4096,
      'meta.llama3-1-405b-instruct-v1:0': 4096,
      'meta.llama3-1-70b-instruct-v1:0': 4096,
      'mistral.mixtral-8x7b-instruct-v0:1': 4096,
      'amazon.titan-text-premier-v1:0': 3072,
    };
    return limits[model] || 4096;
  }

  async listModels(): Promise<string[]> {
    return [
      'anthropic.claude-3-5-sonnet-20241022-v2:0',
      'anthropic.claude-3-5-haiku-20241022-v1:0',
      'anthropic.claude-3-opus-20240229-v1:0',
      'anthropic.claude-3-haiku-20240307-v1:0',
      'meta.llama3-1-405b-instruct-v1:0',
      'meta.llama3-1-70b-instruct-v1:0',
      'mistral.mixtral-8x7b-instruct-v0:1',
      'amazon.titan-text-premier-v1:0',
    ];
  }

  /**
   * Convert messages to Bedrock Converse API format
   */
  private convertMessages(messages: LLMMessage[]): BedrockMessage[] {
    return messages.map((m): BedrockMessage => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [
            {
              toolResult: {
                toolUseId: m.toolCallId,
                content: [{ text: getTextContent(m.content) }],
              },
            },
          ],
        };
      }

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const textContent = getTextContent(m.content);
        return {
          role: 'assistant',
          content: [
            ...(textContent ? [{ text: textContent }] : []),
            ...m.toolCalls.map(tc => {
              let input: Record<string, unknown>;
              try {
                input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
              } catch {
                input = {};
              }
              return {
                toolUse: {
                  toolUseId: tc.id,
                  name: tc.function.name,
                  input,
                },
              };
            }),
          ] as ContentBlock[],
        };
      }

      return {
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: [{ text: getTextContent(m.content) }],
      };
    });
  }

  /**
   * Extract text content from Bedrock Converse response
   */
  private extractContentFromResponse(response: ConverseResponse): string {
    const output = response.output;
    if (!output?.message?.content) {
      return '';
    }

    return output.message.content
      .filter(block => block.text)
      .map(block => block.text)
      .join('');
  }

  /**
   * Extract tool calls from Bedrock Converse response
   */
  private extractToolCallsFromResponse(response: ConverseResponse): ToolCall[] {
    const output = response.output;
    if (!output?.message?.content) {
      return [];
    }

    const toolCalls: ToolCall[] = [];
    for (const block of output.message.content) {
      if (block.toolUse) {
        toolCalls.push({
          id:
            block.toolUse.toolUseId ||
            `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          type: 'function',
          function: {
            name: block.toolUse.name || 'unknown',
            arguments: JSON.stringify(block.toolUse.input || {}),
          },
        });
      }
    }

    return toolCalls;
  }

  /**
   * Map Bedrock stop reason to standard format
   */
  private mapBedrockStopReason(reason: string | undefined): LLMResponse['finishReason'] {
    if (!reason) {
      return 'stop';
    }

    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'tool_use':
        return 'tool_calls';
      case 'content_filtered':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
