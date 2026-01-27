/**
 * Ollama Provider
 * Supports local Ollama models: Llama 3.2, CodeLlama, Mistral, etc.
 */

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

export class OllamaProvider extends BaseProvider {
  name = 'ollama';
  private baseUrl: string;
  private defaultModel = 'llama3.2';

  constructor(baseUrl?: string) {
    super();
    this.baseUrl = baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    const messages = this.convertMessages(request.messages);

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        messages,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
          stop: request.stopSequences,
        },
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${await response.text()}`);
    }

    const data: any = await response.json();

    return {
      content: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      model: data.model,
      finishReason: 'stop',
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const messages = this.convertMessages(request.messages);

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        messages,
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const data = JSON.parse(line);

          if (data.message?.content) {
            yield {
              content: data.message.content,
              done: false,
            };
          }

          if (data.done) {
            yield { done: true };
          }
        } catch (e) {
          // Ignore malformed JSON lines
          continue;
        }
      }
    }
  }

  async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
    // Ollama tool calling support varies by model
    // Use prompt engineering fallback
    const toolPrompt = this.buildToolPrompt(request.tools);
    const modifiedRequest: CompletionRequest = {
      ...request,
      messages: [
        { role: 'system', content: toolPrompt },
        ...request.messages,
      ],
    };

    const response = await this.complete(modifiedRequest);

    // Try to extract tool calls from response
    const toolCalls = this.extractToolCalls(response.content);

    return {
      ...response,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  async countTokens(text: string): Promise<number> {
    // Rough estimate for Llama models: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(model: string): number {
    const limits: Record<string, number> = {
      'llama3.2': 8192,
      'llama3.2:70b': 8192,
      'llama3.1': 8192,
      'codellama': 16384,
      'mistral': 32768,
      'mixtral': 32768,
      'phi': 2048,
    };

    // Handle model variants (e.g., "llama3.2:7b" -> "llama3.2")
    const baseModel = model.split(':')[0];
    return limits[baseModel] || limits[model] || 4096;
  }

  /**
   * Convert messages to Ollama format
   */
  private convertMessages(messages: LLMMessage[]): Array<{ role: string; content: string }> {
    return messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: m.content,
    }));
  }

  /**
   * Build tool prompt for prompt engineering approach
   */
  private buildToolPrompt(tools: ToolDefinition[]): string {
    const toolDescriptions = tools
      .map(
        (t) =>
          `- ${t.function.name}: ${t.function.description}\n  Parameters: ${JSON.stringify(t.function.parameters, null, 2)}`
      )
      .join('\n\n');

    return `You have access to the following tools:

${toolDescriptions}

To use a tool, respond with JSON in this exact format:
{
  "tool": "tool_name",
  "arguments": { ... }
}

If you don't need to use a tool, respond normally.`;
  }

  /**
   * Extract tool calls from response content using pattern matching
   */
  private extractToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Try to find JSON blocks that look like tool calls
    const jsonBlockRegex = /\{[\s\S]*?"tool"[\s\S]*?"arguments"[\s\S]*?\}/g;
    const matches = content.match(jsonBlockRegex);

    if (!matches) return toolCalls;

    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        if (parsed.tool && parsed.arguments) {
          toolCalls.push({
            id: `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            type: 'function',
            function: {
              name: parsed.tool,
              arguments: JSON.stringify(parsed.arguments),
            },
          });
        }
      } catch (e) {
        // Not a valid tool call JSON, continue
        continue;
      }
    }

    return toolCalls;
  }
}
