import { logger } from '@logger';

import type { ProgressRepository } from '@repositories/progress.repository';
import { playableKey, type PlayableRef } from '@routes/playable.types';

/**
 * Where a user's playback of a playable will resume, as a fraction (0–1) of its duration, using
 * the player's rule (an unfinished position past 5 s). Undefined starts from the beginning,
 * including when the lookup fails.
 */
export async function findResumeFraction(
  progress: Pick<ProgressRepository, 'findByKey'> | undefined,
  userId: string,
  playable: PlayableRef
): Promise<number | undefined> {
  if (!progress) return undefined;
  try {
    const saved = await progress.findByKey(userId, playableKey(playable));
    if (!saved || saved.state === 'completed' || saved.positionSeconds <= 5) return undefined;
    if (!(saved.durationSeconds > 0)) return undefined;
    return Math.min(1, saved.positionSeconds / saved.durationSeconds);
  } catch (error) {
    logger.debug('Progress', 'Resume position lookup failed', error);
    return undefined;
  }
}
