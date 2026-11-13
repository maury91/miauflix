import { createMiddleware } from 'hono/factory';

import type { RateLimitGuard } from '@routes/common.types';

/** A rate limit guard that lets every request through, for route tests. */
export const noRateLimit: RateLimitGuard = () => createMiddleware(async (_c, next) => next());
