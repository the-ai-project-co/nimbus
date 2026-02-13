import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IntentParser } from '../conversational/intent-parser';

/**
 * Edge case tests for IntentParser LLM integration.
 *
 * These tests cover scenarios that the base intent-parser-llm.test.ts may not:
 * - LLM returns extra fields gracefully
 * - HTTP 500 from LLM
 * - LLM returns null entities
 * - Kubernetes intent detection via fallback
 * - Helm intent detection via fallback
 * - Various provider detection
 * - Low confidence LLM results
 * - Malformed LLM response structures
 */
describe('IntentParser - LLM Edge Cases', () => {
  let parser: IntentParser;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    parser = new IntentParser();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should handle LLM returning extra fields gracefully', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          intent: 'generate',
          confidence: 0.95,
          entities: [{ type: 'provider', value: 'aws' }],
          extra_field: 'should be ignored',
          another_extra: 42,
        }) } }],
      })))
    ) as any;

    const result = await parser.parse('create vpc aws');
    expect(result.type).toBe('generate');
    expect(result.confidence).toBe(0.95);
  });

  it('should handle HTTP 500 from LLM', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('error', { status: 500 }))
    ) as any;

    const result = await parser.parse('create a vpc on aws');
    expect(result.type).toBeDefined();
    // Fallback should still detect generate intent via keyword matching
    expect(result.type).toBe('generate');
  });

  it('should handle HTTP 503 Service Unavailable from LLM', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Service Unavailable', { status: 503 }))
    ) as any;

    const result = await parser.parse('help');
    expect(result.type).toBe('help');
  });

  it('should handle LLM returning null entities', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          intent: 'help',
          confidence: 0.9,
          entities: null,
        }) } }],
      })))
    ) as any;

    const result = await parser.parse('help');
    expect(result.type).toBe('help');
    expect(Array.isArray(result.entities)).toBe(true);
    // null entities should result in empty array
    expect(result.entities.length).toBe(0);
  });

  it('should handle LLM returning entities with invalid structure', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          intent: 'generate',
          confidence: 0.8,
          entities: [
            { type: 'provider', value: 'aws' },
            { invalid: 'entity' },
            'not-an-object',
            null,
          ],
        }) } }],
      })))
    ) as any;

    const result = await parser.parse('create vpc aws');
    expect(result.type).toBe('generate');
    // Only the valid entity should be parsed
    expect(result.entities.length).toBe(1);
    expect(result.entities[0].value).toBe('aws');
  });

  it('should still detect kubernetes intents via fallback', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('create a deployment');
    expect(result.type).toBe('generate');
    expect(result.entities.some(e => e.value === 'deployment')).toBe(true);
  });

  it('should still detect helm intents via fallback', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('create a helm chart');
    expect(result.type).toBe('generate');
    expect(result.entities.some(e => e.type === 'generation_type' && e.value === 'helm')).toBe(true);
  });

  it('should detect statefulset via fallback keyword matching', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('create a statefulset');
    expect(result.type).toBe('generate');
    expect(result.entities.some(e => e.value === 'statefulset')).toBe(true);
  });

  it('should detect cronjob via fallback keyword matching', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('create a cronjob');
    expect(result.type).toBe('generate');
    expect(result.entities.some(e => e.value === 'cronjob')).toBe(true);
  });

  it('should detect GCP provider via fallback', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('deploy vpc on gcp');
    expect(result.type).toBe('generate');
    expect(result.entities.some(e => e.type === 'provider' && e.value === 'gcp')).toBe(true);
  });

  it('should detect azure provider via fallback', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('deploy vpc on azure');
    expect(result.type).toBe('generate');
    expect(result.entities.some(e => e.type === 'provider' && e.value === 'azure')).toBe(true);
  });

  it('should detect explain intent via fallback', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('explain what is a vpc');
    expect(result.type).toBe('explain');
  });

  it('should detect modify intent via fallback', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('modify the vpc');
    expect(result.type).toBe('modify');
  });

  it('should return unknown for completely unrecognized input', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('xyzzy plugh');
    expect(result.type).toBe('unknown');
    expect(result.confidence).toBe(0);
    expect(result.entities.length).toBe(0);
  });

  it('should handle LLM returning unrecognized intent type', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          intent: 'destroy',
          confidence: 0.85,
          entities: [],
        }) } }],
      })))
    ) as any;

    const result = await parser.parse('destroy everything');
    // Unrecognized intent maps to 'unknown' type
    expect(result.type).toBe('unknown');
  });

  it('should handle LLM returning empty choices array', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [],
      })))
    ) as any;

    const result = await parser.parse('create vpc');
    expect(result.type).toBeDefined();
    // Should fall back to heuristics
    expect(result.type).toBe('generate');
  });

  it('should handle LLM response missing confidence field', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          intent: 'generate',
          entities: [],
        }) } }],
      })))
    ) as any;

    const result = await parser.parse('create vpc');
    // Missing confidence should cause fallback
    expect(result.type).toBeDefined();
  });

  it('should detect environment in input via fallback', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('create a vpc for production');
    expect(result.type).toBe('generate');
    expect(result.entities.some(e => e.type === 'environment' && e.value === 'production')).toBe(true);
  });

  it('should normalize dev environment to development', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const result = await parser.parse('create a vpc for dev');
    const envEntity = result.entities.find(e => e.type === 'environment');
    expect(envEntity?.value).toBe('development');
  });

  it('should handle concurrent parse calls without interference', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    const [result1, result2, result3] = await Promise.all([
      parser.parse('create a vpc'),
      parser.parse('help me'),
      parser.parse('explain terraform'),
    ]);

    expect(result1.type).toBe('generate');
    expect(result2.type).toBe('help');
    expect(result3.type).toBe('explain');
  });
});
