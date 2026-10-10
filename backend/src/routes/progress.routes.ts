import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';

import type { Deps } from './common.types';
import { playableRefSchema } from './playable.types';
import type { ProgressListResponse } from './progress.types';

const progressSchema = z
  .object({
    playable: playableRefSchema,
    positionSeconds: z.number().finite().nonnegative(),
    durationSeconds: z.number().finite().positive(),
    state: z.enum(['playing', 'paused', 'completed']),
  })
  .strict()
  .refine(value => value.positionSeconds <= value.durationSeconds, {
    message: 'Position cannot exceed duration',
    path: ['positionSeconds'],
  });

/** Create authenticated routes to save validated playback progress and list the current user’s progress. */
export const createProgressRoutes = ({ progressService }: Pick<Deps, 'progressService'>) => {
  return new Hono()
    .post('/', authGuard(), zValidator('json', progressSchema), async c => {
      const session = c.get('sessionInfo');
      await progressService.update(session.user.id, c.req.valid('json'));
      return c.body(null, 204);
    })
    .get('/', authGuard(), async c => {
      const session = c.get('sessionInfo');
      const progress = await progressService.findByUser(session.user.id);
      return c.json({ progress } satisfies ProgressListResponse);
    });
};
