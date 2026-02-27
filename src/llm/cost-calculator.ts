/**
 * Per-request cost calculation for LLM providers
 *
 * Pricing data is based on published rates from each provider.
 * Prices are per 1K tokens (input / output).
 * Ollama models are local and free.
 * Unknown models return 0 cost with a warning log.
 */

import { logger } from '../utils';

export interface CostBreakdown {
  /** Input token cost in USD */
  input: number;
  /** Output token cost in USD */
  output: number;
}

export interface CostResult {
  /** Total cost in USD */
  costUSD: number;
  /** Per-component breakdown */
  breakdown: CostBreakdown;
}

/**
 * Pricing entry: [inputPricePer1K, outputPricePer1K] in USD
 */
type PricingEntry = [input: number, output: number];

/**
 * Pricing data by provider and model.
 * Prices are in USD per 1,000 tokens.
 */
const PRICING: Record<string, Record<string, PricingEntry>> = {
  anthropic: {
    // Claude 4 family
    'claude-4-opus': [0.015, 0.075],
    'claude-opus-4-20250514': [0.015, 0.075],
    'claude-4-sonnet': [0.003, 0.015],
    'claude-sonnet-4-20250514': [0.003, 0.015],
    'claude-4-haiku': [0.0008, 0.004],
    'claude-haiku-4-20250514': [0.0008, 0.004],
    // Claude 3.5 family
    'claude-3.5-sonnet': [0.003, 0.015],
    'claude-3-5-sonnet-20241022': [0.003, 0.015],
    'claude-3.5-haiku': [0.0008, 0.004],
    'claude-3-5-haiku-20241022': [0.0008, 0.004],
    // Claude 3 family
    'claude-3-opus': [0.015, 0.075],
    'claude-3-opus-20240229': [0.015, 0.075],
    'claude-3-haiku': [0.00025, 0.00125],
    'claude-3-haiku-20240307': [0.00025, 0.00125],
  },
  openai: {
    'gpt-4': [0.03, 0.06],
    'gpt-4-turbo': [0.01, 0.03],
    'gpt-4-turbo-2024-04-09': [0.01, 0.03],
    'gpt-4o': [0.005, 0.015],
    'gpt-4o-2024-11-20': [0.005, 0.015],
    'gpt-4o-mini': [0.00015, 0.0006],
    'gpt-4o-mini-2024-07-18': [0.00015, 0.0006],
    'gpt-3.5-turbo': [0.0005, 0.0015],
  },
  google: {
    'gemini-pro': [0.00025, 0.0005],
    'gemini-1.5-pro': [0.00125, 0.005],
    'gemini-1.5-flash': [0.000075, 0.0003],
    'gemini-2.0-flash-exp': [0.000075, 0.0003],
  },
  ollama: {
    // All local models are free
  },
  groq: {
    'llama-3.1-70b-versatile': [0.00059, 0.00079],
    'llama-3.1-8b-instant': [0.00005, 0.00008],
    'llama-3.3-70b-versatile': [0.00059, 0.00079],
    'mixtral-8x7b-32768': [0.00024, 0.00024],
    'gemma2-9b-it': [0.0002, 0.0002],
  },
  together: {
    'meta-llama/Llama-3.1-70B-Instruct-Turbo': [0.00088, 0.00088],
    'meta-llama/Llama-3.1-8B-Instruct-Turbo': [0.00018, 0.00018],
    'meta-llama/Llama-3.3-70B-Instruct-Turbo': [0.00088, 0.00088],
    'mistralai/Mixtral-8x22B-Instruct-v0.1': [0.0012, 0.0012],
    'Qwen/Qwen2.5-72B-Instruct-Turbo': [0.0012, 0.0012],
  },
  deepseek: {
    'deepseek-chat': [0.00014, 0.00028],
    'deepseek-coder': [0.00014, 0.00028],
    'deepseek-reasoner': [0.00055, 0.00219],
  },
  fireworks: {
    'accounts/fireworks/models/llama-v3p1-70b-instruct': [0.0009, 0.0009],
    'accounts/fireworks/models/llama-v3p1-8b-instruct': [0.0002, 0.0002],
    'accounts/fireworks/models/mixtral-8x22b-instruct': [0.0009, 0.0009],
    'accounts/fireworks/models/qwen2p5-72b-instruct': [0.0009, 0.0009],
  },
  perplexity: {
    'llama-3.1-sonar-large-128k-online': [0.001, 0.001],
    'llama-3.1-sonar-small-128k-online': [0.0002, 0.0002],
    'llama-3.1-sonar-huge-128k-online': [0.005, 0.005],
  },
  openrouter: {
    // OpenRouter models use provider/model format; prices approximate the underlying provider
    'anthropic/claude-sonnet-4-20250514': [0.003, 0.015],
    'anthropic/claude-haiku-4-20250514': [0.0008, 0.004],
    'anthropic/claude-opus-4-20250514': [0.015, 0.075],
    'anthropic/claude-3.5-sonnet': [0.003, 0.015],
    'openai/gpt-4o': [0.005, 0.015],
    'openai/gpt-4o-mini': [0.00015, 0.0006],
    'google/gemini-2.0-flash-exp': [0.000075, 0.0003],
    'meta-llama/llama-3.1-405b-instruct': [0.003, 0.003],
    'meta-llama/llama-3.1-70b-instruct': [0.0008, 0.0008],
    'mistralai/mixtral-8x22b-instruct': [0.0009, 0.0009],
  },
};

/**
 * Calculate the cost for a single LLM request.
 *
 * @param provider  - Provider name (e.g. "anthropic", "openai", "google", "ollama", "openrouter")
 * @param model     - Model identifier (e.g. "claude-sonnet-4-20250514", "gpt-4o")
 * @param inputTokens  - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @returns Cost result with total USD cost and per-component breakdown
 */
export function calculateCost(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): CostResult {
  // Ollama is always free
  if (provider === 'ollama') {
    return { costUSD: 0, breakdown: { input: 0, output: 0 } };
  }

  const providerPricing = PRICING[provider];
  if (!providerPricing) {
    logger.warn(`No pricing data for provider "${provider}", returning zero cost`);
    return { costUSD: 0, breakdown: { input: 0, output: 0 } };
  }

  const entry = providerPricing[model];
  if (!entry) {
    logger.warn(
      `No pricing data for model "${model}" on provider "${provider}", returning zero cost`
    );
    return { costUSD: 0, breakdown: { input: 0, output: 0 } };
  }

  const [inputPricePer1K, outputPricePer1K] = entry;
  const inputCost = (inputTokens / 1000) * inputPricePer1K;
  const outputCost = (outputTokens / 1000) * outputPricePer1K;

  return {
    costUSD: inputCost + outputCost,
    breakdown: {
      input: inputCost,
      output: outputCost,
    },
  };
}

/**
 * Get available pricing data (useful for debugging / admin endpoints).
 */
export function getPricingData(): Record<string, Record<string, PricingEntry>> {
  return PRICING;
}
