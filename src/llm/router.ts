/**
 * LLM Router
 * Routes requests to the appropriate provider based on model, cost optimization, and fallback logic.
 *
 * Refactored for the embedded Nimbus architecture. Key changes from the microservice version:
 * - Imports providers from local ./providers/ directory
 * - Integrates model alias resolution via resolveModelAlias
 * - Integrates auto-detection via detectProvider
 * - Supports OpenAI-compatible and Bedrock providers via env vars
 * - persistUsage writes to the embedded SQLite usage table (fire-and-forget)
 */

import { logger } from '../utils';
import {
  getTextContent,
  type LLMProvider,
  type CompletionRequest,
  type LLMResponse,
  type StreamChunk,
  type ToolCompletionRequest,
} from './types';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { GoogleProvider } from './providers/google';
import { OllamaProvider } from './providers/ollama';
import { OpenRouterProvider } from './providers/openrouter';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import { BedrockProvider } from './providers/bedrock';
import { calculateCost, type CostResult } from './cost-calculator';
import { resolveModelAlias, stripProviderPrefix } from './model-aliases';
import { detectProvider } from './provider-registry';
import { ProviderCircuitBreaker } from './circuit-breaker';

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
  private circuitBreaker = new ProviderCircuitBreaker();

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
      defaultModel: config?.defaultModel || process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514',
      costOptimization: {
        enabled:
          config?.costOptimization?.enabled ?? process.env.ENABLE_COST_OPTIMIZATION === 'true',
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
        cheapModel:
          config?.costOptimization?.cheapModel ||
          process.env.CHEAP_MODEL ||
          'claude-haiku-4-20250514',
        expensiveModel:
          config?.costOptimization?.expensiveModel ||
          process.env.EXPENSIVE_MODEL ||
          'claude-opus-4-20250514',
      },
      fallback: {
        enabled: config?.fallback?.enabled ?? process.env.DISABLE_FALLBACK !== 'true',
        providers:
          config?.fallback?.providers ||
          (process.env.FALLBACK_PROVIDERS?.split(',') ?? [
            'anthropic',
            'openai',
            'openrouter',
            'google',
          ]),
      },
    };

    this.initializeProviders();
  }

  /**
   * Initialize all available providers based on API keys, auth.json, and environment variables.
   *
   * Resolution order per provider:
   *   1. auth.json (~/.nimbus/auth.json) via the auth-bridge
   *   2. Environment variables (ANTHROPIC_API_KEY, etc.)
   */
  private initializeProviders(): void {
    // Lazy-import the auth-bridge to avoid circular deps at module level
    let isConfigured: (name: string) => boolean;
    let getApiKey: (name: string) => string | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bridge = require('./auth-bridge');
      isConfigured = bridge.isProviderConfigured;
      getApiKey = bridge.getProviderApiKey;
    } catch (err) {
      // Auth-bridge unavailable (e.g., test environment) — fall back to env-only
      logger.warn(
        'Auth-bridge unavailable, using environment variables only:',
        err instanceof Error ? err.message : String(err)
      );
      isConfigured = () => false;
      getApiKey = () => undefined;
    }

    // Anthropic
    if (process.env.ANTHROPIC_API_KEY || isConfigured('anthropic')) {
      this.providers.set('anthropic', new AnthropicProvider());
      logger.info('Initialized Anthropic provider');
    }

    // OpenAI
    if (process.env.OPENAI_API_KEY || isConfigured('openai')) {
      this.providers.set('openai', new OpenAIProvider());
      logger.info('Initialized OpenAI provider');
    }

    // Google
    if (process.env.GOOGLE_API_KEY || isConfigured('google')) {
      this.providers.set('google', new GoogleProvider());
      logger.info('Initialized Google provider');
    }

    // OpenRouter
    if (process.env.OPENROUTER_API_KEY || isConfigured('openrouter')) {
      this.providers.set('openrouter', new OpenRouterProvider());
      logger.info('Initialized OpenRouter provider');
    }

    // Ollama (only if explicitly configured via auth.json or env var)
    if (process.env.OLLAMA_BASE_URL || isConfigured('ollama')) {
      this.providers.set('ollama', new OllamaProvider());
      logger.info('Initialized Ollama provider');
    }

    // AWS Bedrock (uses IAM credentials from environment / instance profile)
    if (
      process.env.AWS_BEDROCK_ENABLED === 'true' ||
      process.env.AWS_REGION ||
      isConfigured('bedrock') ||
      (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    ) {
      this.providers.set('bedrock', new BedrockProvider());
      logger.info('Initialized AWS Bedrock provider');
    }

    // Groq (OpenAI-compatible)
    const groqKey = process.env.GROQ_API_KEY || getApiKey('groq');
    if (groqKey) {
      this.providers.set(
        'groq',
        new OpenAICompatibleProvider({
          name: 'groq',
          apiKey: groqKey,
          baseURL: 'https://api.groq.com/openai/v1',
          defaultModel: 'llama-3.1-70b-versatile',
        })
      );
      logger.info('Initialized Groq provider (OpenAI-compatible)');
    }

    // Together AI (OpenAI-compatible)
    const togetherKey = process.env.TOGETHER_API_KEY || getApiKey('together');
    if (togetherKey) {
      this.providers.set(
        'together',
        new OpenAICompatibleProvider({
          name: 'together',
          apiKey: togetherKey,
          baseURL: 'https://api.together.xyz/v1',
          defaultModel: 'meta-llama/Llama-3.1-70B-Instruct-Turbo',
        })
      );
      logger.info('Initialized Together AI provider (OpenAI-compatible)');
    }

    // DeepSeek (OpenAI-compatible)
    const deepseekKey = process.env.DEEPSEEK_API_KEY || getApiKey('deepseek');
    if (deepseekKey) {
      this.providers.set(
        'deepseek',
        new OpenAICompatibleProvider({
          name: 'deepseek',
          apiKey: deepseekKey,
          baseURL: 'https://api.deepseek.com/v1',
          defaultModel: 'deepseek-chat',
        })
      );
      logger.info('Initialized DeepSeek provider (OpenAI-compatible)');
    }

    // Fireworks AI (OpenAI-compatible)
    const fireworksKey = process.env.FIREWORKS_API_KEY || getApiKey('fireworks');
    if (fireworksKey) {
      this.providers.set(
        'fireworks',
        new OpenAICompatibleProvider({
          name: 'fireworks',
          apiKey: fireworksKey,
          baseURL: 'https://api.fireworks.ai/inference/v1',
          defaultModel: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
        })
      );
      logger.info('Initialized Fireworks AI provider (OpenAI-compatible)');
    }

    // Perplexity (OpenAI-compatible)
    const perplexityKey = process.env.PERPLEXITY_API_KEY || getApiKey('perplexity');
    if (perplexityKey) {
      this.providers.set(
        'perplexity',
        new OpenAICompatibleProvider({
          name: 'perplexity',
          apiKey: perplexityKey,
          baseURL: 'https://api.perplexity.ai',
          defaultModel: 'llama-3.1-sonar-large-128k-online',
        })
      );
      logger.info('Initialized Perplexity provider (OpenAI-compatible)');
    }
  }

  /**
   * Get the names of all initialized providers.
   */
  getAvailableProviders(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * Get the names of providers whose circuit breakers are currently OPEN
   * (i.e. temporarily disabled due to consecutive failures).
   */
  getDisabledProviders(): string[] {
    return this.circuitBreaker.getOpenCircuits();
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
    // Resolve model alias before routing
    if (request.model) {
      request.model = resolveModelAlias(request.model);
    }

    const provider = this.selectProvider(request, taskType);

    // Strip provider prefix after routing (APIs expect model ID without prefix)
    if (request.model) {
      request.model = stripProviderPrefix(request.model);
    }

    // Enforce token budget
    this.enforceTokenBudget(request);

    if (!provider) {
      throw new Error(
        'No LLM provider available. Run `nimbus login` to configure a provider, or set an API key via environment variable (e.g. ANTHROPIC_API_KEY).'
      );
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

    // Persist usage (fire-and-forget)
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
  async *routeStream(request: CompletionRequest, taskType?: string): AsyncIterable<StreamChunk> {
    // Resolve model alias before routing
    if (request.model) {
      request.model = resolveModelAlias(request.model);
    }

    // Capture `this` and config references before yield points.
    // TypeScript strict mode narrows `this` to `never` after yield in
    // async generators, so all post-yield access goes through locals.
    const self = this as LLMRouter;
    const defaultModel = self.config.defaultModel;

    const provider = self.selectProvider(request, taskType);

    // Strip provider prefix after routing (APIs expect model ID without prefix)
    if (request.model) {
      request.model = stripProviderPrefix(request.model);
    }

    // Enforce token budget
    self.enforceTokenBudget(request);

    if (!provider) {
      throw new Error(
        'No LLM provider available. Run `nimbus login` to configure a provider, or set an API key via environment variable (e.g. ANTHROPIC_API_KEY).'
      );
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
        (sum, m) => sum + Math.ceil(getTextContent(m.content).length / 4),
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
   * Route a streaming tool completion request.
   * Text chunks are yielded incrementally; tool calls arrive on the final
   * chunk.  Falls back to non-streaming completeWithTools when the selected
   * provider doesn't support streamWithTools.
   */
  async *routeStreamWithTools(
    request: ToolCompletionRequest,
    taskType?: string
  ): AsyncIterable<StreamChunk> {
    // Resolve model alias before routing
    if (request.model) {
      request.model = resolveModelAlias(request.model);
    }

    const self = this as LLMRouter;
    const defaultModel = self.config.defaultModel;
    const provider = self.selectProvider(request, taskType);

    // Strip provider prefix after routing
    if (request.model) {
      request.model = stripProviderPrefix(request.model);
    }

    self.enforceTokenBudget(request);

    if (!provider) {
      throw new Error(
        'No LLM provider available. Run `nimbus login` to configure a provider, or set an API key via environment variable (e.g. ANTHROPIC_API_KEY).'
      );
    }

    // Use native streaming-with-tools if providers support it
    if (provider.streamWithTools && self.config.fallback.enabled) {
      // Try primary provider first, then fallbacks
      const fallbackProviders = self.config.fallback.providers
        .map(name => self.providers.get(name))
        .filter(Boolean) as LLMProvider[];
      const allProviders = [provider, ...fallbackProviders.filter(p => p !== provider)];

      for (const p of allProviders) {
        if (!p.streamWithTools || !self.circuitBreaker.isAvailable(p.name)) {
          continue;
        }
        try {
          let lastUsage: StreamChunk['usage'] | undefined;
          const bufferedChunks: StreamChunk[] = [];
          for await (const chunk of p.streamWithTools(request)) {
            bufferedChunks.push(chunk);
            if (chunk.usage) {
              lastUsage = chunk.usage;
            }
          }
          self.circuitBreaker.recordSuccess(p.name);
          for (const chunk of bufferedChunks) {
            yield chunk;
          }
          if (lastUsage) {
            const model = request.model || defaultModel;
            const cost = calculateCost(
              p.name,
              model,
              lastUsage.promptTokens,
              lastUsage.completionTokens
            );
            self.persistUsage(lastUsage, model, p.name, cost);
          }
          return;
        } catch (error) {
          self.circuitBreaker.recordFailure(p.name);
          logger.warn(`Provider ${p.name} failed for streamWithTools, trying fallback...`, {
            error,
          });
          continue;
        }
      }
      // If all providers with streamWithTools failed, fall through to non-streaming fallback below
    } else if (provider.streamWithTools) {
      // Fallback disabled — use provider directly
      let lastUsage: StreamChunk['usage'] | undefined;
      for await (const chunk of provider.streamWithTools(request)) {
        if (chunk.usage) {
          lastUsage = chunk.usage;
        }
        yield chunk;
      }
      if (lastUsage) {
        const model = request.model || defaultModel;
        const cost = calculateCost(
          provider.name,
          model,
          lastUsage.promptTokens,
          lastUsage.completionTokens
        );
        self.persistUsage(lastUsage, model, provider.name, cost);
      }
      return;
    }

    // Fallback: non-streaming completeWithTools, yield result as a single chunk
    const response = await provider.completeWithTools(request);
    const cost = self.computeCost(provider.name, response);
    response.cost = cost;
    if (response.usage) {
      self.persistUsage(response.usage, response.model, provider.name, cost);
    }

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
   * Route a tool completion request
   */
  async routeWithTools(request: ToolCompletionRequest, taskType?: string): Promise<LLMResponse> {
    // Resolve model alias before routing
    if (request.model) {
      request.model = resolveModelAlias(request.model);
    }

    const provider = this.selectProvider(request, taskType);

    // Strip provider prefix after routing (APIs expect model ID without prefix)
    if (request.model) {
      request.model = stripProviderPrefix(request.model);
    }

    // Enforce token budget
    this.enforceTokenBudget(request);

    if (!provider) {
      throw new Error(
        'No LLM provider available. Run `nimbus login` to configure a provider, or set an API key via environment variable (e.g. ANTHROPIC_API_KEY).'
      );
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

    // Persist usage (fire-and-forget)
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
          if (!request.model) {
            request.model = cheapModel;
          }
          logger.info(
            `Selected cheap provider ${provider.name} with model ${request.model} for task type: ${taskType}`
          );
          return provider;
        }
      }
      if (this.config.costOptimization.expensiveModelFor.includes(taskType)) {
        const expensiveModel = this.config.costOptimization.expensiveModel;
        const provider = this.getProviderForModel(expensiveModel)
          ? this.providers.get(this.getProviderForModel(expensiveModel)) ||
            this.getExpensiveProvider()
          : this.getExpensiveProvider();
        if (provider) {
          if (!request.model) {
            request.model = expensiveModel;
          }
          logger.info(
            `Selected expensive provider ${provider.name} with model ${request.model} for task type: ${taskType}`
          );
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
   * Check whether an error is a rate-limit (429) or server error (5xx)
   * that should be retried with backoff before falling through.
   */
  private static isRetryableError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const errObj = error as Record<string, unknown>;
      const status =
        (typeof errObj.status === 'number' ? errObj.status : undefined) ??
        (typeof errObj.statusCode === 'number' ? errObj.statusCode : undefined);
      if (status !== undefined && (status === 429 || (status >= 500 && status < 600))) {
        return true;
      }
      const msg = typeof errObj.message === 'string' ? errObj.message : '';
      if (/rate.?limit|429|too many requests|overloaded|503/i.test(msg)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Execute an async function with retry + exponential backoff for rate limits.
   * Retries up to `maxRetries` times with delays of 1s, 2s, 4s, ...
   */
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && LLMRouter.isRetryableError(error)) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          const jitter = Math.random() * 500;
          logger.info(
            `Rate limited — retrying in ${Math.round(delay + jitter)}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await new Promise(resolve => setTimeout(resolve, delay + jitter));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  /**
   * Execute request with fallback logic
   */
  private async executeWithFallback(
    primaryProvider: LLMProvider,
    request: CompletionRequest
  ): Promise<LLMResponse> {
    const fallbackProviders = this.config.fallback.providers
      .map(name => this.providers.get(name))
      .filter(Boolean) as LLMProvider[];

    const allProviders = [primaryProvider, ...fallbackProviders.filter(p => p !== primaryProvider)];

    for (const provider of allProviders) {
      if (!this.circuitBreaker.isAvailable(provider.name)) {
        logger.info(`Skipping ${provider.name} (circuit open)`);
        continue;
      }
      try {
        logger.info(`Attempting request with ${provider.name}`);
        const result = await this.withRetry(() => provider.complete(request));
        this.circuitBreaker.recordSuccess(provider.name);
        return result;
      } catch (error) {
        this.circuitBreaker.recordFailure(provider.name);
        logger.warn(`Provider ${provider.name} failed, trying fallback...`, { error });
        continue;
      }
    }

    throw new Error(
      'All LLM providers failed. Check your API keys and network connection, or try a different provider.'
    );
  }

  /**
   * Execute tool request with fallback logic
   */
  private async executeToolsWithFallback(
    primaryProvider: LLMProvider,
    request: ToolCompletionRequest
  ): Promise<LLMResponse> {
    const fallbackProviders = this.config.fallback.providers
      .map(name => this.providers.get(name))
      .filter(Boolean) as LLMProvider[];

    const allProviders = [primaryProvider, ...fallbackProviders.filter(p => p !== primaryProvider)];

    for (const provider of allProviders) {
      if (!this.circuitBreaker.isAvailable(provider.name)) {
        logger.info(`Skipping ${provider.name} for tool request (circuit open)`);
        continue;
      }
      try {
        logger.info(`Attempting tool request with ${provider.name}`);
        const result = await this.withRetry(() => provider.completeWithTools(request));
        this.circuitBreaker.recordSuccess(provider.name);
        return result;
      } catch (error) {
        this.circuitBreaker.recordFailure(provider.name);
        logger.warn(`Provider ${provider.name} failed for tool request, trying fallback...`, {
          error,
        });
        continue;
      }
    }

    throw new Error(
      'All LLM providers failed for tool request. Check your API keys and network connection, or try a different provider.'
    );
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
      .map(name => self.providers.get(name))
      .filter(Boolean) as LLMProvider[];

    const allProviders = [primaryProvider, ...fallbackProviders.filter(p => p !== primaryProvider)];

    let failedProvider: string | undefined;

    for (const provider of allProviders) {
      if (!self.circuitBreaker.isAvailable(provider.name)) {
        logger.info(`Skipping ${provider.name} for stream (circuit open)`);
        continue;
      }

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
        self.circuitBreaker.recordSuccess(provider.name);
      } catch (error) {
        self.circuitBreaker.recordFailure(provider.name);
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

    throw new Error(
      'All LLM providers failed for streaming request. Check your API keys and network connection, or try a different provider.'
    );
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
   * Get provider name for a specific model.
   * Uses the detectProvider utility for auto-detection.
   */
  private getProviderForModel(model: string): string {
    const detected = detectProvider(model);

    // If the detected provider is registered, use it
    if (this.providers.has(detected)) {
      return detected;
    }

    // For models with "/" prefix that could be OpenRouter
    if (model.includes('/') && this.providers.has('openrouter')) {
      return 'openrouter';
    }

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
   * Persist token usage to the embedded SQLite state layer (fire-and-forget).
   *
   * Inserts a row into the `usage` table with token counts, cost, and metadata.
   * Failures are logged but never propagated -- persistence is non-critical and
   * must not break the LLM request path.
   */
  persistUsage(
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    model?: string,
    provider?: string,
    cost?: CostResult
  ): void {
    try {
      // Lazy import to avoid circular dependency between llm/ and state/
      import('../state/db')
        .then(({ getDb }) => {
          try {
            const db = getDb();
            const id = crypto.randomUUID();
            const metadata = JSON.stringify({
              model: model ?? null,
              provider: provider ?? null,
              prompt_tokens: usage.promptTokens,
              completion_tokens: usage.completionTokens,
            });

            db.run(
              `INSERT INTO usage (id, type, quantity, unit, cost_usd, metadata)
             VALUES (?, ?, ?, ?, ?, ?)`,
              [id, 'llm_call', usage.totalTokens, 'tokens', cost?.costUSD ?? 0, metadata]
            );
          } catch (err) {
            logger.debug('Failed to persist LLM usage to SQLite', { error: err });
          }
        })
        .catch(err => {
          logger.debug('Failed to import state/db for usage persistence', { error: err });
        });
    } catch (err) {
      logger.debug('Unexpected error in persistUsage', { error: err });
    }
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
