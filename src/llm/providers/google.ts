/**
 * Google Gemini Provider
 * Supports Gemini 2.0 Flash, Gemini 1.5 Pro
 */

import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerativeModel,
  type Content,
  type EnhancedGenerateContentResponse,
  type FunctionDeclaration,
  type FunctionDeclarationSchema,
} from '@google/generative-ai';
import {
  BaseProvider,
  getTextContent,
  type CompletionRequest,
  type LLMMessage,
  type LLMResponse,
  type StreamChunk,
  type ToolCall,
  type ToolCompletionRequest,
  type ToolDefinition,
} from '../types';
import { getProviderApiKey } from '../auth-bridge';

export class GoogleProvider extends BaseProvider {
  name = 'google';
  private client: GoogleGenerativeAI;
  private defaultModel = 'gemini-2.0-flash-exp';

  constructor(apiKey?: string) {
    super();
    const key = apiKey || getProviderApiKey('google') || process.env.GOOGLE_API_KEY;
    if (!key) {
      throw new Error(
        'Google API key is required. Run `nimbus login` to configure, set GOOGLE_API_KEY environment variable, or pass it to the constructor.'
      );
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
        responseMimeType:
          request.responseFormat?.type === 'json_object' ? 'application/json' : 'text/plain',
      },
    });

    const response = result.response;
    // response.text() throws when the response contains no text parts
    // (e.g. tool-only responses). Safely extract text content.
    let content = '';
    try {
      content = response.text();
    } catch {
      /* no text parts */
    }

    return {
      content,
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

    let usage: StreamChunk['usage'] | undefined;

    for await (const chunk of result.stream) {
      let text = '';
      try {
        text = chunk.text();
      } catch {
        /* no text parts in this chunk */
      }
      if (text) {
        yield {
          content: text,
          done: false,
        };
      }

      // Capture usage metadata from the chunk if available
      if (chunk.usageMetadata) {
        usage = {
          promptTokens: chunk.usageMetadata.promptTokenCount || 0,
          completionTokens: chunk.usageMetadata.candidatesTokenCount || 0,
          totalTokens: chunk.usageMetadata.totalTokenCount || 0,
        };
      }
    }

    yield { done: true, usage };
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

    // response.text() throws when the response contains only tool calls
    let textContent = '';
    try {
      textContent = response.text();
    } catch {
      /* tool-only response */
    }

    return {
      content: textContent,
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

  async *streamWithTools(request: ToolCompletionRequest): AsyncIterable<StreamChunk> {
    const model = this.getModel(request.model || this.defaultModel);
    const { contents, systemInstruction } = this.convertMessages(request.messages);

    const result = await model.generateContentStream({
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

    let usage: StreamChunk['usage'] | undefined;
    const toolCalls: ToolCall[] = [];

    for await (const chunk of result.stream) {
      let text = '';
      try {
        text = chunk.text();
      } catch {
        /* no text parts in this chunk */
      }
      if (text) {
        yield {
          content: text,
          done: false,
        };
      }

      // Accumulate tool calls from chunk parts
      const candidate = chunk.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.functionCall) {
            toolCalls.push({
              id: crypto.randomUUID(),
              type: 'function',
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args),
              },
            });
          }
        }
      }

      // Capture usage metadata from the chunk if available
      if (chunk.usageMetadata) {
        usage = {
          promptTokens: chunk.usageMetadata.promptTokenCount || 0,
          completionTokens: chunk.usageMetadata.candidatesTokenCount || 0,
          totalTokens: chunk.usageMetadata.totalTokenCount || 0,
        };
      }
    }

    yield {
      done: true,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
    };
  }

  async countTokens(text: string): Promise<number> {
    try {
      const model = this.getModel(this.defaultModel);
      const result = await model.countTokens(text);
      return result.totalTokens;
    } catch {
      // Fallback to approximation if API call fails
      return Math.ceil(text.length / 4);
    }
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

  async listModels(): Promise<string[]> {
    return ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
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

    const contents: Content[] = nonSystemMessages.map(m => {
      if (m.role === 'tool') {
        // Tool response
        return {
          role: 'function',
          parts: [
            {
              functionResponse: {
                name: m.name || 'unknown',
                response: {
                  result: getTextContent(m.content),
                },
              },
            },
          ],
        };
      }

      if (m.toolCalls && m.toolCalls.length > 0) {
        // Message with tool calls
        const textContent = getTextContent(m.content);
        return {
          role: 'model',
          parts: [
            ...(textContent
              ? [
                  {
                    text: textContent,
                  },
                ]
              : []),
            ...m.toolCalls.map(tc => {
              try {
                return {
                  functionCall: {
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments),
                  },
                };
              } catch (error) {
                console.error(
                  `Failed to parse tool call arguments for ${tc.function.name}:`,
                  error
                );
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
        parts: [{ text: getTextContent(m.content) }],
      };
    });

    return { contents, systemInstruction };
  }

  /**
   * Convert tool definitions to Gemini format.
   * The JSONSchema from tool definitions is structurally compatible with
   * FunctionDeclarationSchema but TypeScript cannot verify property-level
   * assignability, so we cast the parameters object.
   */
  private convertTools(tools: ToolDefinition[]): FunctionDeclaration[] {
    return tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: {
        ...t.function.parameters,
        type: SchemaType.OBJECT,
      } as FunctionDeclarationSchema,
    }));
  }

  /**
   * Extract tool calls from Gemini response
   */
  private extractToolCalls(response: EnhancedGenerateContentResponse): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const candidate = response.candidates?.[0];

    if (candidate?.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: crypto.randomUUID(),
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
    if (!reason) {
      return 'stop';
    }

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
