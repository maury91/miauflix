import { zValidator } from '@hono/zod-validator';
import { logger } from '@logger';
import { Hono } from 'hono';
import { z } from 'zod';

import { authGuard } from '@middleware/auth.middleware';

import type { Deps } from './common.types';
import { playableRefSchema } from './playable.types';
import { mergeProgress } from './progress.merge';
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

export const createProgressRoutes = ({
  progressRepository,
  listClient,
}: Partial<Pick<Deps, 'listClient'>> & Pick<Deps, 'progressRepository'>) => {
  return new Hono()
    .post('/', authGuard(), zValidator('json', progressSchema), async c => {
      const session = c.get('sessionInfo');
      const update = c.req.valid('json');
      await progressRepository.upsert(session.user.id, update);
      if (listClient?.isReady()) {
        await listClient.syncPlayback(session.user.id, update).catch(() => {
          // Local progress remains authoritative when the optional Trakt sync is unavailable.
          logger.warn('Progress', 'Trakt playback export failed; local progress was saved');
        });
      }
      return c.body(null, 204);
    })
    .get('/', authGuard(), async c => {
      const session = c.get('sessionInfo');
      const remote = listClient?.isReady()
        ? await listClient.getPlayback(session.user.id).catch(() => {
            logger.warn('Progress', 'Trakt playback import failed; returning local progress');
            return [];
          })
        : [];
      const progress = await progressRepository.findByUser(session.user.id);
      return c.json({
        progress: mergeProgress(
          progress.map(item => ({
            playable:
              item.playableKind === 'movie'
                ? { kind: 'movie' as const, mediaId: Number(item.playableKey.slice(2)) }
                : parseEpisodeKey(item.playableKey),
            positionSeconds: item.positionSeconds,
            durationSeconds: item.durationSeconds,
            state: item.state,
            updatedAt: item.updatedAt.toISOString(),
          })),
          remote
        ),
      } satisfies ProgressListResponse);
    });
};

function parseEpisodeKey(key: string) {
  const [, showMediaId, seasonNumber, episodeNumber] = key.split(':').map(Number);
  return { kind: 'episode' as const, showMediaId, seasonNumber, episodeNumber };
}
