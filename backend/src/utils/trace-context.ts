import { context, trace } from '@opentelemetry/api';

/**
 * Get the current trace ID from the active span context
 * @returns The current trace ID or null if no active span
 */
export function getCurrentTraceId(): string | null {
  if (process.env.ENABLE_TRACING !== 'true') {
    return null;
  }

  const currentSpan = trace.getSpan(context.active());
  if (currentSpan) {
    return currentSpan.spanContext().traceId;
  }
  return null;
}

/**
 * Get the current span ID from the active span context
 * @returns The current span ID or null if no active span
 */
export function getCurrentSpanId(): string | null {
  if (process.env.ENABLE_TRACING !== 'true') {
    return null;
  }

  const currentSpan = trace.getSpan(context.active());
  if (currentSpan) {
    return currentSpan.spanContext().spanId;
  }
  return null;
}

/**
 * Get the current trace context (trace ID and span ID)
 * @returns Object with traceId and spanId, or null if no active span
 */
export function getCurrentTraceContext(): { traceId: string; spanId: string } | null {
  if (process.env.ENABLE_TRACING !== 'true') {
    return null;
  }

  const currentSpan = trace.getSpan(context.active());
  if (currentSpan) {
    const spanContext = currentSpan.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  }
  return null;
}

/**
 * Create a trace context string for logging
 * @returns A formatted trace context string or empty string if no active span
 */
export function getTraceContextString(): string {
  if (process.env.ENABLE_TRACING !== 'true') {
    return '';
  }

  const traceContext = getCurrentTraceContext();
  if (traceContext) {
    return `[trace:${traceContext.traceId} span:${traceContext.spanId}]`;
  }
  return '';
}
