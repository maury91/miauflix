import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { isAllowedOrigin } from '@utils/origin.util';

/**
 * Middleware to validate Origin and Referer headers for sensitive operations
 * Helps prevent CSRF attacks on cookie-based authentication
 */
export const createOriginValidationMiddleware = (allowedOrigins: string[]) => {
  return createMiddleware(async (c, next) => {
    // Skip validation for non-sensitive methods
    const method = c.req.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      await next();
      return;
    }

    const origin = c.req.header('origin');
    const referer = c.req.header('referer');

    // For state-changing operations, we need either Origin or Referer
    if (!origin && !referer) {
      throw new HTTPException(403, {
        message: 'Missing Origin or Referer header',
      });
    }

    // Validate Origin header (preferred)
    if (origin) {
      if (!isAllowedOrigin(origin, allowedOrigins)) {
        throw new HTTPException(403, {
          message: 'Invalid Origin',
        });
      }
    }
    // Fallback to Referer validation
    else if (referer) {
      const refererOrigin = extractOriginFromReferer(referer);
      if (!isAllowedOrigin(refererOrigin, allowedOrigins)) {
        throw new HTTPException(403, {
          message: 'Invalid Referer',
        });
      }
    }

    await next();
  });
};

/**
 * Extract origin from referer URL
 */
function extractOriginFromReferer(referer: string): string {
  try {
    const url = new URL(referer);
    return url.origin;
  } catch {
    return '';
  }
}
