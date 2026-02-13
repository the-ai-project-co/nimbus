import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { IntentParser } from '../conversational/intent-parser';

describe('IntentParser LLM Integration', () => {
  let parser: IntentParser;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    parser = new IntentParser();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should use LLM classification when available', async () => {
    const llmResponse = {
      intent: 'generate',
      confidence: 0.95,
      entities: [
        { type: 'provider', value: 'aws' },
        { type: 'component', value: 'vpc' },
      ],
    };

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(llmResponse) } }],
      })))
    ) as any;

    const result = await parser.parse('create a vpc on aws');

    expect(result.type).toBe('generate');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.entities.length).toBe(2);
  });

  it('should fall back to regex/keyword matching when LLM fails', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Connection refused'))) as any;

    const result = await parser.parse('create a vpc on aws');

    expect(result.type).toBe('generate');
    expect(result.entities.length).toBeGreaterThan(0);
  });

  it('should fall back when LLM returns invalid JSON', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: 'invalid json response' } }],
      })))
    ) as any;

    const result = await parser.parse('what is a vpc');

    expect(['generate', 'explain', 'help', 'unknown']).toContain(result.type);
  });

  it('should handle unknown intent from LLM gracefully', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ intent: 'unknown', confidence: 0.3, entities: [] }) } }],
      })))
    ) as any;

    const result = await parser.parse('asdfghjkl');

    // Should still return a valid result (possibly from LLM with low confidence)
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
  });

  it('should maintain backward compatibility with sync-like usage', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('no LLM'))) as any;

    // parse() is now async but should work via await
    const result = await parser.parse('help me');
    expect(result.type).toBe('help');
  });
});
