import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import type { Deps } from './common.types';
import type { ProgressListResponse } from './progress.types';

const progressSchema = z.object({
  type: z.enum(['movie', 'episode']),
  progress: z.number().min(0).max(1),
  status: z.enum(['watching', 'completed', 'paused']),
  movieId: z.string().optional(),
  showId: z.string().optional(),
  season: z.number().optional(),
  episode: z.number().optional(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const createProgressRoutes = (_deps?: Deps) => {
  return new Hono()
    .post('/', zValidator('json', progressSchema), async c => {
      // FixMe: Implement the progress tracking
      return c.body(null, 204);
    })
    .get('/', async c => {
      // ToDo: Implement progress retrieval - return list of progress for the authenticated user
      // For now, return empty array
      return c.json({ progress: [] } satisfies ProgressListResponse);
    });
};
