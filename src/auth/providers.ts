/**
 * Provider Registry & Validation
 * Static metadata and validation functions for LLM providers
 */

import type { LLMProviderName, ProviderInfo, ProviderValidationResult } from './types';

/**
 * Registry of all supported LLM providers
 */
export const PROVIDER_REGISTRY: Record<LLMProviderName, ProviderInfo> = {
  anthropic: {
    name: 'anthropic',
    displayName: 'Anthropic (Claude)',
    description: 'Claude Sonnet 4, Opus 4, Haiku 4',
    envVarName: 'ANTHROPIC_API_KEY',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    requiresApiKey: true,
    models: [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', isDefault: true },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
      { id: 'claude-haiku-4-20250514', name: 'Claude Haiku 4' },
    ],
  },
  openai: {
    name: 'openai',
    displayName: 'OpenAI (GPT)',
    description: 'GPT-4o, GPT-4o-mini',
    envVarName: 'OPENAI_API_KEY',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    requiresApiKey: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', isDefault: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
    ],
  },
  google: {
    name: 'google',
    displayName: 'Google (Gemini)',
    description: 'Gemini 2.0 Flash, Gemini 1.5 Pro',
    envVarName: 'GOOGLE_API_KEY',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    requiresApiKey: true,
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', isDefault: true },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    ],
  },
  openrouter: {
    name: 'openrouter',
    displayName: 'OpenRouter',
    description: 'Access multiple models via OpenRouter',
    envVarName: 'OPENROUTER_API_KEY',
    apiKeyUrl: 'https://openrouter.ai/keys',
    requiresApiKey: true,
    models: [
      {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4 (via OpenRouter)',
        isDefault: true,
      },
      { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)' },
      { id: 'google/gemini-pro', name: 'Gemini Pro (via OpenRouter)' },
      { id: 'meta-llama/llama-3.1-405b-instruct', name: 'Llama 3.1 405B' },
    ],
  },
  ollama: {
    name: 'ollama',
    displayName: 'Ollama (Local)',
    description: 'Local models: Llama 3.2, CodeLlama, Mistral',
    requiresApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: 'http://localhost:11434',
    models: [
      { id: 'llama3.2', name: 'Llama 3.2', isDefault: true },
      { id: 'codellama', name: 'CodeLlama' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'deepseek-coder', name: 'DeepSeek Coder' },
    ],
  },
  groq: {
    name: 'groq',
    displayName: 'Groq',
    description: 'Ultra-fast inference: Llama 3, Mixtral',
    envVarName: 'GROQ_API_KEY',
    apiKeyUrl: 'https://console.groq.com/keys',
    requiresApiKey: true,
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', isDefault: true },
      { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant' },
      { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B' },
    ],
  },
  together: {
    name: 'together',
    displayName: 'Together AI',
    description: 'Open-source models: Llama, CodeLlama, Mistral',
    envVarName: 'TOGETHER_API_KEY',
    apiKeyUrl: 'https://api.together.xyz/settings/api-keys',
    requiresApiKey: true,
    models: [
      {
        id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        name: 'Llama 3.3 70B Turbo',
        isDefault: true,
      },
      { id: 'meta-llama/Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 8B Turbo' },
      { id: 'mistralai/Mixtral-8x7B-Instruct-v0.1', name: 'Mixtral 8x7B' },
    ],
  },
  deepseek: {
    name: 'deepseek',
    displayName: 'DeepSeek',
    description: 'DeepSeek V3, DeepSeek Coder',
    envVarName: 'DEEPSEEK_API_KEY',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
    requiresApiKey: true,
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', isDefault: true },
      { id: 'deepseek-coder', name: 'DeepSeek Coder' },
    ],
  },
  fireworks: {
    name: 'fireworks',
    displayName: 'Fireworks AI',
    description: 'Fast inference: Llama, Mixtral, FireFunction',
    envVarName: 'FIREWORKS_API_KEY',
    apiKeyUrl: 'https://fireworks.ai/api-keys',
    requiresApiKey: true,
    models: [
      {
        id: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        name: 'Llama 3.3 70B',
        isDefault: true,
      },
      { id: 'accounts/fireworks/models/mixtral-8x7b-instruct', name: 'Mixtral 8x7B' },
    ],
  },
  perplexity: {
    name: 'perplexity',
    displayName: 'Perplexity',
    description: 'Search-augmented AI: Sonar models',
    envVarName: 'PERPLEXITY_API_KEY',
    apiKeyUrl: 'https://www.perplexity.ai/settings/api',
    requiresApiKey: true,
    models: [
      { id: 'sonar-pro', name: 'Sonar Pro', isDefault: true },
      { id: 'sonar', name: 'Sonar' },
    ],
  },
  bedrock: {
    name: 'bedrock',
    displayName: 'AWS Bedrock',
    description: 'Claude via AWS Bedrock (uses IAM credentials)',
    envVarName: 'AWS_ACCESS_KEY_ID',
    requiresApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: 'us-east-1',
    models: [
      {
        id: 'anthropic.claude-sonnet-4-20250514-v1:0',
        name: 'Claude Sonnet 4 (Bedrock)',
        isDefault: true,
      },
      { id: 'anthropic.claude-haiku-4-20250514-v1:0', name: 'Claude Haiku 4 (Bedrock)' },
    ],
  },
};

/**
 * Get provider info from registry
 */
export function getProviderInfo(name: LLMProviderName): ProviderInfo {
  return PROVIDER_REGISTRY[name];
}

/**
 * Get all provider names
 */
export function getProviderNames(): LLMProviderName[] {
  return Object.keys(PROVIDER_REGISTRY) as LLMProviderName[];
}

/**
 * Get the default model for a provider
 */
export function getDefaultModel(name: LLMProviderName): string {
  const info = PROVIDER_REGISTRY[name];
  const defaultModel = info.models.find(m => m.isDefault);
  return defaultModel?.id || info.models[0].id;
}

/**
 * Validate a provider's API key or configuration
 * Makes lightweight test API calls to verify credentials
 */
export async function validateProviderApiKey(
  provider: LLMProviderName,
  apiKey?: string,
  baseUrl?: string
): Promise<ProviderValidationResult> {
  try {
    switch (provider) {
      case 'anthropic':
        return await validateAnthropic(apiKey);
      case 'openai':
        return await validateOpenAI(apiKey);
      case 'google':
        return await validateGoogle(apiKey);
      case 'openrouter':
        return await validateOpenRouter(apiKey);
      case 'ollama':
        return await validateOllama(baseUrl);
      case 'groq':
        return await validateOpenAICompatible(apiKey, 'https://api.groq.com/openai/v1/models');
      case 'together':
        return await validateOpenAICompatible(apiKey, 'https://api.together.xyz/v1/models');
      case 'deepseek':
        return await validateOpenAICompatible(apiKey, 'https://api.deepseek.com/v1/models');
      case 'fireworks':
        return await validateOpenAICompatible(
          apiKey,
          'https://api.fireworks.ai/inference/v1/models'
        );
      case 'perplexity':
        return await validateOpenAICompatible(apiKey, 'https://api.perplexity.ai/models');
      case 'bedrock':
        return await validateBedrock(baseUrl);
      default:
        return { valid: false, error: `Unknown provider: ${provider}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { valid: false, error: message };
  }
}

/**
 * Validate Anthropic API key
 * Uses POST /v1/messages with max_tokens: 1
 */
async function validateAnthropic(apiKey?: string): Promise<ProviderValidationResult> {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250514',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }],
    }),
  });

  if (response.ok) {
    return { valid: true };
  }

  // Check for specific error types
  if (response.status === 401) {
    return { valid: false, error: 'Invalid API key' };
  }

  if (response.status === 400) {
    // 400 errors with valid auth often mean the key is valid but request is malformed
    // For validation purposes, a 400 with auth working is acceptable
    const body = (await response.json().catch(() => ({}))) as { error?: { type?: string } };
    if (body.error?.type === 'invalid_request_error') {
      // Key is valid, just request was bad
      return { valid: true };
    }
  }

  const errorText = await response.text().catch(() => 'Unknown error');
  return { valid: false, error: `API error: ${response.status} - ${errorText}` };
}

/**
 * Validate OpenAI API key
 * Uses GET /v1/models
 */
async function validateOpenAI(apiKey?: string): Promise<ProviderValidationResult> {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }

  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.ok) {
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const models = data.data?.map(m => m.id) || [];
    return { valid: true, models };
  }

  if (response.status === 401) {
    return { valid: false, error: 'Invalid API key' };
  }

  const errorText = await response.text().catch(() => 'Unknown error');
  return { valid: false, error: `API error: ${response.status} - ${errorText}` };
}

/**
 * Validate Google API key
 * Uses GET /v1/models?key=<key>
 */
async function validateGoogle(apiKey?: string): Promise<ProviderValidationResult> {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'GET',
    }
  );

  if (response.ok) {
    const data = (await response.json()) as { models?: Array<{ name: string }> };
    const models = data.models?.map(m => m.name) || [];
    return { valid: true, models };
  }

  if (response.status === 400 || response.status === 403) {
    return { valid: false, error: 'Invalid API key' };
  }

  const errorText = await response.text().catch(() => 'Unknown error');
  return { valid: false, error: `API error: ${response.status} - ${errorText}` };
}

/**
 * Validate OpenRouter API key
 * Uses GET /api/v1/models with Bearer auth
 */
async function validateOpenRouter(apiKey?: string): Promise<ProviderValidationResult> {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }

  const response = await fetch('https://openrouter.ai/api/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.ok) {
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const models = data.data?.map(m => m.id) || [];
    return { valid: true, models };
  }

  if (response.status === 401) {
    return { valid: false, error: 'Invalid API key' };
  }

  const errorText = await response.text().catch(() => 'Unknown error');
  return { valid: false, error: `API error: ${response.status} - ${errorText}` };
}

/**
 * Validate OpenAI-compatible provider API key
 * Uses GET /v1/models (or equivalent) with Bearer auth
 */
async function validateOpenAICompatible(
  apiKey?: string,
  modelsUrl?: string
): Promise<ProviderValidationResult> {
  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }

  const url = modelsUrl || 'https://api.openai.com/v1/models';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.ok) {
    return { valid: true };
  }

  if (response.status === 401 || response.status === 403) {
    return { valid: false, error: 'Invalid API key' };
  }

  const errorText = await response.text().catch(() => 'Unknown error');
  return { valid: false, error: `API error: ${response.status} - ${errorText}` };
}

/**
 * Validate Ollama connection
 * Uses GET <baseUrl>/api/tags (no key needed)
 */
async function validateOllama(baseUrl?: string): Promise<ProviderValidationResult> {
  const url = baseUrl || 'http://localhost:11434';

  try {
    const response = await fetch(`${url}/api/tags`, {
      method: 'GET',
    });

    if (response.ok) {
      const data = (await response.json()) as { models?: Array<{ name: string }> };
      const models = data.models?.map(m => m.name) || [];
      return { valid: true, models };
    }

    const errorText = await response.text().catch(() => 'Unknown error');
    return { valid: false, error: `Ollama API error: ${response.status} - ${errorText}` };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        valid: false,
        error: `Cannot connect to Ollama at ${url}. Is Ollama running?`,
      };
    }
    throw error;
  }
}

/**
 * Validate AWS Bedrock credentials
 * Checks for AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars,
 * or AWS credentials file (~/.aws/credentials).
 */
async function validateBedrock(_region?: string): Promise<ProviderValidationResult> {
  const hasAccessKey = !!process.env.AWS_ACCESS_KEY_ID;
  const hasSecretKey = !!process.env.AWS_SECRET_ACCESS_KEY;
  const hasProfile = !!process.env.AWS_PROFILE;

  // Check for AWS credentials file
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
  const hasCredentialsFile = fs.existsSync(credentialsPath);

  if (hasAccessKey && hasSecretKey) {
    return { valid: true };
  }

  if (hasProfile || hasCredentialsFile) {
    return { valid: true };
  }

  return {
    valid: false,
    error:
      'AWS credentials not found. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or configure ~/.aws/credentials.',
  };
}
