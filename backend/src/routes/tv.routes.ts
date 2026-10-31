import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';
import { createRateLimitMiddlewareFactory } from '@middleware/rate-limit.middleware';

import type { Deps } from './common.types';

const PAIRING_TIMEOUT_MS = 10_000;

const pairingCodeSchema = z.object({
  code: z.string().regex(/^[0-9A-Za-z\s-]{8,12}$/),
});

const pairingBodySchema = z.object({
  /** The address the TV should use: the one the browser reached this server at, or edited. */
  url: z
    .string()
    .max(256)
    .regex(/^https?:\/\/[^/?#]+\/?$/),
});

/** What the pairing service answered, as told to the browser. */
const pairingErrors: Record<number, { status: 400 | 404 | 409 | 429; error: string }> = {
  400: { status: 400, error: 'The TV cannot use that address' },
  404: { status: 404, error: 'That code is unknown or expired: check the code on the TV' },
  409: { status: 409, error: 'That code was already used: the TV shows a new one' },
  429: { status: 429, error: 'Too many attempts, try again in a minute' },
};

/**
 * TV app pairing: the TV shows a code from the pairing service (TV_PAIRING_URL); a signed-in
 * user enters it here, and this server stores the address the TV should use under that code.
 */
export const createTvRoutes = (deps: Pick<Deps, 'auditLogService' | 'configurationService'>) => {
  const rateLimitGuard = createRateLimitMiddlewareFactory(
    deps.auditLogService,
    deps.configurationService
  );
  const pairingEnabled = () => deps.configurationService.get('TV_PAIRING_ENABLED') !== false;

  return new Hono()
    .get('/pairing', rateLimitGuard(30), authGuard(), c => c.json({ enabled: pairingEnabled() }))
    .post(
      '/pairings/:code',
      rateLimitGuard(10),
      authGuard(),
      zValidator('param', pairingCodeSchema),
      zValidator('json', pairingBodySchema),
      async c => {
        if (!pairingEnabled()) return c.json({ error: 'TV pairing is turned off' }, 404);
        const { code } = c.req.valid('param');
        const { url } = c.req.valid('json');
        const pairingUrl = deps.configurationService.get('TV_PAIRING_URL')?.replace(/\/+$/, '');
        if (!pairingUrl) return c.json({ error: 'TV pairing is turned off' }, 404);

        let response: Response;
        try {
          response = await fetch(`${pairingUrl}/v1/pairings/${encodeURIComponent(code)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url.replace(/\/$/, '') }),
            signal: AbortSignal.timeout(PAIRING_TIMEOUT_MS),
          });
        } catch {
          return c.json({ error: 'The pairing service is unreachable' }, 502);
        }
        if (response.ok) return c.json({ paired: true as const });
        const failure = pairingErrors[response.status];
        return failure
          ? c.json({ error: failure.error }, failure.status)
          : c.json({ error: 'The pairing service failed' }, 502);
      }
    );
};
