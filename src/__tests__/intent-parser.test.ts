/**
 * Tests for src/generator/intent-parser.ts – IntentParser
 *
 * The IntentParser is instantiated WITHOUT an LLM router so every test
 * exercises the deterministic heuristic (regex + keyword) path only.
 * LLM-based classification requires live API keys and is therefore
 * intentionally excluded from unit tests.
 */

import { describe, it, expect } from 'bun:test';
import { IntentParser, type ConversationalIntent } from '../generator/intent-parser';

// Helper: create a parser in pure-heuristic mode (no router)
function makeParser(): IntentParser {
  return new IntentParser();
}

// Helper: extract entities of a given type from a parsed result
function entitiesOfType(intent: ConversationalIntent, type: string): string[] {
  return intent.entities.filter(e => e.type === type).map(e => e.value);
}

// ---------------------------------------------------------------------------
// Intent type detection
// ---------------------------------------------------------------------------

describe('IntentParser – generate intents', () => {
  it('parse("create a vpc on aws") returns type: generate', async () => {
    const parser = makeParser();
    const result = await parser.parse('create a vpc on aws');
    expect(result.type).toBe('generate');
  });

  it('parse("generate a helm chart") returns type: generate', async () => {
    const parser = makeParser();
    const result = await parser.parse('generate a helm chart');
    expect(result.type).toBe('generate');
  });

  it('parse("build an eks cluster on aws") returns type: generate', async () => {
    const parser = makeParser();
    const result = await parser.parse('build an eks cluster on aws');
    expect(result.type).toBe('generate');
  });

  it('parse("create a deployment") returns type: generate', async () => {
    const parser = makeParser();
    const result = await parser.parse('create a deployment');
    expect(result.type).toBe('generate');
  });

  it('parse("setup an s3 bucket") returns type: generate', async () => {
    const parser = makeParser();
    const result = await parser.parse('setup an s3 bucket');
    expect(result.type).toBe('generate');
  });
});

describe('IntentParser – explain intents', () => {
  it('parse("explain kubernetes") returns type: explain', async () => {
    const parser = makeParser();
    const result = await parser.parse('explain kubernetes');
    expect(result.type).toBe('explain');
  });

  it('parse("what is terraform") returns type: explain', async () => {
    const parser = makeParser();
    const result = await parser.parse('what is terraform');
    expect(result.type).toBe('explain');
  });

  it('parse("describe a vpc") returns type: explain', async () => {
    const parser = makeParser();
    const result = await parser.parse('describe a vpc');
    expect(result.type).toBe('explain');
  });

  it('parse("why should I use helm") returns type: explain', async () => {
    const parser = makeParser();
    const result = await parser.parse('why should I use helm');
    expect(result.type).toBe('explain');
  });
});

describe('IntentParser – help intents', () => {
  it('parse("help") returns type: help', async () => {
    const parser = makeParser();
    const result = await parser.parse('help');
    expect(result.type).toBe('help');
  });

  it('parse("what can you do") returns type: help', async () => {
    const parser = makeParser();
    const result = await parser.parse('what can you do');
    expect(result.type).toBe('help');
  });

  it('parse("guide me through the process") returns type: help', async () => {
    const parser = makeParser();
    const result = await parser.parse('guide me through the process');
    expect(result.type).toBe('help');
  });
});

describe('IntentParser – unknown intents', () => {
  it('parse("random gibberish qwerty xyz") returns type: unknown', async () => {
    const parser = makeParser();
    const result = await parser.parse('random gibberish qwerty xyz');
    expect(result.type).toBe('unknown');
  });

  it('parse("xyzzy plugh foo bar baz") returns type: unknown', async () => {
    const parser = makeParser();
    const result = await parser.parse('xyzzy plugh foo bar baz');
    expect(result.type).toBe('unknown');
  });
});

describe('IntentParser – modify intents', () => {
  it('parse("change the vpc") returns type: modify', async () => {
    const parser = makeParser();
    const result = await parser.parse('change the vpc');
    expect(result.type).toBe('modify');
  });

  it('parse("update the rds instance") returns type: modify', async () => {
    const parser = makeParser();
    const result = await parser.parse('update the rds instance');
    expect(result.type).toBe('modify');
  });
});

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------

describe('IntentParser – entity extraction', () => {
  it('parse("create a vpc on aws") extracts provider: aws', async () => {
    const parser = makeParser();
    const result = await parser.parse('create a vpc on aws');
    const providers = entitiesOfType(result, 'provider');
    expect(providers).toContain('aws');
  });

  it('parse("create a vpc on aws") extracts component: vpc', async () => {
    const parser = makeParser();
    const result = await parser.parse('create a vpc on aws');
    const components = entitiesOfType(result, 'component');
    expect(components).toContain('vpc');
  });

  it('parse("generate a helm chart") extracts generation_type: helm', async () => {
    const parser = makeParser();
    const result = await parser.parse('generate a helm chart');
    const genTypes = entitiesOfType(result, 'generation_type');
    expect(genTypes).toContain('helm');
  });

  it('parse("create a deployment") extracts generation_type: kubernetes', async () => {
    const parser = makeParser();
    const result = await parser.parse('create a deployment');
    const genTypes = entitiesOfType(result, 'generation_type');
    expect(genTypes).toContain('kubernetes');
  });

  it('parse("deploy something on gcp") extracts provider: gcp', async () => {
    const parser = makeParser();
    const result = await parser.parse('deploy something on gcp');
    const providers = entitiesOfType(result, 'provider');
    expect(providers).toContain('gcp');
  });

  it('parse("provision infrastructure in us-east-1") extracts region entity', async () => {
    const parser = makeParser();
    const result = await parser.parse('provision infrastructure in us-east-1');
    const regions = entitiesOfType(result, 'region');
    expect(regions).toContain('us-east-1');
  });

  it('parse("provision eks for the production environment") extracts environment entity', async () => {
    const parser = makeParser();
    const result = await parser.parse('provision eks for the production environment');
    const envs = entitiesOfType(result, 'environment');
    // The parser normalises "production" to "production"
    expect(envs.some(e => e.includes('production'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

describe('IntentParser – confidence', () => {
  it('returns confidence between 0 and 1 for any input', async () => {
    const parser = makeParser();
    const inputs = ['create a vpc on aws', 'explain kubernetes', 'help', 'random gibberish xyz'];

    for (const input of inputs) {
      const result = await parser.parse(input);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('unknown intent has confidence 0', async () => {
    const parser = makeParser();
    const result = await parser.parse('xyzzy plugh aaabbbccc');
    expect(result.confidence).toBe(0);
  });

  it('matched intents have confidence greater than 0', async () => {
    const parser = makeParser();
    const result = await parser.parse('create a vpc on aws');
    expect(result.confidence).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// setRouter
// ---------------------------------------------------------------------------

describe('IntentParser – setRouter', () => {
  it('setRouter() accepts a router without throwing', () => {
    const parser = makeParser();
    // Pass a minimal mock object; we only test that the setter accepts it
    const mockRouter = {} as any;
    expect(() => parser.setRouter(mockRouter)).not.toThrow();
  });
});
