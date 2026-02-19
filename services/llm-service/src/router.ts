/**
 * LLM Router
 * Routes requests to the appropriate provider based on model, cost optimization, and fallback logic
 */

import { logger } from '@nimbus/shared-utils';
import {
  LLMProvider,
  CompletionRequest,
  LLMResponse,
  StreamChunk,
  ToolCompletionRequest,
} from './providers/base';
import {
  AnthropicProvider,
  OpenAIProvider,
  GoogleProvider,
  OllamaProvider,
  OpenRouterProvider,
} from './providers';
import { calculateCost, CostResult } from './cost-calculator';

export interface RouterConfig {
  defaultProvider: string;
  defaultModel: string;
  costOptimization: {
    enabled: boolean;
    cheapModelFor: string[];
    expensiveModelFor: string[];
    cheapModel: string;
    expensiveModel: string;
  };
  fallback: {
    enabled: boolean;
    providers: string[];
  };
  tokenBudget?: {
    maxTokensPerRequest?: number;
  };
}

export interface ProviderInfo {
  name: string;
  available: boolean;
  models: string[];
}

/**
 * Metadata emitted by the streaming fallback to indicate which provider
 * is actually serving the response.  The WebSocket handler inspects this
 * to notify clients of provider switches.
 */
export interface StreamFallbackMeta {
  /** The provider that is actively streaming. */
  activeProvider: string;
  /** If a fallback occurred, the provider that originally failed. */
  failedProvider?: string;
  /** True when this stream is being served by a fallback provider. */
  isFallback: boolean;
}

export class LLMRouter {
  private providers: Map<string, LLMProvider>;
  private config: RouterConfig;

  /**
   * Populated during streaming with fallback so callers (e.g. WebSocket)
   * can inspect which provider ended up serving the stream.  Reset on
   * every call to routeStream / executeStreamWithFallback.
   */
  lastStreamFallbackMeta: StreamFallbackMeta | null = null;

  constructor(config?: Partial<RouterConfig>) {
    this.providers = new Map();
    this.config = {
      defaultProvider: config?.defaultProvider || process.env.DEFAULT_PROVIDER || 'anthropic',
      defaultModel:
        config?.defaultModel || process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514',
      costOptimization: {
        enabled:
          config?.costOptimization?.enabled ??
          process.env.ENABLE_COST_OPTIMIZATION === 'true',
        cheapModelFor: config?.costOptimization?.cheapModelFor || [
          'simple_queries',
          'summarization',
          'classification',
          'explanations',
        ],
        expensiveModelFor: config?.costOptimization?.expensiveModelFor || [
          'code_generation',
          'complex_reasoning',
          'planning',
        ],
        cheapModel: config?.costOptimization?.cheapModel || process.env.CHEAP_MODEL || 'claude-haiku-4-20250514',
        expensiveModel: config?.costOptimization?.expensiveModel || process.env.EXPENSIVE_MODEL || 'claude-opus-4-20250514',
      },
      fallback: {
        enabled: config?.fallback?.enabled ?? process.env.DISABLE_FALLBACK !== 'true',
        providers:
          config?.fallback?.providers ||
          (process.env.FALLBACK_PROVIDERS?.split(',') ?? ['anthropic', 'openai', 'openrouter', 'google']),
      },
    };

    this.initializeProviders();
  }

  /**
   * Initialize all available providers based on API keys
   */
  private initializeProviders(): void {
    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set('anthropic', new AnthropicProvider());
      logger.info('Initialized Anthropic provider');
    }

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', new OpenAIProvider());
      logger.info('Initialized OpenAI provider');
    }

    // Google
    if (process.env.GOOGLE_API_KEY) {
      this.providers.set('google', new GoogleProvider());
      logger.info('Initialized Google provider');
    }

    // OpenRouter
    if (process.env.OPENROUTER_API_KEY) {
      this.providers.set('openrouter', new OpenRouterProvider());
      logger.info('Initialized OpenRouter provider');
    }

    // Ollama (always available for local models)
    this.providers.set('ollama', new OllamaProvider());
    logger.info('Initialized Ollama provider');
  }

  /**
   * Register a custom provider
   */
  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
    logger.info(`Registered custom provider: ${provider.name}`);
  }

  /**
   * Route a completion request to the appropriate provider
   */
  async route(request: CompletionRequest, taskType?: string): Promise<LLMResponse> {
    const provider = this.selectProvider(request, taskType);

    // Enforce token budget
    this.enforceTokenBudget(request);

    if (!provider) {
      throw new Error('No LLM provider available');
    }

    let response: LLMResponse;
    if (this.config.fallback.enabled) {
      response = await this.executeWithFallback(provider, request);
    } else {
      response = await provider.complete(request);
    }

    // Attach per-request cost calculation
    const cost = this.computeCost(provider.name, response);
    response.cost = cost;

    // Persist usage to the state service (fire-and-forget)
    if (response.usage) {
      this.persistUsage(response.usage, response.model, provider.name, cost);
    }

    return response;
  }

  /**
   * Route a streaming completion request.
   * Collects token usage from the final chunk and persists cost data
   * after the stream completes (fire-and-forget, same as route()).
   */
  async *routeStream(
    request: CompletionRequest,
    taskType?: string
  ): AsyncIterable<StreamChunk> {
    // Capture `this` and config references before yield points.
    // TypeScript strict mode narrows `this` to `never` after yield in
    // async generators, so all post-yield access goes through locals.
    const self = this as LLMRouter;
    const defaultModel = self.config.defaultModel;

    const provider = self.selectProvider(request, taskType);

    // Enforce token budget
    self.enforceTokenBudget(request);

    if (!provider) {
      throw new Error('No LLM provider available');
    }

    // Reset fallback metadata
    self.lastStreamFallbackMeta = null;

    const stream = self.config.fallback.enabled
      ? self.executeStreamWithFallback(provider, request)
      : provider.stream(request);

    let totalContent = '';
    let lastUsage: StreamChunk['usage'] | undefined;

    for await (const chunk of stream) {
      if (chunk.content) {
        totalContent += chunk.content;
      }
      if (chunk.usage) {
        lastUsage = chunk.usage;
      }
      yield chunk;
    }

    // Determine which provider actually served the stream.
    // Use type assertion because TS control-flow analysis incorrectly
    // narrows lastStreamFallbackMeta to `null` -- it was mutated by
    // executeStreamWithFallback during iteration above.
    const fallbackMeta = self.lastStreamFallbackMeta as StreamFallbackMeta | null;
    const activeProviderName = fallbackMeta?.activeProvider ?? provider.name;

    // Track cost after stream completes
    if (lastUsage) {
      const model = request.model || defaultModel;
      const cost = calculateCost(
        activeProviderName,
        model,
        lastUsage.promptTokens,
        lastUsage.completionTokens
      );
      self.persistUsage(lastUsage, model, activeProviderName, cost);
    } else {
      // Estimate tokens from content length if no usage data
      const estimatedOutputTokens = Math.ceil(totalContent.length / 4);
      const estimatedInputTokens = request.messages.reduce(
        (sum, m) => sum + Math.ceil(m.content.length / 4),
        0
      );
      const model = request.model || defaultModel;
      const cost = calculateCost(
        activeProviderName,
        model,
        estimatedInputTokens,
        estimatedOutputTokens
      );
      self.persistUsage(
        {
          promptTokens: estimatedInputTokens,
          completionTokens: estimatedOutputTokens,
          totalTokens: estimatedInputTokens + estimatedOutputTokens,
        },
        model,
        activeProviderName,
        cost
      );
    }
  }

  /**
   * Route a tool completion request
   */
  async routeWithTools(request: ToolCompletionRequest, taskType?: string): Promise<LLMResponse> {
    const provider = this.selectProvider(request, taskType);

    // Enforce token budget
    this.enforceTokenBudget(request);

    if (!provider) {
      throw new Error('No LLM provider available');
    }

    let response: LLMResponse;
    if (this.config.fallback.enabled) {
      response = await this.executeToolsWithFallback(provider, request);
    } else {
      response = await provider.completeWithTools(request);
    }

    // Attach per-request cost calculation
    const cost = this.computeCost(provider.name, response);
    response.cost = cost;

    // Persist usage to the state service (fire-and-forget)
    if (response.usage) {
      this.persistUsage(response.usage, response.model, provider.name, cost);
    }

    return response;
  }

  /**
   * Get list of available models across all providers
   */
  async getAvailableModels(): Promise<Record<string, string[]>> {
    const models: Record<string, string[]> = {};

    const entries = Array.from(this.providers.entries());
    const results = await Promise.allSettled(
      entries.map(async ([name, provider]) => {
        const providerModels = await provider.listModels();
        return { name, models: providerModels };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        models[result.value.name] = result.value.models;
      }
    }

    return models;
  }

  /**
   * Get provider information including availability and models.
   * Each registered provider is queried for its model list. If the query
   * succeeds the provider is marked available; otherwise it is marked
   * unavailable with an empty model list.
   */
  async getProviders(): Promise<ProviderInfo[]> {
    const entries = Array.from(this.providers.entries());
    const results = await Promise.allSettled(
      entries.map(async ([name, provider]) => {
        const models = await provider.listModels();
        return { name, available: true, models };
      })
    );

    const providers: ProviderInfo[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        providers.push(result.value);
      } else {
        providers.push({ name: entries[i][0], available: false, models: [] });
      }
    }

    return providers;
  }

  /**
   * Select the appropriate provider based on request and task type
   */
  private selectProvider(request: CompletionRequest, taskType?: string): LLMProvider | null {
    // If model explicitly specified, use its provider
    if (request.model) {
      const providerName = this.getProviderForModel(request.model);
      const provider = this.providers.get(providerName);
      if (provider) {
        logger.info(`Selected ${providerName} provider for model ${request.model}`);
        return provider;
      }
    }

    // Cost optimization
    if (this.config.costOptimization.enabled && taskType) {
      if (this.config.costOptimization.cheapModelFor.includes(taskType)) {
        const cheapModel = this.config.costOptimization.cheapModel;
        const provider = this.getProviderForModel(cheapModel)
          ? this.providers.get(this.getProviderForModel(cheapModel)) || this.getCheapProvider()
          : this.getCheapProvider();
        if (provider) {
          if (!request.model) request.model = cheapModel;
          logger.info(`Selected cheap provider ${provider.name} with model ${request.model} for task type: ${taskType}`);
          return provider;
        }
      }
      if (this.config.costOptimization.expensiveModelFor.includes(taskType)) {
        const expensiveModel = this.config.costOptimization.expensiveModel;
        const provider = this.getProviderForModel(expensiveModel)
          ? this.providers.get(this.getProviderForModel(expensiveModel)) || this.getExpensiveProvider()
          : this.getExpensiveProvider();
        if (provider) {
          if (!request.model) request.model = expensiveModel;
          logger.info(`Selected expensive provider ${provider.name} with model ${request.model} for task type: ${taskType}`);
          return provider;
        }
      }
    }

    // Default provider
    const defaultProvider = this.providers.get(this.config.defaultProvider);
    if (defaultProvider) {
      logger.info(`Using default provider: ${this.config.defaultProvider}`);
      return defaultProvider;
    }

    // Fallback to any available provider
    const firstAvailable = Array.from(this.providers.values())[0];
    if (firstAvailable) {
      logger.warn(`No default provider, using first available: ${firstAvailable.name}`);
      return firstAvailable;
    }

    return null;
  }

  /**
   * Execute request with fallback logic
   */
  private async executeWithFallback(
    primaryProvider: LLMProvider,
    request: CompletionRequest
  ): Promise<LLMResponse> {
    const fallbackProviders = this.config.fallback.providers
      .map((name) => this.providers.get(name))
      .filter(Boolean) as LLMProvider[];

    const allProviders = [primaryProvider, ...fallbackProviders.filter((p) => p !== primaryProvider)];

    for (const provider of allProviders) {
      try {
        logger.info(`Attempting request with ${provider.name}`);
        return await provider.complete(request);
      } catch (error) {
        logger.warn(`Provider ${provider.name} failed, trying fallback...`, { error });
        continue;
      }
    }

    throw new Error('All LLM providers failed');
  }

  /**
   * Execute tool request with fallback logic
   */
  private async executeToolsWithFallback(
    primaryProvider: LLMProvider,
    request: ToolCompletionRequest
  ): Promise<LLMResponse> {
    const fallbackProviders = this.config.fallback.providers
      .map((name) => this.providers.get(name))
      .filter(Boolean) as LLMProvider[];

    const allProviders = [primaryProvider, ...fallbackProviders.filter((p) => p !== primaryProvider)];

    for (const provider of allProviders) {
      try {
        logger.info(`Attempting tool request with ${provider.name}`);
        return await provider.completeWithTools(request);
      } catch (error) {
        logger.warn(`Provider ${provider.name} failed for tool request, trying fallback...`, {
          error,
        });
        continue;
      }
    }

    throw new Error('All LLM providers failed for tool request');
  }

  /**
   * Execute streaming request with fallback logic.
   *
   * Handles two failure modes:
   * 1. Provider fails before producing any chunks (e.g. auth error, rate limit) --
   *    immediately falls through to the next provider.
   * 2. Provider fails mid-stream (partial chunks already buffered) -- discards
   *    the partial output and starts fresh with the next provider.
   *
   * Chunks are buffered internally per-provider attempt.  Only once a provider
   * completes its full stream successfully are the buffered chunks yielded to
   * the caller.  This prevents the caller from receiving a garbled mix of
   * partial responses from multiple providers.
   */
  private async *executeStreamWithFallback(
    primaryProvider: LLMProvider,
    request: CompletionRequest
  ): AsyncIterable<StreamChunk> {
    // Capture `this` for use across yield points
    const self = this as LLMRouter;

    const fallbackProviders = self.config.fallback.providers
      .map((name) => self.providers.get(name))
      .filter(Boolean) as LLMProvider[];

    const allProviders = [primaryProvider, ...fallbackProviders.filter((p) => p !== primaryProvider)];

    let failedProvider: string | undefined;

    for (const provider of allProviders) {
      const bufferedChunks: StreamChunk[] = [];
      let streamCompleted = false;

      try {
        logger.info(`Attempting stream with ${provider.name}`);

        for await (const chunk of provider.stream(request)) {
          bufferedChunks.push(chunk);

          if (chunk.done) {
            streamCompleted = true;
          }
        }

        // If we got here the stream completed without throwing.
        // Even if there was no explicit done=true chunk we treat
        // exhausting the iterator as success.
        streamCompleted = true;
      } catch (error) {
        const partialChunkCount = bufferedChunks.length;
        logger.warn(
          `Provider ${provider.name} failed for stream after ${partialChunkCount} chunk(s), trying fallback...`,
          { error }
        );
        failedProvider = provider.name;
        // Discard buffered chunks from the failed provider and try next
        continue;
      }

      if (streamCompleted) {
        // Record which provider served the response
        self.lastStreamFallbackMeta = {
          activeProvider: provider.name,
          failedProvider,
          isFallback: !!failedProvider,
        };

        if (failedProvider) {
          logger.info(
            `Stream fallback: ${failedProvider} -> ${provider.name} (${bufferedChunks.length} chunks)`
          );
        }

        // Yield all buffered chunks to the caller
        for (const chunk of bufferedChunks) {
          yield chunk;
        }
        return;
      }
    }

    throw new Error('All LLM providers failed for streaming request');
  }

  /**
   * Compute cost for a response using the cost calculator
   */
  private computeCost(providerName: string, response: LLMResponse): CostResult {
    return calculateCost(
      providerName,
      response.model,
      response.usage.promptTokens,
      response.usage.completionTokens
    );
  }

  /**
   * Get provider name for a specific model
   */
  private getProviderForModel(model: string): string {
    if (model.startsWith('claude')) return 'anthropic';
    if (model.startsWith('gpt')) return 'openai';
    if (model.startsWith('gemini')) return 'google';

    // OpenRouter models use provider/model format (e.g., anthropic/claude-sonnet-4-20250514)
    if (model.includes('/') && this.providers.has('openrouter')) {
      return 'openrouter';
    }

    if (model.startsWith('llama') || model.startsWith('mistral'))
      return 'ollama';
    return this.config.defaultProvider;
  }

  /**
   * Get the cheapest available provider
   */
  private getCheapProvider(): LLMProvider | null {
    // Prefer Ollama (free) > Haiku > GPT-4o-mini
    return (
      this.providers.get('ollama') ||
      this.providers.get('anthropic') || // Will use Haiku in practice
      this.providers.get('openai') || // Will use gpt-4o-mini in practice
      null
    );
  }

  /**
   * Persist token usage to the state service (fire-and-forget)
   */
  persistUsage(
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    model?: string,
    provider?: string,
    cost?: CostResult
  ): void {
    const stateServiceUrl = process.env.STATE_SERVICE_URL || 'http://localhost:3011';
    fetch(`${stateServiceUrl}/api/state/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'llm_usage',
        command: 'llm.completion',
        provider: provider || this.config.defaultProvider,
        model: model || this.config.defaultModel,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        costUSD: cost?.costUSD ?? 0,
        timestamp: new Date().toISOString(),
      }),
    }).catch((err) => {
      logger.warn('Failed to persist LLM usage to state service', { error: err.message });
    });
  }

  /**
   * Get the most capable (expensive) provider
   */
  private getExpensiveProvider(): LLMProvider | null {
    // Prefer Claude Opus/Sonnet > GPT-4o > Gemini Pro
    return (
      this.providers.get('anthropic') ||
      this.providers.get('openai') ||
      this.providers.get('google') ||
      null
    );
  }

  /**
   * Enforce token budget on a request
   */
  private enforceTokenBudget(request: CompletionRequest): void {
    const maxTokens = this.config.tokenBudget?.maxTokensPerRequest || 32768;
    request.maxTokens = Math.min(request.maxTokens || 4096, maxTokens);
  }
}
