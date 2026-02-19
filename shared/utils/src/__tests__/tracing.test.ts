import { describe, it, expect } from 'bun:test';
import {
  initTracing,
  getTracer,
  createSpan,
  generateTraceId,
  generateSpanId,
  extractTraceHeaders,
  injectTraceHeaders,
} from '../tracing';

describe('tracing', () => {
  // ---------- initTracing ----------

  describe('initTracing', () => {
    it('does not throw', () => {
      expect(() => initTracing('test-service')).not.toThrow();
    });

    it('can be called multiple times safely', () => {
      expect(() => initTracing('test-service-a')).not.toThrow();
      expect(() => initTracing('test-service-b')).not.toThrow();
    });
  });

  // ---------- getTracer ----------

  describe('getTracer', () => {
    it('returns a tracer object', () => {
      initTracing('tracer-test-service');
      const tracer = getTracer();
      expect(tracer).toBeDefined();
      expect(typeof tracer.startActiveSpan).toBe('function');
    });

    it('returns a named tracer when name is provided', () => {
      const tracer = getTracer('custom-tracer');
      expect(tracer).toBeDefined();
      expect(typeof tracer.startSpan).toBe('function');
    });
  });

  // ---------- createSpan ----------

  describe('createSpan', () => {
    it('executes function and returns result', async () => {
      initTracing('span-test-service');
      const result = await createSpan('test-span', async (_span) => {
        return 42;
      });
      expect(result).toBe(42);
    });

    it('executes async function and returns result', async () => {
      const result = await createSpan('async-span', async (_span) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'async-value';
      });
      expect(result).toBe('async-value');
    });

    it('propagates errors', async () => {
      const error = new Error('span-error');
      try {
        await createSpan('error-span', async () => {
          throw error;
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBe(error);
        expect((e as Error).message).toBe('span-error');
      }
    });
  });

  // ---------- generateTraceId ----------

  describe('generateTraceId', () => {
    it('returns 32 hex chars', () => {
      const traceId = generateTraceId();
      expect(traceId.length).toBe(32);
      expect(/^[0-9a-f]{32}$/.test(traceId)).toBe(true);
    });

    it('generates unique values', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();
      expect(id1).not.toBe(id2);
    });
  });

  // ---------- generateSpanId ----------

  describe('generateSpanId', () => {
    it('returns 16 hex chars', () => {
      const spanId = generateSpanId();
      expect(spanId.length).toBe(16);
      expect(/^[0-9a-f]{16}$/.test(spanId)).toBe(true);
    });

    it('generates unique values', () => {
      const id1 = generateSpanId();
      const id2 = generateSpanId();
      expect(id1).not.toBe(id2);
    });
  });

  // ---------- extractTraceHeaders ----------

  describe('extractTraceHeaders', () => {
    it('parses valid traceparent', () => {
      const req = new Request('http://localhost/test', {
        headers: {
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        },
      });

      const result = extractTraceHeaders(req);
      expect(result.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(result.spanId).toBe('00f067aa0ba902b7');
      expect(result.traceFlags).toBe('01');
    });

    it('returns empty for missing traceparent header', () => {
      const req = new Request('http://localhost/test');
      const result = extractTraceHeaders(req);
      expect(result.traceId).toBeUndefined();
      expect(result.spanId).toBeUndefined();
      expect(result.traceFlags).toBeUndefined();
    });

    it('returns empty for malformed traceparent', () => {
      const req = new Request('http://localhost/test', {
        headers: { traceparent: 'invalid-format' },
      });
      const result = extractTraceHeaders(req);
      expect(result.traceId).toBeUndefined();
    });

    it('returns empty for traceparent with wrong number of parts', () => {
      const req = new Request('http://localhost/test', {
        headers: { traceparent: '00-abc-def' },
      });
      const result = extractTraceHeaders(req);
      expect(result.traceId).toBeUndefined();
    });
  });

  // ---------- injectTraceHeaders ----------

  describe('injectTraceHeaders', () => {
    it('creates valid traceparent header', () => {
      const headers = injectTraceHeaders();
      expect(headers.traceparent).toBeDefined();

      const parts = headers.traceparent.split('-');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe('00'); // version
      expect(parts[1].length).toBe(32); // trace ID
      expect(parts[2].length).toBe(16); // span ID
      expect(parts[3]).toBe('01'); // trace flags
    });

    it('uses provided traceId and spanId', () => {
      const traceId = 'aaaabbbbccccddddeeee111122223333';
      const spanId = '1234567890abcdef';
      const headers = injectTraceHeaders({}, traceId, spanId);

      expect(headers.traceparent).toBe(`00-${traceId}-${spanId}-01`);
    });

    it('preserves existing headers', () => {
      const existing = { 'content-type': 'application/json', 'x-custom': 'value' };
      const headers = injectTraceHeaders(existing);

      expect(headers['content-type']).toBe('application/json');
      expect(headers['x-custom']).toBe('value');
      expect(headers.traceparent).toBeDefined();
    });

    it('generates traceId when not provided', () => {
      const spanId = 'aabbccdd11223344';
      const headers = injectTraceHeaders({}, undefined, spanId);

      const parts = headers.traceparent.split('-');
      expect(parts[1].length).toBe(32);
      expect(parts[2]).toBe(spanId);
    });

    it('generates spanId when not provided', () => {
      const traceId = 'aaaabbbbccccddddeeee111122223333';
      const headers = injectTraceHeaders({}, traceId);

      const parts = headers.traceparent.split('-');
      expect(parts[1]).toBe(traceId);
      expect(parts[2].length).toBe(16);
    });
  });
});
