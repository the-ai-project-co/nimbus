/**
 * Google Gemini Provider
 * Supports Gemini 2.0 Flash, Gemini 1.5 Pro
 */

import { GoogleGenerativeAI, GenerativeModel, Content } from '@google/generative-ai';
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

export class GoogleProvider extends BaseProvider {
  name = 'google';
  private client: GoogleGenerativeAI;
  private defaultModel = 'gemini-2.0-flash-exp';

  constructor(apiKey?: string) {
    super();
    const key = apiKey || getProviderApiKey('google') || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error('Google API key is required. Run `nimbus login` to configure, set GOOGLE_API_KEY environment variable, or pass it to the constructor.');
    }
    this.client = new GoogleGenerativeAI(key);
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    const model = this.getModel(request.model || this.defaultModel);
    const { contents, systemInstruction } = this.convertMessages(request.messages);

    const result = await model.generateContent({
      contents,
      systemInstruction,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences,
        responseMimeType: request.responseFormat?.type === 'json_object' ? 'application/json' : 'text/plain',
      },
    });

    const response = result.response;
    return {
      content: response.text(),
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount || 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0,
      },
      model: request.model || this.defaultModel,
      finishReason: this.mapGeminiFinishReason(response.candidates?.[0]?.finishReason),
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const model = this.getModel(request.model || this.defaultModel);
    const { contents, systemInstruction } = this.convertMessages(request.messages);

    const result = await model.generateContentStream({
      contents,
      systemInstruction,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        stopSequences: request.stopSequences,
      },
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield {
          content: text,
          done: false,
        };
      }
    }

    yield { done: true };
  }

  async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
    const model = this.getModel(request.model || this.defaultModel);
    const { contents, systemInstruction } = this.convertMessages(request.messages);

    const result = await model.generateContent({
      contents,
      systemInstruction,
      tools: [
        {
          functionDeclarations: this.convertTools(request.tools),
        },
      ],
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
      },
    });

    const response = result.response;
    const toolCalls = this.extractToolCalls(response);

    return {
      content: response.text() || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount || 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0,
      },
      model: request.model || this.defaultModel,
      finishReason: this.mapGeminiFinishReason(response.candidates?.[0]?.finishReason),
    };
  }

  async countTokens(text: string): Promise<number> {
    // Approximate: ~4 characters per token (similar to other models)
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(model: string): number {
    const limits: Record<string, number> = {
      'gemini-2.0-flash-exp': 8192,
      'gemini-1.5-pro': 8192,
      'gemini-1.5-flash': 8192,
      'gemini-pro': 2048,
    };
    return limits[model] || 8192;
  }

  /**
   * Get Gemini model instance
   */
  private getModel(modelName: string): GenerativeModel {
    return this.client.getGenerativeModel({ model: modelName });
  }

  /**
   * Convert messages to Gemini format
   */
  private convertMessages(messages: LLMMessage[]): {
    contents: Content[];
    systemInstruction?: string;
  } {
    const systemInstruction = this.extractSystemPrompt(messages);
    const nonSystemMessages = this.filterSystemMessages(messages);

    const contents: Content[] = nonSystemMessages.map((m) => {
      if (m.role === 'tool') {
        // Tool response
        return {
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: m.name || 'unknown',
                response: {
                  result: m.content,
                },
              },
            },
          ],
        };
      }

      if (m.toolCalls && m.toolCalls.length > 0) {
        // Message with tool calls
        return {
          role: 'model',
          parts: [
            ...(m.content
              ? [
                  {
                    text: m.content,
                  },
                ]
              : []),
            ...m.toolCalls.map((tc) => {
              try {
                return {
                  functionCall: {
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments),
                  },
                };
              } catch (error) {
                console.error(`Failed to parse tool call arguments for ${tc.function.name}:`, error);
                return {
                  functionCall: {
                    name: tc.function.name,
                    args: {},
                  },
                };
              }
            }),
          ],
        };
      }

      // Regular message
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      };
    });

    return { contents, systemInstruction };
  }

  /**
   * Convert tool definitions to Gemini format
   */
  private convertTools(tools: ToolDefinition[]): any[] {
    return tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: {
        ...t.function.parameters,
        type: 'OBJECT' as any,
      },
    }));
  }

  /**
   * Extract tool calls from Gemini response
   */
  private extractToolCalls(response: any): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const candidate = response.candidates?.[0];

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args),
            },
          });
        }
      }
    }

    return toolCalls;
  }

  /**
   * Map Gemini finish reason to standard format
   */
  private mapGeminiFinishReason(reason: string | undefined): LLMResponse['finishReason'] {
    if (!reason) return 'stop';

    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
