/**
 * Ollama Provider
 * Supports local Ollama models: Llama 3.2, CodeLlama, Mistral, etc.
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
  type ToolDefinition,
} from '../types';
import { getProviderBaseUrl } from '../auth-bridge';

export class OllamaProvider extends BaseProvider {
  name = 'ollama';
  private baseUrl: string;
  private defaultModel = 'llama3.2';

  constructor(baseUrl?: string) {
    super();
    this.baseUrl =
      baseUrl ||
      getProviderBaseUrl('ollama') ||
      process.env.OLLAMA_BASE_URL ||
      'http://localhost:11434';
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    const messages = this.convertMessages(request.messages);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

    try {
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
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${await response.text()}`);
      }

      const data = (await response.json()) as {
        message: { content: string };
        model: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };

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
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Ollama request timed out after 120 seconds');
      }
      throw error;
    }
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
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

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
    // Try native Ollama tool calling first (supported by llama3.x, mistral, etc.)
    try {
      const nativeResult = await this.completeWithNativeTools(request);
      if (nativeResult) {
        return nativeResult;
      }
    } catch {
      // Native tool calling not supported by this model — fall through
    }

    // Fallback: prompt engineering approach for models without native tool support
    const toolPrompt = this.buildToolPrompt(request.tools);
    const modifiedRequest: CompletionRequest = {
      ...request,
      messages: [{ role: 'system', content: toolPrompt }, ...request.messages],
    };

    const response = await this.complete(modifiedRequest);

    // Attempt to extract tool calls from the text response. If extraction
    // fails for any reason (malformed JSON, unexpected structure, etc.),
    // return the raw text so the agent loop can still display it.
    let toolCalls: ToolCall[] = [];
    try {
      toolCalls = this.extractToolCalls(response.content);
    } catch {
      // Extraction failed -- return the original text as a plain response
      return response;
    }

    return {
      ...response,
      content: toolCalls.length > 0 ? '' : response.content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }

  /**
   * Attempt native Ollama tool calling via the /api/chat tools parameter.
   * Returns null if the model doesn't support tools (response has no tool_calls).
   */
  private async completeWithNativeTools(
    request: ToolCompletionRequest
  ): Promise<LLMResponse | null> {
    const messages = this.convertMessages(request.messages);
    const tools = request.tools.map(t => ({
      type: 'function',
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: request.model || this.defaultModel,
          messages,
          tools,
          options: {
            temperature: request.temperature,
            num_predict: request.maxTokens,
          },
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        message?: {
          content?: string;
          tool_calls?: Array<{
            function: { name: string; arguments: Record<string, unknown> };
          }>;
        };
        model: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      const msg = data.message;

      // If no tool_calls in response, native tools aren't working
      if (!msg?.tool_calls || msg.tool_calls.length === 0) {
        return null;
      }

      const toolCalls: ToolCall[] = msg.tool_calls.map(tc => ({
        id: crypto.randomUUID(),
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        },
      }));

      return {
        content: msg.content || '',
        toolCalls,
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        model: data.model,
        finishReason: 'tool_calls',
      };
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  }

  /**
   * Stream a chat completion with tool calling support.
   * Attempts native Ollama tool streaming via the OpenAI-compatible endpoint first.
   * Falls back to the non-streaming completeWithTools for models without native
   * tool support, yielding the result as a single chunk.
   */
  async *streamWithTools(request: ToolCompletionRequest): AsyncGenerator<StreamChunk> {
    // Try native streaming with tools via the OpenAI-compatible endpoint
    try {
      const nativeStream = this.streamWithNativeTools(request);
      let gotToolCalls = false;

      for await (const chunk of nativeStream) {
        if (chunk.toolCalls && chunk.toolCalls.length > 0) {
          gotToolCalls = true;
        }
        yield chunk;
      }

      // If we successfully streamed (even without tool calls), we're done
      if (gotToolCalls) {
        return;
      }

      // If the native stream completed without any tool calls, it may mean
      // the model answered with text only, which is a valid response — return.
      return;
    } catch {
      // Native streaming not supported — fall through to fallback
    }

    // Fallback: use non-streaming completeWithTools and yield as a single chunk
    const response = await this.completeWithTools(request);
    if (response.content) {
      yield { content: response.content, done: false };
    }
    yield {
      done: true,
      toolCalls: response.toolCalls,
      usage: response.usage,
    };
  }

  /**
   * Stream with native tool calling via the Ollama OpenAI-compatible endpoint.
   * Uses fetch + SSE parsing against /v1/chat/completions with stream: true.
   */
  private async *streamWithNativeTools(
    request: ToolCompletionRequest
  ): AsyncGenerator<StreamChunk> {
    const messages = this.convertMessages(request.messages);
    const tools = request.tools.map(t => ({
      type: 'function',
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        messages,
        tools,
        tool_choice: request.toolChoice || 'auto',
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama OpenAI-compatible API error: ${response.status} ${await response.text()}`
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const toolCallAccumulator = new Map<number, { id: string; name: string; arguments: string }>();
    let usage: StreamChunk['usage'] | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') {
          continue;
        }
        if (!trimmed.startsWith('data: ')) {
          continue;
        }

        try {
          const data = JSON.parse(trimmed.slice(6));
          const delta = data.choices?.[0]?.delta;
          const finishReason = data.choices?.[0]?.finish_reason;

          if (delta?.content) {
            yield { content: delta.content, done: false };
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
                  id: tc.id || crypto.randomUUID(),
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                });
              }
            }
          }

          if (data.usage) {
            usage = {
              promptTokens: data.usage.prompt_tokens || 0,
              completionTokens: data.usage.completion_tokens || 0,
              totalTokens: data.usage.total_tokens || 0,
            };
          }

          if (finishReason) {
            const toolCalls =
              toolCallAccumulator.size > 0
                ? Array.from(toolCallAccumulator.values()).map(tc => ({
                    id: tc.id,
                    type: 'function' as const,
                    function: { name: tc.name, arguments: tc.arguments },
                  }))
                : undefined;
            yield { done: true, toolCalls, usage };
            return;
          }
        } catch {
          // Ignore malformed SSE lines
          continue;
        }
      }
    }

    // If we reach here without a finishReason, emit a final done chunk
    const toolCalls =
      toolCallAccumulator.size > 0
        ? Array.from(toolCallAccumulator.values()).map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments },
          }))
        : undefined;
    yield { done: true, toolCalls, usage };
  }

  async countTokens(text: string): Promise<number> {
    try {
      // Use gpt-tokenizer (already a dependency) for better approximation
      const { encode } = await import('gpt-tokenizer');
      return encode(text).length;
    } catch {
      // Fallback to approximation if tokenizer fails
      return Math.ceil(text.length / 4);
    }
  }

  getMaxTokens(model: string): number {
    // Check the runtime cache first (populated by getModelInfo)
    const cached = this.modelContextCache.get(model);
    if (cached !== undefined) {
      return cached;
    }

    const limits: Record<string, number> = {
      // Llama 3.x family
      llama3: 8192,
      'llama3.1': 131072,
      'llama3.1:8b': 131072,
      'llama3.1:70b': 131072,
      'llama3.1:405b': 131072,
      'llama3.2': 131072,
      'llama3.2:1b': 131072,
      'llama3.2:3b': 131072,
      'llama3.2:70b': 131072,
      'llama3.3': 131072,
      'llama3.3:70b': 131072,
      // Llama 2 family
      llama2: 4096,
      'llama2:13b': 4096,
      'llama2:70b': 4096,
      // CodeLlama
      codellama: 16384,
      'codellama:7b': 16384,
      'codellama:13b': 16384,
      'codellama:34b': 16384,
      'codellama:70b': 16384,
      // Mistral / Mixtral
      mistral: 32768,
      'mistral:7b': 32768,
      'mistral-nemo': 128000,
      'mistral-large': 128000,
      'mistral-small': 32768,
      mixtral: 32768,
      'mixtral:8x7b': 32768,
      'mixtral:8x22b': 65536,
      // Phi family
      phi: 2048,
      phi3: 131072,
      'phi3:mini': 131072,
      'phi3:medium': 131072,
      'phi3.5': 131072,
      phi4: 16384,
      // Gemma family
      gemma: 8192,
      'gemma:2b': 8192,
      'gemma:7b': 8192,
      gemma2: 8192,
      'gemma2:2b': 8192,
      'gemma2:9b': 8192,
      'gemma2:27b': 8192,
      // Qwen family
      qwen: 32768,
      qwen2: 131072,
      'qwen2:7b': 131072,
      'qwen2:72b': 131072,
      'qwen2.5': 131072,
      'qwen2.5:7b': 131072,
      'qwen2.5:14b': 131072,
      'qwen2.5:32b': 131072,
      'qwen2.5:72b': 131072,
      'qwen2.5-coder': 131072,
      // DeepSeek family
      'deepseek-coder': 16384,
      'deepseek-coder-v2': 131072,
      'deepseek-r1': 131072,
      // StarCoder
      starcoder: 8192,
      starcoder2: 16384,
      // Command R
      'command-r': 131072,
      'command-r-plus': 131072,
      // Others
      'nomic-embed-text': 8192,
      'mxbai-embed-large': 512,
      yi: 200000,
      solar: 4096,
      'neural-chat': 4096,
      'wizard-vicuna': 4096,
    };

    // Handle model variants (e.g., "llama3.2:7b-instruct" -> "llama3.2:7b" -> "llama3.2")
    if (limits[model]) {
      return limits[model];
    }
    const baseModel = model.split(':')[0];
    return limits[baseModel] || 8192;
  }

  /**
   * Query the Ollama `/api/show` endpoint to retrieve the actual model
   * context length from the running server. Results are cached in memory
   * so repeated calls for the same model are free.
   *
   * If the call fails (Ollama not running, model not pulled, etc.) the
   * method returns `null` and the caller should fall back to the
   * hardcoded map in {@link getMaxTokens}.
   */
  async getModelInfo(model: string): Promise<number | null> {
    const cached = this.modelContextCache.get(model);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        model_info?: Record<string, unknown>;
        parameters?: string;
      };

      // Strategy 1: Check model_info for context_length or num_ctx keys
      if (data.model_info) {
        for (const [key, value] of Object.entries(data.model_info)) {
          if (
            (key.includes('context_length') || key.includes('num_ctx')) &&
            typeof value === 'number' &&
            value > 0
          ) {
            this.modelContextCache.set(model, value);
            return value;
          }
        }
      }

      // Strategy 2: Parse the parameters string for num_ctx
      if (data.parameters) {
        const match = data.parameters.match(/num_ctx\s+(\d+)/);
        if (match) {
          const numCtx = parseInt(match[1], 10);
          if (numCtx > 0) {
            this.modelContextCache.set(model, numCtx);
            return numCtx;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /** In-memory cache for model context lengths retrieved via /api/show. */
  private modelContextCache = new Map<string, number>();

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          models?: Array<{ name?: string; model?: string }>;
        };
        if (data.models && Array.isArray(data.models)) {
          return data.models.map(m => m.name || m.model || '').filter(Boolean);
        }
      }
    } catch {
      // Ollama not available, return static fallback
    }
    return ['llama3.2', 'llama3.2:70b', 'codellama', 'mistral', 'mixtral', 'phi'];
  }

  /**
   * Convert messages to Ollama format
   */
  private convertMessages(messages: LLMMessage[]): Array<{ role: string; content: string }> {
    return messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user',
      content: getTextContent(m.content),
    }));
  }

  /**
   * Build tool prompt for prompt engineering approach
   */
  private buildToolPrompt(tools: ToolDefinition[]): string {
    const toolDescriptions = tools
      .map(t => {
        const params = t.function.parameters;
        const required = params.required || [];
        const props = params.properties || {};
        const paramList = Object.entries(props)
          .map(([k, v]: [string, Record<string, unknown>]) => {
            const req = required.includes(k) ? ' (required)' : ' (optional)';
            return `    "${k}": ${v.type || 'string'}${req} — ${v.description || ''}`;
          })
          .join('\n');
        return `- ${t.function.name}: ${t.function.description}\n  Parameters:\n${paramList}`;
      })
      .join('\n\n');

    return `You are a helpful AI assistant with access to tools. When you need to use a tool, respond with ONLY a JSON object in this exact format (no other text before or after):

\`\`\`json
{"tool": "tool_name", "arguments": {"param1": "value1"}}
\`\`\`

Available tools:

${toolDescriptions}

IMPORTANT: When using a tool, output ONLY the JSON object. Do not include any explanation text before or after it. If you want to respond without using a tool, respond normally with plain text (no JSON).`;
  }

  /**
   * Extract tool calls from response content using robust pattern matching.
   * Handles JSON in code blocks, bare JSON, and multiple tool calls.
   */
  private extractToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Strategy 1: Look for JSON in code blocks
    const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const parsed = this.tryParseToolCall(match[1].trim());
      if (parsed) {
        toolCalls.push(parsed);
      }
    }
    if (toolCalls.length > 0) {
      return toolCalls;
    }

    // Strategy 2: Try to parse the entire content as JSON
    const wholeContent = content.trim();
    if (wholeContent.startsWith('{')) {
      const parsed = this.tryParseToolCall(wholeContent);
      if (parsed) {
        return [parsed];
      }
    }

    // Strategy 3: Find JSON objects using balanced brace matching
    let depth = 0;
    let start = -1;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') {
        if (depth === 0) {
          start = i;
        }
        depth++;
      } else if (content[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          const candidate = content.slice(start, i + 1);
          const parsed = this.tryParseToolCall(candidate);
          if (parsed) {
            toolCalls.push(parsed);
          }
          start = -1;
        }
      }
    }

    return toolCalls;
  }

  /**
   * Try to parse a string as a tool call JSON object.
   */
  private tryParseToolCall(text: string): ToolCall | null {
    try {
      const parsed = JSON.parse(text);
      if (
        parsed.tool &&
        typeof parsed.tool === 'string' &&
        parsed.arguments &&
        typeof parsed.arguments === 'object'
      ) {
        return {
          id: crypto.randomUUID(),
          type: 'function',
          function: {
            name: parsed.tool,
            arguments: JSON.stringify(parsed.arguments),
          },
        };
      }
    } catch {
      // Not valid JSON
    }
    return null;
  }
}
