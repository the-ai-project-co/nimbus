import { describe, test, expect, beforeEach } from 'bun:test';

// Reset tracing state before each test by clearing the module cache
// We need fresh imports because initTracing sets a module-level flag

describe('Tracing with OTLP', () => {
  beforeEach(() => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    // Reset the initialized flag
    (globalThis as any).__nimbus_trace_service = undefined;
  });

  test('initTracing without env var does not throw', async () => {
    // Re-import to get fresh module (initTracing is idempotent per process,
    // so we test the basic path)
    const { initTracing } = await import('../tracing');
    expect(() => initTracing('test-service-no-env')).not.toThrow();
  });

  test('getTracer returns named tracer', async () => {
    const { getTracer } = await import('../tracing');
    const tracer = getTracer('my-service');
    expect(tracer).toBeDefined();
    // OpenTelemetry API tracer should have startSpan method
    expect(typeof tracer.startSpan).toBe('function');
  });

  test('createSpan wraps function and returns result', async () => {
    const { createSpan } = await import('../tracing');
    const result = await createSpan('test-span', async (span) => {
      expect(span).toBeDefined();
      return 42;
    });
    expect(result).toBe(42);
  });

  test('createSpan propagates errors', async () => {
    const { createSpan } = await import('../tracing');
    await expect(
      createSpan('error-span', async () => {
        throw new Error('test error');
      })
    ).rejects.toThrow('test error');
  });
});
