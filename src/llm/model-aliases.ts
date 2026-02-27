/**
 * Model alias resolution
 * Maps short names to full model identifiers
 */

const MODEL_ALIASES: Record<string, string> = {
  // Anthropic shortcuts
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-4-20250514',
  opus: 'claude-opus-4-20250514',
  claude: 'claude-sonnet-4-20250514',

  // OpenAI shortcuts
  gpt4: 'gpt-4o',
  gpt4o: 'gpt-4o',
  gpt4mini: 'gpt-4o-mini',
  '4o': 'gpt-4o',
  '4o-mini': 'gpt-4o-mini',

  // Google shortcuts
  gemini: 'gemini-2.0-flash-exp',
  'gemini-flash': 'gemini-2.0-flash-exp',
  'gemini-pro': 'gemini-1.5-pro',

  // Groq shortcuts
  groq: 'llama-3.1-70b-versatile',
  'groq-fast': 'llama-3.1-8b-instant',

  // Together shortcuts
  together: 'meta-llama/Llama-3.1-70B-Instruct-Turbo',
  'together-llama': 'meta-llama/Llama-3.1-70B-Instruct-Turbo',

  // DeepSeek shortcuts
  deepseek: 'deepseek-chat',
  'deepseek-coder': 'deepseek-coder',
  'deepseek-r1': 'deepseek-reasoner',

  // Fireworks shortcuts
  fireworks: 'accounts/fireworks/models/llama-v3p1-70b-instruct',

  // Perplexity shortcuts
  perplexity: 'llama-3.1-sonar-large-128k-online',
  pplx: 'llama-3.1-sonar-large-128k-online',
  sonar: 'llama-3.1-sonar-large-128k-online',

  // Local shortcuts
  llama: 'llama3.2',
  mistral: 'mistral',
  codellama: 'codellama',
};

/**
 * Resolve a model alias to its full model identifier.
 * Returns the original string if no alias match is found.
 *
 * @param modelOrAlias - Short alias or full model identifier
 * @returns Resolved full model identifier
 */
export function resolveModelAlias(modelOrAlias: string): string {
  return MODEL_ALIASES[modelOrAlias.toLowerCase()] || modelOrAlias;
}

/**
 * Strip a "provider/" prefix from a model string.
 *
 * Model strings can be specified as "provider/model" (e.g., "anthropic/claude-sonnet-4-20250514").
 * The provider prefix is used for routing but must be stripped before sending to the
 * provider's API, which expects just the model ID (e.g., "claude-sonnet-4-20250514").
 *
 * Preserves multi-segment model IDs used by OpenRouter (e.g., "meta-llama/llama-3.1-405b")
 * and Fireworks (e.g., "accounts/fireworks/models/llama-v3p3-70b-instruct") by only
 * stripping prefixes that match known provider names.
 *
 * @param model - Model string, optionally with provider prefix
 * @returns Model string with provider prefix removed
 */
export function stripProviderPrefix(model: string): string {
  if (!model.includes('/')) {
    return model;
  }

  const slashIndex = model.indexOf('/');
  const prefix = model.slice(0, slashIndex).toLowerCase();

  // Only strip if the prefix is a known provider name.
  // This preserves OpenRouter-style "meta-llama/llama-3.1-405b" and
  // Fireworks-style "accounts/fireworks/models/..." paths.
  const KNOWN_PROVIDERS = new Set([
    'anthropic',
    'openai',
    'google',
    'ollama',
    'groq',
    'together',
    'deepseek',
    'fireworks',
    'perplexity',
    'bedrock',
  ]);

  if (KNOWN_PROVIDERS.has(prefix)) {
    return model.slice(slashIndex + 1);
  }

  return model;
}

/**
 * Get a copy of all registered model aliases.
 *
 * @returns Record mapping alias names to full model identifiers
 */
export function getAliases(): Record<string, string> {
  return { ...MODEL_ALIASES };
}
