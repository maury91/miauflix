import type { Migration } from './migration.types';

/** Score sources stored while streaming scores were never calculated (all were 0). */
export const backfillStreamingScores: Migration = async ({ db, logger }) => {
  const count = await db.getContentSourceRepository().backfillStreamingScores();
  if (count) logger.info('Migrations', `Calculated streaming scores for ${count} sources`);
};
