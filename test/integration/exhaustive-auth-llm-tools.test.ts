/**
 * Exhaustive Auth / LLM / Tools Test Suite
 *
 * Tests every documented feature in:
 *   - src/auth/  (AuthStore, types, providers, oauth, connect-github)
 *   - src/llm/   (LLMRouter, cost-calculator, circuit-breaker, model-aliases, provider-registry, types)
 *   - src/tools/ (schemas/index, schemas/types, schemas/converter, spawn-exec, file-ops, git-ops,
 *                 terraform-ops, k8s-ops, helm-ops)
 *
 * Pattern:
 *   - Direct imports for things that can be imported (no side-effectful env deps).
 *   - readFileSync source-inspection for things that cannot be safely instantiated in tests.
 *   - tmpdir isolation for any file I/O; cleaned up in afterEach.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Source helpers
// ---------------------------------------------------------------------------

function src(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), 'utf-8');
}

// ---------------------------------------------------------------------------
// Temp-dir isolation helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nimbus-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ===========================================================================
// AUTH SYSTEM — src/auth/
// ===========================================================================

// ---------------------------------------------------------------------------
// A1: AuthStore — basic lifecycle
// ---------------------------------------------------------------------------

describe('AuthStore — basic lifecycle', () => {
  it('instantiates with a custom path without throwing', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    expect(store).toBeTruthy();
  });

  it('load() creates an empty auth file when none exists', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    const authFile = store.load();
    expect(authFile).toBeTruthy();
    expect(authFile.version).toBe(1);
    expect(authFile.providers).toEqual({});
    expect(authFile.identity).toEqual({});
  });

  it('save() writes the file to disk', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const authPath = path.join(tmpDir, 'auth.json');
    const store = new AuthStore(authPath);
    store.load(); // initialise
    store.save();
    expect(fs.existsSync(authPath)).toBe(true);
  });

  it('save() sets 0600 file permissions', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const authPath = path.join(tmpDir, 'auth.json');
    const store = new AuthStore(authPath);
    store.load();
    store.save();
    const stat = fs.statSync(authPath);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('reload() discards cached content and re-reads from disk', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const authPath = path.join(tmpDir, 'auth.json');
    const store = new AuthStore(authPath);
    store.load();
    store.save();
    const reloaded = store.reload();
    expect(reloaded).toBeTruthy();
    expect(reloaded.version).toBe(1);
  });

  it('clear() removes the auth file from disk', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const authPath = path.join(tmpDir, 'auth.json');
    const store = new AuthStore(authPath);
    store.load();
    store.save();
    expect(fs.existsSync(authPath)).toBe(true);
    store.clear();
    expect(fs.existsSync(authPath)).toBe(false);
  });

  it('exists() returns false when no providers configured', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    expect(store.exists()).toBe(false);
  });

  it('exists() returns true after setting a provider', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setProvider('anthropic', { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514' });
    expect(store.exists()).toBe(true);
  });

  it('stored file is plain JSON — no enc: prefix', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const authPath = path.join(tmpDir, 'auth.json');
    const store = new AuthStore(authPath);
    store.setProvider('anthropic', { apiKey: 'sk-ant-test', model: 'claude-sonnet-4-20250514' });
    const raw = fs.readFileSync(authPath, 'utf-8');
    expect(raw).not.toContain('enc:');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('getAuthPath() returns the configured path', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const authPath = path.join(tmpDir, 'auth.json');
    const store = new AuthStore(authPath);
    expect(store.getAuthPath()).toBe(authPath);
  });
});

// ---------------------------------------------------------------------------
// A2: AuthStore — maskApiKey
// ---------------------------------------------------------------------------

describe('AuthStore.maskApiKey()', () => {
  it('returns "(not set)" for undefined', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    expect(AuthStore.maskApiKey(undefined)).toBe('(not set)');
  });

  it('returns "****" for keys of 8 chars or fewer', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    expect(AuthStore.maskApiKey('short')).toBe('****');
  });

  it('masks a long key as prefix...suffix', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const masked = AuthStore.maskApiKey('sk-ant-api-1234567890abcdef');
    expect(masked).toContain('...');
    expect(masked.startsWith('sk-ant-')).toBe(true);
  });

  it('suffix is last 4 chars of the original key', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const key = 'sk-ant-api-xyz-1234';
    const masked = AuthStore.maskApiKey(key);
    expect(masked.endsWith('1234')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A3: AuthStore — provider round-trips
// ---------------------------------------------------------------------------

describe('AuthStore — setProvider/getProvider/removeProvider/getProviders', () => {
  it('setProvider then getProvider returns the credential', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setProvider('openai', { apiKey: 'sk-openai-test', model: 'gpt-4o' });
    const cred = store.getProvider('openai');
    expect(cred).toBeTruthy();
    expect(cred!.apiKey).toBe('sk-openai-test');
    expect(cred!.model).toBe('gpt-4o');
  });

  it('getProviders returns all stored providers', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setProvider('anthropic', { apiKey: 'ant-key', model: 'claude-sonnet-4-20250514' });
    store.setProvider('openai', { apiKey: 'oai-key', model: 'gpt-4o' });
    const providers = store.getProviders();
    expect(Object.keys(providers)).toContain('anthropic');
    expect(Object.keys(providers)).toContain('openai');
  });

  it('removeProvider removes the provider', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setProvider('groq', { apiKey: 'groq-key', model: 'llama-3.1-70b-versatile' });
    store.removeProvider('groq');
    expect(store.getProvider('groq')).toBeUndefined();
  });

  it('removeProvider updates defaultProvider if it was the removed one', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setProvider('anthropic', { apiKey: 'ant-key', model: 'claude-sonnet-4-20250514' });
    store.setProvider('openai', { apiKey: 'oai-key', model: 'gpt-4o' });
    // First provider becomes default automatically
    store.removeProvider('anthropic');
    // After removal, default should shift to openai (or undefined)
    const def = store.getDefaultProvider();
    expect(def === 'openai' || def === undefined).toBe(true);
  });

  it('first provider added becomes the default provider automatically', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setProvider('google', { apiKey: 'google-key', model: 'gemini-2.0-flash' });
    expect(store.getDefaultProvider()).toBe('google');
  });
});

// ---------------------------------------------------------------------------
// A4: AuthStore — identity round-trips
// ---------------------------------------------------------------------------

describe('AuthStore — setIdentity/getIdentity/clearIdentity', () => {
  it('setIdentity then getIdentity returns the identity', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    const identity = {
      username: 'testuser',
      name: 'Test User',
      email: 'test@example.com',
      avatarUrl: null,
      accessToken: 'gho_testtoken',
      authenticatedAt: new Date().toISOString(),
    };
    store.setIdentity(identity);
    const fetched = store.getIdentity();
    expect(fetched).toBeTruthy();
    expect(fetched!.username).toBe('testuser');
    expect(fetched!.avatarUrl).toBeNull();
  });

  it('GitHubIdentity supports avatarUrl: null', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setIdentity({
      username: 'u',
      name: null,
      email: null,
      avatarUrl: null,
      accessToken: 'tok',
      authenticatedAt: new Date().toISOString(),
    });
    const id = store.getIdentity();
    expect(id!.avatarUrl).toBeNull();
  });

  it('clearIdentity removes the stored identity', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setIdentity({
      username: 'u',
      name: null,
      email: null,
      avatarUrl: null,
      accessToken: 'tok',
      authenticatedAt: new Date().toISOString(),
    });
    store.clearIdentity();
    expect(store.getIdentity()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A5: AuthStore — getApiKey env var fallbacks for all 9 providers
// ---------------------------------------------------------------------------

describe('AuthStore.getApiKey() — env var fallbacks', () => {
  const providerEnvMap: Array<[string, string]> = [
    ['anthropic', 'ANTHROPIC_API_KEY'],
    ['openai', 'OPENAI_API_KEY'],
    ['google', 'GOOGLE_API_KEY'],
    ['openrouter', 'OPENROUTER_API_KEY'],
    ['groq', 'GROQ_API_KEY'],
    ['together', 'TOGETHER_API_KEY'],
    ['deepseek', 'DEEPSEEK_API_KEY'],
    ['fireworks', 'FIREWORKS_API_KEY'],
    ['perplexity', 'PERPLEXITY_API_KEY'],
  ];

  for (const [provider, envVar] of providerEnvMap) {
    it(`${provider} falls back to ${envVar}`, async () => {
      const { AuthStore } = await import('../../src/auth/store');
      const store = new AuthStore(path.join(tmpDir, `auth-${provider}.json`));
      const origVal = process.env[envVar];
      process.env[envVar] = `test-key-for-${provider}`;
      try {
        const key = store.getApiKey(provider as any);
        expect(key).toBe(`test-key-for-${provider}`);
      } finally {
        if (origVal === undefined) {
          delete process.env[envVar];
        } else {
          process.env[envVar] = origVal;
        }
      }
    });
  }

  it('ollama returns undefined (no API key needed)', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    // ollama has no env var fallback in envVarMap
    const orig = process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_API_KEY;
    const key = store.getApiKey('ollama' as any);
    expect(key).toBeUndefined();
    if (orig !== undefined) {process.env.OLLAMA_API_KEY = orig;}
  });
});

// ---------------------------------------------------------------------------
// A6: AuthStore — setDefaultProvider / getDefaultProvider
// ---------------------------------------------------------------------------

describe('AuthStore — setDefaultProvider/getDefaultProvider', () => {
  it('setDefaultProvider throws when provider not configured', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    expect(() => store.setDefaultProvider('openai')).toThrow();
  });

  it('setDefaultProvider succeeds when provider is configured', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setProvider('anthropic', { apiKey: 'ant-key', model: 'claude-sonnet-4-20250514' });
    store.setProvider('openai', { apiKey: 'oai-key', model: 'gpt-4o' });
    store.setDefaultProvider('openai');
    expect(store.getDefaultProvider()).toBe('openai');
  });
});

// ---------------------------------------------------------------------------
// A7: AuthStore — getStatus
// ---------------------------------------------------------------------------

describe('AuthStore.getStatus()', () => {
  it('returns isConfigured: false when no providers', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    const status = store.getStatus();
    expect(status.isConfigured).toBe(false);
    expect(status.hasProviders).toBe(false);
    expect(status.hasIdentity).toBe(false);
  });

  it('returns isConfigured: true after adding a provider', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setProvider('anthropic', { apiKey: 'ant-key', model: 'claude-sonnet-4-20250514' });
    const status = store.getStatus();
    expect(status.isConfigured).toBe(true);
    expect(status.hasProviders).toBe(true);
  });

  it('returns hasIdentity: true after setting GitHub identity', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setIdentity({
      username: 'octocat',
      name: null,
      email: null,
      avatarUrl: null,
      accessToken: 'tok',
      authenticatedAt: new Date().toISOString(),
    });
    const status = store.getStatus();
    expect(status.hasIdentity).toBe(true);
    expect(status.identity?.username).toBe('octocat');
  });

  it('providers array in status includes configured providers', async () => {
    const { AuthStore } = await import('../../src/auth/store');
    const store = new AuthStore(path.join(tmpDir, 'auth.json'));
    store.setProvider('anthropic', { apiKey: 'key', model: 'claude-sonnet-4-20250514' });
    const status = store.getStatus();
    expect(status.providers.length).toBeGreaterThanOrEqual(1);
    expect(status.providers[0].name).toBe('anthropic');
  });
});

// ---------------------------------------------------------------------------
// A8: AuthStore source — legacyDecrypt migration path
// ---------------------------------------------------------------------------

describe('AuthStore source — legacy migration', () => {
  const STORE_SRC = src('src/auth/store.ts');

  it('source contains _legacyDecrypt function', () => {
    expect(STORE_SRC).toContain('_legacyDecrypt');
  });

  it('source contains ENC_PREFIX constant', () => {
    expect(STORE_SRC).toContain('enc:');
  });

  it('source contains migrateEncryptedFields function', () => {
    expect(STORE_SRC).toContain('migrateEncryptedFields');
  });

  it('source contains legacyDecrypt migration comment', () => {
    expect(STORE_SRC).toContain('one-time migration');
  });
});

// ---------------------------------------------------------------------------
// A9: auth/types.ts — all interfaces exported
// ---------------------------------------------------------------------------

describe('auth/types.ts — exported interfaces', () => {
  const TYPES_SRC = src('src/auth/types.ts');

  it('exports AuthFile interface', () => {
    expect(TYPES_SRC).toContain('export interface AuthFile');
  });

  it('exports LLMProviderCredential interface', () => {
    expect(TYPES_SRC).toContain('export interface LLMProviderCredential');
  });

  it('exports GitHubIdentity interface', () => {
    expect(TYPES_SRC).toContain('export interface GitHubIdentity');
  });

  it('exports AuthStatus interface', () => {
    expect(TYPES_SRC).toContain('export interface AuthStatus');
  });

  it('GitHubIdentity includes avatarUrl field', () => {
    expect(TYPES_SRC).toContain('avatarUrl');
  });

  it('LLMProviderName union includes all 9 env-var providers plus ollama and bedrock', () => {
    expect(TYPES_SRC).toContain("'anthropic'");
    expect(TYPES_SRC).toContain("'openai'");
    expect(TYPES_SRC).toContain("'google'");
    expect(TYPES_SRC).toContain("'openrouter'");
    expect(TYPES_SRC).toContain("'groq'");
    expect(TYPES_SRC).toContain("'together'");
    expect(TYPES_SRC).toContain("'deepseek'");
    expect(TYPES_SRC).toContain("'fireworks'");
    expect(TYPES_SRC).toContain("'perplexity'");
    expect(TYPES_SRC).toContain("'ollama'");
    expect(TYPES_SRC).toContain("'bedrock'");
  });
});

// ---------------------------------------------------------------------------
// A10: auth/providers.ts — getProviderInfo, getProviderNames, getDefaultModel
// ---------------------------------------------------------------------------

describe('auth/providers.ts — exported functions', () => {
  it('getProviderInfo returns provider metadata', async () => {
    const { getProviderInfo } = await import('../../src/auth/providers');
    const info = getProviderInfo('anthropic');
    expect(info).toBeTruthy();
    expect(info.name).toBe('anthropic');
    expect(info.displayName).toContain('Anthropic');
    expect(info.models.length).toBeGreaterThan(0);
  });

  it('getProviderNames returns all provider names', async () => {
    const { getProviderNames } = await import('../../src/auth/providers');
    const names = getProviderNames();
    expect(names).toContain('anthropic');
    expect(names).toContain('openai');
    expect(names).toContain('google');
    expect(names).toContain('groq');
    expect(names.length).toBeGreaterThanOrEqual(9);
  });

  it('getDefaultModel returns a non-empty string for anthropic', async () => {
    const { getDefaultModel } = await import('../../src/auth/providers');
    const model = getDefaultModel('anthropic');
    expect(typeof model).toBe('string');
    expect(model.length).toBeGreaterThan(0);
  });

  it('getDefaultModel returns a non-empty string for openai', async () => {
    const { getDefaultModel } = await import('../../src/auth/providers');
    const model = getDefaultModel('openai');
    expect(typeof model).toBe('string');
    expect(model.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// A11: auth/oauth.ts — GitHubDeviceFlow class
// ---------------------------------------------------------------------------

describe('auth/oauth.ts — GitHubDeviceFlow', () => {
  it('GitHubDeviceFlow can be instantiated', async () => {
    const { GitHubDeviceFlow } = await import('../../src/auth/oauth');
    const flow = new GitHubDeviceFlow();
    expect(flow).toBeTruthy();
  });

  it('GitHubDeviceFlow has requestDeviceCode method', async () => {
    const { GitHubDeviceFlow } = await import('../../src/auth/oauth');
    const flow = new GitHubDeviceFlow();
    expect(typeof flow.requestDeviceCode).toBe('function');
  });

  it('GitHubDeviceFlow has waitForAuthorization method', async () => {
    const { GitHubDeviceFlow } = await import('../../src/auth/oauth');
    const flow = new GitHubDeviceFlow();
    expect(typeof flow.waitForAuthorization).toBe('function');
  });

  it('GitHubDeviceFlow has getPollingInterval method', async () => {
    const { GitHubDeviceFlow } = await import('../../src/auth/oauth');
    const flow = new GitHubDeviceFlow();
    expect(typeof flow.getPollingInterval).toBe('function');
  });

  it('getPollingInterval returns a number (milliseconds)', async () => {
    const { GitHubDeviceFlow } = await import('../../src/auth/oauth');
    const flow = new GitHubDeviceFlow();
    const interval = flow.getPollingInterval();
    expect(typeof interval).toBe('number');
    expect(interval).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// A12: connect-github.ts — connectGitHubCommand exported, no "Continue without?"
// ---------------------------------------------------------------------------

describe('connect-github.ts — connectGitHubCommand', () => {
  const CONNECT_SRC = src('src/commands/connect-github.ts');

  it('exports connectGitHubCommand as named export', () => {
    expect(CONNECT_SRC).toContain('export async function connectGitHubCommand');
  });

  it('does not contain "Continue without?" prompt text', () => {
    expect(CONNECT_SRC).not.toContain('Continue without?');
  });

  it('exits cleanly on failure — source contains failure comment', () => {
    expect(CONNECT_SRC).toContain('without asking the user to continue');
  });
});

// ===========================================================================
// LLM SYSTEM — src/llm/
// ===========================================================================

// ---------------------------------------------------------------------------
// L1: LLMRouter
// ---------------------------------------------------------------------------

describe('LLMRouter — instantiation and basic API', () => {
  it('instantiates without throwing', async () => {
    const { LLMRouter } = await import('../../src/llm/router');
    const router = new LLMRouter();
    expect(router).toBeTruthy();
  });

  it('getAvailableProviders() returns an array', async () => {
    const { LLMRouter } = await import('../../src/llm/router');
    const router = new LLMRouter();
    const providers = router.getAvailableProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it('route() method exists on the instance', async () => {
    const { LLMRouter } = await import('../../src/llm/router');
    const router = new LLMRouter();
    expect(typeof router.route).toBe('function');
  });

  it('routeStream() method exists on the instance', async () => {
    const { LLMRouter } = await import('../../src/llm/router');
    const router = new LLMRouter();
    expect(typeof router.routeStream).toBe('function');
  });

  it('reinitializeProviders() method exists and does not throw', async () => {
    const { LLMRouter } = await import('../../src/llm/router');
    const router = new LLMRouter();
    expect(() => router.reinitializeProviders()).not.toThrow();
  });

  it('reinitializeProviders() returns void (undefined)', async () => {
    const { LLMRouter } = await import('../../src/llm/router');
    const router = new LLMRouter();
    const result = router.reinitializeProviders();
    expect(result).toBeUndefined();
  });

  it('getAvailableProviders() result is still an array after reinitialization', async () => {
    const { LLMRouter } = await import('../../src/llm/router');
    const router = new LLMRouter();
    router.reinitializeProviders();
    expect(Array.isArray(router.getAvailableProviders())).toBe(true);
  });

  it('routeWithTools() method exists', async () => {
    const { LLMRouter } = await import('../../src/llm/router');
    const router = new LLMRouter();
    expect(typeof router.routeWithTools).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// L2: cost-calculator.ts
// ---------------------------------------------------------------------------

describe('cost-calculator.ts — calculateCost', () => {
  it('calculateCost is exported from cost-calculator', async () => {
    const mod = await import('../../src/llm/cost-calculator');
    expect(typeof mod.calculateCost).toBe('function');
  });

  it('returns an object with costUSD and breakdown properties', async () => {
    const { calculateCost } = await import('../../src/llm/cost-calculator');
    const result = calculateCost('anthropic', 'claude-sonnet-4-20250514', 1000, 500);
    expect(result).toHaveProperty('costUSD');
    expect(result).toHaveProperty('breakdown');
    expect(result.breakdown).toHaveProperty('input');
    expect(result.breakdown).toHaveProperty('output');
  });

  it('groq with 1000/500 tokens returns a number >= 0', async () => {
    const { calculateCost } = await import('../../src/llm/cost-calculator');
    const result = calculateCost('groq', 'llama-3.3-70b-versatile', 1000, 500);
    expect(typeof result.costUSD).toBe('number');
    expect(result.costUSD).toBeGreaterThanOrEqual(0);
  });

  it('anthropic claude-sonnet with 1000/500 tokens returns cost > 0', async () => {
    const { calculateCost } = await import('../../src/llm/cost-calculator');
    const result = calculateCost('anthropic', 'claude-sonnet-4-20250514', 1000, 500);
    expect(result.costUSD).toBeGreaterThan(0);
    expect(result.breakdown.input).toBeGreaterThan(0);
    expect(result.breakdown.output).toBeGreaterThan(0);
  });

  it('unknown model returns 0 gracefully', async () => {
    const { calculateCost } = await import('../../src/llm/cost-calculator');
    const result = calculateCost('anthropic', 'totally-unknown-model-xyz', 1000, 500);
    expect(result.costUSD).toBe(0);
  });

  it('unknown provider returns 0 gracefully', async () => {
    const { calculateCost } = await import('../../src/llm/cost-calculator');
    const result = calculateCost('unknownprovider', 'some-model', 1000, 500);
    expect(result.costUSD).toBe(0);
  });

  it('ollama always returns 0 (local, free)', async () => {
    const { calculateCost } = await import('../../src/llm/cost-calculator');
    const result = calculateCost('ollama', 'llama3.2', 5000, 2000);
    expect(result.costUSD).toBe(0);
  });

  it('input and output costs sum to total costUSD', async () => {
    const { calculateCost } = await import('../../src/llm/cost-calculator');
    const result = calculateCost('anthropic', 'claude-sonnet-4-20250514', 2000, 1000);
    expect(result.costUSD).toBeCloseTo(result.breakdown.input + result.breakdown.output, 10);
  });
});

// ---------------------------------------------------------------------------
// L3: circuit-breaker.ts — ProviderCircuitBreaker
// ---------------------------------------------------------------------------

describe('circuit-breaker.ts — ProviderCircuitBreaker', () => {
  it('ProviderCircuitBreaker is exported', async () => {
    const mod = await import('../../src/llm/circuit-breaker');
    expect(mod.ProviderCircuitBreaker).toBeTruthy();
  });

  it('instantiates without arguments', async () => {
    const { ProviderCircuitBreaker } = await import('../../src/llm/circuit-breaker');
    const cb = new ProviderCircuitBreaker();
    expect(cb).toBeTruthy();
  });

  it('new providers are available by default (circuit CLOSED)', async () => {
    const { ProviderCircuitBreaker } = await import('../../src/llm/circuit-breaker');
    const cb = new ProviderCircuitBreaker();
    expect(cb.isAvailable('anthropic')).toBe(true);
  });

  it('records success without throwing', async () => {
    const { ProviderCircuitBreaker } = await import('../../src/llm/circuit-breaker');
    const cb = new ProviderCircuitBreaker();
    expect(() => cb.recordSuccess('anthropic')).not.toThrow();
  });

  it('records failure without throwing', async () => {
    const { ProviderCircuitBreaker } = await import('../../src/llm/circuit-breaker');
    const cb = new ProviderCircuitBreaker();
    expect(() => cb.recordFailure('openai')).not.toThrow();
  });

  it('circuit opens after threshold failures', async () => {
    const { ProviderCircuitBreaker } = await import('../../src/llm/circuit-breaker');
    const cb = new ProviderCircuitBreaker({ failureThreshold: 3, cooldownMs: 60000 });
    cb.recordFailure('groq');
    cb.recordFailure('groq');
    cb.recordFailure('groq');
    expect(cb.isAvailable('groq')).toBe(false);
  });

  it('getState returns CLOSED for unknown provider', async () => {
    const { ProviderCircuitBreaker } = await import('../../src/llm/circuit-breaker');
    const cb = new ProviderCircuitBreaker();
    expect(cb.getState('unknown')).toBe('CLOSED');
  });

  it('reset() re-opens a closed circuit', async () => {
    const { ProviderCircuitBreaker } = await import('../../src/llm/circuit-breaker');
    const cb = new ProviderCircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure('google');
    cb.recordFailure('google');
    cb.reset('google');
    expect(cb.isAvailable('google')).toBe(true);
  });

  it('getOpenCircuits returns provider names with OPEN circuits', async () => {
    const { ProviderCircuitBreaker } = await import('../../src/llm/circuit-breaker');
    const cb = new ProviderCircuitBreaker({ failureThreshold: 2, cooldownMs: 60000 });
    cb.recordFailure('openai');
    cb.recordFailure('openai');
    const open = cb.getOpenCircuits();
    expect(open).toContain('openai');
  });

  it('recordSuccess resets an open circuit back to CLOSED', async () => {
    const { ProviderCircuitBreaker } = await import('../../src/llm/circuit-breaker');
    const cb = new ProviderCircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure('openai');
    cb.recordFailure('openai');
    cb.recordSuccess('openai');
    expect(cb.getState('openai')).toBe('CLOSED');
  });
});

// ---------------------------------------------------------------------------
// L4: model-aliases.ts — resolveModelAlias
// ---------------------------------------------------------------------------

describe('model-aliases.ts — resolveModelAlias', () => {
  it('resolveModelAlias is exported', async () => {
    const mod = await import('../../src/llm/model-aliases');
    expect(typeof mod.resolveModelAlias).toBe('function');
  });

  it("'claude-3-5-sonnet' resolves to something (alias or itself)", async () => {
    const { resolveModelAlias } = await import('../../src/llm/model-aliases');
    const resolved = resolveModelAlias('claude-3-5-sonnet');
    expect(typeof resolved).toBe('string');
    expect(resolved.length).toBeGreaterThan(0);
  });

  it("known alias 'sonnet' resolves to a claude model ID", async () => {
    const { resolveModelAlias } = await import('../../src/llm/model-aliases');
    const resolved = resolveModelAlias('sonnet');
    expect(resolved).toContain('claude');
  });

  it("known alias 'haiku' resolves to a claude haiku model ID", async () => {
    const { resolveModelAlias } = await import('../../src/llm/model-aliases');
    const resolved = resolveModelAlias('haiku');
    expect(resolved).toContain('haiku');
  });

  it("known alias 'gpt4' resolves to a gpt model ID", async () => {
    const { resolveModelAlias } = await import('../../src/llm/model-aliases');
    const resolved = resolveModelAlias('gpt4');
    expect(resolved).toContain('gpt');
  });

  it('unknown alias returns the original string unchanged', async () => {
    const { resolveModelAlias } = await import('../../src/llm/model-aliases');
    const original = 'some-completely-unknown-model-xyz-12345';
    expect(resolveModelAlias(original)).toBe(original);
  });

  it('alias resolution is case-insensitive', async () => {
    const { resolveModelAlias } = await import('../../src/llm/model-aliases');
    const lower = resolveModelAlias('sonnet');
    const upper = resolveModelAlias('SONNET');
    expect(lower).toBe(upper);
  });
});

// ---------------------------------------------------------------------------
// L5: llm/types.ts — key interfaces present in source
// ---------------------------------------------------------------------------

describe('llm/types.ts — interface definitions', () => {
  const TYPES_SRC = src('src/llm/types.ts');

  it('contains LLMProvider interface', () => {
    expect(TYPES_SRC).toContain('LLMProvider');
  });

  it('contains CompletionRequest interface', () => {
    expect(TYPES_SRC).toContain('CompletionRequest');
  });

  it('contains ToolCompletionRequest interface', () => {
    expect(TYPES_SRC).toContain('ToolCompletionRequest');
  });

  it('contains LLMMessage interface', () => {
    expect(TYPES_SRC).toContain('LLMMessage');
  });
});

// ---------------------------------------------------------------------------
// L6: provider-registry.ts — detectProvider
// ---------------------------------------------------------------------------

describe('provider-registry.ts — detectProvider', () => {
  it('detectProvider is exported', async () => {
    const mod = await import('../../src/llm/provider-registry');
    expect(typeof mod.detectProvider).toBe('function');
  });

  it('claude-* models detect as anthropic', async () => {
    const { detectProvider } = await import('../../src/llm/provider-registry');
    expect(detectProvider('claude-sonnet-4-20250514')).toBe('anthropic');
  });

  it('gpt-* models detect as openai', async () => {
    const { detectProvider } = await import('../../src/llm/provider-registry');
    expect(detectProvider('gpt-4o')).toBe('openai');
  });

  it('gemini-* models detect as google', async () => {
    const { detectProvider } = await import('../../src/llm/provider-registry');
    expect(detectProvider('gemini-2.0-flash-exp')).toBe('google');
  });

  it('deepseek-* models detect as deepseek', async () => {
    const { detectProvider } = await import('../../src/llm/provider-registry');
    expect(detectProvider('deepseek-chat')).toBe('deepseek');
  });

  it('llama-* models detect as ollama', async () => {
    const { detectProvider } = await import('../../src/llm/provider-registry');
    expect(detectProvider('llama3.2')).toBe('ollama');
  });

  it('provider/model prefix correctly routes', async () => {
    const { detectProvider } = await import('../../src/llm/provider-registry');
    expect(detectProvider('anthropic/claude-sonnet-4-20250514')).toBe('anthropic');
  });

  it('unknown model defaults to anthropic', async () => {
    const { detectProvider } = await import('../../src/llm/provider-registry');
    expect(detectProvider('totally-unknown-xyz')).toBe('anthropic');
  });
});

// ===========================================================================
// TOOLS SYSTEM — src/tools/
// ===========================================================================

// ---------------------------------------------------------------------------
// T1: tools/schemas/index.ts — exported arrays and classes
// ---------------------------------------------------------------------------

describe('tools/schemas/index.ts — exports', () => {
  it('standardTools is exported and is an array with >= 10 tools', async () => {
    const { standardTools } = await import('../../src/tools/schemas/index');
    expect(Array.isArray(standardTools)).toBe(true);
    expect(standardTools.length).toBeGreaterThanOrEqual(10);
  });

  it('devopsTools is exported and is an array with >= 5 tools', async () => {
    const { devopsTools } = await import('../../src/tools/schemas/index');
    expect(Array.isArray(devopsTools)).toBe(true);
    expect(devopsTools.length).toBeGreaterThanOrEqual(5);
  });

  it('allBuiltinTools equals standardTools + devopsTools', async () => {
    const { standardTools, devopsTools, allBuiltinTools } = await import('../../src/tools/schemas/index');
    expect(allBuiltinTools.length).toBe(standardTools.length + devopsTools.length);
  });

  it('ToolRegistry class is exported', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/index');
    expect(typeof ToolRegistry).toBe('function'); // class constructor
  });

  it('defaultToolRegistry is exported as an object', async () => {
    const { defaultToolRegistry } = await import('../../src/tools/schemas/index');
    expect(defaultToolRegistry).toBeTruthy();
    expect(typeof defaultToolRegistry).toBe('object');
  });
});

// ---------------------------------------------------------------------------
// T2: standardTools — required tools present
// ---------------------------------------------------------------------------

describe('standardTools — required tools present', () => {
  const REQUIRED_STANDARD = ['bash', 'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'list_dir'];

  for (const toolName of REQUIRED_STANDARD) {
    it(`standardTools contains '${toolName}'`, async () => {
      const { standardTools } = await import('../../src/tools/schemas/index');
      const names = standardTools.map(t => t.name);
      expect(names).toContain(toolName);
    });
  }
});

// ---------------------------------------------------------------------------
// T3: devopsTools — required tools present
// ---------------------------------------------------------------------------

describe('devopsTools — required tools present', () => {
  const REQUIRED_DEVOPS = ['terraform', 'kubectl', 'helm'];

  for (const toolName of REQUIRED_DEVOPS) {
    it(`devopsTools contains '${toolName}'`, async () => {
      const { devopsTools } = await import('../../src/tools/schemas/index');
      const names = devopsTools.map(t => t.name);
      expect(names).toContain(toolName);
    });
  }
});

// ---------------------------------------------------------------------------
// T4: Every tool in standardTools has required shape
// ---------------------------------------------------------------------------

describe('standardTools — every tool has name, description, inputSchema', () => {
  it('all standard tools have a non-empty name', async () => {
    const { standardTools } = await import('../../src/tools/schemas/index');
    for (const tool of standardTools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('all standard tools have a non-empty description', async () => {
    const { standardTools } = await import('../../src/tools/schemas/index');
    for (const tool of standardTools) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('all standard tools have an inputSchema object', async () => {
    const { standardTools } = await import('../../src/tools/schemas/index');
    for (const tool of standardTools) {
      expect(tool.inputSchema).toBeTruthy();
      expect(typeof tool.inputSchema).toBe('object');
    }
  });
});

// ---------------------------------------------------------------------------
// T5: Every tool in devopsTools has required shape
// ---------------------------------------------------------------------------

describe('devopsTools — every tool has name, description, inputSchema', () => {
  it('all devops tools have a non-empty name', async () => {
    const { devopsTools } = await import('../../src/tools/schemas/index');
    for (const tool of devopsTools) {
      expect(typeof tool.name).toBe('string');
      expect(tool.name.length).toBeGreaterThan(0);
    }
  });

  it('all devops tools have a non-empty description', async () => {
    const { devopsTools } = await import('../../src/tools/schemas/index');
    for (const tool of devopsTools) {
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('all devops tools have an inputSchema object', async () => {
    const { devopsTools } = await import('../../src/tools/schemas/index');
    for (const tool of devopsTools) {
      expect(tool.inputSchema).toBeTruthy();
      expect(typeof tool.inputSchema).toBe('object');
    }
  });
});

// ---------------------------------------------------------------------------
// T6: tools/schemas/types.ts — PermissionTier and ToolExecuteContext
// ---------------------------------------------------------------------------

describe('tools/schemas/types.ts — PermissionTier and ToolExecuteContext', () => {
  const TYPES_SRC = src('src/tools/schemas/types.ts');

  it("source contains 'auto_allow' tier", () => {
    expect(TYPES_SRC).toContain('auto_allow');
  });

  it("source contains 'ask_once' tier", () => {
    expect(TYPES_SRC).toContain('ask_once');
  });

  it("source contains 'always_ask' tier", () => {
    expect(TYPES_SRC).toContain('always_ask');
  });

  it("source contains 'blocked' tier", () => {
    expect(TYPES_SRC).toContain('blocked');
  });

  it('source contains ToolExecuteContext interface', () => {
    expect(TYPES_SRC).toContain('ToolExecuteContext');
  });

  it('PERMISSION_TIER_ORDER contains all four tiers', async () => {
    const { PERMISSION_TIER_ORDER } = await import('../../src/tools/schemas/types');
    expect(PERMISSION_TIER_ORDER).toContain('auto_allow');
    expect(PERMISSION_TIER_ORDER).toContain('ask_once');
    expect(PERMISSION_TIER_ORDER).toContain('always_ask');
    expect(PERMISSION_TIER_ORDER).toContain('blocked');
    expect(PERMISSION_TIER_ORDER.length).toBe(4);
  });

  it('permissionTierIndex returns 0 for auto_allow (least restrictive)', async () => {
    const { permissionTierIndex } = await import('../../src/tools/schemas/types');
    expect(permissionTierIndex('auto_allow')).toBe(0);
  });

  it('permissionTierIndex returns 3 for blocked (most restrictive)', async () => {
    const { permissionTierIndex } = await import('../../src/tools/schemas/types');
    expect(permissionTierIndex('blocked')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// T7: tools/schemas/converter.ts — toAnthropicTool / toAnthropicFormat
// ---------------------------------------------------------------------------

describe('tools/schemas/converter.ts — converter exports', () => {
  it('toAnthropicFormat is exported', async () => {
    const mod = await import('../../src/tools/schemas/converter');
    expect(typeof mod.toAnthropicFormat).toBe('function');
  });

  it('toAnthropicTool is exported', async () => {
    const mod = await import('../../src/tools/schemas/converter');
    expect(typeof mod.toAnthropicTool).toBe('function');
  });

  it('toOpenAIFormat is exported', async () => {
    const mod = await import('../../src/tools/schemas/converter');
    expect(typeof mod.toOpenAIFormat).toBe('function');
  });

  it('toGoogleFormat is exported', async () => {
    const mod = await import('../../src/tools/schemas/converter');
    expect(typeof mod.toGoogleFormat).toBe('function');
  });

  it('toAnthropicFormat converts standardTools to Anthropic format', async () => {
    const { toAnthropicFormat } = await import('../../src/tools/schemas/converter');
    const { standardTools } = await import('../../src/tools/schemas/index');
    const converted = toAnthropicFormat(standardTools);
    expect(Array.isArray(converted)).toBe(true);
    expect(converted.length).toBe(standardTools.length);
    for (const tool of converted) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('input_schema');
      expect(tool.input_schema.type).toBe('object');
    }
  });

  it('toOpenAIFormat converts standardTools to OpenAI function-calling format', async () => {
    const { toOpenAIFormat } = await import('../../src/tools/schemas/converter');
    const { standardTools } = await import('../../src/tools/schemas/index');
    const converted = toOpenAIFormat(standardTools);
    expect(Array.isArray(converted)).toBe(true);
    for (const tool of converted) {
      expect(tool.type).toBe('function');
      expect(tool.function).toHaveProperty('name');
      expect(tool.function).toHaveProperty('description');
      expect(tool.function).toHaveProperty('parameters');
    }
  });

  it('getToolNames returns array of name strings', async () => {
    const { getToolNames } = await import('../../src/tools/schemas/converter');
    const { standardTools } = await import('../../src/tools/schemas/index');
    const names = getToolNames(standardTools);
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBe(standardTools.length);
    expect(names.every(n => typeof n === 'string')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T8: tools/spawn-exec.ts — spawnExec exported
// ---------------------------------------------------------------------------

describe('tools/spawn-exec.ts — spawnExec', () => {
  const SPAWN_SRC = src('src/tools/spawn-exec.ts');

  it('exports spawnExec function (source check)', () => {
    expect(SPAWN_SRC).toContain('export async function spawnExec');
  });

  it('spawnExec is importable', async () => {
    const mod = await import('../../src/tools/spawn-exec');
    expect(typeof mod.spawnExec).toBe('function');
  });

  it('SpawnResult interface is defined in source', () => {
    expect(SPAWN_SRC).toContain('SpawnResult');
  });

  it('source contains onChunk callback parameter', () => {
    expect(SPAWN_SRC).toContain('onChunk');
  });

  it('source contains secret redaction logic', () => {
    expect(SPAWN_SRC).toContain('redactSecrets');
  });
});

// ---------------------------------------------------------------------------
// T9: tools/file-ops.ts — FileSystemOperations exported
// ---------------------------------------------------------------------------

describe('tools/file-ops.ts — FileSystemOperations', () => {
  const FILE_OPS_SRC = src('src/tools/file-ops.ts');

  it('exports FileSystemOperations class (source check)', () => {
    expect(FILE_OPS_SRC).toContain('export class FileSystemOperations');
  });

  it('FileSystemOperations is importable', async () => {
    const mod = await import('../../src/tools/file-ops');
    expect(typeof mod.FileSystemOperations).toBe('function');
  });

  it('FileSystemOperations can be instantiated', async () => {
    const { FileSystemOperations } = await import('../../src/tools/file-ops');
    const ops = new FileSystemOperations();
    expect(ops).toBeTruthy();
  });

  it('source contains SENSITIVE_PATTERNS for security blocking', () => {
    expect(FILE_OPS_SRC).toContain('SENSITIVE_PATTERNS');
  });
});

// ---------------------------------------------------------------------------
// T10: tools/git-ops.ts — GitOperations exported
// ---------------------------------------------------------------------------

describe('tools/git-ops.ts — GitOperations', () => {
  const GIT_OPS_SRC = src('src/tools/git-ops.ts');

  it('exports GitOperations class (source check)', () => {
    expect(GIT_OPS_SRC).toContain('export class GitOperations');
  });

  it('GitOperations is importable', async () => {
    const mod = await import('../../src/tools/git-ops');
    expect(typeof mod.GitOperations).toBe('function');
  });

  it('GitOperations can be instantiated', async () => {
    const { GitOperations } = await import('../../src/tools/git-ops');
    const ops = new GitOperations();
    expect(ops).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// T11: tools/terraform-ops.ts — TerraformOperations exported
// ---------------------------------------------------------------------------

describe('tools/terraform-ops.ts — TerraformOperations', () => {
  const TF_SRC = src('src/tools/terraform-ops.ts');

  it('exports TerraformOperations class (source check)', () => {
    expect(TF_SRC).toContain('export class TerraformOperations');
  });

  it('TerraformOperations is importable', async () => {
    const mod = await import('../../src/tools/terraform-ops');
    expect(typeof mod.TerraformOperations).toBe('function');
  });

  it('TerraformOperations can be instantiated', async () => {
    const { TerraformOperations } = await import('../../src/tools/terraform-ops');
    const ops = new TerraformOperations();
    expect(ops).toBeTruthy();
  });

  it('source contains TerraformInitOptions interface', () => {
    expect(TF_SRC).toContain('TerraformInitOptions');
  });

  it('source contains TerraformPlanOptions interface', () => {
    expect(TF_SRC).toContain('TerraformPlanOptions');
  });
});

// ---------------------------------------------------------------------------
// T12: tools/k8s-ops.ts — KubernetesOperations exported
// ---------------------------------------------------------------------------

describe('tools/k8s-ops.ts — KubernetesOperations', () => {
  const K8S_SRC = src('src/tools/k8s-ops.ts');

  it('exports KubernetesOperations class (source check)', () => {
    expect(K8S_SRC).toContain('export class KubernetesOperations');
  });

  it('KubernetesOperations is importable', async () => {
    const mod = await import('../../src/tools/k8s-ops');
    expect(typeof mod.KubernetesOperations).toBe('function');
  });

  it('KubernetesOperations can be instantiated', async () => {
    const { KubernetesOperations } = await import('../../src/tools/k8s-ops');
    const ops = new KubernetesOperations();
    expect(ops).toBeTruthy();
  });

  it('source contains KubernetesConfig interface', () => {
    expect(K8S_SRC).toContain('KubernetesConfig');
  });
});

// ---------------------------------------------------------------------------
// T13: tools/helm-ops.ts — HelmOperations exported
// ---------------------------------------------------------------------------

describe('tools/helm-ops.ts — HelmOperations', () => {
  const HELM_SRC = src('src/tools/helm-ops.ts');

  it('exports HelmOperations class (source check)', () => {
    expect(HELM_SRC).toContain('export class HelmOperations');
  });

  it('HelmOperations is importable', async () => {
    const mod = await import('../../src/tools/helm-ops');
    expect(typeof mod.HelmOperations).toBe('function');
  });

  it('HelmOperations can be instantiated', async () => {
    const { HelmOperations } = await import('../../src/tools/helm-ops');
    const ops = new HelmOperations();
    expect(ops).toBeTruthy();
  });

  it('source contains HelmConfig interface', () => {
    expect(HELM_SRC).toContain('HelmConfig');
  });

  it('source contains InstallOptions interface', () => {
    expect(HELM_SRC).toContain('InstallOptions');
  });
});

// ---------------------------------------------------------------------------
// T14: ToolRegistry — unit tests
// ---------------------------------------------------------------------------

describe('ToolRegistry — functional tests', () => {
  it('can register and retrieve a tool', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const registry = new ToolRegistry();
    const tool = {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: z.object({ x: z.string() }),
      execute: async () => ({ output: 'ok', isError: false }),
      permissionTier: 'auto_allow' as const,
      category: 'standard' as const,
    };
    registry.register(tool);
    expect(registry.get('test_tool')).toBeTruthy();
  });

  it('throws when registering a duplicate tool name', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const registry = new ToolRegistry();
    const tool = {
      name: 'dup_tool',
      description: 'Duplicate tool',
      inputSchema: z.object({}),
      execute: async () => ({ output: '', isError: false }),
      permissionTier: 'auto_allow' as const,
      category: 'standard' as const,
    };
    registry.register(tool);
    expect(() => registry.register(tool)).toThrow();
  });

  it('getAll() returns all registered tools', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const registry = new ToolRegistry();
    for (let i = 0; i < 3; i++) {
      registry.register({
        name: `tool_${i}`,
        description: `Tool ${i}`,
        inputSchema: z.object({}),
        execute: async () => ({ output: '', isError: false }),
        permissionTier: 'auto_allow' as const,
        category: 'standard' as const,
      });
    }
    expect(registry.getAll().length).toBe(3);
  });

  it('getByCategory() filters by category', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const registry = new ToolRegistry();
    registry.register({
      name: 'std_tool',
      description: 'Standard',
      inputSchema: z.object({}),
      execute: async () => ({ output: '', isError: false }),
      permissionTier: 'auto_allow' as const,
      category: 'standard' as const,
    });
    registry.register({
      name: 'dev_tool',
      description: 'DevOps',
      inputSchema: z.object({}),
      execute: async () => ({ output: '', isError: false }),
      permissionTier: 'auto_allow' as const,
      category: 'devops' as const,
    });
    expect(registry.getByCategory('standard').length).toBe(1);
    expect(registry.getByCategory('devops').length).toBe(1);
  });

  it('unregister() removes a registered tool', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const registry = new ToolRegistry();
    registry.register({
      name: 'to_remove',
      description: 'Remove me',
      inputSchema: z.object({}),
      execute: async () => ({ output: '', isError: false }),
      permissionTier: 'auto_allow' as const,
      category: 'standard' as const,
    });
    const removed = registry.unregister('to_remove');
    expect(removed).toBe(true);
    expect(registry.get('to_remove')).toBeUndefined();
  });

  it('size property reflects the number of registered tools', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const registry = new ToolRegistry();
    expect(registry.size).toBe(0);
    registry.register({
      name: 'size_test',
      description: 'x',
      inputSchema: z.object({}),
      execute: async () => ({ output: '', isError: false }),
      permissionTier: 'auto_allow' as const,
      category: 'standard' as const,
    });
    expect(registry.size).toBe(1);
  });

  it('clear() empties the registry', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const registry = new ToolRegistry();
    registry.register({
      name: 'clear_test',
      description: 'x',
      inputSchema: z.object({}),
      execute: async () => ({ output: '', isError: false }),
      permissionTier: 'auto_allow' as const,
      category: 'standard' as const,
    });
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('getByPermissionTier() filters correctly', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const registry = new ToolRegistry();
    registry.register({
      name: 'auto_tool',
      description: 'auto',
      inputSchema: z.object({}),
      execute: async () => ({ output: '', isError: false }),
      permissionTier: 'auto_allow' as const,
      category: 'standard' as const,
    });
    registry.register({
      name: 'blocked_tool',
      description: 'blocked',
      inputSchema: z.object({}),
      execute: async () => ({ output: '', isError: false }),
      permissionTier: 'blocked' as const,
      category: 'standard' as const,
    });
    expect(registry.getByPermissionTier('auto_allow').length).toBe(1);
    expect(registry.getByPermissionTier('blocked').length).toBe(1);
    expect(registry.getByPermissionTier('ask_once').length).toBe(0);
  });

  it('toAnthropicTools() returns correctly shaped Anthropic tools', async () => {
    const { ToolRegistry } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const registry = new ToolRegistry();
    registry.register({
      name: 'anthropic_test',
      description: 'Test for Anthropic',
      inputSchema: z.object({ query: z.string() }),
      execute: async () => ({ output: '', isError: false }),
      permissionTier: 'auto_allow' as const,
      category: 'standard' as const,
    });
    const anthropicTools = registry.toAnthropicTools();
    expect(anthropicTools.length).toBe(1);
    expect(anthropicTools[0].input_schema.type).toBe('object');
    expect(anthropicTools[0].name).toBe('anthropic_test');
  });
});

// ---------------------------------------------------------------------------
// T15: zodToJsonSchema — basic conversion correctness
// ---------------------------------------------------------------------------

describe('zodToJsonSchema — conversion correctness', () => {
  it('converts z.object to JSON Schema with type: object', async () => {
    const { zodToJsonSchema } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const schema = z.object({ name: z.string(), count: z.number() });
    const json = zodToJsonSchema(schema);
    expect(json.type).toBe('object');
    expect(json.properties).toHaveProperty('name');
    expect(json.properties).toHaveProperty('count');
  });

  it('marks non-optional fields as required', async () => {
    const { zodToJsonSchema } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const schema = z.object({ required: z.string(), optional: z.string().optional() });
    const json = zodToJsonSchema(schema);
    expect(json.required).toContain('required');
    expect(json.required ?? []).not.toContain('optional');
  });

  it('converts z.string() to { type: "string" }', async () => {
    const { zodToJsonSchema } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const json = zodToJsonSchema(z.string());
    expect(json.type).toBe('string');
  });

  it('converts z.number() to { type: "number" }', async () => {
    const { zodToJsonSchema } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const json = zodToJsonSchema(z.number());
    expect(json.type).toBe('number');
  });

  it('converts z.boolean() to { type: "boolean" }', async () => {
    const { zodToJsonSchema } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const json = zodToJsonSchema(z.boolean());
    expect(json.type).toBe('boolean');
  });

  it('converts z.enum() to { type: "string", enum: [...] }', async () => {
    const { zodToJsonSchema } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const json = zodToJsonSchema(z.enum(['a', 'b', 'c']));
    expect(json.type).toBe('string');
    expect(json.enum).toEqual(['a', 'b', 'c']);
  });

  it('converts z.array() to { type: "array", items: {...} }', async () => {
    const { zodToJsonSchema } = await import('../../src/tools/schemas/types');
    const { z } = await import('zod');
    const json = zodToJsonSchema(z.array(z.string()));
    expect(json.type).toBe('array');
    expect(json.items).toHaveProperty('type', 'string');
  });
});
