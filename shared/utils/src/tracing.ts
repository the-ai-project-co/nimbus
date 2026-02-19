/**
 * OpenTelemetry Distributed Tracing
 *
 * Provides tracing utilities for Nimbus services including
 * tracer initialization, span creation, and W3C traceparent propagation.
 */

import { trace, context, SpanStatusCode, type Tracer, type Span } from '@opentelemetry/api';

let initialized = false;

/**
 * Initialize tracing for a service.
 * When OTEL_EXPORTER_OTLP_ENDPOINT is set, spans are exported via OTLP/HTTP.
 * Otherwise tracing remains a no-op (current behavior).
 */
export function initTracing(serviceName: string): void {
  if (initialized) return;
  initialized = true;
  (globalThis as any).__nimbus_trace_service = serviceName;

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return; // No exporter configured — no-op tracing

  // Lazy-import to avoid loading SDK when tracing is disabled
  import('@opentelemetry/sdk-trace-node').then(async ({ NodeTracerProvider }) => {
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { SimpleSpanProcessor } = await import('@opentelemetry/sdk-trace-base');
    const { Resource } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME } = await import('@opentelemetry/semantic-conventions');

    const provider = new NodeTracerProvider({
      resource: new Resource({ [ATTR_SERVICE_NAME]: serviceName }),
    });
    provider.addSpanProcessor(new SimpleSpanProcessor(new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })));
    provider.register();
  }).catch(() => {
    // Silently ignore if OTLP dependencies fail to load
  });
}

/**
 * Get a named tracer instance
 */
export function getTracer(name?: string): Tracer {
  const tracerName = name || (globalThis as any).__nimbus_trace_service || 'nimbus';
  return trace.getTracer(tracerName);
}

/**
 * Convenience wrapper: create a span, execute an async function, and end the span
 */
export async function createSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  tracerName?: string,
): Promise<T> {
  const tracer = getTracer(tracerName);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Generate a random trace ID (32 hex chars)
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random span ID (16 hex chars)
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Extract W3C traceparent header from incoming request
 * Format: version-traceId-spanId-traceFlags
 * Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
 */
export function extractTraceHeaders(req: Request): {
  traceId?: string;
  spanId?: string;
  traceFlags?: string;
} {
  const traceparent = req.headers.get('traceparent');
  if (!traceparent) return {};

  const parts = traceparent.split('-');
  if (parts.length !== 4) return {};

  return {
    traceId: parts[1],
    spanId: parts[2],
    traceFlags: parts[3],
  };
}

/**
 * Inject W3C traceparent header for outgoing requests
 */
export function injectTraceHeaders(
  headers: Record<string, string> = {},
  traceId?: string,
  spanId?: string,
): Record<string, string> {
  const tid = traceId || generateTraceId();
  const sid = spanId || generateSpanId();
  return {
    ...headers,
    traceparent: `00-${tid}-${sid}-01`,
  };
}
