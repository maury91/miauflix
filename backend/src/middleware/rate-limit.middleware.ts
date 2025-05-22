import { createMiddleware } from 'hono/factory';

import type { AuditLogService } from '@services/security/audit-log.service';
import { getRealClientIp } from '@utils/proxy.util';
import { RateLimiter } from '@utils/rateLimiter';

// Create a map to store rate limiters by IP address
const rateLimiters = new Map<string, RateLimiter>();

// Create a function to get or create a rate limiter for an IP
const getRateLimiter = (ip: string, path: string, limit: number): RateLimiter => {
  const key = `${ip}-${path}`;
  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, new RateLimiter(limit));
  }
  return rateLimiters.get(key)!;
};

export const createRateLimitMiddlewareFactory =
  (auditLogService: AuditLogService) => (limit: number) => {
    return createMiddleware(async (context, next) => {
      const request = context.req.raw;

      const clientIp = getRealClientIp(context) || 'unknown';
      const path = new URL(request.url).pathname;
      const routePath = context.req.routePath;
      const rateLimiter = getRateLimiter(clientIp, routePath, limit);

      // Check if the request should be rejected
      if (rateLimiter.shouldReject()) {
        // Log the rate limit exceeded event
        auditLogService.logRateLimitExceeded({
          context,
          limit,
          metadata: {
            ip: clientIp,
            limit,
            path,
            routePath,
          },
        });

        // Return a 429 Too Many Requests response
        return context.text('Too Many Requests', 429);
      }

      await next();
    });
  };
