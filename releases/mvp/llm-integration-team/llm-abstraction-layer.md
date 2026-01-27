# LLM Integration Team - MVP Specification

> **Team**: LLM Integration Team
> **Phase**: MVP (Months 1-3)
> **Dependencies**: Core Engine

---

## Overview

The LLM Integration Team builds the model-agnostic abstraction layer that allows Nimbus to work with multiple LLM providers (Anthropic, OpenAI, Google, Ollama, etc.) through a unified interface.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   LLM Abstraction Layer                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    LLM Router                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │   │
│  │  │   Model     │  │   Cost      │  │   Fallback      │ │   │
│  │  │  Selector   │  │  Optimizer  │  │   Manager       │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Provider Adapters                       │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────┐  │   │
│  │  │Anthropic│  │ OpenAI  │  │ Google  │  │  Ollama   │  │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └───────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. LLM Provider Interface

**File**: `packages/core/src/llm/provider.ts`

```typescript
interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

interface StreamChunk {
  content?: string;
  toolCalls?: Partial<ToolCall>[];
  done: boolean;
}

interface LLMProvider {
  name: string;

  // Core methods
  complete(request: CompletionRequest): Promise<LLMResponse>;
  stream(request: CompletionRequest): AsyncIterable<StreamChunk>;

  // Tool calling
  completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse>;

  // Utilities
  countTokens(text: string): Promise<number>;
  getMaxTokens(model: string): number;
}

interface CompletionRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  responseFormat?: { type: 'text' | 'json_object' };
}

interface ToolCompletionRequest extends CompletionRequest {
  tools: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}
```

### 2. Anthropic Provider

**File**: `packages/core/src/llm/anthropic.ts`

```typescript
import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;
  private defaultModel = 'claude-sonnet-4-20250514';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens || 4096,
      messages: this.convertMessages(request.messages),
      system: this.extractSystemPrompt(request.messages),
      temperature: request.temperature,
      stop_sequences: request.stopSequences,
    });

    return this.convertResponse(response);
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const stream = await this.client.messages.stream({
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens || 4096,
      messages: this.convertMessages(request.messages),
      system: this.extractSystemPrompt(request.messages),
      temperature: request.temperature,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        yield {
          content: event.delta.text,
          done: false,
        };
      }
    }

    yield { done: true };
  }

  async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens || 4096,
      messages: this.convertMessages(request.messages),
      system: this.extractSystemPrompt(request.messages),
      tools: this.convertTools(request.tools),
      tool_choice: request.toolChoice ? this.convertToolChoice(request.toolChoice) : undefined,
    });

    return this.convertResponse(response);
  }

  private convertMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));
  }

  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  async countTokens(text: string): Promise<number> {
    // Approximate token count (Anthropic doesn't have a public tokenizer)
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(model: string): number {
    const limits: Record<string, number> = {
      'claude-sonnet-4-20250514': 8192,
      'claude-haiku-4-20250514': 8192,
      'claude-opus-4-20250514': 8192,
    };
    return limits[model] || 4096;
  }
}
```

### 3. OpenAI Provider

**File**: `packages/core/src/llm/openai.ts`

```typescript
import OpenAI from 'openai';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: OpenAI;
  private defaultModel = 'gpt-4o';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model || this.defaultModel,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stopSequences,
      response_format: request.responseFormat,
    });

    return {
      content: response.choices[0].message.content || '',
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
      finishReason: this.mapFinishReason(response.choices[0].finish_reason),
    };
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const stream = await this.client.chat.completions.create({
      model: request.model || this.defaultModel,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      yield {
        content: delta?.content || undefined,
        done: chunk.choices[0]?.finish_reason !== null,
      };
    }
  }

  async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model || this.defaultModel,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls,
        tool_call_id: m.toolCallId,
      })),
      tools: request.tools,
      tool_choice: request.toolChoice,
      max_tokens: request.maxTokens,
    });

    return {
      content: response.choices[0].message.content || '',
      toolCalls: response.choices[0].message.tool_calls,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
      finishReason: this.mapFinishReason(response.choices[0].finish_reason),
    };
  }

  async countTokens(text: string): Promise<number> {
    // Use tiktoken for accurate count
    const { encode } = await import('gpt-tokenizer');
    return encode(text).length;
  }

  getMaxTokens(model: string): number {
    const limits: Record<string, number> = {
      'gpt-4o': 16384,
      'gpt-4o-mini': 16384,
      'gpt-4-turbo': 4096,
    };
    return limits[model] || 4096;
  }
}
```

### 4. Ollama Provider

**File**: `packages/core/src/llm/ollama.ts`

```typescript
export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string;
  private defaultModel = 'llama3.2';

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async complete(request: CompletionRequest): Promise<LLMResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        options: {
          temperature: request.temperature,
          num_predict: request.maxTokens,
        },
        stream: false,
      }),
    });

    const data = await response.json();

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
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.model || this.defaultModel,
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      for (const line of lines) {
        const data = JSON.parse(line);
        yield {
          content: data.message?.content,
          done: data.done,
        };
      }
    }
  }

  async completeWithTools(request: ToolCompletionRequest): Promise<LLMResponse> {
    // Ollama tool calling support varies by model
    // Implement tool calling prompt engineering fallback
    const toolPrompt = this.buildToolPrompt(request.tools);
    const modifiedRequest = {
      ...request,
      messages: [
        { role: 'system' as const, content: toolPrompt },
        ...request.messages,
      ],
    };

    const response = await this.complete(modifiedRequest);
    const toolCalls = this.extractToolCalls(response.content);

    return {
      ...response,
      toolCalls,
    };
  }

  private buildToolPrompt(tools: ToolDefinition[]): string {
    const toolDescriptions = tools.map(t =>
      `- ${t.function.name}: ${t.function.description}\n  Parameters: ${JSON.stringify(t.function.parameters)}`
    ).join('\n');

    return `You have access to the following tools:\n${toolDescriptions}\n\nTo use a tool, respond with JSON: {"tool": "tool_name", "arguments": {...}}`;
  }

  async countTokens(text: string): Promise<number> {
    // Rough estimate for Llama models
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(model: string): number {
    const limits: Record<string, number> = {
      'llama3.2': 8192,
      'llama3.2:70b': 8192,
      'codellama': 16384,
      'mistral': 32768,
    };
    return limits[model] || 4096;
  }
}
```

### 5. LLM Router

**File**: `packages/core/src/llm/router.ts`

```typescript
interface RouterConfig {
  defaultProvider: string;
  defaultModel: string;
  costOptimization: {
    enabled: boolean;
    cheapModelFor: string[];
    expensiveModelFor: string[];
  };
  fallback: {
    enabled: boolean;
    providers: string[];
  };
}

export class LLMRouter {
  private providers: Map<string, LLMProvider>;
  private config: RouterConfig;

  constructor(config: RouterConfig) {
    this.providers = new Map();
    this.config = config;
  }

  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  async route(request: CompletionRequest, taskType?: string): Promise<LLMResponse> {
    const provider = this.selectProvider(request, taskType);

    if (this.config.fallback.enabled) {
      return this.executeWithFallback(provider, request);
    }

    return provider.complete(request);
  }

  async *routeStream(request: CompletionRequest, taskType?: string): AsyncIterable<StreamChunk> {
    const provider = this.selectProvider(request, taskType);
    yield* provider.stream(request);
  }

  private selectProvider(request: CompletionRequest, taskType?: string): LLMProvider {
    // If model explicitly specified, use its provider
    if (request.model) {
      const providerName = this.getProviderForModel(request.model);
      const provider = this.providers.get(providerName);
      if (provider) return provider;
    }

    // Cost optimization
    if (this.config.costOptimization.enabled && taskType) {
      if (this.config.costOptimization.cheapModelFor.includes(taskType)) {
        return this.getCheapProvider();
      }
      if (this.config.costOptimization.expensiveModelFor.includes(taskType)) {
        return this.getExpensiveProvider();
      }
    }

    // Default provider
    return this.providers.get(this.config.defaultProvider)!;
  }

  private async executeWithFallback(
    primaryProvider: LLMProvider,
    request: CompletionRequest
  ): Promise<LLMResponse> {
    const fallbackProviders = this.config.fallback.providers
      .map(name => this.providers.get(name))
      .filter(Boolean) as LLMProvider[];

    const allProviders = [primaryProvider, ...fallbackProviders];

    for (const provider of allProviders) {
      try {
        return await provider.complete(request);
      } catch (error) {
        console.warn(`Provider ${provider.name} failed, trying fallback...`, error);
        continue;
      }
    }

    throw new Error('All LLM providers failed');
  }

  private getProviderForModel(model: string): string {
    if (model.startsWith('claude')) return 'anthropic';
    if (model.startsWith('gpt')) return 'openai';
    if (model.startsWith('gemini')) return 'google';
    if (model.includes('/')) return 'ollama'; // ollama/llama3.2
    return this.config.defaultProvider;
  }

  private getCheapProvider(): LLMProvider {
    // Prefer Ollama (free) > Haiku > GPT-4o-mini
    return this.providers.get('ollama') ||
           this.providers.get('anthropic') ||
           this.providers.get('openai')!;
  }

  private getExpensiveProvider(): LLMProvider {
    // Prefer Claude Opus > GPT-4o
    return this.providers.get('anthropic') ||
           this.providers.get('openai')!;
  }
}
```

---

## Configuration

### Config Schema

```yaml
# ~/.nimbus/config.yaml

llm:
  default_provider: anthropic
  default_model: claude-sonnet-4-20250514

  providers:
    anthropic:
      api_key: ${ANTHROPIC_API_KEY}
      models:
        - claude-sonnet-4-20250514
        - claude-haiku-4-20250514

    openai:
      api_key: ${OPENAI_API_KEY}
      models:
        - gpt-4o
        - gpt-4o-mini

    ollama:
      base_url: http://localhost:11434
      models:
        - llama3.2
        - codellama

  cost_optimization:
    enabled: true
    use_cheap_model_for:
      - simple_queries
      - explanations
    use_expensive_model_for:
      - code_generation
      - complex_reasoning

  fallback:
    enabled: true
    providers:
      - anthropic
      - openai
      - ollama
```

---

## Project Structure

```
packages/core/src/llm/
├── provider.ts           # Interface definitions
├── router.ts             # LLM routing logic
├── anthropic.ts          # Anthropic provider
├── openai.ts             # OpenAI provider
├── google.ts             # Google Gemini provider
├── ollama.ts             # Ollama provider
├── openrouter.ts         # OpenRouter provider
├── cost-calculator.ts    # Token cost calculation
└── index.ts              # Exports
```

---

## User Stories

| ID | Story | Acceptance Criteria | Sprint |
|----|-------|---------------------|--------|
| US-050 | As a user, I want to use Claude for generation | Anthropic provider works | Sprint 1-2 |
| US-051 | As a user, I want to use GPT-4 | OpenAI provider works | Sprint 1-2 |
| US-052 | As a user, I want to use local models | Ollama provider works | Sprint 3-4 |
| US-053 | As a user, I want automatic fallback | Fallback on provider failure | Sprint 3-4 |
| US-054 | As a user, I want streaming responses | All providers stream | Sprint 1-2 |

---

## Sprint Breakdown

### Sprint 1-2 (Weeks 1-4)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Provider interface design | 2 days | Type definitions |
| Anthropic provider | 3 days | Full implementation |
| OpenAI provider | 3 days | Full implementation |
| Streaming support | 3 days | All providers stream |

### Sprint 3-4 (Weeks 5-8)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Ollama provider | 3 days | Local model support |
| Google Gemini provider | 2 days | Gemini support |
| LLM Router | 3 days | Routing logic |
| Cost optimization | 2 days | Model selection |

### Sprint 5-6 (Weeks 9-12)

| Task | Effort | Deliverable |
|------|--------|-------------|
| Fallback system | 2 days | Provider failover |
| Tool calling unification | 3 days | Consistent tool API |
| Testing & polish | 3 days | All providers tested |

---

## Acceptance Criteria

- [ ] 4+ LLM providers supported (Anthropic, OpenAI, Google, Ollama)
- [ ] Streaming works for all providers
- [ ] Tool calling works for Claude and GPT-4
- [ ] Automatic fallback on provider failure
- [ ] Cost optimization routes to appropriate models
- [ ] < 100ms overhead for routing
- [ ] Configuration via YAML and environment variables

---

*Document Version: 1.0*
*Last Updated: January 2026*
