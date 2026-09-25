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

export const createProgressRoutes = ({ progressRepository }: Pick<Deps, 'progressRepository'>) => {
  return new Hono()
    .post('/', authGuard(), zValidator('json', progressSchema), async c => {
      const session = c.get('sessionInfo');
      await progressRepository.upsert(session.user.id, c.req.valid('json'));
      return c.body(null, 204);
    })
    .get('/', authGuard(), async c => {
      const session = c.get('sessionInfo');
      const progress = await progressRepository.findByUser(session.user.id);
      return c.json({
        progress: progress.map(item => ({
          playable:
            item.playableKind === 'movie'
              ? { kind: 'movie' as const, mediaId: Number(item.playableKey.slice(2)) }
              : parseEpisodeKey(item.playableKey),
          positionSeconds: item.positionSeconds,
          durationSeconds: item.durationSeconds,
          state: item.state,
          updatedAt: item.updatedAt.toISOString(),
        })),
      } satisfies ProgressListResponse);
    });
};

function parseEpisodeKey(key: string) {
  const [, showMediaId, seasonNumber, episodeNumber] = key.split(':').map(Number);
  return { kind: 'episode' as const, showMediaId, seasonNumber, episodeNumber };
}
