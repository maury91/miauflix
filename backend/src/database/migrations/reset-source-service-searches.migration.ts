import { Movie } from '@entities/movie.entity';

import type { Migration } from './migration.types';

/** Re-search existing movies through the sources planner, keeping every stored source. */
export const resetSourceServiceSearches: Migration = async ({ db, logger }) => {
  const result = await db.write(() =>
    db
      .getRepository(Movie)
      .createQueryBuilder()
      .update()
      .set({
        contentDirectoriesSearched: [],
        nextSourceSearchAt: null,
        sourceSearchComplete: false,
      })
      .execute()
  );
  if (result.affected)
    logger.info('Migrations', `Scheduled ${result.affected} movies for the sources service`);
};
