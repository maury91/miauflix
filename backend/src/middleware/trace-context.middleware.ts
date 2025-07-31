import type { Context, Next } from 'hono';

import { getCurrentTraceId } from '@utils/trace-context';

/**
 * Middleware that injects the current trace ID into HTTP response headers
 * This allows e2e tests to correlate requests with backend logs and traces
 */
export const traceContextMiddleware = async (c: Context, next: Next) => {
  // Get the current trace ID
  const traceId = getCurrentTraceId();

  // Add trace ID to response headers if available
  if (traceId) {
    c.header('X-Request-ID', traceId);
  }

  // Continue to the next middleware/route handler
  await next();
};
