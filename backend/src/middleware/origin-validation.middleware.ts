import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';

import { ENV } from '@constants';

/**
 * Middleware to validate Origin and Referer headers for sensitive operations
 * Helps prevent CSRF attacks on cookie-based authentication
 */
export const createOriginValidationMiddleware = () => {
  const allowedOrigins = ENV('CORS_ORIGIN') as string[];

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
      if (!isValidOrigin(origin, allowedOrigins)) {
        throw new HTTPException(403, {
          message: 'Invalid Origin',
        });
      }
    }
    // Fallback to Referer validation
    else if (referer) {
      const refererOrigin = extractOriginFromReferer(referer);
      if (!isValidOrigin(refererOrigin, allowedOrigins)) {
        throw new HTTPException(403, {
          message: 'Invalid Referer',
        });
      }
    }

    await next();
  });
};

/**
 * Check if an origin is in the allowed list
 */
function isValidOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (!origin) return false;

  // Handle wildcard (allow all origins)
  if (allowedOrigins.includes('*')) {
    return true;
  }

  // Exact match
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Check for subdomain patterns (e.g., "*.example.com")
  return allowedOrigins.some(allowed => {
    if (allowed.startsWith('*.')) {
      const domain = allowed.slice(2);
      const originUrl = new URL(origin);
      return originUrl.hostname === domain || originUrl.hostname.endsWith('.' + domain);
    }
    return false;
  });
}

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
