import { Elysia } from "elysia";
import { RateLimiter } from "../utils/rateLimiter";
import { AuditLogService } from "@services/audit-log.service";

// Create a map to store rate limiters by IP address
const rateLimiters = new Map<string, RateLimiter>();

// Create a function to get or create a rate limiter for an IP
const getRateLimiter = (
  ip: string,
  path: string,
  limit: number,
): RateLimiter => {
  const key = `${ip}-${path}`;
  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, new RateLimiter(limit));
  }
  return rateLimiters.get(key)!;
};

export const createRateLimitMiddleware = (auditLogService: AuditLogService) => {
  return new Elysia({
    name: "rateLimitMiddleware",
  }).macro(({ onBeforeHandle }) => ({
    rateLimit(limit: number) {
      onBeforeHandle(({ error, path, request, server }) => {
        const clientIp = server?.requestIP(request)?.address || "unknown";
        const rateLimiter = getRateLimiter(clientIp, path, limit);

        // Check if the request should be rejected
        if (rateLimiter.shouldReject()) {
          // Log the rate limit exceeded event
          auditLogService.logRateLimitExceeded({
            request,
            server,
            limit,
            metadata: {
              ip: clientIp,
              limit,
              path,
            },
          });

          // Return a 429 Too Many Requests response
          throw error("Too Many Requests");
        }

        return;
      });
    },
  }));
};
