import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { replaceGenres, replaceTranslations } from './catalog-db.helpers';
import { movieRow } from './catalog-db.mappers';
import type { MovieRow, UpsertableMovie } from './catalog-db.types';
import { inBatches } from './catalog-db.types';
import type { CatalogDatabase } from './database';
import { movies } from './schema';

/** Persistence operations that own the movie table and its dependent metadata. */
export class MovieRepository {
  constructor(private readonly database: CatalogDatabase) {}

  private get db() {
    return this.database.db;
  }

  getMovie(mediaId: number): MovieRow | undefined {
    const row = this.db.select().from(movies).where(eq(movies.mediaId, mediaId)).get();
    return row && movieRow(row);
  }

  hasKnownMovies(): boolean {
    return (
      this.db
        .select({ mediaId: movies.mediaId })
        .from(movies)
        .where(isNotNull(movies.detailsSyncedAt))
        .get() !== undefined
    );
  }

  upsertMovie(movie: UpsertableMovie): void {
    const now = Date.now();
    this.db.transaction(tx => {
      tx.insert(movies)
        .values({
          mediaId: movie.mediaId,
          imdbId: movie.imdbId,
          title: movie.title,
          overview: movie.overview,
          tagline: movie.tagline,
          releaseDate: movie.releaseDate,
          runtime: movie.runtime,
          poster: movie.poster,
          backdrop: movie.backdrop,
          logo: movie.logo,
          popularity: movie.popularity,
          rating: movie.rating,
          detailsSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: movies.mediaId,
          set: {
            imdbId: movie.imdbId,
            title: movie.title,
            overview: movie.overview,
            tagline: movie.tagline,
            releaseDate: movie.releaseDate,
            runtime: movie.runtime,
            poster: movie.poster,
            backdrop: movie.backdrop,
            logo: movie.logo,
            popularity: movie.popularity,
            rating: movie.rating,
            detailsSyncedAt: now,
            updatedAt: now,
          },
        })
        .run();
      replaceGenres(tx, 'movie', movie.mediaId, movie.genreIds);
      replaceTranslations(tx, 'movie', movie.mediaId, movie.translations);
    });
  }

  knownMovieIds(ids: number[]): Set<number> {
    const known = new Set<number>();
    for (const batch of inBatches(ids))
      for (const row of this.db
        .select({ mediaId: movies.mediaId })
        .from(movies)
        .where(and(inArray(movies.mediaId, batch), isNotNull(movies.detailsSyncedAt)))
        .all())
        known.add(row.mediaId);
    return known;
  }
}
