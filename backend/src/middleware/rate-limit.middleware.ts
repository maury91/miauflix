import { createMiddleware } from 'hono/factory';

import type { ConfigService } from '@mytypes/configuration';
import type { AuditLogService } from '@services/security/audit-log.service';
import { getRealClientIp } from '@utils/proxy.util';
import { RateLimiter } from '@utils/rateLimiter';

/** A limiter unused for this long holds no request inside its window and is dropped. */
const IDLE_MS = 60_000;
const SWEEP_EVERY_MS = 30_000;
/** Hard ceiling for floods of distinct addresses within one idle window. */
const MAX_ENTRIES = 50_000;
/** While full, idle entries are looked for at most this often. */
const FULL_SWEEP_EVERY_MS = 1_000;
/** At most one audit row per address and route per this long while it stays over the limit. */
const REJECTION_LOG_EVERY_MS = 60_000;

/**
 * The address a limit applies to. An IPv6 client usually controls a whole /64, so each of its
 * addresses would otherwise get a fresh limit (and a fresh entry).
 */
export function rateLimitSubject(ip: string): string {
  const address = ip.split('%')[0].toLowerCase();
  const mappedV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mappedV4) return mappedV4[1];
  if (!address.includes(':')) return address;

  const [head, tail] = address.split('::');
  // A dotted IPv4 tail (::ffff:192.0.2.1, 0:0:0:0:0:ffff:192.0.2.1) is the last two groups.
  const dottedToGroups = (dotted: string) => {
    const [a = 0, b = 0, c = 0, d = 0] = dotted.split('.').map(Number);
    return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
  };
  const groups = (part: string | undefined) =>
    part
      ? part.split(':').flatMap(group => (group.includes('.') ? dottedToGroups(group) : [group]))
      : [];
  const left = groups(head);
  const right = tail === undefined ? [] : groups(tail);
  const full = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  const value = full.map(group => parseInt(group, 16) || 0);
  // IPv4-mapped in hex notation (::ffff:c000:280): the same client as 192.0.2.128.
  if (value.slice(0, 5).every(group => group === 0) && value[5] === 0xffff) {
    return [value[6] >> 8, value[6] & 0xff, value[7] >> 8, value[7] & 0xff].join('.');
  }
  return `${full
    .slice(0, 4)
    .map(group => (parseInt(group, 16) || 0).toString(16))
    .join(':')}::/64`;
}

interface LimiterEntry {
  limiter: RateLimiter;
  lastSeen: number;
  idleMs: number;
  lastRejectionLog: number;
}

/**
 * Limiters by address and route, dropped once idle (when they hold no request inside their
 * window, so dropping one never resets a count). Past `maxEntries` an active limiter is never
 * evicted: new addresses share one overflow limiter per route instead, so a flood of distinct
 * addresses is still limited (as a whole) and memory stays bounded by the number of routes.
 */
export class RateLimiterRegistry {
  private readonly entries = new Map<string, LimiterEntry>();
  private readonly overflow = new Map<string, LimiterEntry>();
  private lastSweep = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = MAX_ENTRIES
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get(subject: string, route: string, limit: number): LimiterEntry {
    const now = this.now();
    if (now - this.lastSweep >= SWEEP_EVERY_MS) this.sweep(now);

    const key = `${subject}-${route}`;
    let entry = this.entries.get(key);
    if (!entry && this.entries.size >= this.maxEntries) {
      if (now - this.lastSweep >= FULL_SWEEP_EVERY_MS) this.sweep(now);
      if (this.entries.size >= this.maxEntries) {
        // Routes come from the router's patterns, so this map stays small.
        entry = this.overflow.get(route) ?? this.create(`overflow-${route}`, limit, now);
        entry.lastSeen = now;
        this.overflow.set(route, entry);
        return entry;
      }
    }
    entry ??= this.create(key, limit, now);
    entry.lastSeen = now;
    this.entries.set(key, entry);
    return entry;
  }

  private create(key: string, limit: number, now: number): LimiterEntry {
    return {
      limiter: new RateLimiter(limit, `RateLimitMiddleware:${key}`),
      lastSeen: now,
      // Fractional limits have windows longer than a second; never drop one mid-window.
      idleMs: Math.max(IDLE_MS, Math.ceil(1000 / limit)),
      lastRejectionLog: -Infinity,
    };
  }

  private sweep(now: number): void {
    this.lastSweep = now;
    for (const map of [this.entries, this.overflow]) {
      for (const [key, entry] of map) {
        if (now - entry.lastSeen >= entry.idleMs) map.delete(key);
      }
    }
  }
}

const rateLimiters = new RateLimiterRegistry();

export const createRateLimitMiddlewareFactory =
  (auditLogService: AuditLogService, configService: ConfigService) => (limit: number) => {
    return createMiddleware(async (c, next) => {
      const request = c.req.raw;
      const url = new URL(request.url);

      // Check if rate limiting should be bypassed
      const rateLimitTestMode = process.env.RATE_LIMIT_TEST_MODE === 'true';
      const forceRateLimit = c.req.header('X-Force-RateLimit') === 'true';

      // In test mode, bypass rate limiting unless explicitly forced
      if (rateLimitTestMode && !forceRateLimit) {
        await next();
        return;
      }

      const clientIp =
        getRealClientIp(c, configService.get('REVERSE_PROXY_SECRET') ?? '') || 'unknown';
      const path = url.pathname;
      const routePath = c.req.routePath;
      const entry = rateLimiters.get(rateLimitSubject(clientIp), routePath, limit);

      // Check if the request should be rejected
      if (entry.limiter.shouldReject()) {
        // One record per address and route while it keeps hitting the limit, not one per request.
        const now = Date.now();
        if (now - entry.lastRejectionLog >= REJECTION_LOG_EVERY_MS) {
          entry.lastRejectionLog = now;
          void auditLogService.logRateLimitExceeded({
            context: c,
            limit,
            metadata: {
              ip: clientIp,
              limit,
              path,
              routePath,
            },
          });
        }

        // Return a 429 Too Many Requests response
        return c.text('Too Many Requests', 429);
      }

      await next();
    });
  };
