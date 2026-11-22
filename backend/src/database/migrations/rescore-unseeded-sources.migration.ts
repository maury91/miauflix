import type { Migration } from './migration.types';

/** Sources with no seeders now rank below every seeded one: recalculate their stored scores. */
export const rescoreUnseededSources: Migration = async ({ db, logger }) => {
  const count = await db.getContentSourceRepository().rescoreUnseededSources();
  if (count)
    logger.info('Migrations', `Recalculated streaming scores of ${count} unseeded sources`);
};
