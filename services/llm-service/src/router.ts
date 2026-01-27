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
} from './providers';

export interface RouterConfig {
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
        ],
        expensiveModelFor: config?.costOptimization?.expensiveModelFor || [
          'code_generation',
          'complex_reasoning',
          'planning',
        ],
      },
      fallback: {
        enabled: config?.fallback?.enabled ?? process.env.ENABLE_FALLBACK === 'true',
        providers:
          config?.fallback?.providers ||
          (process.env.FALLBACK_PROVIDERS?.split(',') ?? ['anthropic', 'openai', 'google']),
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

    // Ollama (always available for local models)
    this.providers.set('ollama', new OllamaProvider());
    logger.info('Initialized Ollama provider');

    if (this.providers.size === 0) {
      logger.warn('No LLM providers initialized. Please set API keys in environment.');
    }
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

    if (!provider) {
      throw new Error('No LLM provider available');
    }

    if (this.config.fallback.enabled) {
      return this.executeWithFallback(provider, request);
    }

    return provider.complete(request);
  }

  /**
   * Route a streaming completion request
   */
  async *routeStream(
    request: CompletionRequest,
    taskType?: string
  ): AsyncIterable<StreamChunk> {
    const provider = this.selectProvider(request, taskType);

    if (!provider) {
      throw new Error('No LLM provider available');
    }

    yield* provider.stream(request);
  }

  /**
   * Route a tool completion request
   */
  async routeWithTools(request: ToolCompletionRequest, taskType?: string): Promise<LLMResponse> {
    const provider = this.selectProvider(request, taskType);

    if (!provider) {
      throw new Error('No LLM provider available');
    }

    if (this.config.fallback.enabled) {
      return this.executeToolsWithFallback(provider, request);
    }

    return provider.completeWithTools(request);
  }

  /**
   * Get list of available models across all providers
   */
  getAvailableModels(): Record<string, string[]> {
    const models: Record<string, string[]> = {};

    if (this.providers.has('anthropic')) {
      models.anthropic = [
        'claude-sonnet-4-20250514',
        'claude-haiku-4-20250514',
        'claude-opus-4-20250514',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
      ];
    }

    if (this.providers.has('openai')) {
      models.openai = [
        'gpt-4o',
        'gpt-4o-2024-11-20',
        'gpt-4o-mini',
        'gpt-4o-mini-2024-07-18',
        'gpt-4-turbo',
        'gpt-4',
      ];
    }

    if (this.providers.has('google')) {
      models.google = ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    }

    if (this.providers.has('ollama')) {
      models.ollama = ['llama3.2', 'llama3.2:70b', 'codellama', 'mistral', 'mixtral', 'phi'];
    }

    return models;
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
        const provider = this.getCheapProvider();
        if (provider) {
          logger.info(`Selected cheap provider ${provider.name} for task type: ${taskType}`);
          return provider;
        }
      }
      if (this.config.costOptimization.expensiveModelFor.includes(taskType)) {
        const provider = this.getExpensiveProvider();
        if (provider) {
          logger.info(`Selected expensive provider ${provider.name} for task type: ${taskType}`);
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
   * Get provider name for a specific model
   */
  private getProviderForModel(model: string): string {
    if (model.startsWith('claude')) return 'anthropic';
    if (model.startsWith('gpt')) return 'openai';
    if (model.startsWith('gemini')) return 'google';
    if (model.includes('/') || model.startsWith('llama') || model.startsWith('mistral'))
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
}
